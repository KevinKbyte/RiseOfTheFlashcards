// Requirement: imported decks survive a page reload. src/flashcards/deck-store.ts is a pure module
// over an injected localStorage-shaped storage ({ getItem, setItem, removeItem }, any of which may
// throw). writeDecks saves the imported decks under their OWN key (DECK_STORE_KEY, never the FSRS
// save key) as a versioned envelope { version: DECK_STORE_VERSION, decks: Deck[] }; readDecks
// restores the same decks (ids, titles, cards, aliases, order). Stored text is untrusted: every
// deck is re-validated through deck-schema parseDeck, so an invalid deck is skipped while valid
// ones are kept, and only allowlisted fields come back. Writes over MAX_DECK_STORE_CHARS are
// refused with { ok: false, reason: 'too-large' } and storage is not touched. Mirroring save.ts:
// an unreadable live payload (bad JSON, unknown version, malformed envelope, over the cap) is
// copied to DECK_STORE_BACKUP_KEY before the next write replaces it; if the backup already holds
// an earlier unreadable payload, the write is refused and the live text is left as-is. Storage
// exceptions never escape: a throwing read yields { decks: [], readFailed: true } and a throwing
// write yields { ok: false }. Deck/card ids like "__proto__" round-trip without prototype pollution.
// Covers: M11, A10, S2
// (Plan IDs, as the other import/menu tests cite; this repo has no .claude/spec-cache.)
import { describe, expect, it } from 'vitest';
import {
  DECK_STORE_BACKUP_KEY,
  DECK_STORE_KEY,
  DECK_STORE_VERSION,
  MAX_DECK_STORE_CHARS,
  readDecks,
  writeDecks,
} from '../src/flashcards/deck-store.js';
import type { Deck, DeckCard } from '../src/flashcards/deck-schema.js';
import { MAX_CARDS, MAX_FIELD_CHARS, MAX_ID_CHARS } from '../src/flashcards/deck-schema.js';
import { SAVE_BACKUP_KEY } from '../src/flashcards/save.js';

