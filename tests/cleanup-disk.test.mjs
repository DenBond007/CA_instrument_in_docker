import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
  symlinkSync, existsSync, statSync, utimesSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = new URL('../scripts/cleanup-disk.sh', import.meta.url).pathname;
const user = userInfo();

function fixture(verify) {
  const directory = mkdtempSync(join(tmpdir(), 'cleanup-disk-test-'));
  const home = join(directory, 'home with spaces');
  const bin = join(directory, 'bin');
  const log = join(directory, 'commands.tsv');
  mkdirSync(bin);
  mkdirSync(home);
  const paths = {
    pip: join(home, '.cache/pip'),
    npm: join(home, '.npm/_cacache'),
    old: join(home, '.cache/codex-runtimes/codex-runtime-install-old'),
    recent: join(home, '.cache/codex-runtimes/codex-runtime-install-recent'),
    runtime: join(home, '.cache/codex-runtimes/codex-primary-runtime'),
    installed: join(home, '.codex/packages/standalone/releases/keep'),
    project: join(home, 'Projects/keep'),
    outside: join(directory, 'outside'),
  };
  for (const path of Object.values(paths)) {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'keep-or-clean'), 'fixture data');
  }
  const old = new Date(Date.now() - 14 * 86400_000);
  utimesSync(join(paths.old, 'keep-or-clean'), old, old);
  utimesSync(paths.old, old, old);
  writeFileSync(log, '');
  const mock = join(bin, 'mock.sh');
  writeFileSync(mock, `#!/usr/bin/env bash
set -euo pipefail
CMD=\${0##*/}
printf '%s' "$CMD" >> "$CLEANUP_TEST_LOG"
printf '\\t%s' "$@" >> "$CLEANUP_TEST_LOG"
printf '\\n' >> "$CLEANUP_TEST_LOG"
check_open() {
  case "\${CLEANUP_TEST_LSOF:-}" in
    busy) printf '12345\\n'; exit 0 ;;
    error) printf 'cannot inspect\\n' >&2; exit 2 ;;
    *) exit 1 ;;
  esac
}
case "$CMD" in
  getent) printf '%s\\n' "$CLEANUP_TEST_ACCOUNT" ;;
  findmnt)
    # Проверить настоящим findmnt корректность флагов до подстановки таблицы.
    /usr/bin/findmnt "$@" >/dev/null
    if [[ -n \${CLEANUP_TEST_FAIL_MOUNTS:-} ]]; then exit 2; fi
    printf '/\\n'
    if [[ -n \${CLEANUP_TEST_MOUNT_TARGET:-} ]]; then printf '%s\\n' "$CLEANUP_TEST_MOUNT_TARGET"; fi
    ;;
  lsof) check_open ;;
  sudo)
    for ARG in "$@"; do
      if [[ $ARG == lsof ]]; then check_open; fi
    done
    if [[ -n \${CLEANUP_TEST_FAIL_CLEAN:-} && " $* " == *' apt-get clean '* ]]; then exit 23; fi
    ;;
  apt-get)
    if [[ $1 == --simulate ]]; then
      if [[ -n \${CLEANUP_TEST_FAIL_SIMULATION:-} ]]; then exit 100; fi
      printf 'Purg unused-test-package [1.0]\\n'
    fi
    if [[ -n \${CLEANUP_TEST_FAIL_CLEAN:-} && $1 == clean ]]; then exit 23; fi
    ;;
  rm)
    TARGET=\${!#}
    # Настоящее удаление допускается только внутри временной фикстуры.
    if [[ $TARGET == "$CLEANUP_TEST_HOME/"* ]]; then /bin/rm "$@"; fi
    ;;
esac
exit 0
`, { mode: 0o755 });
  for (const name of ['getent', 'findmnt', 'sudo', 'apt-get', 'docker', 'snap', 'flatpak', 'journalctl', 'lsof', 'rm']) {
    symlinkSync(mock, join(bin, name));
  }
  function run(args = [], options = {}) {
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CLEANUP_TEST_LOG: log,
      CLEANUP_TEST_HOME: home,
      CLEANUP_TEST_ACCOUNT: `${user.username}:x:${user.uid}:${user.gid}::${home}:/bin/bash`,
      ...options.env,
    };
    delete env.SUDO_USER;
    const input = options.input ?? '';
    return spawnSync('bash', [script, ...args], {
      env, ...(input ? { input } : {}), stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      encoding: 'utf8', timeout: 10_000,
    });
  }
  const calls = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => {
    const [cmd, ...args] = line.split('\t');
    return { cmd, args };
  });
  try {
    verify({ paths, home, run, calls });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('cleanup defaults to preview without executing privileged or destructive commands', () => {
  fixture(({ paths, run, calls }) => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Изменений нет/);
    assert.equal(calls().every(({ cmd }) => ['getent', 'findmnt'].includes(cmd)), true);
    assert.equal(existsSync(paths.pip), true);
    if (existsSync('/var/run/docker.sock') && statSync('/var/run/docker.sock').isSocket()) {
      assert.match(result.stdout, /--host unix:\/\/\/var\/run\/docker.sock/);
      assert.match(result.stdout, /buildx prune --builder default --all --force/);
      assert.match(result.stdout, /image prune --force/);
    }
    assert.doesNotMatch(result.stdout, /image prune --all|volume prune|container prune|system prune/);
  });
});

