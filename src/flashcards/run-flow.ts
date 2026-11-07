// Pure run controller for the cards scene: the scene reports events, the controller answers with
// plain-data effects (pips left, one end screen). Built on run-state.ts; never mutates its inputs,
// and an event that does not apply returns the same state object with no effects.
import {
  beginEncounter,
  recordCorrect,
  recordEnemyHit,
  recordWrong,
  startRun,
  type RunOptions,
  type RunState,
} from './run-state.js';

export interface RunFlowState {
  readonly run: RunState;
  /**
   * Latest encounterId presented per card id. Only the latest matters for encounter identity, so
   * this stays bounded by the deck size however long the run: a re-render never starts a new encounter.
   */
  readonly latest: Readonly<Record<string, string>>;
}

export type RunFlowEvent =
  | { type: 'presented'; cardId: string; encounterId: string }
  | { type: 'wrongOrb'; cardId: string }
  | { type: 'correctOrb'; cardId: string }
  /** The enemy's strike landed on the player for this card (not answered in time). */
  | { type: 'enemyHit'; cardId: string }
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

/** @throws {RangeError} when `opts.cardIds` contains a duplicate card id (via startRun). */
export function startFlow(opts: RunOptions): RunFlowStep {
  const run = startRun(opts);
  const effects: RunFlowEffect[] =
    run.status === 'practice'
      ? [{ type: 'endScreen', kind: 'practice-done', text: TEXT.practice }]
      : [{ type: 'pips', remaining: run.pips }];
  return { state: { run, latest: {} }, effects };
}

// Own-property check: a card id like "constructor" must not hit Object.prototype.
const latestOf = (latest: Readonly<Record<string, string>>, cardId: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(latest, cardId) ? latest[cardId] : undefined;

// Shared by the wrong orb and a landed strike: both go through run-state's per-encounter pip cap.
function hitEffects(run: RunState, next: RunState): RunFlowEffect[] {
  const effects: RunFlowEffect[] = [];
  if (next.pips !== run.pips) effects.push({ type: 'pips', remaining: next.pips });
  if (next.status === 'lost') effects.push({ type: 'endScreen', kind: 'lose', text: TEXT.lose });
  return effects;
}

export function stepFlow(state: RunFlowState, event: RunFlowEvent): RunFlowStep {
  const noop: RunFlowStep = { state, effects: [] };
  const { run } = state;
  if (run.status !== 'active') return noop;

  switch (event.type) {
    case 'presented': {
      if (latestOf(state.latest, event.cardId) === event.encounterId) return noop;
      const next = beginEncounter(run, event.cardId);
      if (next === run) return noop;
      const latest = { ...state.latest, [event.cardId]: event.encounterId };
      return { state: { run: next, latest }, effects: [] };
    }
    case 'wrongOrb': {
      // No `latest` check here, unlike enemyHit: answer orbs exist only on the question panel, which
      // the scene opens in the same step that reports `presented`, so a wrong answer always follows
      // its presentation. A strike comes from the wave's own timer and can land on a target whose
      // presentation was never reported (e.g. no card found for it), so enemyHit must check.
      const next = recordWrong(run, event.cardId);
      if (next === run) return noop;
      return { state: { ...state, run: next }, effects: hitEffects(run, next) };
    }
    case 'enemyHit': {
      // Only a presented card is in an encounter, so only it can strike.
      if (latestOf(state.latest, event.cardId) === undefined) return noop;
      const next = recordEnemyHit(run, event.cardId);
      if (next === run) return noop;
      return { state: { ...state, run: next }, effects: hitEffects(run, next) };
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
