import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/credits-audit.mjs', import.meta.url));
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

// files: { 'repo/relative/path': 'content' }; credits: CREDITS.md text or null.
function makeRepo(files, credits = '# Credits\n') {
  const repo = mkdtempSync(join(tmpdir(), 'credits-audit-'));
  tempDirs.push(repo);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(repo, ...rel.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  if (credits !== null) writeFileSync(join(repo, 'CREDITS.md'), credits);
  return repo;
}

function audit(repo, extraArgs = []) {
  assert.ok(existsSync(SCRIPT), `missing ${SCRIPT}`);
  const run = spawnSync(process.execPath, [SCRIPT, '--repo', repo, ...extraArgs], {
    encoding: 'utf8',
    cwd: tmpdir(),
  });
  return { code: run.status, output: `${run.stdout}${run.stderr}` };
}

function assertUncovered(result, uncovered, covered = []) {
  assert.equal(result.code, 1, result.output);
  for (const path of uncovered) assert.ok(result.output.includes(path), `not listed: ${path}\n${result.output}`);
  for (const path of covered) assert.ok(!result.output.includes(path), `wrongly listed: ${path}\n${result.output}`);
}

// Covers: CRED-001
// Requirement: every non-code file under the asset roots must be credited in
// CREDITS.md, either by its exact backticked path or by a backticked directory
// prefix ending in "/"; code and metadata files are exempt.
describe('credits audit coverage rules', () => {
  test('exact backticked path covers a file', () => {
    const repo = makeRepo({ 'Assets/Textures/brick.png': 'x' }, '- `Assets/Textures/brick.png` CC0\n');
    assert.equal(audit(repo).code, 0);
  });

  test('uncovered file is listed by repo-relative forward-slash path', () => {
    const repo = makeRepo(
      { 'Assets/Textures/brick.png': 'x', 'Assets/Audio/Sfx/hit.wav': 'x' },
      '- `Assets/Textures/brick.png` CC0\n',
    );
    assertUncovered(audit(repo), ['Assets/Audio/Sfx/hit.wav'], ['Assets/Textures/brick.png']);
  });

  test('every uncovered file is listed', () => {
    const repo = makeRepo({ 'Assets/a.png': 'x', 'Assets/b.ogg': 'x', 'Assets/Deep/c.fbx': 'x' });
    assertUncovered(audit(repo), ['Assets/a.png', 'Assets/b.ogg', 'Assets/Deep/c.fbx']);
  });

  test('backticked directory prefix ending in "/" covers nested files', () => {
    const repo = makeRepo(
      { 'Assets/Audio/Sfx/hit.wav': 'x', 'Assets/Audio/music.ogg': 'x' },
      'All audio: `Assets/Audio/` by Kev, CC-BY 4.0\n',
    );
    assert.equal(audit(repo).code, 0);
  });

  test('directory prefix without a trailing "/" does not cover', () => {
    const repo = makeRepo({ 'Assets/Audio/hit.wav': 'x' }, '`Assets/Audio`\n');
    assertUncovered(audit(repo), ['Assets/Audio/hit.wav']);
  });

  test('a prefix of a sibling directory name does not cover', () => {
    const repo = makeRepo({ 'Assets/Audio/hit.wav': 'x' }, '`Assets/Aud/`\n');
    assertUncovered(audit(repo), ['Assets/Audio/hit.wav']);
  });

  test('a path mentioned without backticks does not cover', () => {
    const repo = makeRepo({ 'Assets/a.png': 'x' }, 'Assets/a.png by Kev\n');
    assertUncovered(audit(repo), ['Assets/a.png']);
  });

  test('code and metadata extensions are skipped', () => {
    const repo = makeRepo({
      'Assets/Scripts/Player.cs': 'x',
      'Assets/Scripts/Player.cs.meta': 'x',
      'Assets/Art/a.png.meta': 'x',
      'Assets/Scripts/Game.asmdef': 'x',
      'Assets/Scripts/Ref.asmref': 'x',
      'Content/Native/a.cpp': 'x',
      'Content/Native/a.h': 'x',
      'Content/Native/a.hpp': 'x',
      'Content/Native/a.c': 'x',
      'Content/Native/MyGame.Build.cs': 'x',
      'Content/Native/MyGame.Target.cs': 'x',
    });
    const result = audit(repo);
    assert.equal(result.code, 0, result.output);
  });

  test('a skipped extension does not exempt a sibling asset', () => {
    const repo = makeRepo({ 'Assets/Art/a.png': 'x', 'Assets/Art/a.png.meta': 'x' });
    assertUncovered(audit(repo), ['Assets/Art/a.png']);
  });

  test('Content/ is a default root alongside Assets/', () => {
    const repo = makeRepo({ 'Assets/a.png': 'x', 'Content/Maps/Arena.umap': 'x' }, '`Assets/a.png`\n');
    assertUncovered(audit(repo), ['Content/Maps/Arena.umap'], ['Assets/a.png']);
  });

  test('files outside the asset roots are not scanned', () => {
    const repo = makeRepo({ 'docs/diagram.png': 'x', 'logo.png': 'x' });
    assert.equal(audit(repo).code, 0);
  });

  test('--root replaces the default roots', () => {
    const repo = makeRepo({ 'Art/hero.png': 'x', 'Assets/ignored.png': 'x' });
    assertUncovered(audit(repo, ['--root', 'Art']), ['Art/hero.png'], ['Assets/ignored.png']);
  });

  test('--root may repeat', () => {
    const repo = makeRepo({ 'Art/hero.png': 'x', 'Sound/zap.wav': 'x' }, '`Art/hero.png`\n');
    assertUncovered(audit(repo, ['--root', 'Art', '--root', 'Sound']), ['Sound/zap.wav'], ['Art/hero.png']);
  });

  test('--credits points at an alternate credits file', () => {
    const repo = makeRepo({ 'Assets/a.png': 'x', 'docs/ATTRIBUTION.md': '`Assets/a.png`\n' }, null);
    assert.equal(audit(repo, ['--credits', join(repo, 'docs', 'ATTRIBUTION.md')]).code, 0);
  });
});

// Covers: CRED-002
// Requirement: the audit exits 0 when every asset is credited (or there are no asset
// roots), 1 when any asset is uncovered, and 2 when the credits file is missing.
describe('credits audit exit codes', () => {
  test('exit 0 when all files are covered', () => {
    const repo = makeRepo({ 'Assets/a.png': 'x' }, '`Assets/`\n');
    assert.equal(audit(repo).code, 0);
  });

  test('exit 0 when no asset root exists', () => {
    const repo = makeRepo({ 'README.md': 'x' });
    assert.equal(audit(repo).code, 0);
  });

  test('exit 1 when any file is uncovered', () => {
    const repo = makeRepo({ 'Assets/a.png': 'x' });
    assertUncovered(audit(repo), ['Assets/a.png']);
  });

  test('exit 2 when CREDITS.md is missing', () => {
    const repo = makeRepo({ 'Assets/a.png': 'x' }, null);
    assert.equal(audit(repo).code, 2);
  });

  test('exit 2 when the --credits file is missing', () => {
    const repo = makeRepo({ 'Assets/a.png': 'x' }, '`Assets/`\n');
    assert.equal(audit(repo, ['--credits', join(repo, 'NOPE.md')]).code, 2);
  });
});
