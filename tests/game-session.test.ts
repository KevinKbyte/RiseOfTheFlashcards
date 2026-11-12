// Requirement: src/cards.ts (CardsSystem) becomes a thin adapter over ONE pure glue module,
// src/flashcards/game-session.ts, that composes the three tested controllers: menu-flow (start ->
// deck select -> ready -> playing, mastery text), run-flow (encounters, shield pips, win/lose/
// practice end screens) and review-flow (grading, one FSRS write per encounter, persisted save).
// The scene forwards its seam events (run start, card presented, wrong orb, correct orb, wave
// cleared) and renders the plain-data effects it gets back. Rules: starting from the menu begins a
// run with the selected deck's FSRS queue (at most 12 cards, deck order for New cards); each
// presentation is reported once and a re-render never resets the one-pip-per-encounter cap; a
// wrong orb costs a pip and writes exactly one Again rating; a correct orb clears the card and
// writes exactly one rating; clearing every reserved card and then the wave (the finishing slash,
// Kev 2026-11-12) is a WIN, never the last correct orb alone, and the mastery text then
// reflects the new ratings; losing every pip is a LOSE; an empty queue is a practice run that
// never WINs; progress survives a reload (a new session on the same storage sees prior ratings);
// a storage read failure leaves the game playable but never writes (it would clobber a save we
// never saw). Progress is per deck (see tests/per-deck-progress.test.ts). The clock and storage are
// injected; the session is immutable.
//
// API contract for src/flashcards/game-session.ts (pure, no three.js/DOM; reuses the controller
// types, never re-implementing them):
//   export interface SessionEnv { decks: readonly Deck[]; storage: SaveStorage; clock: () => Date }
//   export interface GameSession {
//     readonly menu: MenuState; readonly run: RunFlowState | null; readonly review: ReviewState | null;
//   }                                                   // other fields are private
//   export type SessionEffect = { type: 'spawnWave'; cards: readonly DeckCard[] } | RunFlowEffect;
//   export interface SessionStep { session: GameSession; effects: readonly SessionEffect[] }
//   export function createSession(env: SessionEnv): GameSession;      // menu = createMenu() + env.decks
//   export function updateMenu(s: GameSession, fn: (m: MenuState) => MenuState): GameSession;
//   export function startRun(s: GameSession): SessionStep;            // menu must be 'ready'
//   export function presented(s: GameSession, cardId: string, encounterId: string): SessionStep;
//   export function wrongOrb(s: GameSession, cardId: string, label: string): SessionStep;
//   export function correctOrb(s: GameSession, cardId: string): SessionStep;
//   export function waveCleared(s: GameSession): SessionStep;
//   export function masteryText(s: GameSession): string[];            // one line per deck
// masteryText uses menu-flow masterySummary text over the latest save: the in-run save once a run
// is loaded, else the save read from storage (so a fresh session after a reload sees prior ratings).
// Orb events grade only while the run is active; after an end screen nothing grades or writes.
// An event that does not apply returns the same session object and no effects.
// Covers tags cite plan IDs (no spec-cache in this repo), as run-flow/review-flow/menu-flow tests do.
import { describe, expect, it } from 'vitest';
import {
  correctOrb,
  createSession,
  masteryText,
  presented,
  startRun,
  updateMenu,
  waveCleared,
  wrongOrb,
  type GameSession,
  type SessionEffect,
  type SessionStep,
} from '../src/flashcards/game-session.js';
import * as gameSession from '../src/flashcards/game-session.js';
import { openDeckSelect, selectDeck } from '../src/flashcards/menu-flow.js';
import { planPoolSizes } from '../src/flashcards/pool.js';
import type { Deck } from '../src/flashcards/deck-schema.js';
import { applyRating } from '../src/flashcards/scheduler.js';
import { deckCards, emptySave, loadSave, writeSave, type SaveStorage } from '../src/flashcards/save.js';

// 10:00 local: well clear of the 04:00 study-day rollover.
const NOW = new Date(2026, 10, 7, 10, 0, 0);
const clock = () => NOW;

function makeDeck(id: string, title: string, n: number): Deck {
  return {
    id,
    title,
    cards: Array.from({ length: n }, (_, i) => ({
      id: `${id}-${i + 1}`,
      prompt: `Question number ${i + 1}?`,
      answer: `answer ${String.fromCharCode(97 + i)}`,
    })),
  };
}

