// Shared playthrough steps for the e2e suites: every step is real controller input through the
// harness (ray aim + trigger) and resolves on the observed game state, never on a fixed sleep.
import type { Game, GameState } from './harness.js';

export const DECK = 'World Capitals';
export const START = 'Start';

/** From the start screen, presses the 'Start' orb; resolves once the deck orbs show. */
export async function pressStart(g: Game): Promise<GameState> {
  await g.until((s) => s.menuOpen && s.orbs.some((o) => o.label === START), 'start screen');
  const deckShown = (s: GameState) => s.menuOpen && s.orbs.some((o) => o.label === DECK);
  await g.aimAndSelect({ kind: 'orb', label: START }, deckShown);
  return g.until(deckShown, 'deck menu');
}

export async function pickDeck(g: Game, title = DECK): Promise<GameState> {
  await g.aimAndSelect({ kind: 'orb', label: title }, (s) => !s.menuOpen);
  return g.until((s) => !s.menuOpen && s.waveCards.length > 0 && s.active.some((e) => e.pos), 'wave spawned');
}

/** Selects (slashes) the first spawned enemy; resolves once its question panel shows orbs. */
export async function revealNext(g: Game): Promise<GameState> {
  const s = await g.until((x) => x.targetId !== null || x.active.some((e) => e.pos), 'an enemy to reveal');
  if (s.targetId !== null && s.orbs.length > 0) return s;
  const enemy = s.active.find((e) => e.pos)!;
  await g.aimAndSelect({ kind: 'enemy', id: enemy.id }, (x) => x.targetId !== null);
  return g.until((x) => x.targetId === enemy.id && x.orbs.length > 0 && x.answer !== null, `card ${enemy.id} revealed`);
}

/** Answers the current card; cleared = the card left (enemy peeled to its next card or gone) or the run ended. */
export async function answerRight(g: Game, s: GameState): Promise<GameState> {
  const card = s.cardId;
  const cleared = (x: GameState) => x.cardId !== card || x.message;
  await g.aimAndSelect({ kind: 'orb', label: s.answer! }, cleared);
  return g.until(cleared, `card ${card} cleared`);
}

export async function answerWrong(g: Game, s: GameState): Promise<{ label: string; after: GameState }> {
  const wrong = s.orbs.find((o) => o.label !== s.answer)!;
  const handled = (x: GameState) => x.pips < s.pips || x.message || !x.orbs.some((o) => o.label === wrong.label);
  await g.aimAndSelect({ kind: 'orb', label: wrong.label }, handled);
  const after = await g.until(handled, `wrong orb ${wrong.label} handled`);
  return { label: wrong.label, after };
}
