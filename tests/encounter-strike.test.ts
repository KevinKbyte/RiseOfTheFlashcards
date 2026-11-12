// Requirement (Kev decision 2026-11-11, "Strike from 0.7 m"): a revealed enemy strikes from its fan
// slot on the 0.7 m hold line without moving in, so the strike distance equals the reach distance
// (0.7 m). Creep from the 2 m knockback line to the strike still takes exactly 8 s (6 s no-speech
// cap + 2 s grading timeout), so the creep speed is (2.0 - 0.7) / 8 = 0.1625 m/s. The telegraph
// starts the moment a creeping enemy reaches the hold line: no hidden stall in its slot.
// Regression (w7 strike freeze): with strike at 0.5 m the logic kept creeping 0.7 -> 0.5 m while the
// view clamped at the 0.7 m slot, so the enemy stood frozen for ~1.07 s before the telegraph.
// Reveal rules are unchanged: an unrevealed enemy halts at 0.7 m and waits to be slashed (it never
// telegraphs on its own); slash only reveals while advancing/slashable; during the telegraph a slash
// does nothing and a correct answer clears the encounter and cancels the hit. A custom config with
// strikeDistance < reachDistance still creeps to its own strike line at its own speed.
// CARDS-* IDs are prototype-local (no spec-cache home yet).
import { describe, expect, it } from 'vitest';
import {
  createEncounter,
  ENCOUNTER_DEFAULTS,
  resolveCorrect,
  slash,
  tick,
  type EncounterConfig,
} from '../src/flashcards/encounter.js';

const D = ENCOUNTER_DEFAULTS;
const STEP = 1 / 64; // binary-exact frame step so accumulated time is not float noise

function revealedAtReach(cfg: Readonly<EncounterConfig> = D) {
  const halted = tick(createEncounter(cfg), 100);
  expect(halted.phase).toBe('slashable');
  return slash(halted);
}

// Covers: CARDS-004
describe('strike from the 0.7 m hold line: defaults', () => {
  it('strikeDistance equals reachDistance equals 0.7 m', () => {
    expect(D.strikeDistance).toBe(0.7);
    expect(D.reachDistance).toBe(0.7);
    expect(D.strikeDistance).toBe(D.reachDistance);
  });

  it('creep speed (knockback - strike) / creepSeconds is 0.1625 m/s', () => {
    const creep = (D.knockbackDistance - D.strikeDistance) / D.creepSeconds;
    expect(creep).toBeCloseTo(0.1625, 12);
  });

  it('the observed creep after a reveal at reach moves 0.1625 m per second', () => {
    const enc = tick(revealedAtReach(), 4);
    expect(enc.phase).toBe('answering');
    expect(enc.distance).toBeCloseTo(2.0 - 0.1625 * 4, 10);
  });

  it('creep from 2.0 m to the strike still takes exactly 8 s (>= 6 s cap + 2 s grading)', () => {
    expect(D.creepSeconds).toBeGreaterThanOrEqual(8);
    const revealed = revealedAtReach();
    expect(revealed.distance).toBe(2.0);
    expect(tick(revealed, 8 - STEP).phase).toBe('answering');
    const struck = tick(revealed, 8);
    expect(struck.phase).toBe('telegraph');
    expect(struck.distance).toBe(0.7);
    expect(struck.telegraphLeft).toBe(D.telegraphSeconds);
  });
});

// Covers: CARDS-004
describe('regression: no hidden stall between the hold line and the telegraph', () => {
  it('the telegraph starts on the same frame the creeping enemy reaches the hold line', () => {
    let enc = revealedAtReach();
    let t = 0;
    let tReach: number | null = null;
    let tTelegraph: number | null = null;
    for (let i = 0; i < 2000 && tTelegraph === null; i++) {
      enc = tick(enc, STEP);
      t += STEP;
      if (tReach === null && enc.distance <= D.reachDistance) tReach = t;
      if (enc.phase === 'telegraph') tTelegraph = t;
    }
    expect(tReach).not.toBeNull();
    expect(tTelegraph).not.toBeNull();
    expect((tTelegraph as number) - (tReach as number)).toBe(0);
  });

  it('a creeping enemy is never still answering at or inside the hold line', () => {
    let enc = revealedAtReach();
    for (let i = 0; i < 2000 && enc.phase === 'answering'; i++) {
      enc = tick(enc, STEP);
      if (enc.phase === 'answering') expect(enc.distance).toBeGreaterThan(D.reachDistance);
    }
    expect(enc.phase).toBe('telegraph');
  });
});

// Covers: CARDS-004
describe('reveal rules at the hold line when reach == strike', () => {
  it('an unrevealed enemy halts slashable at 0.7 m and never telegraphs on its own', () => {
    const halted = tick(createEncounter(), 100);
    expect(halted.phase).toBe('slashable');
    expect(halted.distance).toBe(D.reachDistance);
    expect(tick(halted, 100)).toEqual(halted);
  });

  it('slashing the halted enemy at 0.7 m knocks it back to 2 m and starts answering', () => {
    const revealed = revealedAtReach();
    expect(revealed.phase).toBe('answering');
    expect(revealed.distance).toBe(D.knockbackDistance);
    expect(revealed.hits).toBe(0);
  });

  it('during the telegraph at 0.7 m a slash does nothing and a correct answer cancels the hit', () => {
    const tel = tick(revealedAtReach(), D.creepSeconds);
    expect(tel.phase).toBe('telegraph');
    expect(tel.distance).toBe(0.7);
    expect(slash(tel)).toBe(tel);
    const cleared = resolveCorrect(tel);
    expect(cleared.phase).toBe('cleared');
    expect(cleared.hits).toBe(0);
  });
});

// Covers: CARDS-004
describe('custom config with strikeDistance < reachDistance', () => {
  const CFG: EncounterConfig = { ...D, reachDistance: 0.7, strikeDistance: 0.5 };
  const CREEP = (CFG.knockbackDistance - CFG.strikeDistance) / CFG.creepSeconds; // 0.1875 m/s

  it('creeps at its own (knockback - strike) / creepSeconds speed', () => {
    const enc = tick(revealedAtReach(CFG), 4);
    expect(enc.phase).toBe('answering');
    expect(enc.distance).toBeCloseTo(2.0 - CREEP * 4, 10);
    expect(CREEP).toBeCloseTo(0.1875, 12);
  });

  it('keeps creeping past the hold line and telegraphs at its own 0.5 m strike after creepSeconds', () => {
    const revealed = revealedAtReach(CFG);
    const pastReach = tick(revealed, (2.0 - 0.6) / CREEP);
    expect(pastReach.phase).toBe('answering');
    expect(pastReach.distance).toBeLessThan(CFG.reachDistance);
    expect(tick(revealed, CFG.creepSeconds - STEP).phase).toBe('answering');
    const struck = tick(revealed, CFG.creepSeconds);
    expect(struck.phase).toBe('telegraph');
    expect(struck.distance).toBe(0.5);
  });
});
