// Requirement: FSRS progress persists across sessions as one versioned JSON save holding FSRS state
// per deck, then per card (see tests/per-deck-progress.test.ts), and the global daily counters.
// Loading must never crash the game: malformed JSON,
// wrong version/shape, or oversized input yield an empty save instead of throwing (and never
// pollute Object.prototype). A defect inside ONE card (non-finite or out-of-range numbers,
// non-ISO-8601 dates, stability above a sane cap, difficulty outside [1,10]) drops only that card;
// every other card and the counters are kept. Progress is never lost silently: stored text that
// is corrupt or from a newer save version is copied to a backup storage key before any write
// replaces it. A present but invalid deck entry or orphans map makes the whole save unreadable
// (backed up), never silently dropped. A save whose text would exceed MAX_SAVE_CHARS is refused on
// write (live save and backup untouched), since a later load would reject it. Storage sits
// behind an injected localStorage-shaped interface; the default (globalThis.localStorage) is
// guarded so a missing or throwing storage (private mode, quota) degrades to "no save" silently.
// No spec-cache ID exists yet for save persistence; Covers tags cite plan IDs
// (docs/plans/2026-10-28-vr-flashcard-game.md D5, S6a).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SAVE_CHARS,
  SAVE_BACKUP_KEY,
  SAVE_VERSION,
  deckCards,
  emptySave,
  loadSave,
  parseSave,
  serializeSave,
  writeSave,
  type SaveData,
  type SaveStorage,
} from '../src/flashcards/save.js';

const card = {
  stability: 12.5,
  difficulty: 4.2,
  state: 2 as const,
  reps: 4,
  lapses: 1,
  due: '2026-11-20T09:00:00.000Z',
  lastReview: '2026-11-07T09:00:00.000Z',
};

const sample = (): SaveData => ({
  ...emptySave(),
  decks: { d1: { abc123: { ...card } } },
  counters: { day: '2026-11-07', newCount: 3, reviewCount: 17 },
});

function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

const throwingStorage: SaveStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

/** Build save JSON with one card field overridden (raw text so 1e999 survives). */
function withCardField(field: string, rawValue: string): string {
  const base = JSON.parse(serializeSave(sample()));
  base.decks.d1.abc123[field] = '__RAW__';
  return JSON.stringify(base).replace('"__RAW__"', rawValue);
}

// Covers: D5, S6a
describe('serializeSave / parseSave round trip', () => {
  it('empty save is version-stamped with no cards and no counters', () => {
    expect(emptySave()).toEqual({ version: SAVE_VERSION, decks: {}, orphans: {}, counters: null });
  });

  it('round-trips a populated save', () => {
    expect(parseSave(serializeSave(sample()))).toEqual(sample());
  });

  it('round-trips the empty save', () => {
    expect(parseSave(serializeSave(emptySave()))).toEqual(emptySave());
  });

  it('serialized form is JSON carrying the version', () => {
    expect(JSON.parse(serializeSave(sample())).version).toBe(SAVE_VERSION);
  });
});

