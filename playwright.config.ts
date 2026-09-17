import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', channel: 'chrome' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:4100/health', timeout: 60000, reuseExistingServer: false },
});
