import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('../scripts/prepare-drawio-ai.py', import.meta.url).pathname;
const fixture = { DRAWIO_AI_ENABLED: 'true', DRAWIO_AI_MODEL: 'local/model',
  DRAWIO_AI_API_KEY: 'private-fixture-key', DRAWIO_AI_BASE_URL: 'http://192.0.2.10:8888/v1', DRAWIO_AI_MAX_TOKENS: '8192' };

function prepare(settings = {}, verify = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'drawio-config-'));
  const local = join(root, '.local', 'drawio');
  try {
    verify(root);
    const code = `import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('config',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
settings=json.load(sys.stdin)
public,private=module.generate(settings)
module.write_local(Path(sys.argv[2]),{'drawio.json':public,'nginx.conf':private})`;
    const result = spawnSync('python3', ['-I', '-S', '-c', code, script, local], {
      input: JSON.stringify({ ...fixture, ...settings }), encoding: 'utf8', timeout: 10_000
    });
    return { ...result, public: result.status === 0 ? JSON.parse(readFileSync(join(local, 'drawio.json'))) : undefined,
      private: result.status === 0 ? readFileSync(join(local, 'nginx.conf'), 'utf8') : undefined,
      directoryMode: result.status === 0 ? statSync(local).mode & 0o777 : undefined };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('the browser gets a same-origin endpoint; the real key only occurs in the private proxy config', () => {
  const result = prepare();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.public.enableAi, true);
  assert.equal(result.public.aiConfigs.gpt.endpoint, '/llm/chat/completions');
  assert.deepEqual(result.public.aiConfigs.gpt.requestHeaders, {});
  assert.deepEqual(result.public.aiActions, ['create', 'update']);
  assert.equal(result.public.aiModels[0].model, fixture.DRAWIO_AI_MODEL);
  assert.ok(!JSON.stringify(result.public).includes(fixture.DRAWIO_AI_API_KEY));
  assert.ok(result.private.includes('Bearer ' + fixture.DRAWIO_AI_API_KEY));
  assert.ok(result.private.includes('proxy_set_header Content-Type "application/json";'));
  assert.ok(result.private.includes('proxy_pass http://192.0.2.10:8888/v1/chat/completions;'));
  assert.ok(result.private.includes('location ^~ /llm/ { return 404; }'));
  assert.ok(result.private.includes("connect-src 'self'"));
  assert.ok(result.private.includes('proxy_read_timeout 600s;'));
  assert.ok(result.private.includes('proxy_send_timeout 600s;'));
  assert.ok(result.private.includes('add_after_body /drawio-ai-runtime.js;'));
  assert.equal(result.directoryMode, 0o700);
});

test('disabling AI needs no model/key and closes the proxy route', () => {
  const result = prepare({ DRAWIO_AI_ENABLED: 'false', DRAWIO_AI_MODEL: '', DRAWIO_AI_API_KEY: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.public.enableAi, false);
  assert.ok(!result.private.includes('Authorization'));
  assert.ok(result.private.includes('location = /llm/chat/completions { return 404; }'));
});

test('invalid or injectable settings fail before producing files or echoing credentials', () => {
  for (const settings of [
    { DRAWIO_AI_ENABLED: 'maybe' }, { DRAWIO_AI_MODEL: '' }, { DRAWIO_AI_API_KEY: 'bad";x' },
    { DRAWIO_AI_BASE_URL: 'http://user:password@host/v1' },
    { DRAWIO_AI_BASE_URL: 'http://host/v1;return 200' }, { DRAWIO_AI_BASE_URL: 'http://host:65536/v1' },
    { DRAWIO_AI_BASE_URL: 'http://host/v1/chat/completions' },
    { DRAWIO_AI_MAX_TOKENS: '0' }, { DRAWIO_AI_MAX_TOKENS: '8192oops' },
  ]) {
    const result = prepare(settings);
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes(fixture.DRAWIO_AI_API_KEY));
    assert.ok(!result.stderr.includes(fixture.DRAWIO_AI_API_KEY));
  }
});

test('a symlink cannot redirect local configuration writes', () => {
  const result = prepare({}, root => {
    writeFileSync(join(root, 'outside'), 'keep');
    symlinkSync(join(root, 'outside'), join(root, '.local'));
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ссылкой/);
});
