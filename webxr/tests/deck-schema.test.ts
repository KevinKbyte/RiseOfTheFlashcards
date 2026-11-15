// Requirement: any deck the game loads (bundled starter deck or a pasted/imported one) passes one
// schema gate before play: a deck is {id, title, cards[{id, prompt, answer, aliases?}]}. parseDeck
// never throws; it returns {ok: true, deck} with whitespace normalized (trim + collapse runs) and
// unknown fields dropped, or {ok: false, error}. It rejects: non-object input, blank/non-string
// fields, empty card lists, more than MAX_CARDS cards, strings over their caps (measured after
// whitespace normalization), purely numeric answers (S2 deck-lint), non-string aliases, and decks
// with fewer than MIN_DISTINCT_ANSWERS distinct answers (S2: >=4, so every card can show 4 answer
// orbs). Caps mirror relay/lib/validate.mjs (RELAY-004/RELAY-010).
// Duplicate card ids (Kev's decision, 2026-11-07): no longer a plain rejection. parseDeck returns a
// distinct non-fatal result {ok: false, kind: 'duplicates', error, deck, groups} carrying the
// normalized deck (all copies, input order) and the duplicate groups (normalized id + each copy's
// card index, prompt and answer) so the UI can let the user pick which copy to keep. Still ok:false,
// so callers that only check .ok never load a deck with duplicate ids. Other card errors still win.
// No spec-cache ID exists for the deck schema yet; plan IDs M11 (deck input) and S2 (deck parser +
// lint gate) are cited instead.
import { describe, expect, it } from 'vitest';
import {
  MAX_ALIASES,
  MAX_ALIAS_CHARS,
  MAX_CARDS,
  MAX_FIELD_CHARS,
  MAX_ID_CHARS,
  MAX_TITLE_CHARS,
  MIN_DISTINCT_ANSWERS,
  parseDeck,
} from '../src/flashcards/deck-schema.js';

type RawCard = Record<string, unknown>;

function card(i: number, extra: RawCard = {}): RawCard {
  return { id: `c${i}`, prompt: `Prompt ${i}?`, answer: `Answer ${i}`, ...extra };
}

function rawDeck(cards: unknown = [card(1), card(2), card(3), card(4)], extra: RawCard = {}): RawCard {
  return { id: 'test-deck', title: 'Test deck', cards, ...extra };
}

function withCard(index: number, patch: RawCard): RawCard {
  const cards = [card(1), card(2), card(3), card(4)];
  cards[index] = { ...cards[index], ...patch };
  return rawDeck(cards);
}

function expectRejected(input: unknown, pattern?: RegExp): void {
  const result = parseDeck(input);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(typeof result.error).toBe('string');
  expect(result.error.length).toBeGreaterThan(0);
  if (pattern) expect(result.error).toMatch(pattern);
}

function expectAccepted(input: unknown) {
  const result = parseDeck(input);
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result.deck;
}

