import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const image = process.env.PORTAL_TEST_IMAGE ?? 'local/analyst-portal:dev';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
let container;
let baseUrl;

function start(settings = {}) {
  const env = { PORTAL_HOST: '192.0.2.10', ...settings };
  const id = docker('run', '-d', '--rm', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m,mode=1777',
    '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '-p', '127.0.0.1::8080',
    ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]), image);
  const port = docker('port', id, '8080/tcp').split(':').at(-1);
  return { id, url: `http://127.0.0.1:${port}` };
}

test.beforeAll(async ({ request }) => {
  const started = start();
  container = started.id;
  baseUrl = started.url;
  await expect.poll(async () => {
    try { return (await request.get(`${baseUrl}/health`)).status(); } catch { return 0; }
  }).toBe(200);
});
test.afterAll(() => { if (container) docker('rm', '-f', container); });

test('cards, search, categories, empty state and browser links work without external requests', async ({ page }) => {
  const errors = [];
  const outsideRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(baseUrl + '/')) outsideRequests.push(request.url()); });
  await page.goto(baseUrl);
  await expect(page.locator('.tool-card:visible')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: 'Инструменты аналитика', exact: true })).toBeVisible();
  await expect(page.locator('[data-tool="mermaid"] a')).toHaveAttribute('href', 'http://192.0.2.10:18081/');
  await expect(page.locator('[data-tool="drawio"] a')).toHaveAttribute('href', 'http://192.0.2.10:18085/?offline=1&https=0');
  await expect(page.locator('[data-tool="portainer"] a')).toHaveAttribute('href', 'https://192.0.2.10:9443/');
  for (const link of await page.locator('.open-link').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await page.getByRole('searchbox').fill('KAFKA');
  await expect(page.locator('.tool-card:visible')).toHaveCount(1);
  await expect(page.locator('[data-tool="asyncapi"]')).toBeVisible();
  await page.getByRole('searchbox').fill('сваггер openapi');
  await expect(page.locator('.tool-card:visible')).toHaveCount(2);
  await page.getByRole('searchbox').fill('');
  await page.locator('[data-category="diagrams"]').click();
  await expect(page.locator('.tool-card:visible')).toHaveCount(3);
  await expect(page.locator('[data-category="diagrams"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('searchbox').fill('несуществующий инструмент');
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить поиск' }).click();
  await expect(page.locator('.tool-card:visible')).toHaveCount(8);
  await expect(page.getByRole('searchbox')).toBeFocused();
  await expect(page.locator('#result-count')).toHaveText('Показано: 8');
  const response = await page.request.get(`${baseUrl}/runtime-config.js`);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers()['content-security-policy']).toContain("connect-src 'none'");
  expect(outsideRequests).toEqual([]);
  expect(errors).toEqual([]);
  expect(JSON.parse(docker('inspect', container))[0].Config.User).not.toBe('0');
});

test('the same image uses different runtime ports, custom URLs and optional Portainer', async ({ page, request }) => {
  const changed = start({ PORTAL_HOST: 'tools.example.internal', PORTAL_TITLE: 'Команда аналитики', MERMAID_PORT: '28081',
    DRAWIO_PORT: '28085', KROKI_URL: 'https://diagrams.example.internal/kroki/', PORTAL_SHOW_PORTAINER: 'false' });
  try {
    await expect.poll(async () => {
      try { return (await request.get(`${changed.url}/health`)).status(); } catch { return 0; }
    }).toBe(200);
    await page.goto(changed.url);
    await expect(page.getByRole('heading', { name: 'Команда аналитики', exact: true })).toBeVisible();
    await expect(page.locator('.tool-card:visible')).toHaveCount(7);
    await expect(page.locator('[data-tool="mermaid"] a')).toHaveAttribute('href', 'http://tools.example.internal:28081/');
    await expect(page.locator('[data-tool="drawio"] a')).toHaveAttribute('href', 'http://tools.example.internal:28085/?offline=1&https=0');
    await expect(page.locator('[data-tool="kroki"] a')).toHaveAttribute('href', 'https://diagrams.example.internal/kroki');
    await expect(page.locator('[data-tool="portainer"]')).toHaveCount(0);
  } finally { docker('rm', '-f', changed.id); }
});

test('theme preference survives reload and mobile layout fits a narrow screen', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('#theme-toggle').click();
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const width of [1024, 736, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.tool-card:visible')).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('searchbox').fill('кроки');
  await expect(page.locator('[data-tool="kroki"]')).toBeVisible();
  await expect(page.locator('.tool-card:visible')).toHaveCount(1);
});

test('missing runtime settings show an accessible error instead of broken links', async ({ page }) => {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto(baseUrl);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.open-link')).toHaveCount(0);
});