interface MemStorage {
  data: Map<string, string>;
  sets: string[];
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function mem(initial: Record<string, string> = {}): MemStorage {
  const data = new Map(Object.entries(initial));
  const sets: string[] = [];
  return {
    data,
    sets,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      sets.push(k);
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

function card(id: string, n: number, extra: Partial<DeckCard> = {}): DeckCard {
  return { id, prompt: `Prompt ${n}?`, answer: `Answer ${n}`, ...extra };
}

function deck(id: string, title = `Deck ${id}`): Deck {
  return { id, title, cards: [card(`${id}-a`, 1), card(`${id}-b`, 2), card(`${id}-c`, 3), card(`${id}-d`, 4)] };
}

function envelope(decks: unknown[], version: unknown = DECK_STORE_VERSION): string {
  return JSON.stringify({ version, decks });
}

/** A max-size deck: MAX_CARDS cards with max-length id/prompt/answer. */
function hugeDeck(tag: string): Deck {
  const pad = (s: string, n: number) => s + 'x'.repeat(Math.max(0, n - s.length));
  return {
    id: tag,
    title: `Huge ${tag}`,
    cards: Array.from({ length: MAX_CARDS }, (_, i) => ({
      id: pad(`${tag}-${i}-`, MAX_ID_CHARS),
      prompt: pad(`Prompt ${i} `, MAX_FIELD_CHARS),
      answer: pad(`Answer ${i} `, MAX_FIELD_CHARS),
    })),
  };
}

describe('deck-store round trip', () => {
  it('uses its own storage keys, distinct from the FSRS save and its backup', () => {
    expect(typeof DECK_STORE_KEY).toBe('string');
    expect(typeof DECK_STORE_BACKUP_KEY).toBe('string');
    expect(DECK_STORE_KEY).not.toBe(DECK_STORE_BACKUP_KEY);
    for (const k of [DECK_STORE_KEY, DECK_STORE_BACKUP_KEY]) {
      expect(k).not.toBe('flashcards.fsrs.save');
      expect(k).not.toBe(SAVE_BACKUP_KEY);
    }
  });

  it('writes a versioned envelope under DECK_STORE_KEY only', () => {
    const s = mem();
    expect(writeDecks([deck('one')], s)).toEqual({ ok: true });
    expect(s.sets).toEqual([DECK_STORE_KEY]);
    const raw = JSON.parse(s.data.get(DECK_STORE_KEY) as string);
    expect(raw.version).toBe(DECK_STORE_VERSION);
    expect(raw.decks).toHaveLength(1);
  });

  it('restores the same decks: ids, titles, cards, aliases and order', () => {
    const s = mem();
    const decks: Deck[] = [
      deck('zeta', 'Zeta'),
      { ...deck('alpha', 'Alpha'), cards: [card('k1', 1, { aliases: ['One', 'Uno'] }), ...deck('alpha').cards] },
      deck('mid', 'Middle'),
    ];
    expect(writeDecks(decks, s).ok).toBe(true);
    const read = readDecks(s);
    expect(read.readFailed).toBe(false);
    expect(read.decks).toEqual(decks);
    expect(read.decks.map((d) => d.id)).toEqual(['zeta', 'alpha', 'mid']);
  });

  it('a later write replaces the earlier list', () => {
    const s = mem();
    writeDecks([deck('a'), deck('b')], s);
    writeDecks([deck('b')], s);
    expect(readDecks(s).decks.map((d) => d.id)).toEqual(['b']);
  });

  it('an empty list round-trips to no decks', () => {
    const s = mem();
    writeDecks([deck('a')], s);
    expect(writeDecks([], s).ok).toBe(true);
    expect(readDecks(s)).toEqual({ decks: [], readFailed: false });
  });

  it('nothing stored reads as no decks, not a failure', () => {
    expect(readDecks(mem())).toEqual({ decks: [], readFailed: false });
  });
});

describe('deck-store size cap', () => {
  it('names a finite positive cap', () => {
    expect(Number.isFinite(MAX_DECK_STORE_CHARS)).toBe(true);
    expect(MAX_DECK_STORE_CHARS).toBeGreaterThan(0);
    expect(MAX_DECK_STORE_CHARS).toBeLessThanOrEqual(5_000_000);
  });

  it('refuses a write whose payload exceeds the cap, without throwing or touching storage', () => {
    const s = mem();
    writeDecks([deck('keep')], s);
    const before = s.data.get(DECK_STORE_KEY);
    s.sets.length = 0;
    const decks: Deck[] = [];
    while (envelope(decks).length <= MAX_DECK_STORE_CHARS) decks.push(hugeDeck(`h${decks.length}`));
    let result: ReturnType<typeof writeDecks> | undefined;
    expect(() => {
      result = writeDecks(decks, s);
    }).not.toThrow();
    expect(result).toEqual({ ok: false, reason: 'too-large' });
    expect(s.sets).toEqual([]);
    expect(s.data.get(DECK_STORE_KEY)).toBe(before);
    expect(readDecks(s).decks.map((d) => d.id)).toEqual(['keep']);
  });

  it('accepts a large payload that is under the cap', () => {
    const s = mem();
    const big = hugeDeck('big');
    expect(envelope([big]).length).toBeLessThan(MAX_DECK_STORE_CHARS);
    expect(writeDecks([big], s)).toEqual({ ok: true });
    expect(readDecks(s).decks).toEqual([big]);
  });

  it('treats stored text over the cap as unreadable', () => {
    const text = envelope([deck('a')]) + ' '.repeat(MAX_DECK_STORE_CHARS);
    expect(readDecks(mem({ [DECK_STORE_KEY]: text })).decks).toEqual([]);
  });
});

describe('deck-store load validation', () => {
  it('skips invalid decks and keeps valid ones in order', () => {
    const tooFewAnswers = { id: 'few', title: 'Few', cards: [card('x', 1), card('y', 2)] };
    const text = envelope([deck('a'), { nope: true }, tooFewAnswers, 'string', null, deck('c')]);
    const read = readDecks(mem({ [DECK_STORE_KEY]: text }));
    expect(read.readFailed).toBe(false);
    expect(read.decks.map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('returns only allowlisted deck-schema fields', () => {
    const raw = { ...deck('a'), evil: 'x', cards: deck('a').cards.map((c) => ({ ...c, onclick: 'y' })) };
    const [loaded] = readDecks(mem({ [DECK_STORE_KEY]: envelope([raw]) })).decks;
    expect(loaded).toEqual(deck('a'));
    expect(Object.keys(loaded)).not.toContain('evil');
    expect(Object.keys(loaded.cards[0])).not.toContain('onclick');
  });

  it.each([
    ['bad JSON', '{not json'],
    ['unknown newer version', envelope([deck('a')], DECK_STORE_VERSION + 1)],
    ['missing version', JSON.stringify({ decks: [deck('a')] })],
    ['decks not an array', JSON.stringify({ version: DECK_STORE_VERSION, decks: { a: deck('a') } })],
    ['top-level array', JSON.stringify([deck('a')])],
  ])('an unreadable payload (%s) loads as no decks without throwing', (_label, text) => {
    expect(readDecks(mem({ [DECK_STORE_KEY]: text }))).toEqual({ decks: [], readFailed: false });
  });
});

describe('deck-store backup of unreadable payloads', () => {
  it('copies an unreadable live payload to the backup key before overwriting it', () => {
    const s = mem({ [DECK_STORE_KEY]: '{corrupt' });
    expect(writeDecks([deck('new')], s)).toEqual({ ok: true });
    expect(s.data.get(DECK_STORE_BACKUP_KEY)).toBe('{corrupt');
    expect(readDecks(s).decks.map((d) => d.id)).toEqual(['new']);
  });

  it('backs up a newer-version payload rather than erasing it', () => {
    const newer = envelope([deck('future')], DECK_STORE_VERSION + 1);
    const s = mem({ [DECK_STORE_KEY]: newer });
    expect(writeDecks([deck('now')], s).ok).toBe(true);
    expect(s.data.get(DECK_STORE_BACKUP_KEY)).toBe(newer);
  });

  it('refuses to overwrite an unreadable live payload when the backup already holds one', () => {
    const s = mem({ [DECK_STORE_KEY]: '{second corrupt', [DECK_STORE_BACKUP_KEY]: '{first corrupt' });
    expect(writeDecks([deck('new')], s).ok).toBe(false);
    expect(s.data.get(DECK_STORE_KEY)).toBe('{second corrupt');
    expect(s.data.get(DECK_STORE_BACKUP_KEY)).toBe('{first corrupt');
  });

  it('a readable live payload is overwritten without touching an existing backup', () => {
    const s = mem({ [DECK_STORE_KEY]: envelope([deck('old')]), [DECK_STORE_BACKUP_KEY]: '{first corrupt' });
    expect(writeDecks([deck('new')], s).ok).toBe(true);
    expect(s.data.get(DECK_STORE_BACKUP_KEY)).toBe('{first corrupt');
    expect(readDecks(s).decks.map((d) => d.id)).toEqual(['new']);
  });
});

describe('deck-store storage exceptions', () => {
  const thrower = () => {
    throw new Error('storage unavailable');
  };

  it('a throwing read yields no decks and readFailed: true', () => {
    const s = { getItem: thrower, setItem: thrower, removeItem: thrower };
    expect(readDecks(s)).toEqual({ decks: [], readFailed: true });
  });

  it('a throwing setItem yields ok: false, never throws', () => {
    const s = { ...mem(), setItem: thrower };
    let result: ReturnType<typeof writeDecks> | undefined;
    expect(() => {
      result = writeDecks([deck('a')], s);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
  });

  it('a throwing getItem during write yields ok: false and writes nothing', () => {
    const sets: string[] = [];
    const s = { getItem: thrower, setItem: (k: string) => void sets.push(k), removeItem: thrower };
    expect(writeDecks([deck('a')], s).ok).toBe(false);
    expect(sets).toEqual([]);
  });

  it('an empty-list write with a throwing removeItem yields ok: false, never throws', () => {
    const base = mem({ [DECK_STORE_KEY]: envelope([deck('a')]) });
    const s = { ...base, removeItem: thrower };
    expect(() => writeDecks([], s)).not.toThrow();
  });
});

describe('deck-store prototype-pollution safety', () => {
  it('round-trips __proto__ / constructor / prototype deck and card ids', () => {
    const s = mem();
    const decks: Deck[] = ['__proto__', 'constructor', 'prototype'].map((id) => ({
      id,
      title: `Title ${id}`,
      cards: [card('__proto__', 1), card('constructor', 2), card('prototype', 3), card('toString', 4)],
    }));
    expect(writeDecks(decks, s).ok).toBe(true);
    const read = readDecks(s).decks;
    expect(read.map((d) => d.id)).toEqual(['__proto__', 'constructor', 'prototype']);
    expect(read).toEqual(decks);
    expect(({} as Record<string, unknown>).title).toBeUndefined();
  });

  it('a hostile payload with __proto__ keys pollutes nothing', () => {
    const hostileDeck = `{"__proto__":{"polluted":true},"id":"h","title":"H","cards":${JSON.stringify(deck('h').cards)}}`;
    const text = `{"__proto__":{"polluted":true},"version":${DECK_STORE_VERSION},"decks":[${hostileDeck}]}`;
    const read = readDecks(mem({ [DECK_STORE_KEY]: text }));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
    expect(read.decks.map((d) => d.id)).toEqual(['h']);
    expect((read.decks[0] as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });
});
