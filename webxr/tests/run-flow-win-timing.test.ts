// Requirement (stack fight, Kev 2026-11-12): the run's WIN fires only after the finishing slash
// knocks the last card off the last enemy, i.e. when the scene reports the wave cleared; the
// correct answer to the last reserved card stuns that enemy but does not end the run. Grading is
// unchanged and happens at the answer, not the slash: the last correct answer still writes exactly
// one Good rating, and the wave-cleared event writes nothing. The WIN is shown exactly once.
//
// Seam (no new export): the existing run-flow event { type: 'waveCleared' } (game-session
// waveCleared(s)) fires the WIN once every reserved card has been answered correctly; correctOrb
// on the last reserved card emits no end screen. Spec IDs: plan IDs, as run-flow.test.ts cites.
import { describe, expect, it } from 'vitest';
import {
  correctOrb as sessionCorrectOrb,
  createSession,
  presented as sessionPresented,
  startRun,
  updateMenu,
  waveCleared as sessionWaveCleared,
  type SessionEffect,
} from '../src/flashcards/game-session.js';
import type { Deck } from '../src/flashcards/deck-schema.js';
import { openDeckSelect, selectDeck } from '../src/flashcards/menu-flow.js';
import { startFlow, stepFlow, type RunFlowEffect, type RunFlowEvent, type RunFlowState } from '../src/flashcards/run-flow.js';
import { deckCards, loadSave, type SaveStorage } from '../src/flashcards/save.js';
import { applyRating } from '../src/flashcards/scheduler.js';

const presented = (cardId: string, encounterId: string): RunFlowEvent => ({ type: 'presented', cardId, encounterId });
const correctOrb = (cardId: string): RunFlowEvent => ({ type: 'correctOrb', cardId });
const waveCleared: RunFlowEvent = { type: 'waveCleared' };

function step(s: RunFlowState, ...events: RunFlowEvent[]): RunFlowState {
  let out = s;
  for (const e of events) out = stepFlow(out, e).state;
  return out;
}

function endScreens(effects: readonly (RunFlowEffect | SessionEffect)[]) {
  return effects.filter((e): e is Extract<RunFlowEffect, { type: 'endScreen' }> => e.type === 'endScreen');
}

/** Every reserved card but the last answered correctly, the last one presented. */
function lastCardPresented(ids: readonly string[], opts: { deckMastered?: boolean } = {}): RunFlowState {
  let s = startFlow({ cardIds: ids, ...opts }).state;
  for (const id of ids.slice(0, -1)) s = step(s, presented(id, `e-${id}`), correctOrb(id));
  return step(s, presented(ids[ids.length - 1], 'e-last'));
}

// Covers: D19, M24
describe('run flow: the WIN waits for the wave to clear', () => {
  it('the correct answer to the last reserved card shows no end screen', () => {
    const ids = ['card-1', 'card-2', 'card-3'];
    const r = stepFlow(lastCardPresented(ids), correctOrb('card-3'));
    expect(r.state.run.remaining).toEqual([]);
    expect(endScreens(r.effects)).toEqual([]);
  });

  it('the wave clearing after the last correct answer shows one "Day cleared" WIN', () => {
    const ids = ['card-1', 'card-2', 'card-3'];
    const answered = stepFlow(lastCardPresented(ids), correctOrb('card-3')).state;
    const r = stepFlow(answered, waveCleared);
    expect(r.state.run.status).toBe('won');
    const screens = endScreens(r.effects);
    expect(screens.map((e) => e.kind)).toEqual(['win']);
    expect(screens[0].text).toMatch(/day cleared/i);
  });

  it('a fully mastered selection shows "Deck conquered" when the wave clears', () => {
    const answered = stepFlow(lastCardPresented(['a'], { deckMastered: true }), correctOrb('a')).state;
    const screens = endScreens(stepFlow(answered, waveCleared).effects);
    expect(screens.map((e) => e.kind)).toEqual(['win']);
    expect(screens[0].text).toMatch(/deck conquered/i);
  });

  it('the WIN is shown once: a second wave-cleared report changes nothing', () => {
    const answered = stepFlow(lastCardPresented(['a', 'b']), correctOrb('b')).state;
    const won = stepFlow(answered, waveCleared).state;
    const again = stepFlow(won, waveCleared);
    expect(again.state).toBe(won);
    expect(again.effects).toEqual([]);
  });

  it('a wave-cleared report before the last card is answered is still not a WIN', () => {
    const s = lastCardPresented(['a', 'b']);
    const r = stepFlow(s, waveCleared);
    expect(r.state).toBe(s);
    expect(r.effects).toEqual([]);
  });
});

// 10:00 local: well clear of the 04:00 study-day rollover.
const NOW = new Date(2026, 10, 7, 10, 0, 0);
const DECK: Deck = {
  id: 'tiny',
  title: 'Tiny Deck',
  cards: [
    { id: 'tiny-1', prompt: 'Question one?', answer: 'answer a' },
    { id: 'tiny-2', prompt: 'Question two?', answer: 'answer b' },
  ],
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

// Covers: D19, M24
describe('game session: Good is written at the answer, the WIN at the wave clear', () => {
  it('last correct answer writes one Good and no WIN; the wave clear shows the WIN and writes nothing', () => {
    const storage = memoryStorage();
    const ready = updateMenu(updateMenu(createSession({ decks: [DECK], storage, clock: () => NOW }), openDeckSelect), (m) =>
      selectDeck(m, DECK.id),
    );
    let s = startRun(ready).session;
    s = sessionCorrectOrb(sessionPresented(s, 'tiny-1', 'e1').session, 'tiny-1').session;
    s = sessionPresented(s, 'tiny-2', 'e2').session;
    const writesBefore = storage.writes.length;

    const answered = sessionCorrectOrb(s, 'tiny-2');
    expect(endScreens(answered.effects)).toEqual([]);
    expect(storage.writes).toHaveLength(writesBefore + 1);
    expect(deckCards(loadSave(storage), DECK.id)['tiny-2']).toEqual(applyRating(undefined, 'good', NOW));

    const cleared = sessionWaveCleared(answered.session);
    expect(endScreens(cleared.effects).map((e) => e.kind)).toEqual(['win']);
    expect(storage.writes).toHaveLength(writesBefore + 1);
  });
});
