import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize } from '../lib/normalize.mjs';

const fixture = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/normalize.json', import.meta.url), 'utf8'),
);

// Covers: NORM-001
// Requirement: answer text is normalized identically on the relay and on the device
// (NFKD, drop combining marks, lowercase, punctuation -> space, collapse whitespace,
// trim), with the shared tests/fixtures/normalize.json as the single contract.
describe('normalize (shared fixture contract)', () => {
  test('fixture holds at least 20 well-formed cases', () => {
    assert.ok(Array.isArray(fixture));
    assert.ok(fixture.length >= 20, `only ${fixture.length} cases`);
    for (const c of fixture) {
      assert.equal(typeof c.input, 'string');
      assert.equal(typeof c.expected, 'string');
    }
  });

  for (const [i, c] of fixture.entries()) {
    test(`case ${i + 1}/${fixture.length}: ${JSON.stringify(c.input)} -> ${JSON.stringify(c.expected)}`, () => {
      assert.equal(normalize(c.input), c.expected);
    });
  }

  test('is idempotent over every fixture input', () => {
    for (const c of fixture) {
      const once = normalize(c.input);
      assert.equal(normalize(once), once, `input ${JSON.stringify(c.input)}`);
    }
  });
});