test('unknown and conflicting cleanup flags fail before inspecting or changing files', () => {
  fixture(({ run, calls }) => {
    for (const args of [['--unknown'], ['--apply', '--dry-run']]) {
      assert.equal(run(args).status, 2);
    }
    assert.deepEqual(calls(), []);
  });
});

test('declining or omitting confirmation performs no cleanup', () => {
  fixture(({ paths, run, calls }) => {
    for (const input of ['no\n', '']) {
      assert.equal(run(['--apply'], { input }).status, 0);
    }
    assert.equal(calls().every(({ cmd }) => ['getent', 'findmnt'].includes(cmd)), true);
    assert.equal(existsSync(paths.pip), true);
  });
});

test('APT autoremove requires its own flag and a successful simulation', () => {
  fixture(({ run, calls }) => {
    const result = run(['--autoremove']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /unused-test-package/);
    assert.deepEqual(calls().filter(({ cmd }) => cmd === 'apt-get').map(({ args }) => args),
      [['--simulate', 'autoremove', '--purge']]);
    const failed = run(['--apply', '--autoremove'], {
      input: 'yes\n', env: { CLEANUP_TEST_FAIL_SIMULATION: '1' },
    });
    assert.equal(failed.status, 1);
    assert.equal(calls().some(({ cmd }) => cmd === 'sudo'), false);
  });
});

test('apply removes only approved test caches and leaves current runtimes and projects',
  { skip: user.uid === 0 }, () => {
    fixture(({ paths, run, calls }) => {
      const result = run(['--apply'], { input: 'yes\n' });
      assert.equal(result.status, 0, result.stderr);
      for (const name of ['pip', 'npm', 'old']) assert.equal(existsSync(paths[name]), false, name);
      for (const name of ['recent', 'runtime', 'installed', 'project', 'outside']) {
        assert.equal(existsSync(join(paths[name], 'keep-or-clean')), true, name);
      }
      assert.equal(calls().some(({ args }) => args.includes('autoremove')), false);
      const removals = calls().filter(({ cmd }) => cmd === 'rm');
      assert.equal(removals.length >= 3, true);
      assert.equal(removals.every(({ args }) => args.includes('--one-file-system')
        && args.includes('--preserve-root=all') && args.includes('--')), true);
    });
  });

test('cache symlinks cannot redirect deletion to another directory', { skip: user.uid === 0 }, () => {
  fixture(({ paths, run, calls }) => {
    rmSync(paths.pip, { recursive: true });
    symlinkSync(paths.outside, paths.pip);
    const result = run(['--apply'], { input: 'yes\n' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(paths.outside, 'keep-or-clean')), true);
    assert.equal(calls().some(({ cmd, args }) => cmd === 'rm' && args.includes(paths.pip)), false);
  });
});

test('open caches are preserved and a failed open-file check prevents deletion',
  { skip: user.uid === 0 }, () => {
    fixture(({ paths, run }) => {
      const busy = run(['--apply'], { input: 'yes\n', env: { CLEANUP_TEST_LSOF: 'busy' } });
      assert.equal(busy.status, 0, busy.stderr);
      assert.match(busy.stdout, /Пропуск занятого каталога/);
      assert.equal(existsSync(paths.pip), true);
      const error = run(['--apply'], { input: 'yes\n', env: { CLEANUP_TEST_LSOF: 'error' } });
      assert.equal(error.status, 1);
      assert.equal(existsSync(paths.pip), true);
    });
  });

test('a failed cleanup step is reported without preventing independent later steps', () => {
  fixture(({ run, calls }) => {
    const result = run(['--apply'], { input: 'yes\n', env: { CLEANUP_TEST_FAIL_CLEAN: '1' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /код 23/);
    assert.equal(calls().some(({ cmd, args }) => cmd === 'journalctl' || args.includes('journalctl')), true);
  });
});

test('mounted caches and nested mounts are preserved, including paths with spaces',
  { skip: user.uid === 0 }, () => {
    fixture(({ paths, run, calls }) => {
      for (const target of [paths.pip, join(paths.pip, 'mounted')]) {
        const result = run(['--apply'], {
          input: 'yes\n', env: { CLEANUP_TEST_MOUNT_TARGET: target.replaceAll(' ', '\\x20') },
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(join(paths.pip, 'keep-or-clean')), true);
      }
      assert.equal(calls().some(({ cmd, args }) => cmd === 'rm' && args.includes(paths.pip)), false);
    });
  });

test('a failed mount-table check preserves caches and reports incomplete cleanup',
  { skip: user.uid === 0 }, () => {
    fixture(({ paths, run }) => {
      const result = run(['--apply'], { input: 'yes\n', env: { CLEANUP_TEST_FAIL_MOUNTS: '1' } });
      assert.equal(result.status, 1);
      assert.equal(existsSync(paths.pip), true);
    });
  });

test('APT performs its final package confirmation instead of using an automatic yes', () => {
  fixture(({ run, calls }) => {
    const result = run(['--apply', '--autoremove'], { input: 'yes\n' });
    assert.equal(result.status, 0, result.stderr);
    const removal = calls().find(({ cmd, args }) => ['sudo', 'apt-get'].includes(cmd)
      && args.includes('autoremove') && !args.includes('--simulate'));
    assert.ok(removal);
    assert.equal(removal.args.includes('--yes'), false);
  });
});
