import { mkdtemp, readFile, writeFile, readdir, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonProjectRepository } from '../src/storage/json-project.repository.js';
import { atomicWrite } from '../src/storage/safe-files.js';
import type { Project, Task } from '@ai-flow/contracts';

const time = '2026-09-16T00:00:00.000Z';
const base = { schemaVersion: 1 as const, revision: 0, createdAt: time, updatedAt: time };
const project: Project = { ...base, id: 'project_a', name: 'Demo', idea: 'Test app', workspace: '/workspace/demo', status: 'draft' };
function task(id: string, projectId = project.id): Task { return { ...base, id, projectId, title: id, role: 'frontend', status: 'pending', dependencies: [], acceptanceIds: [], allowedPaths: [], inputArtifacts: [] }; }
let root: string;
let repo: JsonProjectRepository;
async function createProject(value = project) { await repo.transaction(value.id, [{ action: 'put', kind: 'project', id: value.id, expectedRevision: null, value }]); }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'ai-flow-storage-')); repo = new JsonProjectRepository(root); await repo.initialize(); await createProject(); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('JSON project repository', () => {
  it('persists across a fresh instance and scopes records to their project', async () => {
    await repo.transaction(project.id, [{ action: 'put', kind: 'task', id: 'task_1', expectedRevision: null, value: task('task_1') }]);
    const fresh = new JsonProjectRepository(root); await fresh.initialize();
    expect(await fresh.get(project.id, 'task', 'task_1')).toEqual(task('task_1'));
    await createProject({ ...project, id: 'project_b' });
    expect(await fresh.list('project_b', 'task')).toEqual([]);
    expect(await fresh.listProjects()).toHaveLength(2);
  });
  it('serializes concurrent FE/BE writes without losing task or run', async () => {
    const run = { ...base, id: 'run_be', projectId: project.id, taskId: 'task_be', role: 'backend', attempt: 1, workspace: '/workspace/be', status: 'queued', inputArtifacts: [], exitCode: null, logPath: 'logs/run_be.log', validation: 'pending' };
    await Promise.all([
      repo.transaction(project.id, [{ action: 'put', kind: 'task', id: 'task_fe', expectedRevision: null, value: task('task_fe') }]),
      new JsonProjectRepository(root).transaction(project.id, [
        { action: 'put', kind: 'task', id: 'task_be', expectedRevision: null, value: { ...task('task_be'), role: 'backend' } },
        { action: 'put', kind: 'run', id: 'run_be', expectedRevision: null, value: run },
      ]),
    ]);
    expect(await repo.list(project.id, 'task')).toHaveLength(2);
    expect(await repo.get(project.id, 'run', 'run_be')).toEqual(run);
  });
  it('allows exactly one update from a stale revision and preserves winning data', async () => {
    const attempts = await Promise.allSettled(['A', 'B'].map((name) => repo.transaction(project.id, [{ action: 'put', kind: 'project', id: project.id, expectedRevision: 0, value: { ...project, name, revision: 1 } }])));
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find((a) => a.status === 'rejected')).toMatchObject({ reason: { code: 'REVISION_CONFLICT' } });
    expect((await repo.get(project.id, 'project', project.id))?.revision).toBe(1);
  });
  it('validates all writes before touching any entity', async () => {
    await expect(repo.transaction(project.id, [
      { action: 'put', kind: 'task', id: 'task_1', expectedRevision: null, value: task('task_1') },
      { action: 'put', kind: 'task', id: 'task_bad', expectedRevision: null, value: { ...task('task_bad'), schemaVersion: 2 } },
    ])).rejects.toMatchObject({ code: 'INVALID_DATA' });
    expect(await repo.get(project.id, 'task', 'task_1')).toBeNull();
  });
  it('rejects project ownership mismatch and unsupported stored schema without changing files', async () => {
    await expect(repo.transaction(project.id, [{ action: 'put', kind: 'task', id: 'task_1', expectedRevision: null, value: task('task_1', 'other_project') }])).rejects.toMatchObject({ code: 'INVALID_DATA' });
    const path = join(root, 'projects', project.id, 'project.json');
    const text = JSON.stringify({ ...project, schemaVersion: 99 }); await writeFile(path, text);
    await expect(repo.get(project.id, 'project', project.id)).rejects.toMatchObject({ code: 'CORRUPT_DATA' });
    expect(await readFile(path, 'utf8')).toBe(text);
  });
  it('preserves malformed JSON instead of resetting it', async () => {
    const path = join(root, 'projects', project.id, 'project.json'); await writeFile(path, '{broken');
    await expect(repo.get(project.id, 'project', project.id)).rejects.toMatchObject({ code: 'CORRUPT_DATA' });
    expect(await readFile(path, 'utf8')).toBe('{broken');
  });
  it.each(['../escape', '/tmp/escape', 'project/other', '..', 'x\\y'])('rejects unsafe project path %s', async (id) => {
    await expect(repo.get(id, 'project', id)).rejects.toMatchObject({ code: 'INVALID_PATH' });
  });
  it('rejects unsafe entity IDs', async () => { await expect(repo.get(project.id, 'task', '../project')).rejects.toMatchObject({ code: 'INVALID_PATH' }); });
  it('rejects symlinked directories and files without changing external data', async () => {
    const external = join(root, 'external'); await mkdir(external); await writeFile(join(external, 'task_1.json'), JSON.stringify(task('task_1')));
    await rm(join(root, 'projects', project.id, 'tasks'), { recursive: true });
    await symlink(external, join(root, 'projects', project.id, 'tasks'));
    await expect(repo.get(project.id, 'task', 'task_1')).rejects.toMatchObject({ code: 'INVALID_PATH' });
    await expect(repo.transaction(project.id, [{ action: 'put', kind: 'task', id: 'task_1', expectedRevision: null, value: task('task_1') }])).rejects.toMatchObject({ code: 'INVALID_PATH' });
    expect(JSON.parse(await readFile(join(external, 'task_1.json'), 'utf8'))).toEqual(task('task_1'));
    const projectPath = join(root, 'projects', project.id, 'project.json'); await rm(projectPath); await symlink(join(external, 'task_1.json'), projectPath);
    await expect(repo.get(project.id, 'project', project.id)).rejects.toMatchObject({ code: 'INVALID_PATH' });
  });
  it('updates and deletes child records with revision checking', async () => {
    await repo.transaction(project.id, [{ action: 'put', kind: 'task', id: 'task_1', expectedRevision: null, value: task('task_1') }]);
    await repo.transaction(project.id, [{ action: 'put', kind: 'task', id: 'task_1', expectedRevision: 0, value: { ...task('task_1'), revision: 1, status: 'running' } }]);
    await expect(repo.transaction(project.id, [{ action: 'delete', kind: 'task', id: 'task_1', expectedRevision: 0 }])).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await repo.transaction(project.id, [{ action: 'delete', kind: 'task', id: 'task_1', expectedRevision: 1 }]);
    expect(await repo.list(project.id, 'task')).toEqual([]);
  });
  it('round-trips workflow, artifact, approval, finding and event records', async () => {
    const scoped = { ...base, projectId: project.id };
    const bundle = { id: 'bundle_1', version: 1, sha256: 'a'.repeat(64) };
    const records = [
      { kind: 'workflow' as const, value: { ...scoped, id: 'workflow_1', stage: 'requirements', status: 'idle', activeTaskIds: [] } },
      { kind: 'artifact' as const, value: { ...scoped, id: 'artifact_1', producerRunId: 'run_1', kind: 'prd', version: 1, path: 'content/prd.md', sha256: 'a'.repeat(64), mediaType: 'text/markdown' } },
      { kind: 'approval' as const, value: { ...scoped, id: 'approval_1', bundle, decision: 'approved', decidedAt: time, comment: '' } },
      { kind: 'finding' as const, value: { ...scoped, id: 'finding_1', producerRunId: 'run_1', severity: 'blocking', status: 'open', owner: 'backend', title: 'Bug', description: 'Failed request', location: '/api/example', evidenceRefs: [], acceptanceIds: [] } },
      { kind: 'event' as const, value: { ...scoped, id: 'event_1', sequence: 1, type: 'task_status', taskId: 'task_1', status: 'pending' } },
    ];
    await repo.transaction(project.id, records.map(({ kind, value }) => ({ action: 'put', kind, id: value.id, expectedRevision: null, value })));
    for (const { kind, value } of records) {
      expect(await repo.get(project.id, kind, value.id)).toEqual(value);
      expect(await repo.list(project.id, kind)).toEqual([value]);
    }
  });
  it('rejects duplicate targets and skipped revisions without creating a journal', async () => {
    const mutation = { action: 'put' as const, kind: 'task' as const, id: 'task_1', expectedRevision: null, value: task('task_1') };
    await expect(repo.transaction(project.id, [mutation, mutation])).rejects.toMatchObject({ code: 'INVALID_DATA' });
    await expect(repo.transaction(project.id, [{ action: 'put', kind: 'project', id: project.id, expectedRevision: 0, value: { ...project, revision: 2 } }])).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await repo.get(project.id, 'task', 'task_1')).toBeNull();
    expect((await readdir(join(root, 'projects', project.id))).includes('.journal.json')).toBe(false);
  });
  it('atomically removes project from listing while preserving files in trash', async () => {
    await expect(repo.deleteProject(project.id, 10)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await repo.deleteProject(project.id, 0);
    expect(await repo.listProjects()).toEqual([]);
    const removed = (await readdir(join(root, '.trash')))[0]!;
    expect(JSON.parse(await readFile(join(root, '.trash', removed, 'project.json'), 'utf8'))).toEqual(project);
  });
  it('blocks a tampered journal without deleting it', async () => {
    const path = join(root, 'projects', project.id, '.journal.json'); const text = JSON.stringify({ schemaVersion: 99 }); await writeFile(path, text);
    await expect(new JsonProjectRepository(root).initialize()).rejects.toMatchObject({ code: 'RECOVERY_BLOCKED' });
    expect(await readFile(path, 'utf8')).toBe(text);
  });
  it('blocks recovery when a target changed outside the journal', async () => {
    const path = join(root, 'projects', project.id, '.journal.json');
    await writeFile(path, JSON.stringify({ schemaVersion: 1, projectId: project.id, transactionId: '00000000-0000-4000-8000-000000000001', operations: [{ kind: 'project', id: project.id, before: project, after: { ...project, revision: 1, name: 'Expected' } }] }));
    const changed = { ...project, revision: 1, name: 'Outside edit' };
    await writeFile(join(root, 'projects', project.id, 'project.json'), JSON.stringify(changed));
    await expect(repo.get(project.id, 'project', project.id)).rejects.toMatchObject({ code: 'RECOVERY_BLOCKED' });
    expect(JSON.parse(await readFile(join(root, 'projects', project.id, 'project.json'), 'utf8'))).toEqual(changed);
  });
  it.each(['journal', 'first-entity'])('recovers a real child process killed after %s write', async (point) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/crash-writer.ts', import.meta.url)), root, point], { stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = ''; child.stderr.on('data', (chunk) => { errors += String(chunk); });
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    expect(result.signal, errors).toBe('SIGKILL');
    const fresh = new JsonProjectRepository(root); await fresh.initialize();
    expect(await fresh.list(project.id, 'task')).toHaveLength(2);
    expect((await readdir(join(root, 'projects', project.id))).includes('.journal.json')).toBe(false);
    await fresh.initialize(); expect(await fresh.list(project.id, 'task')).toHaveLength(2);
  });
  it('atomic replacement never exposes partial JSON to a reader', async () => {
    const path = join(root, 'atomic.json'); await atomicWrite(path, { count: 0, payload: 'x'.repeat(10000) });
    await Promise.all([
      (async () => { for (let count = 1; count <= 15; count++) await atomicWrite(path, { count, payload: 'x'.repeat(10000) }); })(),
      (async () => { for (let i = 0; i < 30; i++) expect(JSON.parse(await readFile(path, 'utf8')).payload).toHaveLength(10000); })(),
    ]);
  });
});
