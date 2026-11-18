// Shared playthrough steps for the e2e suites: every step is real controller input through the
// harness (ray aim + trigger) and resolves on the observed game state, never on a fixed sleep.
import type { Game, GameState } from './harness.js';

export const DECK = 'World Capitals';
export const START = 'Start';

/** HUD stack label on the question panel's second line (src/flashcards/pool.ts livesLabel). */
export const cardsLabel = (remaining: number, total: number): string => `Cards ${remaining}/${total}`;

/** The panel's HUD line (`Braincells: N   Cards r/t`), or null while no question panel is drawn. */
export const hudLine = (s: GameState): string | null => s.panelText?.[1] ?? null;

/** The revealed card is the run's last: one enemy left on the field, on its last card, nothing queued. */
export const isLastCard = (s: GameState): boolean =>
  s.queue.length === 0 && s.active.length === 1 && s.active[0].cards.length === 1;

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

const shown = (x: GameState) => x.targetId !== null && x.orbs.length > 0 && x.answer !== null && x.panelText !== null;

/**
 * Waits, with no input, until the enemy on the field shows its card by itself (auto-reveal at the
 * hold line); resolves once its question panel shows orbs.
 */
export async function revealNext(g: Game): Promise<GameState> {
  return g.until(shown, 'the enemy to show its card by itself', 60_000);
}

/** Selects the advancing enemy before it parks (early reveal); resolves once its question panel shows orbs. */
export async function revealEarly(g: Game): Promise<{ before: GameState; after: GameState }> {
  const before = await g.until((x) => x.targetId === null && x.active.some((e) => e.pos && e.phase === 'advancing'), 'an advancing enemy');
  const enemy = before.active.find((e) => e.pos && e.phase === 'advancing')!;
  await g.aimAndSelect({ kind: 'enemy', id: enemy.id }, (x) => x.targetId !== null);
  const after = await g.until((x) => x.targetId === enemy.id && shown(x), `card ${enemy.id} revealed`);
  return { before, after };
}

/** Selects the correct orb; resolves once the target is stunned (or the run ended). */
export async function stunTarget(g: Game, s: GameState): Promise<GameState> {
  const card = s.cardId;
  const stunned = (x: GameState) => (x.stunned && x.cardId === card) || x.message;
  await g.aimAndSelect({ kind: 'orb', label: s.answer! }, stunned);
  return g.until(stunned, `target stunned on card ${card}`);
}

/** Finishing select on the stunned target; resolves once its card is knocked off (or the run ended). */
export async function finishTarget(g: Game, s: GameState): Promise<GameState> {
  const card = s.cardId;
  const off = (x: GameState) => x.cardId !== card || x.message;
  await g.aimAndSelect({ kind: 'enemy', id: s.targetId! }, off);
  return g.until(off, `card ${card} knocked off`);
}

/** Answers the current card: correct orb (stun), then the finishing select that knocks it off. */
export async function answerRight(g: Game, s: GameState): Promise<GameState> {
  return finishTarget(g, await stunTarget(g, s));
}

export async function answerWrong(g: Game, s: GameState): Promise<{ label: string; after: GameState }> {
  const wrong = s.orbs.find((o) => o.label !== s.answer)!;
  const handled = (x: GameState) => x.pips < s.pips || x.message || !x.orbs.some((o) => o.label === wrong.label);
  await g.aimAndSelect({ kind: 'orb', label: wrong.label }, handled);
  const after = await g.until(handled, `wrong orb ${wrong.label} handled`);
  return { label: wrong.label, after };
}