// Covers: D5, S6a
describe('parseSave rejects bad input safely (empty save, never throws)', () => {
  const bad: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['empty string', ''],
    ['malformed JSON', '{"version":1,"cards":'],
    ['top-level array', '[]'],
    ['JSON null', 'null'],
    ['wrong version', JSON.stringify({ ...sample(), version: 999 })],
    ['missing decks', JSON.stringify({ version: SAVE_VERSION, counters: null })],
    ['decks is an array', JSON.stringify({ version: SAVE_VERSION, decks: [], counters: null })],
    [
      'non-finite counter',
      JSON.stringify({ ...sample(), counters: { day: '2026-11-07', newCount: 0, reviewCount: 0 } }).replace(
        '"reviewCount":0',
        '"reviewCount":1e999',
      ),
    ],
    [
      'negative counter',
      JSON.stringify({ ...sample(), counters: { day: '2026-11-07', newCount: -3, reviewCount: 0 } }),
    ],
    ['malformed counter day', JSON.stringify({ ...sample(), counters: { day: 'yesterday', newCount: 0, reviewCount: 0 } })],
  ];

  for (const [label, input] of bad) {
    it(`${label} -> empty save`, () => {
      let result: SaveData | undefined;
      expect(() => {
        result = parseSave(input);
      }).not.toThrow();
      expect(result).toEqual(emptySave());
    });
  }

  it('input longer than MAX_SAVE_CHARS -> empty save without parsing', () => {
    const huge = serializeSave(sample()).replace('{', `{"pad":"${'x'.repeat(MAX_SAVE_CHARS)}",`);
    expect(huge.length).toBeGreaterThan(MAX_SAVE_CHARS);
    expect(parseSave(huge)).toEqual(emptySave());
  });

  it('a save just under MAX_SAVE_CHARS is still accepted', () => {
    const text = serializeSave(sample());
    expect(text.length).toBeLessThanOrEqual(MAX_SAVE_CHARS);
    expect(parseSave(text)).toEqual(sample());
  });

  // Card-level defects drop only that card (see 'one bad card is skipped' below).
  const badCard: [string, string][] = [
    ['non-finite stability (1e999)', withCardField('stability', '1e999')],
    ['negative stability', withCardField('stability', '-1')],
    ['stability as string', withCardField('stability', '"12"')],
    ['null difficulty', withCardField('difficulty', 'null')],
    ['negative reps', withCardField('reps', '-1')],
    ['fractional lapses', withCardField('lapses', '1.5')],
    ['unknown FSRS state', withCardField('state', '7')],
    ['unparseable due date', withCardField('due', '"not a date"')],
    ['missing lastReview', withCardField('lastReview', 'null')],
  ];
  for (const [label, input] of badCard) {
    it(`${label} -> that card dropped, counters kept`, () => {
      const parsed = parseSave(input);
      expect(parsed).toEqual({ ...sample(), decks: { d1: {} } });
      expect(parsed.orphans).toEqual({});
    });
  }

  it('a __proto__ card key does not pollute Object.prototype', () => {
    const text = `{"version":${SAVE_VERSION},"decks":{"d1":{"__proto__":${JSON.stringify({ ...card, polluted: true })}}},"counters":null}`;
    expect(() => parseSave(text)).not.toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).stability).toBeUndefined();
  });
});

// Covers: D5, S6a
describe('loadSave / writeSave via injected storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('write then load round-trips through the storage', () => {
    const storage = memoryStorage();
    expect(writeSave(sample(), storage)).toBe(true);
    expect(storage.data.size).toBe(1);
    expect(loadSave(storage)).toEqual(sample());
  });

  it('empty storage -> empty save', () => {
    expect(loadSave(memoryStorage())).toEqual(emptySave());
  });

  it('corrupted stored value -> empty save', () => {
    const storage = memoryStorage();
    writeSave(sample(), storage);
    const [key] = [...storage.data.keys()];
    storage.data.set(key, '{"version":1,"cards":{"x":');
    expect(loadSave(storage)).toEqual(emptySave());
  });

  it('throwing storage: load -> empty save, write -> false, neither throws', () => {
    expect(() => loadSave(throwingStorage)).not.toThrow();
    expect(loadSave(throwingStorage)).toEqual(emptySave());
    expect(() => writeSave(sample(), throwingStorage)).not.toThrow();
    expect(writeSave(sample(), throwingStorage)).toBe(false);
  });

  it('defaults to globalThis.localStorage', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(writeSave(sample())).toBe(true);
    expect(storage.data.size).toBe(1);
    expect(loadSave()).toEqual(sample());
  });

  it('missing localStorage: default load/write degrade silently', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadSave()).toEqual(emptySave());
    expect(writeSave(sample())).toBe(false);
  });

  it('throwing default localStorage degrades silently', () => {
    vi.stubGlobal('localStorage', throwingStorage);
    expect(loadSave()).toEqual(emptySave());
    expect(writeSave(sample())).toBe(false);
  });
});

