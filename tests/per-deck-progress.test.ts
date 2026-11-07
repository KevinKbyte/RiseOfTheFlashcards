// Requirement: FSRS progress is stored PER DECK. Two decks that share a card id keep independent
// progress: rating the card while playing deck A never changes deck B's card state, due queue or
// mastery line. The save nests progress by deck id, then card id (never a concatenated
// "deck:card" string key); deck ids such as "__proto__", "constructor" and "toString" are stored
// and read back safely and never pollute Object.prototype. An old flat save (version 1, cards
// keyed by card id alone) migrates without loss: each card's progress is copied under EVERY known
// deck containing that card id, and cards in no known deck are kept in the save (preserved for a
// later deck, never dropped). The first write after load uses the new format. Backup rules are
// unchanged: an unreadable live save is never overwritten without a backup, and a readable old
// save is a migration source, not an unreadable one. A reload (new session, same storage) sees
// the per-deck progress. The first new-format write over an old flat save copies the original
// text to the backup key when it is empty (rollback safety). Prototype-named CARD ids
// ("__proto__", "constructor") keep their progress across a reload.
//
// API contract (save.ts, review-flow.ts, menu-flow.ts, game-session.ts):
//   SAVE_VERSION === 2; SaveData.decks: Record<deckId, Record<cardId, CardState>>; counters stay global
//   deckCards(save, deckId) -> own-property read of one deck's cards map, {} when absent
//   parseSave(input, knownDecks?) / readSave(storage?, knownDecks?) / loadSave(storage?, knownDecks?)
//     knownDecks: readonly { id: string; cards: readonly { id: string }[] }[]  (a Deck[] fits)
//   loadReview(storage, deck, now, { deckId, knownDecks? }); submitAnswer writes under that deck id
//   masterySummary(decks, save.decks)
//   game-session passes the deck being played and the menu's decks through; masteryText per deck.
// Covers tags cite plan IDs (no spec-cache in this repo), as save/review-flow tests do.
import { describe, expect, it } from 'vitest';
import {
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
import { loadReview, startEncounter, submitAnswer } from '../src/flashcards/review-flow.js';
import { masterySummary } from '../src/flashcards/menu-flow.js';
import { correctOrb, createSession, masteryText, presented, startRun, updateMenu, type GameSession } from '../src/flashcards/game-session.js';
import { openDeckSelect, selectDeck } from '../src/flashcards/menu-flow.js';
import { applyRating, type CardState } from '../src/flashcards/scheduler.js';
import type { Deck } from '../src/flashcards/deck-schema.js';

// 10:00 local: well clear of the 04:00 study-day rollover.
const NOW = new Date(2026, 10, 7, 10, 0, 0);
const LATER_SAME_DAY = new Date(2026, 10, 7, 10, 5, 0);
const YESTERDAY = new Date(2026, 10, 6, 10, 0, 0);
const clock = () => NOW;

const stA: CardState = {
  stability: 12.5,
  difficulty: 4.2,
  state: 2,
  reps: 4,
  lapses: 1,
  due: '2026-11-20T09:00:00.000Z',
  lastReview: '2026-11-07T09:00:00.000Z',
};
const stB: CardState = { ...stA, stability: 30, reps: 9 };
const stOrphan: CardState = { ...stA, stability: 3, reps: 2 };

function card(id: string, answer: string) {
  return { id, prompt: `What is ${answer}?`, answer };
}

// Decks share card ids 'shared' and 'both2'; 'onlyA' / 'onlyB' are exclusive.
const DECK_A: Deck = {
  id: 'deckA',
  title: 'Deck A',
  cards: [card('shared', 'alpha'), card('both2', 'beta'), card('onlyA', 'gamma'), card('a4', 'delta')],
};
const DECK_B: Deck = {
  id: 'deckB',
  title: 'Deck B',
  cards: [card('shared', 'alpha'), card('both2', 'beta'), card('onlyB', 'epsilon'), card('b4', 'zeta')],
};
const DECKS: readonly Deck[] = [DECK_A, DECK_B];

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

// The live save key is not exported; discover it as the other save tests do.
function liveKey(): string {
  const s = memoryStorage();
  writeSave(emptySave(), s);
  return [...s.data.keys()][0];
}

/** Old (current, version 1) flat save text: cards keyed by card id alone. */
function flatSaveText(cards: Record<string, CardState>): string {
  return JSON.stringify({ version: 1, cards, counters: { day: '2026-11-06', newCount: 2, reviewCount: 5 } });
}

function storageWithFlat(cards: Record<string, CardState>) {
  const storage = memoryStorage();
  storage.data.set(liveKey(), flatSaveText(cards));
  return storage;
}

/** Every object key at any depth of a JSON value. */
function allKeys(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'object' && v !== null) {
    for (const [k, child] of Object.entries(v)) {
      out.push(k);
      allKeys(child, out);
    }
  }
  return out;
}

