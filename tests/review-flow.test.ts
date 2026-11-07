// Requirement: a study session joins voice/orb grading to FSRS scheduling and the persisted save,
// so src/cards.ts calls one module instead of wiring matcher, answer-outcome, scheduler and save
// itself. API (src/flashcards/review-flow.ts):
//   loadReview(storage, deck, now, { deckId, knownDecks? }) -> ReviewState { save, queue, saveFailed }
//   (progress is read and written under deckId only; see tests/per-deck-progress.test.ts)
//   startEncounter(cardId) -> Encounter { cardId, answer: AnswerState }
//   submitAnswer(state, encounter, attempt, { deck, storage, now })
//     -> { state, encounter, outcome: VoiceResult, rating: 'again' | 'hard' | 'good' | null }
//   attempt = { kind: 'voice', transcript } | { kind: 'orb', label }  (orb label === card answer -> correct)
// Grading reuses answer-outcome (plan D4): Didn't catch is never graded; the FIRST graded attempt
// of an encounter is the only FSRS write for that card in that encounter; later attempts in the
// same encounter change nothing; a fresh encounter (next study day) can grade again. The save is
// written through the injected storage after each graded attempt; a throwing storage never crashes
// and never loses the in-memory progress (saveFailed flag instead). A corrupt or missing save
// loads as fresh progress and the unreadable text is preserved via the save module's backup key.
// The clock is always injected; inputs are never mutated.
// No spec-cache ID exists yet for FSRS scheduling/save; Covers tags cite plan IDs as the
// scheduler/save/answer-outcome tests do (docs/plans/2026-10-28-vr-flashcard-game.md D4, D5, S6a).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadReview,
  startEncounter,
  submitAnswer,
  type Encounter,
  type ReviewState,
} from '../src/flashcards/review-flow.js';
import { SAVE_BACKUP_KEY, deckCards, emptySave, loadSave, writeSave, type SaveStorage } from '../src/flashcards/save.js';
import type { MatchCard } from '../src/flashcards/matcher.js';

const deck: MatchCard[] = [
  { id: 'aff', answer: 'afferent', reject: ['efferent'] },
  { id: 'mito', answer: 'mitochondria' },
  { id: 'ion', answer: 'ion channel' },
  { id: 'syn', answer: 'synapse' },
];

const DECK_ID = 'neuro';
const KEY = { deckId: DECK_ID };

// 10:00 local: well clear of the 04:00 study-day rollover.
const NOW = new Date(2026, 10, 7, 10, 0, 0);
const LATER_SAME_DAY = new Date(2026, 10, 7, 10, 5, 0);
const NEXT_DAY = new Date(2026, 10, 8, 10, 0, 0);

function memoryStorage(): SaveStorage & { data: Map<string, string>; writes: string[] } {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    data,
    writes,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      writes.push(k);
      data.set(k, v);
    },
  };
}

// Discover the live save key the same way tests/save.test.ts does (it is not exported).
function liveKey(): string {
  const s = memoryStorage();
  writeSave(emptySave(), s);
  return [...s.data.keys()][0];
}

const voice = (transcript: string) => ({ kind: 'voice' as const, transcript });
const orb = (label: string) => ({ kind: 'orb' as const, label });

function env(storage: SaveStorage, now: Date = NOW) {
  return { deck, storage, now };
}

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

afterEach(() => {
  vi.useRealTimers();
});

// Covers: D5, S6a
describe('loadReview: start-of-session load', () => {
  it('missing save -> fresh progress and today\'s queue of New cards in deck order', () => {
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    expect(state.save).toEqual(emptySave());
    expect(state.queue.day).toBe('2026-11-07');
    expect(state.queue.ids).toEqual(['aff', 'mito', 'ion', 'syn']);
    expect(state.saveFailed).toBe(false);
  });

  it('existing save -> its cards are loaded and a card reviewed today is not queued again', () => {
    const storage = memoryStorage();
    submitAnswer(loadReview(storage, deck, NOW, KEY), startEncounter('aff'), voice('afferent'), env(storage));
    const reloaded = loadReview(storage, deck, LATER_SAME_DAY, KEY);
    expect(Object.keys(deckCards(reloaded.save, DECK_ID))).toEqual(['aff']);
    expect(reloaded.queue.ids).not.toContain('aff');
    expect(reloaded.queue.ids).toEqual(['mito', 'ion', 'syn']);
  });

  it('corrupt save -> fresh progress, no throw, and the corrupt text is left in place on load', () => {
    const storage = memoryStorage();
    const key = liveKey();
    const corrupt = '{"version":1,"cards":{"x":';
    storage.data.set(key, corrupt);
    let state: ReviewState | undefined;
    expect(() => {
      state = loadReview(storage, deck, NOW, KEY);
    }).not.toThrow();
    expect(state?.save).toEqual(emptySave());
    expect(storage.data.get(key)).toBe(corrupt);
  });

  it('corrupt save is not destroyed by the first graded write: it is copied to the backup key', () => {
    const storage = memoryStorage();
    const key = liveKey();
    const corrupt = 'not json at all';
    storage.data.set(key, corrupt);
    const state = loadReview(storage, deck, NOW, KEY);
    const r = submitAnswer(state, startEncounter('aff'), voice('afferent'), env(storage));
    expect(r.state.saveFailed).toBe(false);
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe(corrupt);
    expect(Object.keys(deckCards(loadSave(storage), DECK_ID))).toEqual(['aff']);
  });

  it('throwing storage on load -> fresh progress, no throw', () => {
    const storage: SaveStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(() => loadReview(storage, deck, NOW, KEY)).not.toThrow();
    expect(loadReview(storage, deck, NOW, KEY).save).toEqual(emptySave());
  });
});

