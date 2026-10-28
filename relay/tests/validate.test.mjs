import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeck } from '../lib/validate.mjs';
import { deckBody, makeCards, makeDeck } from './decks.mjs';

// 200 KB is read as 200 * 1024 bytes of UTF-8.
const MAX_BYTES = 200 * 1024;

function assertRejected(result, status) {
  assert.equal(result.ok, false, 'expected rejection');
  assert.equal(result.status, status);
  assert.equal(typeof result.error, 'string');
  assert.ok(result.error.length > 0, 'error must be non-empty');
}

function padToBytes(json, bytes) {
  const length = Buffer.byteLength(json, 'utf8');
  if (length > bytes) throw new Error(`base body already ${length} bytes`);
  return json + ' '.repeat(bytes - length);
}

function withCard(index, patch) {
  const cards = makeCards(4);
  cards[index] = { ...cards[index], ...patch };
  return deckBody(cards);
}

// Covers: RELAY-004
// Requirement: the relay rejects any deck that is oversized, malformed, off-schema,
// too large in card count, too small in distinct answers, or carrying rich-text tags,
// and accepts a well-formed deck unchanged.
describe('validateDeck', () => {
  describe('accepts', () => {
    test('a minimal valid deck and returns it parsed', () => {
      const deck = makeDeck();
      const result = validateDeck(JSON.stringify(deck));
      assert.equal(result.ok, true);
      assert.equal(result.deck.title, deck.title);
      assert.deepEqual(result.deck.cards, deck.cards);
    });

    test('optional aliases and reject lists', () => {
      const cards = makeCards(4);
      cards[0] = { ...cards[0], aliases: ['Reply 0'], reject: ['Wrong 0'] };
      assert.equal(validateDeck(deckBody(cards)).ok, true);
    });

    test('exactly 500 cards', () => {
      assert.equal(validateDeck(deckBody(makeCards(500))).ok, true);
    });

    test('a body of exactly 200 KB', () => {
      const body = padToBytes(deckBody(), MAX_BYTES);
      assert.equal(Buffer.byteLength(body, 'utf8'), MAX_BYTES);
      assert.equal(validateDeck(body).ok, true);
    });

    test('angle brackets that do not form a tag', () => {
      assert.equal(validateDeck(withCard(0, { front: 'Is 2 < 3 > 1?', back: 'x<3 yes' })).ok, true);
    });

    test('exactly 4 distinct normalized backs among duplicates', () => {
      const backs = ['Paris', 'paris', 'PARIS!', 'Rome', 'Oslo', 'Bern'];
      const cards = backs.map((back, i) => ({ front: `Capital ${i}`, back }));
      assert.equal(validateDeck(deckBody(cards)).ok, true);
    });
  });

  describe('rejects with 413', () => {
    test('a body one byte over 200 KB', () => {
      const body = padToBytes(deckBody(), MAX_BYTES + 1);
      assertRejected(validateDeck(body), 413);
    });

    test('a body over 200 KB in UTF-8 bytes though under it in characters', () => {
      const body = deckBody(makeCards(4), { title: '\u00e9'.repeat(MAX_BYTES / 2 + 1) });
      assert.ok(body.length < MAX_BYTES);
      assert.ok(Buffer.byteLength(body, 'utf8') > MAX_BYTES);
      assertRejected(validateDeck(body), 413);
    });

    test('an oversized body even when it is not JSON', () => {
      assertRejected(validateDeck('x'.repeat(MAX_BYTES + 1)), 413);
    });
  });

  describe('rejects with 400', () => {
    const cases = [
      ['malformed JSON', '{"version":1,"title":"t","cards":['],
      ['an empty body', ''],
      ['JSON null', 'null'],
      ['a top-level array', JSON.stringify(makeCards(4))],
      ['a top-level string', JSON.stringify('deck')],
      ['a missing version', JSON.stringify({ title: 't', cards: makeCards(4) })],
      ['version 2', deckBody(makeCards(4), { version: 2 })],
      ['version as a string', deckBody(makeCards(4), { version: '1' })],
      ['a missing title', JSON.stringify({ version: 1, cards: makeCards(4) })],
      ['missing cards', JSON.stringify({ version: 1, title: 't' })],
      ['cards as an object', deckBody({ 0: { front: 'a', back: 'b' } })],
      ['an empty cards array', deckBody([])],
      ['a card that is not an object', deckBody([...makeCards(4), 'card'])],
      ['501 cards', deckBody(makeCards(501))],
      ['a missing front', withCard(1, { front: undefined })],
      ['an empty front', withCard(1, { front: '' })],
      ['a whitespace-only front', withCard(1, { front: ' \t\n ' })],
      ['a numeric front', withCard(1, { front: 42 })],
      ['a missing back', withCard(2, { back: undefined })],
      ['an empty back', withCard(2, { back: '' })],
      ['a whitespace-only back', withCard(2, { back: '   ' })],
      ['a rich-text tag in a front', withCard(0, { front: '<b>Bold</b> question' })],
      ['a rich-text tag in a back', withCard(3, { back: 'Answer <color=#ff0000>red' })],
      ['a lone closing tag', withCard(3, { back: 'Answer</i>' })],
      ['a rich-text tag in the title', deckBody(makeCards(4), { title: 'My <size=200>deck' })],
      ['a rich-text tag in an alias', withCard(0, { aliases: ['ok', '<u>under</u>'] })],
      ['a rich-text tag in a reject entry', withCard(0, { reject: ['<sprite=1>'] })],
    ];
    for (const [name, body] of cases) {
      test(name, () => {
        assertRejected(validateDeck(body), 400);
      });
    }

    test('fewer than 4 distinct normalized backs ("Paris", "paris", "PARIS!" count once)', () => {
      const backs = ['Paris', 'paris', 'PARIS!', 'Rome', 'Oslo'];
      const cards = backs.map((back, i) => ({ front: `Capital ${i}`, back }));
      assertRejected(validateDeck(deckBody(cards)), 400);
    });

    test('3 distinct backs even when aliases add more distinct strings', () => {
      const cards = ['Paris', 'Rome', 'Oslo'].map((back, i) => ({
        front: `Capital ${i}`,
        back,
        aliases: [`Alias ${i}`],
      }));
      assertRejected(validateDeck(deckBody(cards)), 400);
    });
  });
});
