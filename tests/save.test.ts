// Requirement: FSRS progress persists across sessions as one versioned JSON save holding per-card
// FSRS state and the global daily counters. Loading must never crash the game: malformed JSON,
// wrong version/shape, non-finite or out-of-range numbers, invalid dates, or oversized input all
// yield an empty save instead of throwing (and never pollute Object.prototype). Storage sits
// behind an injected localStorage-shaped interface; the default (globalThis.localStorage) is
// guarded so a missing or throwing storage (private mode, quota) degrades to "no save" silently.
// No spec-cache ID exists yet for save persistence; Covers tags cite plan IDs
// (docs/plans/2026-10-28-vr-flashcard-game.md D5, S6a).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SAVE_CHARS,
  SAVE_VERSION,
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
  version: SAVE_VERSION,
  cards: { abc123: { ...card } },
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
  base.cards.abc123[field] = '__RAW__';
  return JSON.stringify(base).replace('"__RAW__"', rawValue);
}

// Covers: D5, S6a
describe('serializeSave / parseSave round trip', () => {
  it('empty save is version-stamped with no cards and no counters', () => {
    expect(emptySave()).toEqual({ version: SAVE_VERSION, cards: {}, counters: null });
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
    ['missing cards', JSON.stringify({ version: SAVE_VERSION, counters: null })],
    ['cards is an array', JSON.stringify({ version: SAVE_VERSION, cards: [], counters: null })],
    ['non-finite stability (1e999)', withCardField('stability', '1e999')],
    ['negative stability', withCardField('stability', '-1')],
    ['stability as string', withCardField('stability', '"12"')],
    ['null difficulty', withCardField('difficulty', 'null')],
    ['negative reps', withCardField('reps', '-1')],
    ['fractional lapses', withCardField('lapses', '1.5')],
    ['unknown FSRS state', withCardField('state', '7')],
    ['unparseable due date', withCardField('due', '"not a date"')],
    ['missing lastReview', withCardField('lastReview', 'null')],
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

  it('a __proto__ card key does not pollute Object.prototype', () => {
    const text = `{"version":${SAVE_VERSION},"cards":{"__proto__":${JSON.stringify({ ...card, polluted: true })}},"counters":null}`;
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