// Covers: D4, MATCH-004, MATCH-005
describe('submitAnswer: classification via answer-outcome', () => {
  it.each([
    ['afferent', 'correct', 'good'],
    ['mitochondria', 'wrong', 'again'],
    ['efferent', 'wrong', 'again'],
  ] as const)('voice %j on aff -> %s, rating %s', (transcript, outcome, rating) => {
    const storage = memoryStorage();
    const r = submitAnswer(loadReview(storage, deck, NOW, KEY), startEncounter('aff'), voice(transcript), env(storage));
    expect(r.outcome).toBe(outcome);
    expect(r.rating).toBe(rating);
  });

  it.each(['', '   ', '?!...', 'a'.repeat(500)])('voice %j -> didnt-catch, not graded, nothing saved', (transcript) => {
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    const r = submitAnswer(state, startEncounter('aff'), voice(transcript), env(storage));
    expect(r.outcome).toBe('didnt-catch');
    expect(r.rating).toBeNull();
    expect(deckCards(r.state.save, DECK_ID)).toEqual({});
    expect(storage.writes).toEqual([]);
  });

  it('didnt-catch leaves the encounter open: a following correct answer is graded good', () => {
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    const first = submitAnswer(state, startEncounter('aff'), voice(''), env(storage));
    const second = submitAnswer(first.state, first.encounter, voice('afferent'), env(storage));
    expect(second.outcome).toBe('correct');
    expect(second.rating).toBe('good');
    expect(deckCards(second.state.save, DECK_ID).aff).toBeDefined();
  });

  it('orb choice: matching label -> correct/good; other label -> wrong/again', () => {
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    const right = submitAnswer(state, startEncounter('mito'), orb('mitochondria'), env(storage));
    expect([right.outcome, right.rating]).toEqual(['correct', 'good']);
    const wrong = submitAnswer(state, startEncounter('syn'), orb('ion channel'), env(storage));
    expect([wrong.outcome, wrong.rating]).toEqual(['wrong', 'again']);
  });
});

