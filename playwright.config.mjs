import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 120_000,
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  reporter: 'list'
});