/** True when some object at any depth has own key `id` whose value deep-equals `state`. */
function holdsCard(v: unknown, id: string, state: CardState): boolean {
  if (typeof v !== 'object' || v === null) return false;
  if (Object.prototype.hasOwnProperty.call(v, id)) {
    const val = (v as Record<string, unknown>)[id];
    if (JSON.stringify(val) === JSON.stringify(state)) return true;
  }
  return Object.values(v).some((child) => holdsCard(child, id, state));
}

function stored(storage: ReturnType<typeof memoryStorage>): Record<string, unknown> {
  return JSON.parse(storage.data.get(liveKey()) as string);
}

function saveWithDecks(decks: Record<string, Record<string, CardState>>): SaveData {
  return { ...emptySave(), decks: Object.fromEntries(Object.entries(decks)) };
}

const KEY_A = { deckId: DECK_A.id, knownDecks: DECKS };
const KEY_B = { deckId: DECK_B.id, knownDecks: DECKS };
const voice = (transcript: string) => ({ kind: 'voice' as const, transcript });

// Covers: D5, S6a
describe('per-deck save format: nested by deck id, then card id', () => {
  it('format version is 2 and the empty save has no deck progress', () => {
    expect(SAVE_VERSION).toBe(2);
    const empty = emptySave();
    expect(empty.version).toBe(2);
    expect(empty.decks).toEqual({});
    expect(empty.counters).toBeNull();
  });

  it('the same card id in two decks round-trips with independent states', () => {
    const data = saveWithDecks({ deckA: { shared: stA }, deckB: { shared: stB } });
    const back = parseSave(serializeSave(data), DECKS);
    expect(deckCards(back, 'deckA')).toEqual({ shared: stA });
    expect(deckCards(back, 'deckB')).toEqual({ shared: stB });
  });

  it('stored JSON nests decks.<deckId>.<cardId>, with no concatenated deck+card key anywhere', () => {
    const storage = memoryStorage();
    expect(writeSave(saveWithDecks({ deckA: { shared: stA } }), storage)).toBe(true);
    const json = stored(storage) as { version: number; decks: Record<string, Record<string, CardState>> };
    expect(json.version).toBe(2);
    expect(json.decks.deckA.shared).toEqual(stA);
    const joined = allKeys(json).filter((k) => k.includes('deckA') && k.includes('shared'));
    expect(joined).toEqual([]);
  });

  it('deckCards returns {} for a deck with no progress', () => {
    const data = saveWithDecks({ deckA: { shared: stA } });
    expect(deckCards(data, 'deckB')).toEqual({});
    expect(deckCards(emptySave(), 'toString')).toEqual({});
    expect(deckCards(emptySave(), '__proto__')).toEqual({});
  });
});

// Covers: D5, S6a
describe('per-deck save: prototype-named deck ids are stored and read safely', () => {
  for (const id of ['__proto__', 'constructor', 'toString']) {
    it(`deck id "${id}" round-trips through storage without polluting prototypes`, () => {
      const storage = memoryStorage();
      // fromEntries defines an OWN property even for "__proto__".
      const data: SaveData = { ...emptySave(), decks: Object.fromEntries([[id, { shared: stA }]]) };
      expect(writeSave(data, storage)).toBe(true);
      const json = stored(storage) as { decks: Record<string, unknown> };
      expect(Object.prototype.hasOwnProperty.call(json.decks, id)).toBe(true);
      const loaded = loadSave(storage, [{ id, cards: [{ id: 'shared' }] }]);
      expect(deckCards(loaded, id)).toEqual({ shared: stA });
      expect(Object.prototype.hasOwnProperty.call(loaded.decks, id)).toBe(true);
      expect(({} as Record<string, unknown>).shared).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'shared')).toBe(false);
    });

    it(`raw stored text with deck id "${id}" parses to that deck only, no pollution`, () => {
      const text = `{"version":2,"decks":{"${id}":{"shared":${JSON.stringify(stA)}}},"counters":null}`;
      const parsed = parseSave(text, [{ id, cards: [{ id: 'shared' }] }]);
      expect(deckCards(parsed, id)).toEqual({ shared: stA });
      expect(deckCards(parsed, 'deckA')).toEqual({});
      expect(({} as Record<string, unknown>).shared).toBeUndefined();
      expect(typeof Object.prototype.toString).toBe('function');
    });

    it(`old flat save migrates into known deck id "${id}"`, () => {
      const storage = storageWithFlat({ shared: stA });
      const loaded = loadSave(storage, [{ id, cards: [{ id: 'shared' }] }]);
      expect(deckCards(loaded, id)).toEqual({ shared: stA });
      expect(({} as Record<string, unknown>).shared).toBeUndefined();
    });
  }
});

