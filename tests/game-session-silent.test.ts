// No spec-cache ID covers silent mode yet; Covers tags cite plan IDs (M10, D2, D4, D14), as
// game-session/run-flow/review-flow tests do.
//
// API contract additions for src/flashcards/game-session.ts (built on src/flashcards/answer-mode.ts):
//   export function answerModeOf(s: GameSession): AnswerMode;                  // 'silent' | 'voice'
//   export function setAnswerMode(s: GameSession, mode: AnswerMode): GameSession; // same object if no-op
//   export function micPermissionDenied(s: GameSession): GameSession;          // latches silent
// The mode is read when an orb is graded: silent -> answer-mode orbOutcome silent rules; voice ->
// voice rules (a correct orb with no preceding miss/Didn't catch writes nothing).
import { describe, expect, it } from 'vitest';
import {
  correctOrb,
  createSession,
  presented,
  startRun,
  updateMenu,
  wrongOrb,
  type GameSession,
  type SessionEffect,
  type SessionStep,
} from '../src/flashcards/game-session.js';
import * as gameSession from '../src/flashcards/game-session.js';
import { openDeckSelect, selectDeck } from '../src/flashcards/menu-flow.js';
import type { Deck } from '../src/flashcards/deck-schema.js';
import { applyRating } from '../src/flashcards/scheduler.js';
import { deckCards, loadSave, type SaveStorage } from '../src/flashcards/save.js';

type Mode = 'silent' | 'voice';

// 10:00 local: well clear of the 04:00 study-day rollover.
const NOW = new Date(2026, 10, 7, 10, 0, 0);
const clock = () => NOW;

const BIG: Deck = {
  id: 'big',
  title: 'Big Deck',
  cards: Array.from({ length: 14 }, (_, i) => ({
    id: `big-${i + 1}`,
    prompt: `Question number ${i + 1}?`,
    answer: `answer ${String.fromCharCode(97 + i)}`,
  })),
};

function memoryStorage(): SaveStorage & { writes: string[] } {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      writes.push(k);
      data.set(k, v);
    },
  };
}

function seam<T extends (...args: never[]) => unknown>(name: string): T {
  const fn = (gameSession as Record<string, unknown>)[name];
  if (typeof fn !== 'function') throw new Error(`game-session does not export ${name}`);
  return fn as T;
}
const answerModeOf = (s: GameSession) => seam<(s: GameSession) => Mode>('answerModeOf')(s);
const setAnswerMode = (s: GameSession, m: Mode) =>
  seam<(s: GameSession, m: Mode) => GameSession>('setAnswerMode')(s, m);
const micPermissionDenied = (s: GameSession) => seam<(s: GameSession) => GameSession>('micPermissionDenied')(s);

function ready(storage: SaveStorage): GameSession {
  const s = createSession({ decks: [BIG], storage, clock });
  return updateMenu(updateMenu(s, openDeckSelect), (m) => selectDeck(m, BIG.id));
}

function idsOf(step: SessionStep): string[] {
  const wave = step.effects.find((e): e is Extract<SessionEffect, { type: 'spawnWave' }> => e.type === 'spawnWave');
  return wave ? wave.cards.map((c) => c.id) : [];
}

function endScreens(effects: readonly SessionEffect[]) {
  return effects.filter((e): e is Extract<SessionEffect, { type: 'endScreen' }> => e.type === 'endScreen');
}

function wrongLabel(cardId: string): string {
  const other = BIG.cards.find((c) => c.id !== cardId);
  if (!other) throw new Error('deck too small');
  return other.answer;
}

