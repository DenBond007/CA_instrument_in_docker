import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';

const script = new URL('../docker/mermaid/40-runtime-config.sh', import.meta.url);

function generate(urls, verify) {
  const directory = mkdtempSync(join(tmpdir(), 'mermaid-config-test-'));
  try {
    for (const url of urls) {
      const env = { ...process.env, MERMAID_HTML_DIR: directory };
      delete env.KROKI_URL;
      if (url !== undefined) env.KROKI_URL = url;
      const result = spawnSync('sh', [script.pathname], { env, encoding: 'utf8' });
      verify(result, directory, url);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the same installation can switch Kroki addresses without a build', () => {
  generate(['http://192.168.1.20:18087/', 'https://diagrams.example.internal/kroki'],
    (result, directory, url) => {
      assert.equal(result.status, 0, result.stderr);
      const context = { window: {} };
      vm.runInNewContext(readFileSync(join(directory, 'runtime-config.js'), 'utf8'), context);
      assert.equal(context.window.__MERMAID_RUNTIME_CONFIG__.krokiRendererUrl, url.replace(/\/$/, ''));
    });
});

test('runtime values are serialized, never executed as JavaScript', () => {
  const url = 'https://kroki.example.internal/prefix/";globalThis.injected=true;//';
  generate([url], (result, directory) => {
    assert.equal(result.status, 0, result.stderr);
    const context = { window: {} };
    vm.runInNewContext(readFileSync(join(directory, 'runtime-config.js'), 'utf8'), context);
    assert.equal(context.window.__MERMAID_RUNTIME_CONFIG__.krokiRendererUrl, url.slice(0, -1));
    assert.equal(context.injected, undefined);
  });
});

test('missing or invalid addresses stop startup instead of falling back to public Kroki', () => {
  generate([undefined, '', 'javascript:alert(1)', 'http://', 'http://user:pass@kroki',
    'https://kroki/#fragment', 'https://kroki/?token=secret', 'http://kroki\n.example'],
  (result) => assert.notEqual(result.status, 0));
});