// Covers: D5, S6a
describe('old flat save migrates without loss', () => {
  const flat = { shared: stA, onlyA: stB, orphan: stOrphan };

  it('each card is copied under every known deck containing its id; counters kept', () => {
    const loaded = parseSave(flatSaveText(flat), DECKS);
    expect(deckCards(loaded, 'deckA')).toEqual({ shared: stA, onlyA: stB });
    expect(deckCards(loaded, 'deckB')).toEqual({ shared: stA });
    expect(loaded.counters).toEqual({ day: '2026-11-06', newCount: 2, reviewCount: 5 });
  });

  it('a card in no known deck is kept in the save, not dropped', () => {
    const loaded = parseSave(flatSaveText(flat), DECKS);
    expect(holdsCard(JSON.parse(serializeSave(loaded)), 'orphan', stOrphan)).toBe(true);
  });

  it('with no known decks every card is preserved', () => {
    const loaded = parseSave(flatSaveText(flat));
    const json = JSON.parse(serializeSave(loaded));
    expect(holdsCard(json, 'shared', stA)).toBe(true);
    expect(holdsCard(json, 'onlyA', stB)).toBe(true);
    expect(holdsCard(json, 'orphan', stOrphan)).toBe(true);
  });

  it('first write after load uses the new nested format and keeps the orphan', () => {
    const storage = storageWithFlat(flat);
    expect(writeSave(loadSave(storage, DECKS), storage)).toBe(true);
    const json = stored(storage) as { version: number; decks: Record<string, Record<string, CardState>> };
    expect(json.version).toBe(2);
    expect(json.decks.deckA).toEqual({ shared: stA, onlyA: stB });
    expect(json.decks.deckB).toEqual({ shared: stA });
    expect(holdsCard(json, 'orphan', stOrphan)).toBe(true);
  });

  it('the orphan survives further load/write cycles in the new format', () => {
    const storage = storageWithFlat(flat);
    writeSave(loadSave(storage, DECKS), storage);
    writeSave(loadSave(storage, DECKS), storage);
    expect(holdsCard(stored(storage), 'orphan', stOrphan)).toBe(true);
  });

  it('an old flat save is a migration source, not unreadable: writes proceed past an occupied backup', () => {
    const storage = storageWithFlat(flat);
    storage.data.set(SAVE_BACKUP_KEY, 'earlier unreadable save');
    expect(writeSave(loadSave(storage, DECKS), storage)).toBe(true);
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe('earlier unreadable save');
    expect((stored(storage) as { version: number }).version).toBe(2);
  });

  it('an unreadable live save is still backed up before the first new-format write', () => {
    const storage = memoryStorage();
    storage.data.set(liveKey(), '{"version":1,"cards":{"shared":');
    expect(writeSave(loadSave(storage, DECKS), storage)).toBe(true);
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe('{"version":1,"cards":{"shared":');
  });
});

