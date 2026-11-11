// Requirement: on an emulated Quest 3 the controller works as a blade: sweeping the right
// controller tip (grip + 0.12 m along grip -Z) through the correct answer orb at 1.0 m/s or faster
// answers it exactly like selecting it (the card clears, no shield pip is lost), while a slow
// crossing picks nothing.
import { afterEach, describe, expect, inject, it } from 'vitest';
import { pickDeck, pressStart, revealNext } from './flow.js';
import { Game, type GameState, type TipSample, type Vec3 } from './harness.js';

/** src/flashcards/slash.ts SLASH_MIN_SPEED. */
const SLASH_MIN_SPEED = 1.0;
/** Answer orb radius (src/card-question-panel.ts ORB_RADIUS); the collider adds a 0.02 m tip margin. */
const ORB_RADIUS = 0.05;

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

/** Tip speed (m/s, slash input clock) of each consecutive trace segment that passes through the orb. */
function crossingSpeeds(trace: TipSample[], orb: Vec3): number[] {
  const out: number[] = [];
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1];
    const b = trace[i];
    if (segDist(a.tip, b.tip, orb) > ORB_RADIUS) continue;
    const len = Math.hypot(b.tip[0] - a.tip[0], b.tip[1] - a.tip[1], b.tip[2] - a.tip[2]);
    if (len > 0) out.push(len / (b.clock - a.clock));
  }
  return out;
}

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

// Covers: M1, M6, S3
describe('controller tip slash on the emulated Quest 3 (IWER set_transform input)', () => {
  it('a fast tip swing through the correct orb answers the card like selecting it', async () => {
    const g = await openRun();
    const shown = await revealNext(g);
    const orb = (await g.orbPivot(shown.answer!))!;
    expect(orb, `pivot of the correct orb ${shown.answer}`).not.toBeNull();
    // 0.25 m per frame on the uncapped input clock. The classifier cuts the path at sample gaps
    // over 0.1 s (SLASH_MAX_SAMPLE_GAP_S), so any frame that can land a slash measures >= 2.5 m/s.
    const swing: Vec3[] = [add(orb, 0.125), add(orb, -0.125), add(orb, -0.375)];
    const trace = await g.sweepTip([...(await approachAbove(g, orb, 0.375)), ...swing]);
    const speeds = crossingSpeeds(trace, orb);
    expect(speeds.length, `tip never crossed the orb; trace ${JSON.stringify(trace)}`).toBeGreaterThan(0);
    expect(Math.max(...speeds)).toBeGreaterThanOrEqual(SLASH_MIN_SPEED);

    const cleared = (x: GameState) => x.cardId !== shown.cardId || x.message;
    const after = await g.until(cleared, `card ${shown.cardId} cleared by the slash`, 5000);
    expect(after.correct).toBe((shown.correct ?? 0) + 1);
    expect(after.charge).toBe((shown.charge ?? 0) + 1);
    expect(after.pips).toBe(shown.pips);
    expect(after.active.flatMap((e) => e.cards)).not.toContain(shown.cardId);
    expect(g.errors).toEqual([]);
  });

  it('a slow tip crossing through the correct orb picks nothing', async () => {
    const g = await openRun();
    const shown = await revealNext(g);
    const orb = (await g.orbPivot(shown.answer!))!;
    expect(orb, `pivot of the correct orb ${shown.answer}`).not.toBeNull();
    // 3 mm per frame through the collider: under 1.0 m/s unless a frame took < 3 ms.
    const slow: Vec3[] = [];
    for (let dy = 0.1; dy >= -0.1; dy -= 0.003) slow.push(add(orb, dy));
    const trace = await g.sweepTip([...(await approachAbove(g, orb, 0.1)), ...slow]);
    const speeds = crossingSpeeds(trace, orb);
    expect(speeds.length, `tip never crossed the orb; trace ${JSON.stringify(trace)}`).toBeGreaterThan(0);
    expect(Math.max(...speeds)).toBeLessThan(SLASH_MIN_SPEED);

    await g.frames(10);
    const after = await g.state();
    expect(after.cardId).toBe(shown.cardId);
    expect(after.targetId).toBe(shown.targetId);
    expect(after.correct).toBe(shown.correct);
    expect(after.orbs.map((o) => o.label).sort()).toEqual(shown.orbs.map((o) => o.label).sort());
    expect(after.message).toBe(false);
    expect(g.errors).toEqual([]);
  }, 120_000);
});
