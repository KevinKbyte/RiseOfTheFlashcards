// Requirement: on an emulated Quest 3 the ultimate is playable with real controller input: the
// ultimate orb shows in front of the player for the whole run, dim (not glowing) while charge is
// below five, and selecting the dim orb does nothing. Five correct answers light it up; selecting
// the glowing orb with a revealed enemy knocks the enemy back to its spawn distance with a
// shockwave, spends the charge back to 0, and the orb goes dim again.
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
  it('the orb is dim and inert below five charge, glows at five, and selecting it knocks the revealed enemy back and spends the charge', async () => {
    const g = await openRun();
    let s = await g.state();
    expect(s.charge).toBe(0);
    expect(s.ultimateOrb, 'orb shown at charge 0').not.toBeNull();
    expect(s.ultimateGlow, 'orb dim at charge 0').toBe(false);

    // Selecting the dim orb with a revealed enemy does nothing.
    const revealed = await revealNext(g);
    await g.aimAndSelect({ kind: 'ultimate' });
    await g.frames(10);
    const inert = await g.state();
    expect(inert.charge).toBe(0);
    expect(inert.pulses).toBe(revealed.pulses);
    expect(inert.targetId).toBe(revealed.targetId);
    expect(inert.ultimateGlow).toBe(false);

    s = inert;
    while ((s.charge ?? 0) < ULTIMATE_CHARGE) {
      s = await answerRight(g, await revealNext(g));
      expect(s.message, 'run ended before the ultimate charged').toBe(false);
      if ((s.charge ?? 0) < ULTIMATE_CHARGE) {
        expect(s.ultimateOrb, `orb shown at charge ${s.charge}`).not.toBeNull();
        expect(s.ultimateGlow, `orb dim at charge ${s.charge}`).toBe(false);
      }
    }
    expect(s.charge).toBe(ULTIMATE_CHARGE);

    await revealNext(g);
    const ready = await g.until(
      (x) => x.ultimateGlow === true && x.targetDistance !== null && x.targetDistance <= CREPT_IN,
      'ultimate orb glowing with a revealed enemy crept in',
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
    expect(fired.ultimateOrb, 'orb still shown after firing').not.toBeNull();
    expect(fired.ultimateGlow, 'orb dim again after firing').toBe(false);
    expect(fired.pips).toBe(ready.pips);
    expect(g.errors).toEqual([]);
  }, 600_000);
});
