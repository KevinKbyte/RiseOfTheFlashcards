import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

const ENV_NAMES = ['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN'];
// Upstash REST tokens are long base64 strings; flag any long base64-ish run that
// mixes upper case, lower case and digits, plus any literal token assignment.
const LONG_RUN = /[A-Za-z0-9+/_-]{40,}={0,2}/g;
const TOKEN_ASSIGNMENT = /token["']?\s*[:=]\s*["'`][^"'`\s]{16,}["'`]/i;

function looksLikeToken(run) {
  return /[A-Z]/.test(run) && /[a-z]/.test(run) && /[0-9]/.test(run);
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

// Covers: RELAY-008
// Requirement: the Upstash token stays server-side; no file served from the static
// page directory names the token variables or carries a token-like value.
describe('static page directory holds no Upstash token', () => {
  test('detector flags an Upstash-shaped value and ignores plain prose', () => {
    const sample = 'AYQgASQgNDQ5ZjE3' + 'YzctMjU4Ny00YjRk' + 'LWE5ZjUtYjZmNjQ2MDk0' + '=';
    assert.deepEqual((`const t = "${sample}";`.match(LONG_RUN) ?? []).filter(looksLikeToken), [sample]);
    assert.ok(TOKEN_ASSIGNMENT.test(`token: "${sample}"`));
    assert.deepEqual(('Paste your deck JSON below and press Send.'.match(LONG_RUN) ?? []), []);
  });

  test('relay/public/index.html exists', () => {
    assert.ok(existsSync(join(PUBLIC_DIR, 'index.html')), `missing ${join(PUBLIC_DIR, 'index.html')}`);
  });

  test('no file names a token environment variable', () => {
    assert.ok(existsSync(PUBLIC_DIR), `missing ${PUBLIC_DIR}`);
    for (const file of listFiles(PUBLIC_DIR)) {
      const text = readFileSync(file, 'utf8');
      for (const name of ENV_NAMES) {
        assert.ok(!text.includes(name), `${relative(PUBLIC_DIR, file)} contains ${name}`);
      }
    }
  });

  test('no file carries a token-looking value', () => {
    assert.ok(existsSync(PUBLIC_DIR), `missing ${PUBLIC_DIR}`);
    for (const file of listFiles(PUBLIC_DIR)) {
      const text = readFileSync(file, 'utf8');
      const where = relative(PUBLIC_DIR, file);
      const runs = (text.match(LONG_RUN) ?? []).filter(looksLikeToken);
      assert.deepEqual(runs, [], `${where} has token-like strings`);
      assert.ok(!TOKEN_ASSIGNMENT.test(text), `${where} assigns a literal token`);
    }
  });
});