const BIG = makeDeck('big', 'Big Deck', 14);
const SMALL = makeDeck('small', 'Small Deck', 4);
const DECKS: readonly Deck[] = [BIG, SMALL];

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

function throwingReadStorage(): SaveStorage & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: (k) => {
      writes.push(k);
    },
  };
}

function answerOf(deck: Deck, cardId: string): string {
  const card = deck.cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`no card ${cardId}`);
  return card.answer;
}

/** A label that is some other card's answer: a wrong orb. */
function wrongLabel(deck: Deck, cardId: string): string {
  const other = deck.cards.find((c) => c.id !== cardId);
  if (!other) throw new Error('deck too small');
  return other.answer;
}

function ready(storage: SaveStorage, deckId = BIG.id): GameSession {
  const s = createSession({ decks: DECKS, storage, clock });
  return updateMenu(updateMenu(s, openDeckSelect), (m) => selectDeck(m, deckId));
}

function spawned(effects: readonly SessionEffect[]): string[] | null {
  const wave = effects.find((e): e is Extract<SessionEffect, { type: 'spawnWave' }> => e.type === 'spawnWave');
  return wave ? wave.cards.map((c) => c.id) : null;
}

function endScreens(effects: readonly SessionEffect[]) {
  return effects.filter((e): e is Extract<SessionEffect, { type: 'endScreen' }> => e.type === 'endScreen');
}

function pips(effects: readonly SessionEffect[]): number[] {
  return effects.flatMap((e) => (e.type === 'pips' ? [e.remaining] : []));
}

function started(storage: SaveStorage, deckId = BIG.id): { step: SessionStep; ids: string[] } {
  const step = startRun(ready(storage, deckId));
  return { step, ids: spawned(step.effects) ?? [] };
}

function rowFor(s: GameSession, title: string): string {
  const row = masteryText(s).find((t) => t.startsWith(`${title}:`));
  if (row === undefined) throw new Error(`no mastery row for ${title}`);
  return row;
}

