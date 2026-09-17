import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DemoService } from '../src/demo/demo.service.js';
import { JsonProjectRepository } from '../src/storage/json-project.repository.js';
import { type AgentRunner, type RunnerInput, RunnerError } from '../src/runner/agent-runner.js';
import { PreflightService } from '../src/runtime/preflight.service.js';
import { type FrontendBuilder, NextFrontendBuilder, validateFrontendSource } from '../src/demo/frontend-builder.js';
import { validateContract, validateMocks } from '../src/demo/openapi.js';
import { outputFor, contract, frontendFiles } from './helpers/demo-fixtures.js';
let root: string; let service: DemoService; let repo: JsonProjectRepository;
let calls: RunnerInput[]; let fixtureRunner: AgentRunner; let builder: FrontendBuilder;
class FixturePreflight extends PreflightService { override async check() { return { ready: true, version: 'fixture', authenticated: true, message: 'test only' }; } }
const waitFor = async (id: string, status: string) => {
  await expect.poll(async () => (await service.snapshot(id)).workflow.status, { timeout: 10000 }).toBe(status);
  return service.snapshot(id);
};
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai-flow-demo-')); process.env.DATA_ROOT = join(root, 'data'); process.env.WORKSPACES_ROOT = join(root, 'workspaces');
  repo = new JsonProjectRepository(process.env.DATA_ROOT); await repo.initialize(); calls = [];
  fixtureRunner = { execute: async (input) => { calls.push(input); input.progress('Fixture progress — not live.'); return { output: outputFor(input.role), sessionId: `fixture_session_${input.runId}` }; } };
  builder = { build: async () => ({ zip: Buffer.from('test ZIP placeholder'), report: 'FAKE BUILD for pipeline test', files: frontendFiles }) };
  service = new DemoService(repo, fixtureRunner, new FixturePreflight(), builder); await service.onModuleInit();
});
afterEach(async () => { await service.onApplicationShutdown(); await rm(root, { recursive: true, force: true }); delete process.env.DATA_ROOT; delete process.env.WORKSPACES_ROOT; });
describe('fixed demo workflow with explicit fake adapter', () => {
  it('hands off across 5 independent runs, waits for approval and deduplicates start/approve', async () => {
    const results = await Promise.all([service.start('App quản lý công việc', 'request1'), service.start('App quản lý công việc', 'request1')]);
    const id = results[0]!.project.id; expect(results[1]!.project.id).toBe(id);
    const waiting = await waitFor(id, 'waiting_approval');
    expect(calls.map((c) => c.role)).toEqual(['requirements', 'docs_reviewer', 'api_contract', 'planner']);
    expect(waiting.runs).toHaveLength(4);
    expect(calls[1]!.inputs.some((i) => i.producerRunId === calls[0]!.runId && i.path.endsWith('requirements.md'))).toBe(true);
    await expect(service.approve(id, '0'.repeat(64))).rejects.toThrow('thay đổi');
    await Promise.all([service.approve(id, waiting.bundleHash!), service.approve(id, waiting.bundleHash!)]);
    const done = await waitFor(id, 'completed');
    expect(calls).toHaveLength(5); expect(new Set(calls.map((c) => c.runId)).size).toBe(5);
    expect(calls[4]!.inputs.some((i) => i.path.endsWith('openapi.json'))).toBe(true);
    expect(done.approvals).toHaveLength(1); expect((await service.download(id)).toString()).toContain('test ZIP');
    expect(await service.latest()).toMatchObject({ project: { id } });
  });
  it('preserves waiting approval across backend recreation', async () => {
    const { project } = await service.start('Demo tasks test', 'restart');
    const first = await waitFor(project.id, 'waiting_approval');
    service = new DemoService(repo, fixtureRunner, new FixturePreflight(), builder); await service.onModuleInit();
    expect((await service.snapshot(project.id)).bundleHash).toBe(first.bundleHash);
    await service.approve(project.id, first.bundleHash!); await waitFor(project.id, 'completed');
  });
  it('stops on review changes and never dispatches contract/planner/FE', async () => {
    fixtureRunner.execute = async (input) => { calls.push(input); const output = outputFor(input.role); if (input.role === 'docs_reviewer') output.reviewVerdict = 'CHANGES_REQUESTED'; return { output }; };
    const { project } = await service.start('Review failed test', 'changes');
    const state = await waitFor(project.id, 'blocked'); expect(calls).toHaveLength(2); expect(state.workflow.reason).toContain('Review');
    await expect(service.download(project.id)).rejects.toThrow();
  });
  it('rejects missing output and does not hand off', async () => {
    fixtureRunner.execute = async (input) => ({ output: { ...outputFor(input.role), files: [] } });
    const { project } = await service.start('Missing file test', 'invalid');
    const state = await waitFor(project.id, 'blocked'); expect(state.runs[0]?.validation).toBe('rejected');
  });
  it('stops on invalid OpenAPI', async () => {
    fixtureRunner.execute = async (input) => { calls.push(input); const output = outputFor(input.role); if (input.role === 'api_contract') output.files[0]!.content = '{}'; return { output }; };
    const { project } = await service.start('Bad OpenAPI test', 'openapi'); await waitFor(project.id, 'blocked'); expect(calls).toHaveLength(3);
  });
  it('cancels a running agent without launching another and blocks concurrent projects', async () => {
    fixtureRunner.execute = (input) => new Promise((_resolve, reject) => { calls.push(input); input.signal.addEventListener('abort', () => reject(new RunnerError('cancelled', 'cancelled'))); });
    const { project } = await service.start('Cancel test idea', 'cancel');
    await expect.poll(() => calls.length).toBe(1);
    await expect(service.start('Another project', 'another')).rejects.toThrow();
    expect((await service.cancel(project.id)).workflow.status).toBe('cancelled'); expect(calls).toHaveLength(1);
  });
  it('marks persisted running work interrupted on restart without executing agents', async () => {
    fixtureRunner.execute = (input) => new Promise((_resolve, reject) => { input.signal.addEventListener('abort', () => reject(new RunnerError('cancelled', 'shutdown'))); });
    const { project } = await service.start('Recovery test idea', 'recovery');
    await expect.poll(async () => (await service.snapshot(project.id)).runs.length).toBe(1);
    const state = await service.snapshot(project.id);
    await service.onApplicationShutdown();
    await repo.transaction(project.id, [
      { action: 'put', kind: 'workflow', id: 'workflow', expectedRevision: (await repo.get(project.id, 'workflow', 'workflow'))!.revision, value: { ...state.workflow, revision: (await repo.get(project.id, 'workflow', 'workflow'))!.revision + 1, status: 'running', updatedAt: new Date().toISOString() } },
      { action: 'put', kind: 'run', id: state.runs[0]!.id, expectedRevision: (await repo.get(project.id, 'run', state.runs[0]!.id))!.revision, value: { ...state.runs[0]!, revision: (await repo.get(project.id, 'run', state.runs[0]!.id))!.revision + 1, status: 'running', updatedAt: new Date().toISOString() } },
    ]);
    const restarted = new DemoService(repo, fixtureRunner, new FixturePreflight(), builder); await restarted.onModuleInit();
    expect((await restarted.snapshot(project.id)).runs[0]?.status).toBe('interrupted');
  });
  it('rejects stale artifact hash, foreign project artifact and path traversal', async () => {
    const { project } = await service.start('Artifact test idea', 'artifact'); const state = await waitFor(project.id, 'waiting_approval');
    const artifact = state.artifacts.find((a) => a.kind === 'prd')!;
    await expect(service.artifact('other_project', artifact.id)).rejects.toThrow();
    await expect(service.artifact('../escape', artifact.id)).rejects.toThrow();
    await writeFile(join(process.env.DATA_ROOT!, 'projects', project.id, artifact.path), 'tampered');
    await expect(service.approve(project.id, state.bundleHash!)).rejects.toThrow('thay đổi'); expect(calls).toHaveLength(4);
  });
  it('validates external refs and mock payloads before building', async () => {
    await expect(validateContract(JSON.stringify({ ...contract, components: { schemas: { X: { $ref: 'http://127.0.0.1/private' } } } }))).rejects.toThrow('nội bộ');
    await expect(validateMocks(JSON.stringify(contract), JSON.stringify({ responses: [{ method: 'GET', path: '/tasks', status: 200, body: [{ id: 'wrong type' }] }] }))).rejects.toThrow('Mock');
    expect(() => validateFrontendSource(`'use client'; import fs from 'node:fs';`)).toThrow();
  });
  it('builds real Next.js static output from fixture code without calling any model', async () => {
    const result = await new NextFrontendBuilder().build('test_project', 'test_run', outputFor('frontend'), JSON.stringify(contract), new AbortController().signal);
    expect(result.report).toContain('Build verified'); expect(result.zip.length).toBeGreaterThan(100);
    const html = await readFile(join(process.env.WORKSPACES_ROOT!, 'test_project/test_run/frontend/out/index.html'), 'utf8');
    expect(html).toContain('Dữ liệu mock');
  }, 120000);
});