/** Two-card save where card `bad` has one field replaced by raw JSON text. */
function twoCardsWithBad(field: string, rawValue: string): string {
  const base = JSON.parse(serializeSave(sample()));
  base.decks.d1.bad = { ...card, [field]: '__RAW__' };
  return JSON.stringify(base).replace('"__RAW__"', rawValue);
}

// Covers: D5, S6a
describe('parseSave: one bad card is skipped, the rest of the save survives', () => {
  it('invalid card among valid ones -> only that card dropped', () => {
    expect(parseSave(twoCardsWithBad('stability', '-1'))).toEqual(sample());
  });

  it('card that is not an object -> only that card dropped', () => {
    const base = JSON.parse(serializeSave(sample()));
    base.decks.d1.bad = 'oops';
    expect(parseSave(JSON.stringify(base))).toEqual(sample());
  });

  it('load then write keeps the valid cards (no progress erased)', () => {
    const storage = memoryStorage();
    writeSave(sample(), storage);
    const [key] = [...storage.data.keys()];
    storage.data.set(key, twoCardsWithBad('difficulty', 'null'));
    expect(writeSave(loadSave(storage), storage)).toBe(true);
    expect(loadSave(storage)).toEqual(sample());
  });
});

// Covers: D5, S6a
describe('parseSave: strict per-card dates and number ranges', () => {
  const rejected: [string, string, string][] = [
    ['due "1"', 'due', '"1"'],
    ['due "2020"', 'due', '"2020"'],
    ['due expanded-year +275760', 'due', '"+275760-09-13T00:00:00.000Z"'],
    ['due free text Date.parse accepts', 'due', '"March 7, 2026"'],
    ['lastReview "1"', 'lastReview', '"1"'],
    ['lastReview "2020"', 'lastReview', '"2020"'],
    ['lastReview expanded-year +275760', 'lastReview', '"+275760-09-13T00:00:00.000Z"'],
    ['stability far above any sane cap (1e12)', 'stability', '1e12'],
    ['stability 1e300', 'stability', '1e300'],
    ['difficulty below 1', 'difficulty', '0.5'],
    ['difficulty above 10', 'difficulty', '10.5'],
    ['negative difficulty', 'difficulty', '-3'],
  ];
  for (const [label, field, raw] of rejected) {
    it(`${label} -> that card rejected, other card kept`, () => {
      expect(parseSave(twoCardsWithBad(field, raw))).toEqual(sample());
    });
  }

  const accepted: [string, string, unknown][] = [
    ['difficulty exactly 1', 'difficulty', 1],
    ['difficulty exactly 10', 'difficulty', 10],
    ['full ISO-8601 with offset', 'due', '2026-11-20T09:00:00+02:00'],
    ['stability of one year', 'stability', 365],
  ];
  for (const [label, field, value] of accepted) {
    it(`${label} -> card kept`, () => {
      const data = sample();
      data.decks.d1.abc123 = { ...card, [field]: value };
      expect(parseSave(serializeSave(data))).toEqual(data);
    });
  }
});

/** True when some storage entry other than the live save key holds exactly `raw`. */
function backedUp(storage: ReturnType<typeof memoryStorage>, liveKey: string, raw: string): boolean {
  return [...storage.data.entries()].some(([k, v]) => k !== liveKey && v === raw);
}

function storageHolding(raw: string): { storage: ReturnType<typeof memoryStorage>; key: string } {
  const storage = memoryStorage();
  writeSave(emptySave(), storage);
  const [key] = [...storage.data.keys()];
  storage.data.set(key, raw);
  return { storage, key };
}

