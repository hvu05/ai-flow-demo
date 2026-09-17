import { Injectable } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { ensureDirectory } from '../storage/safe-files.js';
import { runProcess } from './process.js';
@Injectable()
export class PreflightService {
  async check() {
    const config = loadConfig();
    let version: string | null = null;
    try {
      const result = await runProcess(config.codexBin, ['--version']);
      if (result.code !== 0) throw new Error('version');
      version = result.stdout.trim().match(/codex-cli [0-9.]+/)?.[0] ?? 'Codex CLI';
    } catch { return { ready: false, version, authenticated: false, message: 'Không tìm thấy Codex CLI. Rebuild Docker image theo hướng dẫn.' }; }
    try {
      await ensureDirectory(config.workspacesRoot);
      const directory = await mkdtemp(join(config.workspacesRoot, '.preflight-'));
      try { await writeFile(join(directory, 'probe'), 'ok'); } finally { await rm(directory, { recursive: true, force: true }); }
    } catch { return { ready: false, version, authenticated: false, message: 'Workspace không ghi được. Kiểm tra quyền volume.' }; }
    try {
      const auth = await runProcess(config.codexBin, ['login', 'status']);
      if (auth.code !== 0) throw new Error('auth');
      return { ready: true, version, authenticated: true, message: 'Codex đã đăng nhập. Chỉ gọi model khi bạn bắt đầu hoặc duyệt lượt chạy.' };
    } catch { return { ready: false, version, authenticated: false, message: 'Chưa đăng nhập Codex trong container. Chạy: docker compose exec app codex login --device-auth' }; }
  }
}
