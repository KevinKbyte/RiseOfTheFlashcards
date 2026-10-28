import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
// Point the user-global excludes file at a path that does not exist, so only the
// repo's own ignore rules decide the result on any machine.
const NO_GLOBAL_EXCLUDES = `core.excludesFile=${join(REPO_ROOT, '.no-such-global-excludes')}`;

function isIgnored(path) {
  const result = spawnSync('git', ['-c', NO_GLOBAL_EXCLUDES, 'check-ignore', '--no-index', '-q', path], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed (${result.status}): ${result.stderr || result.error}`);
  }
  return result.status === 0;
}

// Covers: REPO-001
// Requirement: .gitignore keeps local settings, worktrees, UE build products, signing
// keys, APKs and .env out of git, while committable config (spec cache, UE Android
// manifest, engine ini, relay vercel.json) stays trackable.
describe('.gitignore', () => {
  const ignored = [
    '.claude/settings.local.json',
    '.claude/worktrees/x',
    'Binaries/x',
    'Intermediate/x',
    'Saved/x',
    'a.keystore',
    'a.apk',
    '.env',
  ];
  for (const path of ignored) {
    test(`ignores ${path}`, () => {
      assert.equal(isIgnored(path), true);
    });
  }

  const tracked = [
    '.claude/spec-cache/game/references/spec.md',
    'Build/Android/AndroidManifest.xml',
    'Config/DefaultEngine.ini',
    'relay/vercel.json',
  ];
  for (const path of tracked) {
    test(`does not ignore ${path}`, () => {
      assert.equal(isIgnored(path), false);
    });
  }
});