// Covers: D4, D5
describe('review-flow: rating a shared card in deck A leaves deck B untouched', () => {
  it('deck B card state and due queue are unchanged after deck A rates the shared card', () => {
    const storage = memoryStorage();
    const bBefore = loadReview(storage, DECK_B.cards, NOW, KEY_B);
    const a = loadReview(storage, DECK_A.cards, NOW, KEY_A);
    const r = submitAnswer(a, startEncounter('shared'), voice('alpha'), { deck: DECK_A.cards, storage, now: NOW });
    expect(r.rating).toBe('good');
    expect(deckCards(r.state.save, 'deckA').shared).toBeDefined();
    expect(deckCards(r.state.save, 'deckB')).toEqual({});

    const bAfter = loadReview(storage, DECK_B.cards, LATER_SAME_DAY, KEY_B);
    expect(deckCards(bAfter.save, 'deckB')).toEqual({});
    expect(bAfter.queue.ids).toEqual(bBefore.queue.ids);
    expect(bAfter.queue.ids).toContain('shared');

    const aAfter = loadReview(storage, DECK_A.cards, LATER_SAME_DAY, KEY_A);
    expect(aAfter.queue.ids).not.toContain('shared');
  });

  it('deck B keeps its own existing progress on the shared card', () => {
    const storage = memoryStorage();
    const bState = applyRating(undefined, 'good', YESTERDAY);
    writeSave(saveWithDecks({ deckB: { shared: bState } }), storage);
    const a = loadReview(storage, DECK_A.cards, NOW, KEY_A);
    // Deck A has never seen 'shared': it is New there despite deck B's progress.
    expect(a.queue.ids).toContain('shared');
    submitAnswer(a, startEncounter('shared'), { kind: 'orb', label: 'beta' }, { deck: DECK_A.cards, storage, now: NOW });
    const loaded = loadSave(storage, DECKS);
    expect(deckCards(loaded, 'deckB').shared).toEqual(bState);
    expect(deckCards(loaded, 'deckA').shared).toEqual(applyRating(undefined, 'again', NOW));
  });

  it('mastery for deck B is unchanged after deck A rates the shared card', () => {
    const storage = memoryStorage();
    const before = masterySummary(DECKS, loadSave(storage, DECKS).decks);
    const a = loadReview(storage, DECK_A.cards, NOW, KEY_A);
    submitAnswer(a, startEncounter('shared'), voice('alpha'), { deck: DECK_A.cards, storage, now: NOW });
    const after = masterySummary(DECKS, loadSave(storage, DECKS).decks);
    expect(after[1]).toEqual(before[1]);
    expect(after[0].newCount).toBe(before[0].newCount - 1);
  });
});

// Covers: D5
describe('menu-flow masterySummary reads each deck\'s own progress', () => {
  it('the same card id counts per deck from that deck\'s map only', () => {
    const mastered: CardState = { ...stA, stability: 40 };
    const rows = masterySummary(DECKS, { deckA: { shared: mastered } });
    expect(rows.map((r) => r.text)).toEqual([
      'Deck A: 3 new, 0 learning, 1 mastered',
      'Deck B: 4 new, 0 learning, 0 mastered',
    ]);
  });

  it('a prototype-named deck id with no stored progress counts every card new', () => {
    const proto: Deck = { id: 'toString', title: 'Proto', cards: [card('shared', 'alpha')] };
    expect(masterySummary([proto], {})[0].newCount).toBe(1);
  });
});

function readyFor(storage: SaveStorage, deckId: string): GameSession {
  const s = createSession({ decks: DECKS, storage, clock });
  return updateMenu(updateMenu(s, openDeckSelect), (m) => selectDeck(m, deckId));
}

function rowFor(s: GameSession, title: string): string {
  const row = masteryText(s).find((t) => t.startsWith(`${title}:`));
  if (row === undefined) throw new Error(`no mastery row for ${title}`);
  return row;
}

function spawnedIds(s: GameSession): string[] {
  const step = startRun(s);
  const wave = step.effects.find((e) => e.type === 'spawnWave') as { cards: { id: string }[] } | undefined;
  return wave ? wave.cards.map((c) => c.id) : [];
}

