import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'version-code.mjs');
const SECTION = '[/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]';

let dir;
let counter = 0;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'version-code-'));
});
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function tmpFile(name) {
  counter += 1;
  return join(dir, `${counter}-${name}`);
}

function run(args) {
  // Node itself exits 1 (and 2 never) on a missing script; fail loudly instead of
  // letting exit-code assertions pass for the wrong reason.
  assert.ok(existsSync(SCRIPT), `scripts/version-code.mjs does not exist: ${SCRIPT}`);
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
}

function stateWith(content) {
  const p = tmpFile('state.json');
  writeFileSync(p, content);
  return p;
}

function iniWith(content) {
  const p = tmpFile('DefaultEngine.ini');
  writeFileSync(p, content);
  return p;
}

// Covers: BUILD-001
// Requirement: `version-code.mjs next --state <file>` reads {"versionCode":N} (missing
// file = 0), writes N+1 back and prints N+1, exit 0. A corrupt state (bad JSON, N not
// a non-negative integer, or N above the Google Play max 2100000000) exits 1 with a
// stderr message and leaves the file unchanged.
describe('version-code next --state', () => {
  test('missing state file counts as 0: prints 1, writes 1, exit 0', () => {
    const state = tmpFile('missing.json');
    const r = run(['next', '--state', state]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '1');
    assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')), { versionCode: 1 });
  });

  test('existing N=41 prints 42 and writes 42', () => {
    const state = stateWith('{"versionCode":41}');
    const r = run(['next', '--state', state]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '42');
    assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')), { versionCode: 42 });
  });

  test('N=0 is valid and yields 1', () => {
    const state = stateWith('{"versionCode":0}');
    const r = run(['next', '--state', state]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '1');
  });

  test('N=2099999999 yields the Play max 2100000000', () => {
    const state = stateWith('{"versionCode":2099999999}');
    const r = run(['next', '--state', state]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '2100000000');
  });

  const corrupt = {
    'bad JSON': '{not json',
    'empty file': '',
    'negative N': '{"versionCode":-1}',
    'fractional N': '{"versionCode":1.5}',
    'string N': '{"versionCode":"7"}',
    'null N': '{"versionCode":null}',
    'missing key': '{}',
    'N above Play max': '{"versionCode":2100000001}',
    'N at Play max (next would exceed)': '{"versionCode":2100000000}',
  };
  for (const [label, content] of Object.entries(corrupt)) {
    test(`corrupt state (${label}) exits 1, stderr message, file unchanged`, () => {
      const state = stateWith(content);
      const r = run(['next', '--state', state]);
      assert.equal(r.status, 1);
      assert.notEqual(r.stderr.trim(), '');
      assert.equal(r.stdout.trim(), '');
      assert.equal(readFileSync(state, 'utf8'), content);
    });
  }
});