// Covers: M11, D4, D5, D14, D19, S6, S6a
describe('game-session: menu -> run -> review glue for the cards scene', () => {
  it('starting from a ready menu begins a run with the selected deck queue and full pips', () => {
    const storage = memoryStorage();
    const s = ready(storage);
    expect(s.menu.screen).toBe('ready');
    const step = startRun(s);
    expect(spawned(step.effects)).toEqual(BIG.cards.slice(0, 12).map((c) => c.id));
    expect(pips(step.effects)).toEqual([5]);
    expect(endScreens(step.effects)).toEqual([]);
    expect(step.session.menu.screen).toBe('playing');
    expect(storage.writes).toEqual([]);
  });

  it('spawned cards carry prompt and answer so the scene can render them', () => {
    const { step } = started(memoryStorage());
    const wave = step.effects.find((e) => e.type === 'spawnWave');
    expect(wave).toBeDefined();
    if (wave?.type !== 'spawnWave') return;
    expect(wave.cards[0]).toEqual(BIG.cards[0]);
  });

  it('startRun before a deck is selected changes nothing', () => {
    const s = createSession({ decks: DECKS, storage: memoryStorage(), clock });
    const step = startRun(s);
    expect(step.session).toBe(s);
    expect(step.effects).toEqual([]);
  });

  it('orb events before a run has started change nothing and write nothing', () => {
    const storage = memoryStorage();
    const s = ready(storage);
    const id = BIG.cards[0].id;
    for (const step of [presented(s, id, 'e1'), wrongOrb(s, id, wrongLabel(BIG, id)), correctOrb(s, id)]) {
      expect(step.session).toBe(s);
      expect(step.effects).toEqual([]);
    }
    expect(storage.writes).toEqual([]);
  });

  it('wrong orb costs one pip and writes exactly one Again rating', () => {
    const storage = memoryStorage();
    const { step, ids } = started(storage);
    const id = ids[0];
    let s = presented(step.session, id, 'e1').session;
    const hit = wrongOrb(s, id, wrongLabel(BIG, id));
    s = hit.session;
    expect(pips(hit.effects)).toEqual([4]);
    expect(storage.writes).toHaveLength(1);
    expect(deckCards(loadSave(storage), BIG.id)[id]).toEqual(applyRating(undefined, 'again', NOW));
  });

  it('a second wrong orb in the same encounter costs no pip and writes nothing', () => {
    const storage = memoryStorage();
    const { step, ids } = started(storage);
    const id = ids[0];
    let s = presented(step.session, id, 'e1').session;
    s = wrongOrb(s, id, wrongLabel(BIG, id)).session;
    const again = wrongOrb(s, id, wrongLabel(BIG, id));
    expect(pips(again.effects)).toEqual([]);
    expect(storage.writes).toHaveLength(1);
  });

  it('re-sending the same presentation (re-render) does not reset the pip cap', () => {
    const storage = memoryStorage();
    const { step, ids } = started(storage);
    const id = ids[0];
    let s = presented(step.session, id, 'e1').session;
    s = wrongOrb(s, id, wrongLabel(BIG, id)).session;
    const rerender = presented(s, id, 'e1');
    expect(rerender.session).toBe(s);
    expect(rerender.effects).toEqual([]);
    const after = wrongOrb(rerender.session, id, wrongLabel(BIG, id));
    expect(pips(after.effects)).toEqual([]);
    expect(storage.writes).toHaveLength(1);
  });

  it('correct orb on a fresh encounter clears the card and writes exactly one Good rating', () => {
    const storage = memoryStorage();
    const { step, ids } = started(storage);
    const id = ids[0];
    const s = presented(step.session, id, 'e1').session;
    const hit = correctOrb(s, id);
    expect(hit.session.run?.run.remaining).not.toContain(id);
    expect(hit.session.run?.run.remaining).toHaveLength(11);
    expect(endScreens(hit.effects)).toEqual([]);
    expect(storage.writes).toHaveLength(1);
    expect(deckCards(loadSave(storage), BIG.id)[id]).toEqual(applyRating(undefined, 'good', NOW));
  });

  it('correct orb after a wrong one in the same encounter clears the card but adds no write', () => {
    const storage = memoryStorage();
    const { step, ids } = started(storage);
    const id = ids[0];
    let s = presented(step.session, id, 'e1').session;
    s = wrongOrb(s, id, wrongLabel(BIG, id)).session;
    const hit = correctOrb(s, id);
    expect(hit.session.run?.run.remaining).not.toContain(id);
    expect(storage.writes).toHaveLength(1);
    expect(deckCards(loadSave(storage), BIG.id)[id]).toEqual(applyRating(undefined, 'again', NOW));
  });

  it('clearing all 12 reserved cards then the wave ends in a win and the mastery text reflects the ratings', () => {
    const storage = memoryStorage();
    const { step, ids } = started(storage);
    expect(ids).toHaveLength(12);
    expect(rowFor(step.session, BIG.title)).toBe(`${BIG.title}: 14 new, 0 learning, 0 mastered`);
    let s = step.session;
    let last: SessionStep = step;
    ids.forEach((id, i) => {
      s = presented(s, id, `e${i}`).session;
      last = correctOrb(s, id);
      s = last.session;
      expect(endScreens(last.effects)).toEqual([]);
    });
    last = waveCleared(s);
    s = last.session;
    const ends = endScreens(last.effects);
    expect(ends).toHaveLength(1);
    expect(ends[0].kind).toBe('win');
    expect(ends[0].text.trim().length).toBeGreaterThan(0);
    expect(storage.writes).toHaveLength(12);
    expect(rowFor(s, BIG.title)).toBe(`${BIG.title}: 2 new, 12 learning, 0 mastered`);
  });

  it('a cleared wave never ends the run on its own', () => {
    const { step } = started(memoryStorage());
    const cleared = waveCleared(step.session);
    expect(endScreens(cleared.effects)).toEqual([]);
  });

  it('losing all 5 pips ends in a lose screen, one Again write per hit, then nothing changes', () => {
    const storage = memoryStorage();
    const { step, ids } = started(storage);
    let s = step.session;
    let last: SessionStep = step;
    for (const [i, id] of ids.slice(0, 5).entries()) {
      s = presented(s, id, `e${i}`).session;
      last = wrongOrb(s, id, wrongLabel(BIG, id));
      s = last.session;
    }
    expect(pips(last.effects)).toEqual([0]);
    const ends = endScreens(last.effects);
    expect(ends).toHaveLength(1);
    expect(ends[0].kind).toBe('lose');
    expect(storage.writes).toHaveLength(5);
    const id = ids[5];
    const afterPresent = presented(s, id, 'late');
    expect(afterPresent.effects).toEqual([]);
    const afterCorrect = correctOrb(afterPresent.session, id);
    expect(afterCorrect.effects).toEqual([]);
    expect(storage.writes).toHaveLength(5);
  });

  it('an empty queue (every card already rated today) is a practice run that never wins', () => {
    const storage = memoryStorage();
    const cards = Object.fromEntries(SMALL.cards.map((c) => [c.id, applyRating(undefined, 'good', NOW)]));
    expect(writeSave({ ...emptySave(), decks: { [SMALL.id]: cards } }, storage)).toBe(true);
    const writesBefore = storage.writes.length;
    const { step, ids } = started(storage, SMALL.id);
    expect(ids).toEqual([]);
    const ends = endScreens(step.effects);
    expect(ends.map((e) => e.kind)).toEqual(['practice-done']);
    const cleared = waveCleared(step.session);
    expect(endScreens(cleared.effects)).toEqual([]);
    const id = SMALL.cards[0].id;
    const tryCorrect = correctOrb(presented(step.session, id, 'e1').session, id);
    expect(endScreens(tryCorrect.effects)).toEqual([]);
    expect(storage.writes).toHaveLength(writesBefore);
  });

  it('progress survives a reload: a new session on the same storage sees prior ratings', () => {
    const storage = memoryStorage();
    const { step, ids } = started(storage);
    let s = presented(step.session, ids[0], 'e1').session;
    s = correctOrb(s, ids[0]).session;
    s = presented(s, ids[1], 'e2').session;
    wrongOrb(s, ids[1], wrongLabel(BIG, ids[1]));

    const reloaded = createSession({ decks: DECKS, storage, clock });
    expect(rowFor(reloaded, BIG.title)).toBe(`${BIG.title}: 12 new, 2 learning, 0 mastered`);
    const again = startRun(updateMenu(updateMenu(reloaded, openDeckSelect), (m) => selectDeck(m, BIG.id)));
    const respawned = spawned(again.effects) ?? [];
    expect(respawned).not.toContain(ids[0]);
    expect(respawned).not.toContain(ids[1]);
    expect(respawned).toEqual(BIG.cards.slice(2, 12).map((c) => c.id));
  });

  it('a storage read failure keeps the session playable but never writes', () => {
    const storage = throwingReadStorage();
    const { step, ids } = started(storage);
    expect(ids).toEqual(BIG.cards.slice(0, 12).map((c) => c.id));
    expect(pips(step.effects)).toEqual([5]);
    let s = presented(step.session, ids[0], 'e1').session;
    const hit = wrongOrb(s, ids[0], wrongLabel(BIG, ids[0]));
    expect(pips(hit.effects)).toEqual([4]);
    s = presented(hit.session, ids[1], 'e2').session;
    const ok = correctOrb(s, ids[1]);
    expect(ok.session.run?.run.remaining).not.toContain(ids[1]);
    expect(storage.writes).toEqual([]);
    expect(() => masteryText(ok.session)).not.toThrow();
  });

  it('never mutates the session it is given', () => {
    const storage = memoryStorage();
    const { step, ids } = started(storage);
    const before = JSON.stringify(step.session);
    const s1 = presented(step.session, ids[0], 'e1');
    expect(JSON.stringify(step.session)).toBe(before);
    const mid = JSON.stringify(s1.session);
    correctOrb(s1.session, ids[0]);
    wrongOrb(s1.session, ids[0], answerOf(BIG, ids[1]));
    expect(JSON.stringify(s1.session)).toBe(mid);
  });
});