// Covers: M10, D2
// Requirement: the game session carries the answer mode: silent (slash answer orbs) by default
// because the IWSDK build ships voice OFF; the player can switch modes at any time, in the menu or
// mid-run, without disturbing the run; a microphone permission denial latches silent and a later
// switch to voice is refused. A mode change that does not apply returns the same session object.
describe('game-session: answer mode (silent default, toggle, mic-denial latch)', () => {
  it('a new session is in silent mode', () => {
    const s = createSession({ decks: [BIG], storage: memoryStorage(), clock });
    expect(answerModeOf(s)).toBe('silent');
  });

  it('switching to the current mode returns the same session', () => {
    const s = createSession({ decks: [BIG], storage: memoryStorage(), clock });
    expect(setAnswerMode(s, 'silent')).toBe(s);
  });

  it('the player can switch to voice and back from the menu', () => {
    const s = createSession({ decks: [BIG], storage: memoryStorage(), clock });
    const voice = setAnswerMode(s, 'voice');
    expect(answerModeOf(voice)).toBe('voice');
    expect(answerModeOf(s)).toBe('silent');
    expect(answerModeOf(setAnswerMode(voice, 'silent'))).toBe('silent');
  });

  it('switching mode mid-run keeps the run and review state', () => {
    const step = startRun(ready(memoryStorage()));
    const voice = setAnswerMode(step.session, 'voice');
    expect(answerModeOf(voice)).toBe('voice');
    expect(voice.run).toBe(step.session.run);
    expect(voice.review).toBe(step.session.review);
  });

  it('mic denial in voice mode drops to silent; switching back to voice is refused', () => {
    const voice = setAnswerMode(createSession({ decks: [BIG], storage: memoryStorage(), clock }), 'voice');
    const denied = micPermissionDenied(voice);
    expect(answerModeOf(denied)).toBe('silent');
    const retry = setAnswerMode(denied, 'voice');
    expect(retry).toBe(denied);
    expect(answerModeOf(retry)).toBe('silent');
  });

  it('the mode survives later session steps (startRun, presented)', () => {
    const storage = memoryStorage();
    const voice = setAnswerMode(ready(storage), 'voice');
    const step = startRun(voice);
    expect(answerModeOf(step.session)).toBe('voice');
    const s = presented(step.session, idsOf(step)[0], 'e1').session;
    expect(answerModeOf(s)).toBe('voice');
  });
});

// Covers: M10, D4, D14
// Requirement: in silent mode (the default) a correct first-pick orb rates Good, so a player who
// answers every card with a first-pick correct orb clears all 12 reserved cards and reaches the WIN
// screen through the game session with 12 Good writes (plan test ledger: "silent-mode first-pick
// orbs -> WIN reachable"). In voice mode, orbs appear only after misses or a hard STT error; a
// correct orb with no miss or Didn't catch recorded in the encounter (the Hard-STT-only path) clears
// the card but writes no rating, while a wrong orb still writes Again as the first scored attempt.
describe('game-session: orb grading by answer mode', () => {
  it('silent first-pick orbs on all 12 reserved cards reach the WIN with 12 Good ratings', () => {
    const storage = memoryStorage();
    const step = startRun(ready(storage));
    expect(answerModeOf(step.session)).toBe('silent');
    const ids = idsOf(step);
    expect(ids).toHaveLength(12);
    let s = step.session;
    let last: SessionStep = step;
    ids.forEach((id, i) => {
      s = presented(s, id, `e${i}`).session;
      last = correctOrb(s, id);
      s = last.session;
      if (i < ids.length - 1) expect(endScreens(last.effects)).toEqual([]);
    });
    const ends = endScreens(last.effects);
    expect(ends).toHaveLength(1);
    expect(ends[0].kind).toBe('win');
    expect(storage.writes).toHaveLength(12);
    const cards = deckCards(loadSave(storage), BIG.id);
    for (const id of ids) expect(cards[id]).toEqual(applyRating(undefined, 'good', NOW));
  });

  it('voice mode: a correct orb with no preceding miss clears the card but writes nothing', () => {
    const storage = memoryStorage();
    const step = startRun(setAnswerMode(ready(storage), 'voice'));
    const id = idsOf(step)[0];
    const s = presented(step.session, id, 'e1').session;
    const hit = correctOrb(s, id);
    expect(hit.session.run?.run.remaining).not.toContain(id);
    expect(storage.writes).toHaveLength(0);
    expect(deckCards(loadSave(storage), BIG.id)[id]).toBeUndefined();
  });

  it('voice mode: a wrong orb still writes exactly one Again', () => {
    const storage = memoryStorage();
    const step = startRun(setAnswerMode(ready(storage), 'voice'));
    const id = idsOf(step)[0];
    const s = presented(step.session, id, 'e1').session;
    wrongOrb(s, id, wrongLabel(id));
    expect(storage.writes).toHaveLength(1);
    expect(deckCards(loadSave(storage), BIG.id)[id]).toEqual(applyRating(undefined, 'again', NOW));
  });
});
