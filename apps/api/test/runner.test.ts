import { mkdtemp, rm, chmod, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { CodexRunner, validateOutput } from '../src/runner/codex.runner.js';
import { PreflightService } from '../src/runtime/preflight.service.js';
import { runProcess } from '../src/runtime/process.js';
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'ai-flow-runner-')); process.env.WORKSPACES_ROOT = root; process.env.CODEX_BIN = fileURLToPath(new URL('./helpers/fake-codex.cjs', import.meta.url)); await chmod(process.env.CODEX_BIN, 0o755); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); delete process.env.WORKSPACES_ROOT; delete process.env.CODEX_BIN; });
it('executes separate CLI fixture processes, materializes context and records session IDs', async () => {
  const runner = new CodexRunner(); const sessions = [];
  for (const runId of ['run_a', 'run_b']) {
    const result = await runner.execute({ projectId: 'project_a', runId, role: 'requirements', idea: 'test input', inputs: [], signal: new AbortController().signal, progress: () => undefined });
    sessions.push(result.sessionId);
    expect(await readFile(join(root, 'project_a', runId, 'input-manifest.json'), 'utf8')).toContain('[]');
    expect(result.output.files[0]?.path).toBe('requirements.md');
  }
  expect(new Set(sessions).size).toBe(2);
});
it('rejects exit 0 without structured output file', async () => {
  await expect(new CodexRunner().execute({ projectId: 'project_a', runId: 'missing', role: 'requirements', idea: 'missing output', inputs: [], signal: new AbortController().signal, progress: () => undefined })).rejects.toThrow('Đầu ra');
});
it('rejects output traversal and unexpected role files', () => {
  expect(() => validateOutput({ role: 'requirements', outcome: 'completed', summary: 'test', reviewVerdict: null, files: [{ path: '../outside', content: 'bad' }] }, 'requirements')).toThrow();
});
it('preflight reports missing authentication without exposing CLI stdout/stderr', async () => {
  const status = await new PreflightService().check();
  expect(status.ready).toBe(false); expect(status.version).toBe('codex-cli 0.154.0'); expect(status.message).toContain('đăng nhập');
});
it('timeout terminates process group, even when child ignores SIGTERM', async () => {
  const result = await runProcess(process.execPath, ['-e', `process.on('SIGTERM',()=>{});setInterval(()=>{},100)`], { timeoutMs: 50 });
  expect(result.reason).toBe('timed_out');
});
it('cancel terminates execution and bounded output cannot grow indefinitely', async () => {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 100);
  const result = await runProcess(process.execPath, ['-e', `setInterval(()=>process.stdout.write('x'.repeat(50000)),10)`], { signal: controller.signal, maxOutput: 1024 });
  clearTimeout(timeout); expect(result.reason).toBe('cancelled'); expect(result.stdout.length).toBeLessThanOrEqual(1024);
});