// Covers: D4, D5
describe('submitAnswer: exactly one FSRS write per card per encounter', () => {
  it('wrong then correct in one encounter: only the first (again) is recorded', () => {
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    const first = submitAnswer(state, startEncounter('aff'), voice('mitochondria'), env(storage));
    expect(first.rating).toBe('again');
    const afterFirst = deckCards(first.state.save, DECK_ID).aff;
    expect(afterFirst).toBeDefined();
    const second = submitAnswer(first.state, first.encounter, voice('afferent'), env(storage, LATER_SAME_DAY));
    expect(second.outcome).toBe('correct');
    expect(second.rating).toBeNull();
    expect(deckCards(second.state.save, DECK_ID).aff).toEqual(afterFirst);
    expect(second.state.save.counters).toEqual(first.state.save.counters);
  });

  it('repeated wrong answers after the first change nothing', () => {
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    const first = submitAnswer(state, startEncounter('aff'), voice('synapse'), env(storage));
    const second = submitAnswer(first.state, first.encounter, voice('ion channel'), env(storage, LATER_SAME_DAY));
    expect(second.rating).toBeNull();
    expect(second.state.save).toEqual(first.state.save);
  });

  it('the save is written once per graded encounter, not per attempt', () => {
    const storage = memoryStorage();
    const key = liveKey();
    let state = loadReview(storage, deck, NOW, KEY);
    let r = submitAnswer(state, startEncounter('aff'), voice(''), env(storage));
    r = submitAnswer(r.state, r.encounter, voice('synapse'), env(storage));
    r = submitAnswer(r.state, r.encounter, voice('afferent'), env(storage));
    expect(storage.writes.filter((k) => k === key)).toHaveLength(1);
    state = r.state;
    submitAnswer(state, startEncounter('mito'), voice('mitochondria'), env(storage));
    expect(storage.writes.filter((k) => k === key)).toHaveLength(2);
  });

  it('a graded New card counts once against today\'s new budget', () => {
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    const first = submitAnswer(state, startEncounter('aff'), voice('synapse'), env(storage));
    const second = submitAnswer(first.state, first.encounter, voice('afferent'), env(storage));
    expect(second.state.save.counters).toEqual({ day: '2026-11-07', newCount: 1, reviewCount: 0 });
  });

  it('a new encounter on the next study day grades the card again', () => {
    const storage = memoryStorage();
    const day1 = loadReview(storage, deck, NOW, KEY);
    const graded1 = submitAnswer(day1, startEncounter('aff'), voice('synapse'), env(storage));
    const day2 = loadReview(storage, deck, NEXT_DAY, KEY);
    expect(deckCards(day2.save, DECK_ID).aff).toEqual(deckCards(graded1.state.save, DECK_ID).aff);
    const graded2 = submitAnswer(day2, startEncounter('aff'), voice('afferent'), env(storage, NEXT_DAY));
    expect(graded2.rating).toBe('good');
    expect(deckCards(graded2.state.save, DECK_ID).aff.lastReview).toBe(NEXT_DAY.toISOString());
    expect(deckCards(graded2.state.save, DECK_ID).aff.reps).toBe(deckCards(graded1.state.save, DECK_ID).aff.reps + 1);
    expect(deckCards(loadSave(storage), DECK_ID).aff).toEqual(deckCards(graded2.state.save, DECK_ID).aff);
  });
});

// Covers: D5, S6a
describe('submitAnswer: save failures never crash or lose progress', () => {
  it('throwing setItem -> no throw, saveFailed true, in-memory progress kept', () => {
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    const failing: SaveStorage = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    let r: ReturnType<typeof submitAnswer> | undefined;
    expect(() => {
      r = submitAnswer(state, startEncounter('aff'), voice('afferent'), env(failing));
    }).not.toThrow();
    expect(r?.state.saveFailed).toBe(true);
    expect(r?.rating).toBe('good');
    expect(deckCards(r!.state.save, DECK_ID).aff).toBeDefined();
  });

  it('a later successful save clears saveFailed and persists the progress kept in memory', () => {
    const storage = memoryStorage();
    const failing: SaveStorage = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const state = loadReview(storage, deck, NOW, KEY);
    const failed = submitAnswer(state, startEncounter('aff'), voice('afferent'), env(failing));
    const ok = submitAnswer(failed.state, startEncounter('mito'), voice('mitochondria'), env(storage));
    expect(ok.state.saveFailed).toBe(false);
    expect(Object.keys(deckCards(loadSave(storage), DECK_ID)).sort()).toEqual(['aff', 'mito']);
  });
});

// Covers: D5
describe('review-flow purity: injected clock, inputs never mutated', () => {
  it('uses the injected now, never the system clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2001, 0, 1, 12, 0, 0));
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    expect(state.queue.day).toBe('2026-11-07');
    const r = submitAnswer(state, startEncounter('aff'), voice('afferent'), env(storage));
    expect(deckCards(r.state.save, DECK_ID).aff.lastReview).toBe(NOW.toISOString());
    expect(r.state.save.counters?.day).toBe('2026-11-07');
  });

  it('deck, state, encounter and attempt are not mutated (frozen inputs do not throw)', () => {
    const storage = memoryStorage();
    const frozenDeck = deepFreeze(structuredClone(deck));
    const state = deepFreeze(loadReview(storage, frozenDeck, NOW, KEY));
    const snapshot = structuredClone(state);
    const enc: Encounter = deepFreeze(startEncounter('aff'));
    const encSnapshot = structuredClone(enc);
    const attempt = deepFreeze(voice('synapse'));
    const r = submitAnswer(state, enc, attempt, { deck: frozenDeck, storage, now: NOW });
    expect(r.rating).toBe('again');
    const r2 = submitAnswer(r.state, deepFreeze(r.encounter), deepFreeze(voice('afferent')), {
      deck: frozenDeck,
      storage,
      now: NOW,
    });
    expect(r2.rating).toBeNull();
    expect(state).toEqual(snapshot);
    expect(enc).toEqual(encSnapshot);
    expect(frozenDeck).toEqual(deck);
    expect(attempt).toEqual(voice('synapse'));
  });
});

