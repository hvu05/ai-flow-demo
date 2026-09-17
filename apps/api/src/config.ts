import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';
export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
config({ path: resolve(repositoryRoot, '.env'), quiet: true });
const EnvironmentSchema = z.object({
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  WEB_ORIGIN: z.url().default('http://127.0.0.1:5173'),
  WORKSPACES_ROOT: z.string().min(1).default('./workspaces'),
  CODEX_BIN: z.string().min(1).default('codex'),
  CODEX_MODEL: z.string().default(''),
  AGENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(3600000).default(600000),
  SERVE_WEB: z.enum(['0', '1']).default('0'),
  DATA_ROOT: z.string().min(1).default('./data'),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvironmentSchema.parse(env);
  return { host: parsed.API_HOST, port: parsed.API_PORT, webOrigin: parsed.WEB_ORIGIN, dataRoot: resolve(repositoryRoot, parsed.DATA_ROOT), workspacesRoot: resolve(repositoryRoot, parsed.WORKSPACES_ROOT), codexBin: parsed.CODEX_BIN, model: parsed.CODEX_MODEL, agentTimeoutMs: parsed.AGENT_TIMEOUT_MS, serveWeb: parsed.SERVE_WEB === '1' };
}
