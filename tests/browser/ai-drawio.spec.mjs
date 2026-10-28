import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Opt-in: this test makes one real request to the app's configured LLM.
test('the deployed AI editor generates editable shapes through its server model', async ({ page }) => {
  test.skip(!process.env.AI_DRAWIO_TEST_URL, 'Set AI_DRAWIO_TEST_URL to a running, configured app');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const base = new URL(process.env.AI_DRAWIO_TEST_URL).origin;
  const externalRequests = [];
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== base) {
      externalRequests.push(request.url());
    }
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const canvas = page.frameLocator('iframe[src*="/drawio/"]').locator('.geDiagramContainer');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Loading the canvas…', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Start with a blank canvas', exact: true }).click();
  await page.getByRole('textbox', { name: 'Chat input' }).fill(
    'Create a minimal flowchart: three editable rectangles labelled Start, API, Done, '
    + 'connected left to right with two arrows. Use display_diagram to draw it, with no images.'
  );
  const chatResponse = page.waitForResponse(response => response.url().includes('/api/chat')
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  expect((await chatResponse).status()).toBe(200);
  for (const label of ['Start', 'API', 'Done']) {
    await expect(canvas).toContainText(label, { timeout: 150_000 });
  }
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(canvas.locator('svg')).toBeVisible();
  expect(externalRequests).toEqual([]);
  if (process.env.AI_DRAWIO_SCREENSHOT_PATH) {
    mkdirSync(dirname(process.env.AI_DRAWIO_SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: process.env.AI_DRAWIO_SCREENSHOT_PATH, fullPage: true });
  }
});