// Covers: D5, S6a
describe('loadSave/writeSave never silently erase unreadable progress (backup key)', () => {
  it('newer save version: raw text survives under a backup key after load + write', () => {
    const future = JSON.stringify({ ...sample(), version: SAVE_VERSION + 1, extra: { x: 1 } });
    const { storage, key } = storageHolding(future);
    writeSave(loadSave(storage), storage);
    expect(backedUp(storage, key, future)).toBe(true);
  });

  it('unparseable text: raw text survives under a backup key after load + write', () => {
    const corrupt = '{"version":1,"cards":{"abc123":{"stability":12.5,';
    const { storage, key } = storageHolding(corrupt);
    writeSave(loadSave(storage), storage);
    expect(backedUp(storage, key, corrupt)).toBe(true);
  });

  it('backup is not clobbered by a later write of the fresh save', () => {
    const corrupt = 'not json at all';
    const { storage, key } = storageHolding(corrupt);
    writeSave(loadSave(storage), storage);
    writeSave(sample(), storage);
    expect(backedUp(storage, key, corrupt)).toBe(true);
    expect(loadSave(storage)).toEqual(sample());
  });
});

// Covers: D5, S6a
describe('writeSave never overwrites an existing backup or an unbacked unreadable save', () => {
  it('backup exists and live save is unreadable -> returns false, backup and live text unchanged', () => {
    const { storage, key } = storageHolding('second unreadable save');
    storage.data.set(SAVE_BACKUP_KEY, 'first unreadable save');
    expect(writeSave(sample(), storage)).toBe(false);
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe('first unreadable save');
    expect(storage.data.get(key)).toBe('second unreadable save');
  });

  it('backup exists and live save is valid -> normal write succeeds, backup unchanged', () => {
    const storage = memoryStorage();
    writeSave(emptySave(), storage);
    storage.data.set(SAVE_BACKUP_KEY, 'old unreadable save');
    expect(writeSave(sample(), storage)).toBe(true);
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe('old unreadable save');
    expect(loadSave(storage)).toEqual(sample());
  });

  it('backup exists and no live save -> normal write succeeds, backup unchanged', () => {
    const storage = memoryStorage();
    storage.data.set(SAVE_BACKUP_KEY, 'old unreadable save');
    expect(writeSave(sample(), storage)).toBe(true);
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe('old unreadable save');
    expect(loadSave(storage)).toEqual(sample());
  });
});

/** A save whose serialized text is longer than MAX_SAVE_CHARS (so a later load would reject it). */
function oversizedSave(): SaveData {
  const cards: Record<string, typeof card> = {};
  for (let i = 0; i < 8000; i++) cards[`c${i}`] = { ...card };
  return { ...sample(), decks: { d1: cards } };
}

// Covers: D5, S6a
describe('writeSave refuses a save too large to read back', () => {
  it('oversized save over a valid live save -> false, live save unchanged, no backup written', () => {
    const huge = oversizedSave();
    expect(serializeSave(huge).length).toBeGreaterThan(MAX_SAVE_CHARS);
    const storage = memoryStorage();
    writeSave(sample(), storage);
    const [key] = [...storage.data.keys()];
    let ok: boolean | undefined;
    expect(() => {
      ok = writeSave(huge, storage);
    }).not.toThrow();
    expect(ok).toBe(false);
    expect(storage.data.get(key)).toBe(serializeSave(sample()));
    expect(storage.data.has(SAVE_BACKUP_KEY)).toBe(false);
    expect(deckCards(loadSave(storage), 'd1')).toEqual(deckCards(sample(), 'd1'));
  });

  it('oversized save over an unreadable live save -> false, live text and existing backup untouched', () => {
    const { storage, key } = storageHolding('not json at all');
    storage.data.set(SAVE_BACKUP_KEY, 'earlier backup');
    expect(writeSave(oversizedSave(), storage)).toBe(false);
    expect(storage.data.get(key)).toBe('not json at all');
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe('earlier backup');
  });

  it('oversized save over an unreadable live save with no backup -> false, nothing written', () => {
    const { storage, key } = storageHolding('not json at all');
    expect(writeSave(oversizedSave(), storage)).toBe(false);
    expect(storage.data.get(key)).toBe('not json at all');
    expect(storage.data.has(SAVE_BACKUP_KEY)).toBe(false);
  });
});