// Requirement: the scene reports a landed enemy strike (the player did not answer in time) through
// game-session's enemyHit(s, cardId) seam, which returns a SessionStep carrying the same run-flow
// effects: one pip lost for a presented card, capped once per encounter and shared with the wrong
// orb, a new presentation of the card can cost a pip again, the strike that takes the last pip
// shows the lose screen, and an enemy hit before a run, for a card not presented, or after the run
// is over returns the same session object and no effects.
// API contract addition: export function enemyHit(s: GameSession, cardId: string): SessionStep;
// Covers: D4, D14, S6
describe('game-session: enemyHit seam for a landed strike', () => {
  function enemyHit(s: GameSession, cardId: string): SessionStep {
    const fn = (gameSession as unknown as Record<string, unknown>).enemyHit;
    if (typeof fn !== 'function') throw new Error('game-session does not export enemyHit(s, cardId)');
    return (fn as (s: GameSession, cardId: string) => SessionStep)(s, cardId);
  }

  it('an enemy hit on a presented card costs one pip', () => {
    const { step, ids } = started(memoryStorage());
    const s = presented(step.session, ids[0], 'e1').session;
    const hit = enemyHit(s, ids[0]);
    expect(pips(hit.effects)).toEqual([4]);
    expect(endScreens(hit.effects)).toEqual([]);
    expect(hit.session.run?.run.pips).toBe(4);
  });

  it('a wrong orb then an enemy hit in the same encounter cost one pip total', () => {
    const { step, ids } = started(memoryStorage());
    const id = ids[0];
    let s = presented(step.session, id, 'e1').session;
    s = wrongOrb(s, id, wrongLabel(BIG, id)).session;
    const hit = enemyHit(s, id);
    expect(pips(hit.effects)).toEqual([]);
    expect(hit.session.run?.run.pips).toBe(4);
  });

  it('two enemy hits in one encounter cost one pip; a new presentation can cost another', () => {
    const { step, ids } = started(memoryStorage());
    const id = ids[0];
    let s = presented(step.session, id, 'e1').session;
    s = enemyHit(s, id).session;
    const again = enemyHit(s, id);
    expect(pips(again.effects)).toEqual([]);
    s = presented(again.session, id, 'e2').session;
    const next = enemyHit(s, id);
    expect(pips(next.effects)).toEqual([3]);
  });

  it('the enemy hit that takes the last pip shows the lose screen, then enemy hits change nothing', () => {
    const { step, ids } = started(memoryStorage());
    let s = step.session;
    for (const [i, id] of ids.slice(0, 4).entries()) {
      s = presented(s, id, `e${i}`).session;
      s = wrongOrb(s, id, wrongLabel(BIG, id)).session;
    }
    s = presented(s, ids[4], 'e4').session;
    const last = enemyHit(s, ids[4]);
    expect(pips(last.effects)).toEqual([0]);
    expect(endScreens(last.effects).map((e) => e.kind)).toEqual(['lose']);
    const after = enemyHit(last.session, ids[5]);
    expect(after.session).toBe(last.session);
    expect(after.effects).toEqual([]);
  });

  it('an enemy hit before a run, for a card not presented, or for an unknown card changes nothing', () => {
    const pre = ready(memoryStorage());
    const before = enemyHit(pre, BIG.cards[0].id);
    expect(before.session).toBe(pre);
    expect(before.effects).toEqual([]);

    const { step, ids } = started(memoryStorage());
    const s = presented(step.session, ids[0], 'e1').session;
    for (const id of [ids[1], 'stranger']) {
      const r = enemyHit(s, id);
      expect(r.session, id).toBe(s);
      expect(r.effects, id).toEqual([]);
    }
  });
});