// Covers: M11, S2
describe('parseDeck: valid decks', () => {
  it('accepts a well-formed deck and returns its cards in order', () => {
    const deck = expectAccepted(rawDeck());
    expect(deck.id).toBe('test-deck');
    expect(deck.title).toBe('Test deck');
    expect(deck.cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(deck.cards[0]).toMatchObject({ id: 'c1', prompt: 'Prompt 1?', answer: 'Answer 1' });
  });

  it('keeps optional string aliases', () => {
    const deck = expectAccepted(withCard(0, { aliases: ['Kiev', 'Kyiv city'] }));
    expect(deck.cards[0].aliases).toEqual(['Kiev', 'Kyiv city']);
  });

  it('trims and collapses whitespace in title, ids, prompts, answers and aliases', () => {
    const deck = expectAccepted(
      rawDeck(
        [
          { id: '  c1 ', prompt: '  Capital   of\tFrance?\n', answer: ' Paris ', aliases: ['  Paree  ', 'City \n of  Light'] },
          card(2),
          card(3),
          card(4),
        ],
        { id: ' caps ', title: '  World \t Capitals  ' },
      ),
    );
    expect(deck.id).toBe('caps');
    expect(deck.title).toBe('World Capitals');
    expect(deck.cards[0]).toMatchObject({
      id: 'c1',
      prompt: 'Capital of France?',
      answer: 'Paris',
      aliases: ['Paree', 'City of Light'],
    });
  });

  it('drops unknown fields from the deck and cards (field allowlist)', () => {
    const deck = expectAccepted(
      rawDeck([card(1, { secret: 'x', front: 'y' }), card(2), card(3), card(4)], { extra: 1, version: 1 }),
    );
    expect(Object.keys(deck).sort()).toEqual(['cards', 'id', 'title']);
    for (const c of deck.cards) {
      for (const key of Object.keys(c)) expect(['id', 'prompt', 'answer', 'aliases']).toContain(key);
    }
  });

  it('does not mutate or alias the input', () => {
    const input = rawDeck([card(1, { prompt: '  spaced  ' }), card(2), card(3), card(4)]);
    const snapshot = JSON.parse(JSON.stringify(input));
    const deck = expectAccepted(input);
    expect(input).toEqual(snapshot);
    expect(deck.cards).not.toBe(input.cards);
  });

  it('accepts exactly MAX_CARDS cards', () => {
    const cards = Array.from({ length: MAX_CARDS }, (_, i) => card(i));
    expect(expectAccepted(rawDeck(cards)).cards).toHaveLength(MAX_CARDS);
  });

  it('accepts strings exactly at each cap, including after whitespace normalization', () => {
    const atCap = 'a'.repeat(MAX_FIELD_CHARS);
    const deck = expectAccepted(
      rawDeck(
        [
          { id: 'i'.repeat(MAX_ID_CHARS), prompt: `  ${atCap}  `, answer: atCap, aliases: ['b'.repeat(MAX_ALIAS_CHARS)] },
          card(2),
          card(3),
          card(4),
        ],
        { title: 't'.repeat(MAX_TITLE_CHARS) },
      ),
    );
    expect(deck.cards[0].prompt).toHaveLength(MAX_FIELD_CHARS);
  });

  it('accepts exactly MAX_ALIASES aliases', () => {
    const aliases = Array.from({ length: MAX_ALIASES }, (_, i) => `alias ${String.fromCharCode(97 + i)}`);
    expect(expectAccepted(withCard(0, { aliases })).cards[0].aliases).toHaveLength(MAX_ALIASES);
  });

  it('exposes caps consistent with the relay validator and S2', () => {
    expect(MAX_CARDS).toBe(500);
    expect(MAX_TITLE_CHARS).toBe(120);
    expect(MAX_FIELD_CHARS).toBe(200);
    expect(MAX_ALIAS_CHARS).toBe(100);
    expect(MAX_ALIASES).toBe(10);
    expect(MIN_DISTINCT_ANSWERS).toBe(4);
    expect(MAX_ID_CHARS).toBeGreaterThan(0);
  });
});

// Covers: M11, S2
describe('parseDeck: rejected decks', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', '{"id":"x"}'],
    ['an array', [card(1)]],
  ])('rejects %s as the deck root', (_label, input) => {
    expectRejected(input);
  });

  it('rejects a missing, blank or non-string deck id', () => {
    expectRejected(rawDeck(undefined, { id: undefined }));
    expectRejected(rawDeck(undefined, { id: '   ' }));
    expectRejected(rawDeck(undefined, { id: 7 }));
  });

  it('rejects a missing, blank or non-string title', () => {
    expectRejected(rawDeck(undefined, { title: undefined }));
    expectRejected(rawDeck(undefined, { title: '\t \n' }));
    expectRejected(rawDeck(undefined, { title: ['Title'] }));
  });

  it('rejects missing, non-array or empty cards', () => {
    expectRejected({ id: 'd', title: 'T' });
    expectRejected(rawDeck('cards'));
    expectRejected(rawDeck({ 0: card(1) }));
    expectRejected(rawDeck([]), /card/i);
  });

  it('rejects more than MAX_CARDS cards', () => {
    const cards = Array.from({ length: MAX_CARDS + 1 }, (_, i) => card(i));
    expectRejected(rawDeck(cards), new RegExp(String(MAX_CARDS)));
  });

  it('rejects a card that is not an object', () => {
    expectRejected(rawDeck([card(1), null, card(3), card(4), card(5)]));
    expectRejected(rawDeck([card(1), 'card', card(3), card(4), card(5)]));
    expectRejected(rawDeck([card(1), [card(2)], card(3), card(4), card(5)]));
  });

  it.each(['id', 'prompt', 'answer'])('rejects a card whose %s is missing, blank or not a string', (field) => {
    expectRejected(withCard(1, { [field]: undefined }));
    expectRejected(withCard(1, { [field]: '' }));
    expectRejected(withCard(1, { [field]: '   \t' }));
    expectRejected(withCard(1, { [field]: 12 }));
    expectRejected(withCard(1, { [field]: { text: 'x' } }));
  });

  it('rejects strings one character over each cap (measured after whitespace normalization)', () => {
    expectRejected(rawDeck(undefined, { title: 't'.repeat(MAX_TITLE_CHARS + 1) }));
    expectRejected(rawDeck(undefined, { id: 'd'.repeat(MAX_ID_CHARS + 1) }));
    expectRejected(withCard(0, { id: 'i'.repeat(MAX_ID_CHARS + 1) }));
    expectRejected(withCard(0, { prompt: 'p'.repeat(MAX_FIELD_CHARS + 1) }));
    expectRejected(withCard(0, { answer: 'a'.repeat(MAX_FIELD_CHARS + 1) }));
    expectRejected(withCard(0, { aliases: ['b'.repeat(MAX_ALIAS_CHARS + 1)] }));
  });

  it('rejects aliases that are not an array of non-blank strings, or too many of them', () => {
    expectRejected(withCard(0, { aliases: 'Kiev' }));
    expectRejected(withCard(0, { aliases: ['Kiev', 3] }));
    expectRejected(withCard(0, { aliases: [null] }));
    expectRejected(withCard(0, { aliases: ['  '] }));
    expectRejected(
      withCard(0, { aliases: Array.from({ length: MAX_ALIASES + 1 }, (_, i) => `alias ${String.fromCharCode(97 + i)}`) }),
    );
  });

  it('rejects purely numeric answers (S2 deck-lint)', () => {
    expectRejected(withCard(0, { answer: '1945' }));
    expectRejected(withCard(0, { answer: ' 3.14 ' }));
  });

  it('rejects decks with fewer than MIN_DISTINCT_ANSWERS distinct answers (case/whitespace-insensitive)', () => {
    expectRejected(rawDeck([card(1), card(2), card(3)]));
    expectRejected(
      rawDeck([
        { id: 'a', prompt: 'A?', answer: 'Paris' },
        { id: 'b', prompt: 'B?', answer: ' paris ' },
        { id: 'c', prompt: 'C?', answer: 'Rome' },
        { id: 'd', prompt: 'D?', answer: 'Oslo' },
      ]),
    );
  });

  it('never throws, whatever the input shape', () => {
    const cyclic: RawCard = { id: 'd', title: 'T' };
    cyclic.cards = [cyclic];
    const inputs: unknown[] = [
      true,
      Symbol('x'),
      () => 1,
      new Date(0),
      { id: 'd', title: 'T', cards: [undefined] },
      { id: 'd', title: 'T', cards: [card(1, { aliases: { length: 2 } })] },
      cyclic,
      Object.create(null),
    ];
    for (const input of inputs) {
      expect(() => parseDeck(input)).not.toThrow();
      expect(parseDeck(input).ok).toBe(false);
    }
  });
});