// Covers: M11, D5, S6a
describe('game-session: per-deck progress across a reload', () => {
  it('playing deck A leaves deck B mastery and spawned queue unchanged, also after reload', () => {
    const storage = memoryStorage();
    const fresh = readyFor(storage, DECK_B.id);
    const bRowBefore = rowFor(fresh, 'Deck B');
    const bIdsBefore = spawnedIds(fresh);

    let s = startRun(readyFor(storage, DECK_A.id)).session;
    s = presented(s, 'shared', 'e1').session;
    s = correctOrb(s, 'shared').session;
    expect(rowFor(s, 'Deck B')).toBe(bRowBefore);
    expect(rowFor(s, 'Deck A')).toBe('Deck A: 3 new, 1 learning, 0 mastered');

    const reloadedB = readyFor(storage, DECK_B.id);
    expect(rowFor(reloadedB, 'Deck B')).toBe(bRowBefore);
    expect(rowFor(reloadedB, 'Deck A')).toBe('Deck A: 3 new, 1 learning, 0 mastered');
    expect(spawnedIds(reloadedB)).toEqual(bIdsBefore);
    expect(spawnedIds(readyFor(storage, DECK_A.id))).not.toContain('shared');
  });

  it('an old flat save shows its progress under both sharing decks and keeps it after deck A plays', () => {
    const prior = applyRating(undefined, 'good', YESTERDAY);
    const storage = storageWithFlat({ shared: prior, orphan: stOrphan });
    const first = readyFor(storage, DECK_A.id);
    expect(rowFor(first, 'Deck A')).toBe('Deck A: 3 new, 1 learning, 0 mastered');
    expect(rowFor(first, 'Deck B')).toBe('Deck B: 3 new, 1 learning, 0 mastered');

    let s = startRun(first).session;
    s = presented(s, 'onlyA', 'e1').session;
    correctOrb(s, 'onlyA');
    const json = stored(storage) as { version: number; decks: Record<string, Record<string, CardState>> };
    expect(json.version).toBe(2);
    expect(json.decks.deckB.shared).toEqual(prior);
    expect(holdsCard(json, 'orphan', stOrphan)).toBe(true);

    const reloaded = readyFor(storage, DECK_B.id);
    expect(rowFor(reloaded, 'Deck A')).toBe('Deck A: 2 new, 2 learning, 0 mastered');
    expect(rowFor(reloaded, 'Deck B')).toBe('Deck B: 3 new, 1 learning, 0 mastered');
  });
});

// Covers: D5, S6a
describe('old flat save: first new-format write keeps the original text as a rollback backup', () => {
  const flat = { shared: stA, onlyA: stB, orphan: stOrphan };

  it('empty backup key -> the original v1 text is copied there before it is replaced', () => {
    const storage = storageWithFlat(flat);
    const original = flatSaveText(flat);
    expect(writeSave(loadSave(storage, DECKS), storage)).toBe(true);
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe(original);
    expect((stored(storage) as { version: number }).version).toBe(2);
  });

  it('later new-format writes leave that v1 backup unchanged', () => {
    const storage = storageWithFlat(flat);
    const original = flatSaveText(flat);
    writeSave(loadSave(storage, DECKS), storage);
    expect(writeSave(loadSave(storage, DECKS), storage)).toBe(true);
    expect(storage.data.get(SAVE_BACKUP_KEY)).toBe(original);
  });
});

// deck-schema accepts any non-empty id up to its length cap, so a real deck may hold these card ids.
const PROTO_DECK = [
  { id: '__proto__', answer: 'alpha' },
  { id: 'constructor', answer: 'beta' },
  { id: 'plain', answer: 'gamma' },
];

// Covers: D4, D5, S6a
describe('per-deck save: prototype-named CARD ids keep their progress across a reload', () => {
  for (const [id, answer] of [['__proto__', 'alpha'], ['constructor', 'beta']] as const) {
    it(`card id "${id}": rating it then reloading keeps its progress, no pollution`, () => {
      const storage = memoryStorage();
      const key = { deckId: 'protoDeck' };
      const r = submitAnswer(loadReview(storage, PROTO_DECK, NOW, key), startEncounter(id), voice(answer), {
        deck: PROTO_DECK,
        storage,
        now: NOW,
      });
      expect(r.rating).toBe('good');
      const rated = applyRating(undefined, 'good', NOW);

      const reloaded = loadReview(storage, PROTO_DECK, LATER_SAME_DAY, key);
      const cards = deckCards(reloaded.save, 'protoDeck');
      expect(Object.prototype.hasOwnProperty.call(cards, id)).toBe(true);
      expect(cards[id]).toEqual(rated);
      expect(reloaded.queue.ids).not.toContain(id);
      expect(reloaded.queue.ids).toContain('plain');
      expect(({} as Record<string, unknown>).stability).toBeUndefined();
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
      expect(typeof ({} as { constructor: unknown }).constructor).toBe('function');
    });
  }
});
