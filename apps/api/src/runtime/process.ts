import { spawn } from 'node:child_process';
export type ProcessResult = { code: number | null; reason: 'exited' | 'timed_out' | 'cancelled'; stdout: string; stderr: string };
export function runProcess(command: string, args: string[], options: {
  cwd?: string; env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number;
  signal?: AbortSignal; onLine?: (line: string) => void; maxOutput?: number;
} = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return resolve({ code: null, reason: 'cancelled', stdout: '', stderr: '' });
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let reason: ProcessResult['reason'] = 'exited';
    let stdout = ''; let stderr = ''; let buffer = ''; let killTimer: ReturnType<typeof setTimeout> | undefined;
    const limit = options.maxOutput ?? 128 * 1024;
    const kill = (signal: NodeJS.Signals) => { if (child.pid) { try { process.kill(-child.pid, signal); } catch { /* Process group already exited. */ } } };
    const stop = (why: ProcessResult['reason']) => { if (reason !== 'exited') return; reason = why; kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 1000); };
    const cancel = () => stop('cancelled');
    const timer = setTimeout(() => stop('timed_out'), options.timeoutMs ?? 10000);
    options.signal?.addEventListener('abort', cancel, { once: true });
    const cleanup = () => { clearTimeout(timer); if (killTimer) clearTimeout(killTimer); options.signal?.removeEventListener('abort', cancel); kill('SIGKILL'); };
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString(); stdout = (stdout + text).slice(-limit); buffer += text;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); options.onLine?.(line.slice(0, limit)); }
      if (buffer.length > limit) buffer = buffer.slice(-limit);
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-limit); });
    child.stdin.on('error', () => { /* Child may stop before consuming stdin. */ });
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('close', (code) => { cleanup(); if (buffer) options.onLine?.(buffer); resolve({ code, reason, stdout, stderr }); });
    child.stdin.end(options.input ?? '');
  });
}