// Covers: D4, D5
describe('submitAnswer: a card id not in the deck is ignored', () => {
  it.each([
    ['voice', voice('afferent')],
    ['orb', orb('afferent')],
  ] as const)('%s attempt on unknown id -> no throw, rating null, no write, counters unchanged', (_kind, attempt) => {
    const storage = memoryStorage();
    const state = loadReview(storage, deck, NOW, KEY);
    let r: ReturnType<typeof submitAnswer> | undefined;
    expect(() => {
      r = submitAnswer(state, startEncounter('ghost'), attempt, env(storage));
    }).not.toThrow();
    expect(r?.rating).toBeNull();
    expect(storage.writes).toEqual([]);
    expect(deckCards(r!.state.save, DECK_ID)).toEqual({});
    expect(r?.state.save.counters).toEqual(state.save.counters);
  });
});

// Covers: D4, D5
describe('submitAnswer: a card already rated this study day is not rated again', () => {
  it('fresh encounter later the same study day: correct answer -> rating null, no write, counters unchanged', () => {
    const storage = memoryStorage();
    const first = submitAnswer(loadReview(storage, deck, NOW, KEY), startEncounter('aff'), voice('synapse'), env(storage));
    expect(first.rating).toBe('again');
    const reloaded = loadReview(storage, deck, LATER_SAME_DAY, KEY);
    const writesBefore = storage.writes.length;
    const r = submitAnswer(reloaded, startEncounter('aff'), voice('afferent'), env(storage, LATER_SAME_DAY));
    expect(r.rating).toBeNull();
    expect(storage.writes).toHaveLength(writesBefore);
    expect(r.state.save.counters).toEqual(reloaded.save.counters);
    expect(deckCards(r.state.save, DECK_ID).aff).toEqual(deckCards(first.state.save, DECK_ID).aff);
  });

  it('one encounter spanning the 04:00 rollover (wrong 03:59, correct 04:01) -> exactly one write', () => {
    const storage = memoryStorage();
    const key = liveKey();
    const before = new Date(2026, 10, 8, 3, 59, 0);
    const after = new Date(2026, 10, 8, 4, 1, 0);
    const first = submitAnswer(loadReview(storage, deck, before, KEY), startEncounter('aff'), voice('synapse'), env(storage, before));
    expect(first.rating).toBe('again');
    const second = submitAnswer(first.state, first.encounter, voice('afferent'), env(storage, after));
    expect(second.rating).toBeNull();
    expect(storage.writes.filter((k) => k === key)).toHaveLength(1);
  });
});

// Covers: D5, S6a
describe('submitAnswer: a save that could not be read is never overwritten', () => {
  it('getItem throws on load then recovers -> later rating writes nothing, saveFailed true, save unchanged', () => {
    const storage = memoryStorage();
    const key = liveKey();
    submitAnswer(loadReview(storage, deck, NOW, KEY), startEncounter('aff'), voice('afferent'), env(storage));
    submitAnswer(loadReview(storage, deck, NOW, KEY), startEncounter('mito'), voice('mitochondria'), env(storage));
    const fullSave = storage.data.get(key);
    expect(Object.keys(deckCards(loadSave(storage), DECK_ID)).sort()).toEqual(['aff', 'mito']);
    let failNext = true;
    const flaky: SaveStorage = {
      getItem: (k) => {
        if (failNext) {
          failNext = false;
          throw new Error('SecurityError');
        }
        return storage.getItem(k);
      },
      setItem: storage.setItem,
    };
    const writesBefore = storage.writes.length;
    const state = loadReview(flaky, deck, NEXT_DAY, KEY);
    let r: ReturnType<typeof submitAnswer> | undefined;
    expect(() => {
      r = submitAnswer(state, startEncounter('ion'), voice('ion channel'), env(flaky, NEXT_DAY));
    }).not.toThrow();
    expect(storage.writes).toHaveLength(writesBefore);
    expect(storage.data.get(key)).toBe(fullSave);
    expect(r?.state.saveFailed).toBe(true);
  });

  it('backup already exists and live save is unreadable -> no write to either key, saveFailed true', () => {
    const storage = memoryStorage();
    const key = liveKey();
    storage.data.set(SAVE_BACKUP_KEY, 'first unreadable save');
    storage.data.set(key, 'second unreadable save');
    const state = loadReview(storage, deck, NOW, KEY);
    const r = submitAnswer(state, startEncounter('aff'), voice('afferent'), env(storage));
    expect(storage.writes).toEqual([]);
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe('first unreadable save');
    expect(storage.data.get(key)).toBe('second unreadable save');
    expect(r.state.saveFailed).toBe(true);
  });
});