// Covers: BUILD-002
// Requirement: `--ini <DefaultEngine.ini>` sets StoreVersion=<N+1> under
// [/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]: replaces an existing
// StoreVersion line, adds one if the section lacks it, appends the section if missing.
// All other lines stay byte-identical (CRLF included); a StoreVersion in another
// section is never touched; a nonexistent ini exits 1 and writes neither file.
describe('version-code next --ini', () => {
  test('replaces existing StoreVersion in the section', () => {
    const state = stateWith('{"versionCode":6}');
    const ini = iniWith(`[Other]\nA=1\n${SECTION}\nPackageName=x\nStoreVersion=3\nB=2\n`);
    const r = run(['next', '--state', state, '--ini', ini]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(ini, 'utf8'), `[Other]\nA=1\n${SECTION}\nPackageName=x\nStoreVersion=7\nB=2\n`);
  });

  test('adds StoreVersion when the section has none', () => {
    const state = stateWith('{"versionCode":0}');
    const ini = iniWith(`${SECTION}\nPackageName=x\n[Other]\nA=1\n`);
    const r = run(['next', '--state', state, '--ini', ini]);
    assert.equal(r.status, 0, r.stderr);
    const out = readFileSync(ini, 'utf8');
    const lines = out.split('\n');
    const start = lines.indexOf(SECTION);
    const end = lines.indexOf('[Other]');
    const body = lines.slice(start + 1, end);
    assert.ok(body.includes('StoreVersion=1'), out);
    assert.ok(body.includes('PackageName=x'), out);
    assert.equal(lines.filter((l) => l.startsWith('StoreVersion=')).length, 1);
    assert.ok(lines.includes('A=1'));
  });

  test('appends the section when missing, keeping prior content', () => {
    const state = stateWith('{"versionCode":9}');
    const prior = '[Other]\nA=1\n';
    const ini = iniWith(prior);
    const r = run(['next', '--state', state, '--ini', ini]);
    assert.equal(r.status, 0, r.stderr);
    const out = readFileSync(ini, 'utf8');
    assert.ok(out.startsWith(prior), out);
    const lines = out.split(/\r?\n/);
    const start = lines.indexOf(SECTION);
    assert.ok(start > 0, out);
    assert.ok(lines.slice(start + 1).includes('StoreVersion=10'), out);
  });

  test('preserves CRLF line endings and untouched lines byte-for-byte', () => {
    const state = stateWith('{"versionCode":4}');
    const ini = iniWith(`[Other]\r\nA=1\r\n${SECTION}\r\nStoreVersion=2\r\nPackageName=x\r\n\r\n[Last]\r\nZ=9\r\n`);
    const r = run(['next', '--state', state, '--ini', ini]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      readFileSync(ini, 'utf8'),
      `[Other]\r\nA=1\r\n${SECTION}\r\nStoreVersion=5\r\nPackageName=x\r\n\r\n[Last]\r\nZ=9\r\n`,
    );
  });

  test('never touches StoreVersion in a different section', () => {
    const state = stateWith('{"versionCode":10}');
    const ini = iniWith(`[Other]\nStoreVersion=99\n${SECTION}\nStoreVersion=1\n[Last]\nStoreVersion=77\n`);
    const r = run(['next', '--state', state, '--ini', ini]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(ini, 'utf8'), `[Other]\nStoreVersion=99\n${SECTION}\nStoreVersion=11\n[Last]\nStoreVersion=77\n`);
  });

  test('StoreVersion only in another section: section gets its own, other stays', () => {
    const state = stateWith('{"versionCode":0}');
    const ini = iniWith(`[Other]\nStoreVersion=99\n${SECTION}\nPackageName=x\n`);
    const r = run(['next', '--state', state, '--ini', ini]);
    assert.equal(r.status, 0, r.stderr);
    const out = readFileSync(ini, 'utf8');
    assert.ok(out.includes('[Other]\nStoreVersion=99\n'), out);
    assert.ok(out.split('\n').slice(out.split('\n').indexOf(SECTION)).includes('StoreVersion=1'), out);
  });

  test('nonexistent ini exits 1 and writes neither ini nor state', () => {
    const state = stateWith('{"versionCode":5}');
    const ini = tmpFile('absent.ini');
    const r = run(['next', '--state', state, '--ini', ini]);
    assert.equal(r.status, 1);
    assert.notEqual(r.stderr.trim(), '');
    assert.equal(existsSync(ini), false);
    assert.equal(readFileSync(state, 'utf8'), '{"versionCode":5}');
  });

  test('nonexistent ini with missing state file creates no state file', () => {
    const state = tmpFile('never.json');
    const ini = tmpFile('absent2.ini');
    const r = run(['next', '--state', state, '--ini', ini]);
    assert.equal(r.status, 1);
    assert.equal(existsSync(state), false);
    assert.equal(existsSync(ini), false);
  });

  test('corrupt state with a valid ini leaves the ini unchanged', () => {
    const state = stateWith('{bad');
    const content = `${SECTION}\nStoreVersion=3\n`;
    const ini = iniWith(content);
    const r = run(['next', '--state', state, '--ini', ini]);
    assert.equal(r.status, 1);
    assert.equal(readFileSync(ini, 'utf8'), content);
    assert.equal(readFileSync(state, 'utf8'), '{bad');
  });
});

// Covers: BUILD-003
// Requirement: the counter is strictly increasing: consecutive `next` calls print
// N+1 then N+2, and a failed run never advances the state. Unknown subcommand or a
// missing --state exits 2 with usage on stderr.
describe('version-code monotonic counter and usage', () => {
  test('two consecutive next calls print N+1 then N+2', () => {
    const state = stateWith('{"versionCode":10}');
    const a = run(['next', '--state', state]);
    const b = run(['next', '--state', state]);
    assert.equal(a.status, 0, a.stderr);
    assert.equal(b.status, 0, b.stderr);
    assert.equal(a.stdout.trim(), '11');
    assert.equal(b.stdout.trim(), '12');
  });

  test('a failed run does not advance the state; the next good run continues', () => {
    const state = stateWith('{"versionCode":10}');
    const bad = run(['next', '--state', state, '--ini', tmpFile('absent3.ini')]);
    assert.equal(bad.status, 1);
    const good = run(['next', '--state', state]);
    assert.equal(good.stdout.trim(), '11');
  });

  test('unknown subcommand exits 2 with usage on stderr', () => {
    const state = stateWith('{"versionCode":1}');
    const r = run(['bogus', '--state', state]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /usage/i);
    assert.equal(readFileSync(state, 'utf8'), '{"versionCode":1}');
  });

  test('no subcommand exits 2 with usage on stderr', () => {
    const r = run([]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /usage/i);
  });

  test('missing --state exits 2 with usage on stderr', () => {
    const r = run(['next']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /usage/i);
  });
});
