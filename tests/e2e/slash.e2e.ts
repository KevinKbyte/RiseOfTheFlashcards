// Requirement: on an emulated Quest 3 the controller works as a blade: sweeping the right
// controller tip (grip + 0.12 m along grip -Z) through the correct answer orb at 1.0 m/s or faster
// answers it exactly like selecting it (the enemy is stunned: answer counted, no shield pip lost, the
// card stays up until the finishing slash, its answer orbs are disposed, panel line 1 reads "SLASH IT",
// and it lunges to the 0.7 m hold line), while a slow crossing picks nothing.
import { afterEach, describe, expect, inject, it } from 'vitest';
import { pickDeck, pressStart, revealNext } from './flow.js';
import { Game, type GameState, type TipSample, type Vec3 } from './harness.js';

/** src/flashcards/slash.ts SLASH_MIN_SPEED. */
const SLASH_MIN_SPEED = 1.0;
/**
 * Slash input clock step per sweep frame (Quest 3 at 72 Hz), pinned by Game.sweepTip so tip speeds
 * and sample gaps do not depend on how long a headless frame really took.
 */
const FRAME_S = 1 / 72;
/** Answer orb radius (src/card-question-panel.ts ORB_RADIUS); the collider adds a 0.02 m tip margin. */
const ORB_RADIUS = 0.05;
/** src/flashcards/stun-look.ts STUN_PANEL_TEXT: panel line 1 while the target is stunned. */
const STUN_PANEL_TEXT = 'SLASH IT';
/** src/flashcards/encounter.ts DEFAULT reachDistance: the hold line the stunned target lunges to. */
const REACH_DISTANCE = 0.7;
const DIST_TOL = 0.01;

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

const add = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]];

/** Distance from `c` to segment a-b. */
function segDist(a: Vec3, b: Vec3, c: Vec3): number {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const f = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t = dd === 0 ? 0 : Math.min(1, Math.max(0, (f[0] * d[0] + f[1] * d[1] + f[2] * d[2]) / dd));
  return Math.hypot(f[0] - t * d[0], f[1] - t * d[1], f[2] - t * d[2]);
}

/**
 * Each consecutive trace segment that passes through the orb: its tip speed (m/s) and clock gap
 * (s), both on the slash input clock.
 */
function crossingSegments(trace: TipSample[], orb: Vec3): { speed: number; gap: number }[] {
  const out: { speed: number; gap: number }[] = [];
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1].tip;
    const b = trace[i].tip;
    if (a === null || b === null || segDist(a, b, orb) > ORB_RADIUS) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const gap = trace[i].clock - trace[i - 1].clock;
    if (len > 0) out.push({ speed: len / gap, gap });
  }
  return out;
}

const crossingSpeeds = (trace: TipSample[], orb: Vec3): number[] => crossingSegments(trace, orb).map((c) => c.speed);

/**
 * Tip path to a point `lead` above the orb that never passes near an orb: up from the current tip
 * to well above the orb row, across, then down to the lead point. Steps are short enough that the
 * sweep itself starts from rest.
 */
async function approachAbove(g: Game, orb: Vec3, lead: number): Promise<Vec3[]> {
  const tip = await g.tip();
  const high = orb[1] + 0.375;
  return [
    [tip[0], high, tip[2]],
    [orb[0], high, orb[2]],
    add(orb, lead + 0.15),
    add(orb, lead),
  ];
}

// Covers: M1, M6, S3, CARDS-010, CARDS-012, ENC-006
describe('controller tip slash on the emulated Quest 3 (IWER set_transform input)', () => {
  it('a fast tip swing through the correct orb answers the card like selecting it (stun)', async () => {
    const g = await openRun();
    const shown = await revealNext(g);
    const cleared = (x: GameState) => x.stunned || x.message;
    // 0.25 m per FRAME_S frame on the pinned input clock: 18 m/s, every sample gap 1/72 s, well
    // under the classifier's 0.1 s path cut (src/flashcards/slash.ts SLASH_MAX_SAMPLE_GAP_S), however
    // slow the real frame.
    const orb = (await g.orbPivot(shown.answer!))!;
    expect(orb, `pivot of the correct orb ${shown.answer}`).not.toBeNull();
    const swing: Vec3[] = [add(orb, 0.125), add(orb, -0.125), add(orb, -0.375)];
    const trace = await g.sweepTip([...(await approachAbove(g, orb, 0.375)), ...swing], FRAME_S);
    const crossing = crossingSegments(trace, orb);
    expect(crossing.length, `tip never crossed the orb; trace ${JSON.stringify(trace)}`).toBeGreaterThan(0);
    expect(Math.max(...crossing.map((c) => c.speed))).toBeGreaterThanOrEqual(SLASH_MIN_SPEED);

    const after = await g.until(cleared, `target stunned by the slash on card ${shown.cardId}`, 5000);
    expect(after.stunned).toBe(true);
    expect(after.correct).toBe((shown.correct ?? 0) + 1);
    expect(after.charge).toBe((shown.charge ?? 0) + 1);
    expect(after.pips).toBe(shown.pips);
    expect(after.cardId).toBe(shown.cardId);
    expect(after.active.flatMap((e) => e.cards)).toContain(shown.cardId);
    // CARDS-012: while stunned the answer orbs are gone and the panel reads SLASH IT.
    const look = await g.until((x) => x.panelText?.[0] === STUN_PANEL_TEXT && x.orbs.length === 0, 'stunned panel reads SLASH IT with no orbs');
    expect(look.stunned).toBe(true);
    expect(look.orbs, 'no answer orbs while stunned').toEqual([]);
    expect(look.panelText?.[0]).toBe(STUN_PANEL_TEXT);
    // ENC-006: the stunned target lunges to the hold line, where the finishing slash lands.
    const held = await g.until(
      (x) => x.targetDistance !== null && Math.abs(x.targetDistance - REACH_DISTANCE) < DIST_TOL,
      'stunned target lunges to the hold line',
    );
    expect(held.stunned).toBe(true);
    expect(held.cardId).toBe(shown.cardId);
    expect(held.orbs).toEqual([]);
    expect(g.errors).toEqual([]);
  });

  it('a slow tip crossing through the correct orb picks nothing', async () => {
    const g = await openRun();
    const shown = await revealNext(g);
    const orb = (await g.orbPivot(shown.answer!))!;
    expect(orb, `pivot of the correct orb ${shown.answer}`).not.toBeNull();
    // 3 mm per FRAME_S frame through the collider: 0.216 m/s on the pinned input clock, whatever
    // the real frame length.
    const slow: Vec3[] = [];
    for (let dy = 0.1; dy >= -0.1; dy -= 0.003) slow.push(add(orb, dy));
    const trace = await g.sweepTip([...(await approachAbove(g, orb, 0.1)), ...slow], FRAME_S);
    const speeds = crossingSpeeds(trace, orb);
    expect(speeds.length, `tip never crossed the orb; trace ${JSON.stringify(trace)}`).toBeGreaterThan(0);
    expect(Math.max(...speeds)).toBeLessThan(SLASH_MIN_SPEED);

    await g.frames(10);
    const after = await g.state();
    expect(after.cardId).toBe(shown.cardId);
    expect(after.targetId).toBe(shown.targetId);
    expect(after.correct).toBe(shown.correct);
    expect(after.stunned).toBe(false);
    expect(after.orbs.map((o) => o.label).sort()).toEqual(shown.orbs.map((o) => o.label).sort());
    expect(after.message).toBe(false);
    expect(g.errors).toEqual([]);
  }, 120_000);
});
