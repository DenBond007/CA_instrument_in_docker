import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const image = process.env.MERMAID_TEST_IMAGE ?? 'local/mermaid-live-editor-runtime:dev';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();

test('one image renders diagrams and uses a different Kroki URL after container recreation', async ({ browser }) => {
  for (const krokiUrl of ['http://192.0.2.10:18087', 'https://kroki.example.internal/prefix']) {
    const id = docker('run', '-d', '--rm', '-p', '127.0.0.1::8080', '-e', `KROKI_URL=${krokiUrl}`, image);
    const context = await browser.newContext();
    try {
      const port = docker('port', id, '8080/tcp').split(':').at(-1);
      const baseUrl = `http://127.0.0.1:${port}`;
      await expect.poll(async () => {
        try {
          return (await context.request.get(`${baseUrl}/runtime-config.js`)).status();
        } catch { return 0; }
      }).toBe(200);
      const response = await context.request.get(`${baseUrl}/runtime-config.js`);
      expect(response.headers()['cache-control']).toContain('no-store');
      const page = await context.newPage();
      await page.goto(`${baseUrl}/edit`, { waitUntil: 'domcontentloaded' });
      await expect.poll(() => page.evaluate(() => window.__MERMAID_RUNTIME_CONFIG__?.krokiRendererUrl))
        .toBe(krokiUrl);
      // The renderer link must come from runtime config in the real built app.
      await page.getByText('Actions', { exact: true }).click();
      const link = page.locator(`a[href^="${krokiUrl}/mermaid/svg/"]`);
      await expect(link.first()).toHaveAttribute('href', new RegExp(`^${krokiUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/mermaid/svg/.+`));
      await expect(page.locator('a[href^="https://kroki.io/"], a[href^="https://mermaid.ink/"]')).toHaveCount(0);
      await expect(page.locator('#container svg').first()).toBeVisible();
    } finally {
      await context.close();
      docker('rm', '-f', id);
    }
  }
});
