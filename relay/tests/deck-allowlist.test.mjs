import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeck } from '../lib/validate.mjs';
import { deckBody, makeCards } from './decks.mjs';
import { bodyOf, createCode, getDeck, postDeck, setup } from './harness.mjs';

const DECK_KEYS = ['cards', 'title', 'version'];
const CARD_KEYS = ['aliases', 'back', 'front', 'reject'];

function assertRejected400(result, echoed) {
  assert.equal(result.ok, false, 'expected rejection');
  assert.equal(result.status, 400);
  assert.equal(typeof result.error, 'string');
  assert.ok(!result.error.includes(echoed), 'error must not echo deck content');
}

function withCard(index, patch) {
  const cards = makeCards(4);
  cards[index] = { ...cards[index], ...patch };
  return deckBody(cards);
}

// Distinct short strings, so only the count matters.
const items = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix} ${i}`);

// Raw JSON with unknown fields at both levels, including a __proto__ key.
const DECK_WITH_EXTRAS = `{
  "version": 1,
  "title": "Capitals",
  "author": "someone",
  "script": "<script>alert(1)</script>",
  "__proto__": { "polluted": true },
  "cards": [
    { "front": "Capital of France?", "back": "Paris", "aliases": ["paris city"], "reject": ["Lyon"],
      "image": "http://example.test/x.png", "__proto__": { "polluted": true } },
    { "front": "Capital of Italy?", "back": "Rome", "notes": "extra" },
    { "front": "Capital of Norway?", "back": "Oslo" },
    { "front": "Capital of Spain?", "back": "Madrid", "aliases": [], "weight": 3 }
  ]
}`;

const EXPECTED_DECK = {
  version: 1,
  title: 'Capitals',
  cards: [
    { front: 'Capital of France?', back: 'Paris', aliases: ['paris city'], reject: ['Lyon'] },
    { front: 'Capital of Italy?', back: 'Rome' },
    { front: 'Capital of Norway?', back: 'Oslo' },
    { front: 'Capital of Spain?', back: 'Madrid', aliases: [] },
  ],
};

function assertOnlyAllowedKeys(deck) {
  assert.deepEqual(Reflect.ownKeys(deck).sort(), DECK_KEYS);
  for (const [i, card] of deck.cards.entries()) {
    for (const key of Reflect.ownKeys(card)) {
      assert.ok(CARD_KEYS.includes(key), `card ${i + 1} kept unknown field ${String(key)}`);
    }
  }
}

// Covers: RELAY-010
// Requirement: the stored deck is rebuilt from an allowlist (version, title, and per
// card front, back, aliases, reject); unknown fields are dropped silently, never
// stored or served back, and never cause a 400.
describe('deck allowlist', () => {
  test('validateDeck accepts unknown fields and returns only allowlisted ones', () => {
    const result = validateDeck(DECK_WITH_EXTRAS);
    assert.equal(result.ok, true, result.error);
    assertOnlyAllowedKeys(result.deck);
    assert.deepEqual(result.deck, EXPECTED_DECK);
  });

  test('the headset receives the allowlisted deck after a post with unknown fields', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    assert.equal((await postDeck(relay, code, DECK_WITH_EXTRAS)).status, 201);
    const res = await getDeck(relay, code);
    assert.equal(res.status, 200);
    const served = bodyOf(res);
    assertOnlyAllowedKeys(served);
    assert.deepEqual(served, EXPECTED_DECK);
    assert.equal({}.polluted, undefined, 'Object.prototype must stay clean');
  });
});

// Covers: RELAY-010
// Requirement: per-field caps reject a deck with 400: title up to 120 chars, front and
// back up to 200, each alias or reject entry up to 100, and at most 10 aliases and 10
// rejects per card; values exactly at a cap are accepted.
describe('deck field caps', () => {
  describe('accepts values at the cap', () => {
    const cases = [
      ['a 120-char title', deckBody(makeCards(4), { title: 'T'.repeat(120) })],
      ['a 200-char front', withCard(0, { front: 'F'.repeat(200) })],
      ['a 200-char back', withCard(0, { back: 'B'.repeat(200) })],
      ['a 100-char alias', withCard(0, { aliases: ['A'.repeat(100)] })],
      ['a 100-char reject entry', withCard(0, { reject: ['R'.repeat(100)] })],
      ['10 aliases', withCard(0, { aliases: items('alias', 10) })],
      ['10 reject entries', withCard(0, { reject: items('wrong', 10) })],
    ];
    for (const [label, body] of cases) {
      test(label, () => {
        const result = validateDeck(body);
        assert.equal(result.ok, true, result.error);
      });
    }
  });

  describe('rejects with 400 one past the cap', () => {
    const cases = [
      ['a 121-char title', deckBody(makeCards(4), { title: 'T'.repeat(121) }), 'T'.repeat(121)],
      ['a 201-char front', withCard(1, { front: 'F'.repeat(201) }), 'F'.repeat(201)],
      ['a 201-char back', withCard(2, { back: 'B'.repeat(201) }), 'B'.repeat(201)],
      ['a 101-char alias', withCard(0, { aliases: ['ok', 'A'.repeat(101)] }), 'A'.repeat(101)],
      ['a 101-char reject entry', withCard(3, { reject: ['R'.repeat(101)] }), 'R'.repeat(101)],
      ['11 aliases', withCard(0, { aliases: items('aliasqv', 11) }), 'aliasqv'],
      ['11 reject entries', withCard(0, { reject: items('wrongqv', 11) }), 'wrongqv'],
    ];
    for (const [label, body, echoed] of cases) {
      test(label, () => {
        assertRejected400(validateDeck(body), echoed);
      });
    }
  });

  test('an over-cap deck is rejected by the relay and not stored', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    const res = await postDeck(relay, code, deckBody(makeCards(4), { title: 'T'.repeat(121) }));
    assert.equal(res.status, 400);
    assert.equal((await getDeck(relay, code)).status, 202);
  });
});