// Requirement: bigger enemies are multi-card health pools (M2). The spawnWave effect tells the scene
// how many cards each spawned enemy carries, in spawn order, so it can build the wave with pools:
// poolSizes sums to the spawned card count (every reserved card is on exactly one enemy) and follows
// the stack packing of planPoolSizes (stacks of 3; 8+ cards end in a 5-card boss; a leftover 1 joins
// the last regular stack, a leftover 2 is its own first stack). The card list itself is unchanged.
// Contract addition: SessionEffect spawnWave gains `poolSizes: readonly number[]` (= planPoolSizes).
// Covers: M2, D19, CARDS-010
describe('game-session: spawnWave carries health-pool sizes', () => {
  function waveOf(effects: readonly SessionEffect[]) {
    const w = effects.find((e): e is Extract<SessionEffect, { type: 'spawnWave' }> => e.type === 'spawnWave');
    if (!w) throw new Error('no spawnWave effect');
    return w as typeof w & { poolSizes?: readonly number[] };
  }

  it('a 12-card run spawns the stack packing for 12, summing to the card count and ending in the 5-card boss', () => {
    const { step, ids } = started(memoryStorage());
    const w = waveOf(step.effects);
    expect(ids).toHaveLength(12);
    expect(w.poolSizes).toEqual(planPoolSizes(12));
    expect(w.poolSizes?.reduce((a, b) => a + b, 0)).toBe(12);
    expect(w.poolSizes?.[w.poolSizes.length - 1]).toBe(5);
  });

  it('a 4-card deck (under 8 cards, no boss) spawns one 4-card stack, every card used once', () => {
    const { step, ids } = started(memoryStorage(), SMALL.id);
    const w = waveOf(step.effects);
    expect(ids).toHaveLength(4);
    expect(w.poolSizes).toEqual([4]);
  });
});
