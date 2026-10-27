import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const script = new URL('../docker/portal/40-runtime-config.sh', import.meta.url).pathname;
const settings = ['BIND_IP', 'PORTAL_HOST', 'PORTAL_TITLE', 'PORTAL_SHOW_PORTAINER', 'PORTAINER_URL',
  'PORTAINER_PORT', 'MERMAID_PORT', 'PLANTUML_PORT', 'SWAGGER_EDITOR_PORT', 'SWAGGER_UI_PORT',
  'DRAWIO_PORT', 'ASYNCAPI_PORT', 'KROKI_PORT', 'KROKI_URL'];

function installation(verify) {
  const directory = mkdtempSync(join(tmpdir(), 'portal-runtime-'));
  const file = join(directory, 'runtime-config.js');
  try {
    verify(overrides => {
      const env = { ...process.env };
      settings.forEach(name => delete env[name]);
      Object.assign(env, { BIND_IP: '192.0.2.10', PORTAL_CONFIG_FILE: file }, overrides);
      const result = spawnSync('sh', [script], { env, encoding: 'utf8' });
      const context = { window: {} };
      if (result.status === 0) vm.runInNewContext(readFileSync(file, 'utf8'), context);
      return { ...result, config: context.window.__ANALYST_PORTAL_CONFIG__, context, file, directory };
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('default links use the configured host, local Kroki and offline draw.io', () => {
  installation(generate => {
    const result = generate({});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.config.version, 1);
    assert.equal(Object.keys(result.config.tools).length, 8);
    assert.equal(result.config.tools.mermaid, 'http://192.0.2.10:18081');
    assert.equal(result.config.tools.kroki, 'http://192.0.2.10:18087');
    assert.equal(result.config.tools.drawio, 'http://192.0.2.10:18085/?offline=1&https=0');
    assert.equal(result.config.tools.portainer, 'https://192.0.2.10:9443');
  });
});

test('one installation changes every port, DNS, Kroki and optional Portainer without a build', () => {
  installation(generate => {
    const first = generate({});
    assert.equal(first.status, 0, first.stderr);
    const result = generate({ PORTAL_HOST: 'analyst.example.internal', PORTAL_TITLE: 'Команда аналитики',
      MERMAID_PORT: '28081', PLANTUML_PORT: '28082', SWAGGER_EDITOR_PORT: '28083', SWAGGER_UI_PORT: '28084',
      DRAWIO_PORT: '28085', ASYNCAPI_PORT: '28086', KROKI_PORT: '28087', PORTAINER_PORT: '10443',
      KROKI_URL: 'https://diagrams.example.internal/kroki/', PORTAINER_URL: 'https://ops.example.internal/portainer/' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.config.title, 'Команда аналитики');
    const ports = { mermaid: '28081', plantuml: '28082', 'swagger-editor': '28083', 'swagger-ui': '28084', drawio: '28085', asyncapi: '28086' };
    Object.entries(ports).forEach(([id, port]) => assert.equal(new URL(result.config.tools[id]).port, port));
    assert.equal(result.config.tools.kroki, 'https://diagrams.example.internal/kroki');
    assert.equal(result.config.tools.portainer, 'https://ops.example.internal/portainer');
    const hidden = generate({ PORTAL_SHOW_PORTAINER: 'false' });
    assert.equal(hidden.status, 0, hidden.stderr);
    assert.equal(Object.keys(hidden.config.tools).length, 7);
    assert.equal(hidden.config.tools.portainer, undefined);
  });
});

test('bracketed IPv6 addresses produce valid browser URLs', () => {
  installation(generate => {
    const result = generate({ PORTAL_HOST: '[2001:db8::1]' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(new URL(result.config.tools.mermaid).hostname, '[2001:db8::1]');
  });
});

test('titles and URL paths are JSON values and never execute code or expose other environment settings', () => {
  installation(generate => {
    const title = '</script>";globalThis.injected=true;//';
    const result = generate({ PORTAL_TITLE: title, KROKI_URL: 'https://kroki.example.internal/";globalThis.injected=true;//',
      SECRET_TEST_VALUE: 'do-not-serialize-this-value' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.config.title, title);
    assert.equal(result.context.injected, undefined);
    assert.ok(!readFileSync(result.file, 'utf8').includes('do-not-serialize-this-value'));
  });
});

test('invalid configuration fails atomically and keeps the previous valid file', () => {
  installation(generate => {
    const valid = generate({});
    assert.equal(valid.status, 0, valid.stderr);
    const previous = readFileSync(valid.file, 'utf8');
    const invalid = [
      { BIND_IP: '', PORTAL_HOST: '' }, { PORTAL_HOST: 'http://192.0.2.10' }, { PORTAL_HOST: 'host\n.invalid' },
      { PORTAL_HOST: 'user:pass@host' }, { PORTAL_HOST: 'host/path' }, { PORTAL_SHOW_PORTAINER: 'maybe' },
      { PORTAL_TITLE: '' }, { PORTAL_TITLE: 'x'.repeat(121) },
      ...settings.filter(name => name.endsWith('_PORT')).flatMap(name => ['0', '65536', '-1', '8080oops', '80\n'].map(value => ({ [name]: value }))),
      ...['javascript:alert(1)', 'http://', 'https://user:pass@host', 'https://host/?secret=x', 'https://host/#fragment',
        'https://host\n.invalid', 'https://host\n', 'https://host:65536', 'https://host:0'].flatMap(value => [{ KROKI_URL: value }, { PORTAINER_URL: value }])
    ];
    invalid.forEach(overrides => {
      const result = generate(overrides);
      assert.notEqual(result.status, 0, JSON.stringify(overrides));
      assert.equal(readFileSync(result.file, 'utf8'), previous);
      assert.deepEqual(readdirSync(result.directory), ['runtime-config.js']);
    });
  });
});
