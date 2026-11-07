// Requirement: on an emulated Quest 3 the ultimate is playable with real controller input: five
// correct answers charge it, which shows a ready orb in front of the player (none before), and
// selecting that orb with a revealed enemy knocks the enemy back to its spawn distance with a
// shockwave and spends the charge back to 0.
import { afterEach, describe, expect, inject, it } from 'vitest';
import { answerRight, pickDeck, pressStart, revealNext } from './flow.js';
import { forwardness, Game } from './harness.js';

/** src/flashcards/run-state.ts ULTIMATE_CHARGE. */
const ULTIMATE_CHARGE = 5;
/** Encounter knockbackDistance: a revealed enemy closer than this has visibly crept in. */
const CREPT_IN = 2.0;

let game: Game | undefined;
afterEach(async () => {
  if (game?.retriedPresses.length) console.warn(`[e2e] retried presses: ${game.retriedPresses.join('; ')}`);
  await game?.close();
  game = undefined;
});

async function openRun(): Promise<Game> {
  game = await Game.launch(inject('baseUrl'));
  await game.enterXR();
  await pressStart(game);
  await pickDeck(game);
  return game;
}

// Covers: M4, D7, S7, H-2, D17
describe('ultimate on the emulated Quest 3 (real controller input)', () => {
  it('five correct answers show the ultimate orb; selecting it knocks the revealed enemy back and spends the charge', async () => {
    const g = await openRun();
    let s = await g.state();
    expect(s.charge).toBe(0);
    expect(s.ultimateOrb).toBeNull();
    while ((s.charge ?? 0) < ULTIMATE_CHARGE) {
      s = await answerRight(g, await revealNext(g));
      expect(s.message, 'run ended before the ultimate charged').toBe(false);
      if ((s.charge ?? 0) < ULTIMATE_CHARGE) expect(s.ultimateOrb, `orb shown at charge ${s.charge}`).toBeNull();
    }
    expect(s.charge).toBe(ULTIMATE_CHARGE);

    await revealNext(g);
    const ready = await g.until(
      (x) => x.ultimateOrb !== null && x.targetDistance !== null && x.targetDistance <= CREPT_IN,
      'ultimate orb shown with a revealed enemy crept in',
      30_000,
    );
    expect(forwardness(ready.cam, ready.camForward, ready.ultimateOrb!), 'ultimate orb in front').toBeGreaterThan(0);
    const pulsesBefore = ready.pulses;

    await g.aimAndSelect({ kind: 'ultimate' }, (x) => x.charge === 0);
    const fired = await g.state();
    expect(fired.charge).toBe(0);
    expect(fired.targetId).toBe(ready.targetId);
    // Knocked back to spawn (3 m); a few frames of creep afterwards cost centimetres at most.
    expect(fired.targetDistance!).toBeGreaterThan(fired.spawnDistance - 0.2);
    expect(fired.pulses).toBe(pulsesBefore + 1);
    expect(fired.ultimateOrb).toBeNull();
    expect(fired.pips).toBe(ready.pips);
    expect(g.errors).toEqual([]);
  }, 600_000);
});
