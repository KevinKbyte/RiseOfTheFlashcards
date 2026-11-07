// Requirement: the 3D cards scene (src/cards.ts CardsSystem) drives one flashcard run through a
// pure controller. The scene reports what happened (a card was presented, a wrong orb or the right
// orb was picked, the wave was cleared) and the controller answers with plain-data effects the
// scene renders: the shield pips left and, when the run ends, one end screen whose text is plain
// words (never a card id). Rules (Kev 2026-11-07): each presentation of a card starts exactly one
// encounter; a re-render or retry of the same presentation never starts another, so it never
// resets the one-pip-per-encounter cap (D14/Q8). A wrong orb counts as a hit (D4). WIN only when
// every reserved card (at most 12) is cleared; an empty queue is a practice run that ends on a
// "practice done" screen, never a WIN (D19). The run is lost when the pips reach 0 (S6). Once the
// run has ended, no event changes anything. The controller never mutates its inputs.
//
// Spec IDs: no .claude/spec-cache in this repo, so tags cite plan IDs
// (docs/plans/2026-10-28-vr-flashcard-game*.md: D4, D14, D19, M24, S6), as run-state.test.ts does.
//
// API contract for src/flashcards/run-flow.ts (pure, immutable, no three.js/DOM; built on
// src/flashcards/run-state.ts, never re-implementing it):
//   export interface RunFlowState { readonly run: RunState; ... }   // other fields are private
//   export type RunFlowEvent =
//     | { type: 'presented'; cardId: string; encounterId: string }
//     | { type: 'wrongOrb'; cardId: string }
//     | { type: 'correctOrb'; cardId: string }
//     | { type: 'waveCleared' };
//   export type EndScreenKind = 'win' | 'lose' | 'practice-done';
//   export type RunFlowEffect =
//     | { type: 'pips'; remaining: number }
//     | { type: 'endScreen'; kind: EndScreenKind; text: string };
//   export interface RunFlowStep { state: RunFlowState; effects: readonly RunFlowEffect[] }
//   export function startFlow(opts: RunOptions): RunFlowStep;
//   export function stepFlow(state: RunFlowState, event: RunFlowEvent): RunFlowStep;
// Encounter identity: the scene passes an encounterId that is unique per presentation (e.g. one
// per reveal). 'presented' calls beginEncounter only when that (cardId, encounterId) pair is new;
// a repeat of a pair already seen returns the same state object with no effects.
// A 'pips' effect is emitted at start and whenever the pip count changes. On the losing hit the
// effects are exactly [pips 0, endScreen lose]. An event that does not apply (run over, card not
// in play, repeated presentation, wave cleared with reserved cards left) returns the same state
// object and no effects.
import { describe, expect, it } from 'vitest';
import {
  startFlow,
  stepFlow,
  type RunFlowEffect,
  type RunFlowEvent,
  type RunFlowState,
} from '../src/flashcards/run-flow.js';

function deck(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `card-${i + 1}`);
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

const presented = (cardId: string, encounterId: string): RunFlowEvent => ({ type: 'presented', cardId, encounterId });
const wrongOrb = (cardId: string): RunFlowEvent => ({ type: 'wrongOrb', cardId });
const correctOrb = (cardId: string): RunFlowEvent => ({ type: 'correctOrb', cardId });
const waveCleared: RunFlowEvent = { type: 'waveCleared' };

function step(s: RunFlowState, ...events: RunFlowEvent[]): RunFlowState {
  let out = s;
  for (const e of events) out = stepFlow(out, e).state;
  return out;
}

function endScreens(effects: readonly RunFlowEffect[]) {
  return effects.filter((e): e is Extract<RunFlowEffect, { type: 'endScreen' }> => e.type === 'endScreen');
}