// Requirement: Kev's decision (2026-11-07) -- a deck with duplicate card ids is not plainly
// rejected; parseDeck returns a non-fatal {ok: false, kind: 'duplicates'} result carrying the
// normalized deck and the duplicate groups so the dedupe UI can resolve them. ADR-0004 blurb update.
// Covers: M11
describe('parseDeck: duplicate card ids are a non-fatal, resolvable result', () => {
  function dupResult(input: unknown) {
    const result = parseDeck(input);
    expect(result.ok).toBe(false);
    if (result.ok || !('kind' in result) || result.kind !== 'duplicates') {
      throw new Error(`expected a duplicates result, got ${JSON.stringify(result)}`);
    }
    return result;
  }

  it('returns kind "duplicates" with the groups (card index + prompt + answer) instead of a plain rejection', () => {
    const result = dupResult(rawDeck([card(1), card(2), card(3, { id: 'c1' }), card(4), card(5)]));
    expect(result.error).toMatch(/duplicate/i);
    expect(result.groups).toEqual([
      {
        id: 'c1',
        copies: [
          { index: 0, prompt: 'Prompt 1?', answer: 'Answer 1' },
          { index: 2, prompt: 'Prompt 3?', answer: 'Answer 3' },
        ],
      },
    ]);
  });

  it('carries the whole normalized deck, every copy kept in input order', () => {
    const result = dupResult(rawDeck([card(1), card(2), card(3, { id: '  c1 ' }), card(4), card(5)]));
    expect(result.deck.id).toBe('test-deck');
    expect(result.deck.title).toBe('Test deck');
    expect(result.deck.cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c1', 'c4', 'c5']);
  });

  it('groups ids that only differ by surrounding/internal whitespace (same normalization as parseDeck)', () => {
    const result = dupResult(rawDeck([card(1), card(2), card(3, { id: ' c1 ' }), card(4), card(5)]));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].id).toBe('c1');
    expect(result.groups[0].copies.map((c) => c.index)).toEqual([0, 2]);
  });

  it('treats ids differing only by case as distinct cards (parseDeck ids are case-sensitive)', () => {
    const result = parseDeck(withCard(2, { id: 'C1' }));
    expect(result.ok).toBe(true);
  });

  it('reports 3+ copies of one id as a single group, and separate ids as separate groups in first-seen order', () => {
    const result = dupResult(
      rawDeck([card(1), card(2), card(3, { id: 'c2' }), card(4, { id: 'c1' }), card(5, { id: 'c1' }), card(6)]),
    );
    expect(result.groups.map((g) => [g.id, g.copies.map((c) => c.index)])).toEqual([
      ['c1', [0, 3, 4]],
      ['c2', [1, 2]],
    ]);
  });

  it('still plainly rejects a deck whose cards are otherwise invalid, even if ids repeat', () => {
    const result = parseDeck(rawDeck([card(1), card(2), card(3, { id: 'c1', prompt: '  ' }), card(4)]));
    expect(result.ok).toBe(false);
    expect('kind' in result && result.kind === 'duplicates').toBe(false);
  });

  it('a deck without duplicate ids never yields a duplicates result', () => {
    expect(parseDeck(rawDeck()).ok).toBe(true);
  });
});
