import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const envDir = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, envDir, ''), ...process.env };
  return { plugins: [react()], envDir, server: { host: env.WEB_HOST || '127.0.0.1', port: Number(env.WEB_PORT || 5173), strictPort: true } };
});