/** Plain words only: letters and simple punctuation, no digits, no card ids. */
function expectPlainWords(text: string, ids: readonly string[]): void {
  expect(text.trim().length).toBeGreaterThan(0);
  expect(text).toMatch(/^[A-Za-z][A-Za-z ,.!'-]*$/);
  for (const id of ids) expect(text).not.toContain(id);
}

/** Wrong orb on each of the first n cards, each in its own new encounter. */
function hitN(s: RunFlowState, ids: readonly string[], n: number): RunFlowState {
  let out = s;
  for (let i = 0; i < n; i++) out = step(out, presented(ids[i], `e-${i}`), wrongOrb(ids[i]));
  return out;
}

// Covers: D14, D19
describe('startFlow', () => {
  it('starts an active run with 5 pips and tells the scene to show them', () => {
    const { state, effects } = startFlow({ cardIds: deck(3) });
    expect(state.run.status).toBe('active');
    expect(state.run.pips).toBe(5);
    expect(effects).toEqual([{ type: 'pips', remaining: 5 }]);
  });

  it('reserves at most 12 cards, delegating to run-state', () => {
    const { state } = startFlow({ cardIds: deck(15) });
    expect(state.run.cards).toEqual(deck(12));
  });

  it('an empty queue is a practice run that ends on a practice-done screen, never a WIN', () => {
    const { state, effects } = startFlow({ cardIds: [] });
    expect(state.run.status).toBe('practice');
    const screens = endScreens(effects);
    expect(screens).toHaveLength(1);
    expect(screens[0].kind).toBe('practice-done');
    expectPlainWords(screens[0].text, []);
    expect(screens[0].text).not.toMatch(/cleared|conquered|win/i);
  });

  it('does not mutate the options it is given', () => {
    const ids = deepFreeze(deck(14));
    expect(() => startFlow(deepFreeze({ cardIds: ids }))).not.toThrow();
    expect(ids).toHaveLength(14);
  });
});

// Covers: D4, D14
describe('presented: one encounter per presentation', () => {
  it('a presentation costs no pip and emits no effects', () => {
    const s0 = startFlow({ cardIds: deck(3) }).state;
    const { state, effects } = stepFlow(s0, presented('card-1', 'e-1'));
    expect(state.run.pips).toBe(5);
    expect(state.run.remaining).toEqual(deck(3));
    expect(effects).toEqual([]);
  });

  it('presenting the same encounter twice (re-render) returns the same state and no effects', () => {
    const s1 = step(startFlow({ cardIds: deck(3) }).state, presented('card-1', 'e-1'));
    const r = stepFlow(s1, presented('card-1', 'e-1'));
    expect(r.state).toBe(s1);
    expect(r.effects).toEqual([]);
  });

  it('a re-render of the same presentation does not reset the pip cap', () => {
    let s = step(startFlow({ cardIds: deck(3) }).state, presented('card-1', 'e-1'), wrongOrb('card-1'));
    expect(s.run.pips).toBe(4);
    s = step(s, presented('card-1', 'e-1'), wrongOrb('card-1'));
    expect(s.run.pips).toBe(4);
  });

  it('a re-render after another card was presented still does not reset the cap', () => {
    let s = step(startFlow({ cardIds: deck(3) }).state, presented('card-1', 'e-1'), wrongOrb('card-1'));
    s = step(s, presented('card-2', 'e-2'), presented('card-1', 'e-1'), wrongOrb('card-1'));
    expect(s.run.pips).toBe(4);
  });

  it('a new presentation of the same card starts a new encounter that can cost a pip again', () => {
    let s = step(startFlow({ cardIds: deck(3) }).state, presented('card-1', 'e-1'), wrongOrb('card-1'));
    s = step(s, presented('card-1', 'e-2'), wrongOrb('card-1'));
    expect(s.run.pips).toBe(3);
  });

  it('presenting a card that is not in the run returns the same state and no effects', () => {
    const s0 = step(startFlow({ cardIds: deck(3) }).state, correctOrb('card-1'));
    for (const e of [presented('card-1', 'e-9'), presented('stranger', 'e-9')]) {
      const r = stepFlow(s0, e);
      expect(r.state).toBe(s0);
      expect(r.effects).toEqual([]);
    }
  });
});

// Covers: D4, D14
describe('wrong orb', () => {
  it('a wrong orb counts as a hit: one pip lost, card stays in play, pips effect emitted', () => {
    const s0 = step(startFlow({ cardIds: deck(3) }).state, presented('card-1', 'e-1'));
    const { state, effects } = stepFlow(s0, wrongOrb('card-1'));
    expect(state.run.pips).toBe(4);
    expect(state.run.remaining).toEqual(deck(3));
    expect(effects).toEqual([{ type: 'pips', remaining: 4 }]);
  });

  it('at most one pip per card per encounter: a second wrong orb costs nothing and emits no pips effect', () => {
    const s1 = step(startFlow({ cardIds: deck(3) }).state, presented('card-1', 'e-1'), wrongOrb('card-1'));
    const { state, effects } = stepFlow(s1, wrongOrb('card-1'));
    expect(state.run.pips).toBe(4);
    expect(effects).toEqual([]);
  });

  it('a wrong orb for a card not in the run changes nothing', () => {
    const s0 = startFlow({ cardIds: deck(3) }).state;
    const r = stepFlow(s0, wrongOrb('stranger'));
    expect(r.state).toBe(s0);
    expect(r.effects).toEqual([]);
  });
});

// Covers: D14, S6
describe('losing the run', () => {
  it('the hit that takes the last pip ends the run on a lose screen', () => {
    const ids = deck(8);
    const s4 = hitN(startFlow({ cardIds: ids }).state, ids, 4);
    expect(s4.run.pips).toBe(1);
    expect(s4.run.status).toBe('active');
    const { state, effects } = stepFlow(step(s4, presented('card-5', 'e-5')), wrongOrb('card-5'));
    expect(state.run.status).toBe('lost');
    expect(effects).toEqual([
      { type: 'pips', remaining: 0 },
      { type: 'endScreen', kind: 'lose', text: expect.any(String) },
    ]);
    expectPlainWords(endScreens(effects)[0].text, ids);
  });

  it('a 1-card deck missed in 5 separate presentations is lost', () => {
    let s = startFlow({ cardIds: ['a'] }).state;
    for (let i = 0; i < 5; i++) s = step(s, presented('a', `e-${i}`), wrongOrb('a'));
    expect(s.run.status).toBe('lost');
  });

  it('5 re-renders of one presentation cannot lose the run', () => {
    let s = startFlow({ cardIds: ['a'] }).state;
    for (let i = 0; i < 5; i++) s = step(s, presented('a', 'e-1'), wrongOrb('a'));
    expect(s.run.pips).toBe(4);
    expect(s.run.status).toBe('active');
  });
});

// Covers: D19, M24
describe('winning the run', () => {
  it('a correct orb on a card that is not the last clears it with no effects and no pip cost', () => {
    const s0 = step(startFlow({ cardIds: deck(3) }).state, presented('card-2', 'e-1'));
    const { state, effects } = stepFlow(s0, correctOrb('card-2'));
    expect(state.run.remaining).toEqual(['card-1', 'card-3']);
    expect(state.run.pips).toBe(5);
    expect(effects).toEqual([]);
  });

  it('clearing the last reserved card shows a "Day cleared" WIN screen', () => {
    const ids = deck(2);
    const s1 = step(startFlow({ cardIds: ids }).state, presented('card-1', 'e-1'), correctOrb('card-1'), presented('card-2', 'e-2'));
    const { state, effects } = stepFlow(s1, correctOrb('card-2'));
    expect(state.run.status).toBe('won');
    expect(effects).toEqual([{ type: 'endScreen', kind: 'win', text: expect.any(String) }]);
    const text = endScreens(effects)[0].text;
    expect(text).toMatch(/day cleared/i);
    expectPlainWords(text, ids);
  });

  it('a fully mastered selection wins with a "Deck conquered" screen', () => {
    const s1 = step(startFlow({ cardIds: ['a'], deckMastered: true }).state, presented('a', 'e-1'));
    const screens = endScreens(stepFlow(s1, correctOrb('a')).effects);
    expect(screens).toHaveLength(1);
    expect(screens[0].kind).toBe('win');
    expect(screens[0].text).toMatch(/deck conquered/i);
  });

  it('WIN only when all 12 reserved cards are cleared: a wave cleared with 1 left is not a WIN', () => {
    const ids = deck(12);
    let s = startFlow({ cardIds: ids }).state;
    for (const id of ids.slice(0, 11)) s = step(s, presented(id, `e-${id}`), correctOrb(id));
    const r = stepFlow(s, waveCleared);
    expect(r.state).toBe(s);
    expect(r.effects).toEqual([]);
    expect(r.state.run.status).toBe('active');
    const last = stepFlow(step(s, presented('card-12', 'e-last')), correctOrb('card-12'));
    expect(endScreens(last.effects).map((e) => e.kind)).toEqual(['win']);
  });

  it('cards beyond the 12-card reservation never count toward or block the WIN', () => {
    const ids = deck(13);
    let s = startFlow({ cardIds: ids }).state;
    const extra = stepFlow(s, correctOrb('card-13'));
    expect(extra.state).toBe(s);
    for (const id of ids.slice(0, 12)) s = step(s, presented(id, `e-${id}`), correctOrb(id));
    expect(s.run.status).toBe('won');
  });

  it('a practice run never shows a WIN, even when the wave is cleared', () => {
    const s = startFlow({ cardIds: [] }).state;
    const r = stepFlow(s, waveCleared);
    expect(r.state).toBe(s);
    expect(endScreens(r.effects).filter((e) => e.kind === 'win')).toEqual([]);
  });
});

// Covers: D14, D19, S6
describe('after the run ends', () => {
  const events: RunFlowEvent[] = [
    presented('card-3', 'e-new'),
    wrongOrb('card-3'),
    correctOrb('card-3'),
    waveCleared,
  ];

  it('no event changes a lost run or emits effects', () => {
    const ids = deck(8);
    const lost = hitN(startFlow({ cardIds: ids }).state, ids, 5);
    expect(lost.run.status).toBe('lost');
    for (const e of events) {
      const r = stepFlow(lost, e);
      expect(r.state).toBe(lost);
      expect(r.effects).toEqual([]);
    }
  });

  it('no event changes a won run or emits effects', () => {
    const won = step(startFlow({ cardIds: ['card-3'] }).state, presented('card-3', 'e-1'), correctOrb('card-3'));
    expect(won.run.status).toBe('won');
    for (const e of events) {
      const r = stepFlow(won, e);
      expect(r.state).toBe(won);
      expect(r.effects).toEqual([]);
    }
  });

  it('no event changes a practice run or emits effects', () => {
    const practice = startFlow({ cardIds: [] }).state;
    for (const e of events) {
      const r = stepFlow(practice, e);
      expect(r.state).toBe(practice);
      expect(r.effects).toEqual([]);
    }
  });
});

// Covers: D4, D14
describe('purity', () => {
  it('never mutates the state or event it is given', () => {
    const s0 = deepFreeze(startFlow({ cardIds: deck(3) }).state);
    const s1 = deepFreeze(stepFlow(s0, deepFreeze(presented('card-1', 'e-1'))).state);
    const s2 = deepFreeze(stepFlow(s1, deepFreeze(wrongOrb('card-1'))).state);
    const s3 = stepFlow(s2, deepFreeze(correctOrb('card-1'))).state;
    expect(s0.run.pips).toBe(5);
    expect(s1.run.pips).toBe(5);
    expect(s2.run.pips).toBe(4);
    expect(s2.run.remaining).toEqual(deck(3));
    expect(s3.run.remaining).toEqual(['card-2', 'card-3']);
  });

  it('the same state and event always give the same result', () => {
    const s0 = deepFreeze(step(startFlow({ cardIds: deck(3) }).state, presented('card-1', 'e-1')));
    expect(stepFlow(s0, wrongOrb('card-1'))).toEqual(stepFlow(s0, wrongOrb('card-1')));
  });
});

// Requirement: a long or endless run never grows the controller's state without bound. Only the
// latest presentation of each card in play matters for encounter identity, so whatever the
// controller remembers about presentations stays bounded by the number of distinct cards (at most
// 12), however many times cards are presented. Re-render rules are unchanged: a repeat of a card's
// latest presentation still starts no new encounter and never resets the pip cap.
// Covers: D14
describe('presented: state stays bounded over a long run', () => {
  // Fixed-width ids so serialized size reflects entry count, not id length.
  const eid = (i: number): string => `e-${String(i).padStart(4, '0')}`;

  function presentMany(s: RunFlowState, n: number): RunFlowState {
    let out = s;
    for (let i = 0; i < n; i++) {
      out = step(out, presented(i % 2 === 0 ? 'card-1' : 'card-2', eid(i)), wrongOrb('stranger'), waveCleared);
    }
    return out;
  }

  it('500 presentations of the same 2 cards leave the state no larger than after 10', () => {
    const s0 = startFlow({ cardIds: deck(3) }).state;
    const after10 = presentMany(s0, 10);
    const after500 = presentMany(s0, 500);
    expect(after500.run).toEqual(after10.run);
    expect(JSON.stringify(after500).length).toBeLessThanOrEqual(JSON.stringify(after10).length);
  });

  it('after 500 presentations a re-render of the latest presentation still does not reset the pip cap', () => {
    let s = presentMany(startFlow({ cardIds: deck(3) }).state, 500);
    s = step(s, presented('card-1', eid(500)), wrongOrb('card-1'));
    expect(s.run.pips).toBe(4);
    const rerender = stepFlow(s, presented('card-1', eid(500)));
    expect(rerender.state).toBe(s);
    expect(rerender.effects).toEqual([]);
    s = step(s, presented('card-2', eid(501)), presented('card-1', eid(500)), wrongOrb('card-1'));
    expect(s.run.pips).toBe(4);
    s = step(s, presented('card-1', eid(502)), wrongOrb('card-1'));
    expect(s.run.pips).toBe(3);
  });
});