/** Version-2 save JSON from sample() with one top-level field replaced by raw JSON text. */
function withTopField(field: string, rawValue: string): string {
  const base = JSON.parse(serializeSave(sample()));
  base[field] = '__RAW__';
  return JSON.stringify(base).replace('"__RAW__"', rawValue);
}

/** Version-2 save JSON from sample() plus one extra deck entry given as raw JSON text. */
function withDeckEntry(deckId: string, rawValue: string): string {
  const base = JSON.parse(serializeSave(sample()));
  base.decks[deckId] = '__RAW__';
  return JSON.stringify(base).replace('"__RAW__"', rawValue);
}

/** Load then write over `raw`; returns the storage for backup / live-text assertions. */
function loadThenWrite(raw: string, backup?: string) {
  const { storage, key } = storageHolding(raw);
  if (backup !== undefined) storage.data.set(SAVE_BACKUP_KEY, backup);
  const wrote = writeSave(loadSave(storage), storage);
  return { storage, key, wrote };
}

// Covers: D5, S6a
describe('parseSave: a present but invalid orphans map makes the save unreadable (backed up)', () => {
  const badOrphans: [string, string][] = [
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"oops"'],
    ['a number', '7'],
  ];
  for (const [label, raw] of badOrphans) {
    it(`orphans is ${label} -> empty save, raw text backed up before the first write`, () => {
      const text = withTopField('orphans', raw);
      expect(parseSave(text)).toEqual(emptySave());
      const { storage, wrote } = loadThenWrite(text);
      expect(wrote).toBe(true);
      expect(storage.data.get(SAVE_BACKUP_KEY)).toBe(text);
    });

    it(`orphans is ${label} with the backup occupied -> write refused, live text unchanged`, () => {
      const text = withTopField('orphans', raw);
      const { storage, key, wrote } = loadThenWrite(text, 'earlier backup');
      expect(wrote).toBe(false);
      expect(storage.data.get(key)).toBe(text);
      expect(storage.data.get(SAVE_BACKUP_KEY)).toBe('earlier backup');
    });
  }

  it('a missing orphans field still reads as an empty orphans map', () => {
    const base = JSON.parse(serializeSave(sample()));
    delete base.orphans;
    const parsed = parseSave(JSON.stringify(base));
    expect(parsed).toEqual(sample());
    expect(parsed.orphans).toEqual({});
  });
});

// Covers: D5, S6a
describe('parseSave: a present but invalid deck entry makes the save unreadable (backed up)', () => {
  const badDecks: [string, string, string][] = [
    ['deck entry null', 'a', 'null'],
    ['deck entry an array', 'a', '[]'],
    ['deck entry a string', 'a', '"oops"'],
    ['deck id over 200 chars', 'x'.repeat(201), '{}'],
  ];
  for (const [label, deckId, raw] of badDecks) {
    it(`${label} -> empty save, not silently dropped`, () => {
      expect(parseSave(withDeckEntry(deckId, raw))).toEqual(emptySave());
    });

    it(`${label} -> raw text backed up before the first write`, () => {
      const text = withDeckEntry(deckId, raw);
      const { storage, wrote } = loadThenWrite(text);
      expect(wrote).toBe(true);
      expect(storage.data.get(SAVE_BACKUP_KEY)).toBe(text);
    });
  }

  it('a deck id of exactly 200 chars is still a valid deck', () => {
    const id = 'x'.repeat(200);
    const data: SaveData = { ...sample(), decks: { ...sample().decks, [id]: { abc123: { ...card } } } };
    expect(parseSave(serializeSave(data))).toEqual(data);
  });
});
