// Pure run controller for the cards scene: the scene reports events, the controller answers with
// plain-data effects (pips left, one end screen). Built on run-state.ts; never mutates its inputs,
// and an event that does not apply returns the same state object with no effects.
import {
  beginEncounter,
  recordCorrect,
  recordWrong,
  startRun,
  type RunOptions,
  type RunState,
} from './run-state.js';

export interface RunFlowState {
  readonly run: RunState;
  /** (cardId, encounterId) pairs already presented: a re-render never starts a new encounter. */
  readonly seen: readonly string[];
}

export type RunFlowEvent =
  | { type: 'presented'; cardId: string; encounterId: string }
  | { type: 'wrongOrb'; cardId: string }
  | { type: 'correctOrb'; cardId: string }
  | { type: 'waveCleared' };

export type EndScreenKind = 'win' | 'lose' | 'practice-done';

export type RunFlowEffect =
  | { type: 'pips'; remaining: number }
  | { type: 'endScreen'; kind: EndScreenKind; text: string };

export interface RunFlowStep {
  state: RunFlowState;
  effects: readonly RunFlowEffect[];
}

const TEXT = {
  'day-cleared': 'Day cleared! Well done.',
  'deck-conquered': 'Deck conquered! Every card mastered.',
  lose: 'Shields down. Try again.',
  practice: 'Practice done. No cards due today.',
} as const;

export function startFlow(opts: RunOptions): RunFlowStep {
  const run = startRun(opts);
  const effects: RunFlowEffect[] =
    run.status === 'practice'
      ? [{ type: 'endScreen', kind: 'practice-done', text: TEXT.practice }]
      : [{ type: 'pips', remaining: run.pips }];
  return { state: { run, seen: [] }, effects };
}

// JSON keeps the pair unambiguous whatever characters the ids contain.
const pairKey = (cardId: string, encounterId: string): string => JSON.stringify([cardId, encounterId]);

export function stepFlow(state: RunFlowState, event: RunFlowEvent): RunFlowStep {
  const noop: RunFlowStep = { state, effects: [] };
  const { run } = state;
  if (run.status !== 'active') return noop;

  switch (event.type) {
    case 'presented': {
      const key = pairKey(event.cardId, event.encounterId);
      if (state.seen.includes(key)) return noop;
      const next = beginEncounter(run, event.cardId);
      if (next === run) return noop;
      return { state: { run: next, seen: [...state.seen, key] }, effects: [] };
    }
    case 'wrongOrb': {
      const next = recordWrong(run, event.cardId);
      if (next === run) return noop;
      const effects: RunFlowEffect[] = [];
      if (next.pips !== run.pips) effects.push({ type: 'pips', remaining: next.pips });
      if (next.status === 'lost') effects.push({ type: 'endScreen', kind: 'lose', text: TEXT.lose });
      return { state: { ...state, run: next }, effects };
    }
    case 'correctOrb': {
      const next = recordCorrect(run, event.cardId);
      if (next === run) return noop;
      const effects: RunFlowEffect[] =
        next.status === 'won' && next.winTier
          ? [{ type: 'endScreen', kind: 'win', text: TEXT[next.winTier] }]
          : [];
      return { state: { ...state, run: next }, effects };
    }
    case 'waveCleared':
      // The WIN fires on the last reserved card's correct orb, so a cleared wave never ends the run.
      return noop;
  }
}
