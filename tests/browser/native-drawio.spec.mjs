import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Opt-in: one real request through the deployed native draw.io proxy.
test('native AI is preconfigured and inserts an editable diagram without a browser API key', async ({ page }) => {
  test.skip(!process.env.DRAWIO_TEST_URL, 'Set DRAWIO_TEST_URL to a configured draw.io gateway');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const base = new URL(process.env.DRAWIO_TEST_URL).origin;
  const external = [];
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== base) external.push(request.url());
  });
  const response = await page.goto(`${base}/?offline=0&https=0&mode=device&lang=en`, { waitUntil: 'domcontentloaded' });
  expect(response.headers()['content-security-policy']).toContain("connect-src 'self'");
  const canvas = page.locator('.geDiagramContainer');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => window.Editor.prototype.generateTimeout)).toBe(600000);
  expect(await page.evaluate(() => window.Editor.aiGlobals.gptApiKey === 'local-proxy')).toBe(true);
  await page.getByText('Arrange', { exact: true }).click();
  await page.getByText('Insert', { exact: true }).hover();
  await page.getByText(/^Generate/).last().click();
  const select = page.locator('select').filter({ has: page.getByRole('option', { name: /^LLM:/ }) });
  const label = await select.locator('option').filter({ hasText: /^LLM:/ }).first().innerText();
  await select.selectOption({ label });
  const input = page.getByPlaceholder('Describe your diagram', { exact: true });
  await input.fill('Return only editable draw.io XML for two rectangles labelled Native Start and Native Done, joined by one arrow.');
  const completion = page.waitForResponse(result => new URL(result.url()).pathname === '/llm/chat/completions'
    && result.request().method() === 'POST');
  await input.press('Enter');
  const result = await completion;
  await result.finished();
  expect(result.status()).toBe(200);
  expect(result.request().headers().authorization === undefined).toBe(true);
  expect(result.request().headers()['content-type']).toBe('application/json');
  await expect(page.getByText('Native Start', { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await page.locator('.mxWindow [title*="insert" i]').first().click();
  await expect(canvas).toContainText('Native Start');
  await expect(canvas).toContainText('Native Done');
  expect(external).toEqual([]);
  if (process.env.DRAWIO_SCREENSHOT_PATH) {
    mkdirSync(dirname(process.env.DRAWIO_SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: process.env.DRAWIO_SCREENSHOT_PATH, fullPage: true });
  }
});
