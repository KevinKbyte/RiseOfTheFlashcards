// Requirement: the ultimate fires from any one of three inputs (plan D7, S7 amended 2026-11-07 by Kev,
// ledgers-2 H-2): a two-palm push (both palms face forward and both move forward >= X cm in < 0.3 s),
// a controller grip squeeze (the press edge, not a held grip), or selecting the glowing ultimate
// orb with any input. The orb is shown, dim, whenever the run is active (an uncharged orb select is
// a no-op, ledgers-2 H-2 S7 CRITERIA "uncharged orb select -> 0", so it must be selectable below
// full charge) and glows (ready-glow, decisions-2 D17) only at charge >= ULTIMATE_CHARGE (5); the
// glow, not the orb, is cleared on firing; no run or an ended run hides it. A fire request only spends charge
// when there is a strike-slot enemy to knock back (wave.targetId not null); with none it spends
// nothing and emits nothing. Several inputs in the same frame fire once. An ended run or charge < 5
// is a no-op.
//
// Contract for src/flashcards/ultimate-input.ts (pure, no DOM/IWSDK, never mutates input):
//   export const PALM_PUSH_WINDOW_S = 0.3;          // D7 "< 0.3 s"
//   export const PALM_PUSH_MIN_DISTANCE: number;   // X metres (tuned in S7), > 0 and < 0.5
//   export interface PalmSample { pos: Vec3; normal: Vec3; t: number }  // normal = out of the palm
//   export function classifyPalmPush(left: PalmSample[], right: PalmSample[], forward: Vec3): boolean;
//     true iff, in the window ending at each hand's newest sample (newest samples within the window
//     of each other), BOTH hands moved >= PALM_PUSH_MIN_DISTANCE along `forward` (not lateral) and
//     both palms face forward. Empty/short/non-finite input -> false.
//   export interface GripState { left: boolean; right: boolean }
//   export function gripSqueezed(prev: GripState, curr: GripState): boolean;  // any false->true edge
//   export function ultimateOrb(run: RunState | null): { visible: boolean; glowing: boolean };
//   export type UltimateRequest = 'palm-push' | 'grip' | 'orb';
//   export function resolveUltimate(session: GameSession, wave: Wave,
//       requests: readonly UltimateRequest[], opts?: { spawnDistance?: number })
//     : { session: GameSession; wave: Wave; effects: readonly SessionEffect[] };
//     >= 1 request, target present, game-session fireUltimate fires -> fired session,
//     ultimateKnockback(wave, opts), effects [{ type: 'ultimate' }]; otherwise the same session and
//     wave objects and no effects.
// Covers tags cite plan IDs (docs/plans/2026-10-28-vr-flashcard-game.md D7, S7; ledgers-2 H-2;
// decisions-2 D17).
import { describe, expect, it } from 'vitest';
import {
  correctOrb,
  createSession,
  presented,
  startRun,
  updateMenu,
  wrongOrb,
  type GameSession,
  type SessionEffect,
} from '../src/flashcards/game-session.js';
import type { Deck } from '../src/flashcards/deck-schema.js';
import { openDeckSelect, selectDeck } from '../src/flashcards/menu-flow.js';
import { recordCorrect, startRun as startRunState, ULTIMATE_CHARGE, type RunState } from '../src/flashcards/run-state.js';
import type { SaveStorage } from '../src/flashcards/save.js';
import type { Vec3 } from '../src/flashcards/spawn.js';
import { createWave, revealEnemy, tickWave, ultimateKnockback, type Wave } from '../src/flashcards/wave.js';

interface PalmSample {
  pos: Vec3;
  normal: Vec3;
  t: number;
}
interface GripState {
  left: boolean;
  right: boolean;
}
type UltimateRequest = 'palm-push' | 'grip' | 'orb';
interface UltimateFrame {
  session: GameSession;
  wave: Wave;
  effects: readonly SessionEffect[];
}

// Dynamic import so each test reports the missing module/export instead of one load error.
const ultimateInput: unknown = await import('../src/flashcards/ultimate-input.js').catch(() => ({}));

function exported<T>(name: string): T {
  const v = (ultimateInput as unknown as Record<string, unknown>)[name];
  if (v === undefined) throw new Error(`ultimate-input does not export ${name}`);
  return v as T;
}
const classifyPalmPush = (l: PalmSample[], r: PalmSample[], f: Vec3) =>
  exported<(l: PalmSample[], r: PalmSample[], f: Vec3) => boolean>('classifyPalmPush')(l, r, f);
const gripSqueezed = (p: GripState, c: GripState) => exported<(p: GripState, c: GripState) => boolean>('gripSqueezed')(p, c);
const ultimateOrb = (run: RunState | null) =>
  exported<(run: RunState | null) => { visible: boolean; glowing: boolean }>('ultimateOrb')(run);
const resolveUltimate = (s: GameSession, w: Wave, req: readonly UltimateRequest[], opts?: { spawnDistance?: number }) =>
  exported<(s: GameSession, w: Wave, req: readonly UltimateRequest[], opts?: { spawnDistance?: number }) => UltimateFrame>(
    'resolveUltimate',
  )(s, w, req, opts);

// Play-forward = -z (WebXR convention); a palm facing forward has its normal along it.
const FWD: Vec3 = { x: 0, y: 0, z: -1 };
const UP: Vec3 = { x: 0, y: 1, z: 0 };
const BACK: Vec3 = { x: 0, y: 0, z: 1 };

/** Straight-line hand path from `start`, moving `delta` over `duration` s, 11 samples ending at `t1`. */
function path(start: Vec3, delta: Vec3, duration: number, t1: number, normal: Vec3 = FWD): PalmSample[] {
  const n = 10;
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = i / n;
    return {
      pos: { x: start.x + delta.x * f, y: start.y + delta.y * f, z: start.z + delta.z * f },
      normal,
      t: t1 - duration + duration * f,
    };
  });
}
const L0: Vec3 = { x: -0.2, y: 1.2, z: -0.3 };
const R0: Vec3 = { x: 0.2, y: 1.2, z: -0.3 };
function forwardBy(d: number): Vec3 {
  return { x: 0, y: 0, z: -d };
}

// Covers: D7, S7, H-2
describe('ultimate-input: two-palm push classifier', () => {
  it('exports the 0.3 s window and a sane push distance', () => {
    expect(exported<number>('PALM_PUSH_WINDOW_S')).toBe(0.3);
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE');
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.5);
  });

  it('both palms facing forward, both moving forward far enough within 0.2 s -> push', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 1.5;
    expect(classifyPalmPush(path(L0, forwardBy(d), 0.2, 5), path(R0, forwardBy(d), 0.2, 5), FWD)).toBe(true);
  });

  it('one hand pushing while the other stays still -> no push', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 1.5;
    expect(classifyPalmPush(path(L0, forwardBy(d), 0.2, 5), path(R0, forwardBy(0), 0.2, 5), FWD)).toBe(false);
    expect(classifyPalmPush(path(L0, forwardBy(0), 0.2, 5), path(R0, forwardBy(d), 0.2, 5), FWD)).toBe(false);
  });

  it('one hand with no samples at all (untracked) -> no push', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 1.5;
    expect(classifyPalmPush(path(L0, forwardBy(d), 0.2, 5), [], FWD)).toBe(false);
    expect(classifyPalmPush([], path(R0, forwardBy(d), 0.2, 5), FWD)).toBe(false);
  });

  it('too slow: the same distance spread over 1 s moves too little inside the 0.3 s window -> no push', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 1.5;
    expect(classifyPalmPush(path(L0, forwardBy(d), 1.0, 5), path(R0, forwardBy(d), 1.0, 5), FWD)).toBe(false);
  });

  it('too short: forward travel below the push distance -> no push', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 0.5;
    expect(classifyPalmPush(path(L0, forwardBy(d), 0.2, 5), path(R0, forwardBy(d), 0.2, 5), FWD)).toBe(false);
  });

  it('palms not facing forward (facing up or back) -> no push, even with a fast forward move', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 1.5;
    for (const normal of [UP, BACK]) {
      expect(classifyPalmPush(path(L0, forwardBy(d), 0.2, 5, normal), path(R0, forwardBy(d), 0.2, 5, normal), FWD)).toBe(false);
    }
    // One palm facing forward is not enough.
    expect(classifyPalmPush(path(L0, forwardBy(d), 0.2, 5), path(R0, forwardBy(d), 0.2, 5, UP), FWD)).toBe(false);
  });

  it('a fast lateral sweep with palms forward is not a push: only travel along play-forward counts', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 3;
    const side: Vec3 = { x: d, y: 0, z: 0 };
    expect(classifyPalmPush(path(L0, side, 0.2, 5), path(R0, side, 0.2, 5), FWD)).toBe(false);
  });

  it('moving backward (pulling hands in) is not a push', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 1.5;
    expect(classifyPalmPush(path(L0, forwardBy(-d), 0.2, 5), path(R0, forwardBy(-d), 0.2, 5), FWD)).toBe(false);
  });

  it('hands pushing at different times (1 s apart) do not combine into a push', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 1.5;
    expect(classifyPalmPush(path(L0, forwardBy(d), 0.2, 4), path(R0, forwardBy(d), 0.2, 5), FWD)).toBe(false);
  });

  it('respects the forward argument: a push along +x counts when forward is +x', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 1.5;
    const px: Vec3 = { x: 1, y: 0, z: 0 };
    const along: Vec3 = { x: d, y: 0, z: 0 };
    expect(classifyPalmPush(path(L0, along, 0.2, 5, px), path(R0, along, 0.2, 5, px), px)).toBe(true);
    expect(classifyPalmPush(path(L0, along, 0.2, 5, px), path(R0, along, 0.2, 5, px), FWD)).toBe(false);
  });

  it('single samples or non-finite data never push', () => {
    const d = exported<number>('PALM_PUSH_MIN_DISTANCE') * 1.5;
    const good = path(R0, forwardBy(d), 0.2, 5);
    expect(classifyPalmPush(good.slice(-1), good.slice(-1), FWD)).toBe(false);
    const bad = path(L0, forwardBy(d), 0.2, 5).map((s, i) => (i === 10 ? { ...s, pos: { ...s.pos, z: NaN } } : s));
    expect(classifyPalmPush(bad, good, FWD)).toBe(false);
  });
});

// Covers: S7, H-2
describe('ultimate-input: controller grip squeeze edge', () => {
  const OFF: GripState = { left: false, right: false };
  it('a grip press on either controller (false -> true) is a fire request', () => {
    expect(gripSqueezed(OFF, { left: true, right: false })).toBe(true);
    expect(gripSqueezed(OFF, { left: false, right: true })).toBe(true);
    expect(gripSqueezed(OFF, { left: true, right: true })).toBe(true);
  });

  it('a held grip does not repeat the request', () => {
    const held: GripState = { left: true, right: false };
    expect(gripSqueezed(held, held)).toBe(false);
    expect(gripSqueezed({ left: true, right: true }, { left: true, right: true })).toBe(false);
  });

  it('releasing or staying open is not a request', () => {
    expect(gripSqueezed({ left: true, right: true }, OFF)).toBe(false);
    expect(gripSqueezed(OFF, OFF)).toBe(false);
  });

  it('the other hand pressing while one is held is a new edge', () => {
    expect(gripSqueezed({ left: true, right: false }, { left: true, right: true })).toBe(true);
  });
});

function charged(n: number): RunState {
  const ids = Array.from({ length: 8 }, (_, i) => `c${i}`);
  let s = startRunState({ cardIds: ids });
  for (let i = 0; i < n; i++) s = recordCorrect(s, ids[i]);
  return s;
}

// Covers: S7, H-2, D17
describe('ultimate-input: ultimate orb ready-glow', () => {
  it('visible but dim (not glowing) while charging below full charge in an active run', () => {
    for (let n = 0; n < ULTIMATE_CHARGE; n++) {
      expect(ultimateOrb(charged(n))).toEqual({ visible: true, glowing: false });
    }
  });

  it('visible and glowing at exactly ULTIMATE_CHARGE and above', () => {
    expect(ultimateOrb(charged(ULTIMATE_CHARGE))).toEqual({ visible: true, glowing: true });
    expect(ultimateOrb(charged(ULTIMATE_CHARGE + 1))).toEqual({ visible: true, glowing: true });
  });

  it('hidden with no run, and once the run has ended even with charge left', () => {
    expect(ultimateOrb(null)).toEqual({ visible: false, glowing: false });
    const ended: RunState = { ...charged(ULTIMATE_CHARGE), status: 'won' };
    expect(ultimateOrb(ended)).toEqual({ visible: false, glowing: false });
  });

  it('glow cleared, orb still shown dim, once firing resets charge to 0', () => {
    expect(ultimateOrb({ ...charged(ULTIMATE_CHARGE), charge: 0 })).toEqual({ visible: true, glowing: false });
  });
});

// ---- Session-level gate ----
const NOW = new Date(2026, 10, 7, 10, 0, 0);
const BIG: Deck = {
  id: 'big',
  title: 'Big Deck',
  cards: Array.from({ length: 14 }, (_, i) => ({
    id: `big-${i + 1}`,
    prompt: `Question number ${i + 1}?`,
    answer: `answer ${String.fromCharCode(97 + i)}`,
  })),
};

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.has(k) ? (data.get(k) as string) : null), setItem: (k, v) => void data.set(k, v) };
}

function sessionWithCorrect(n: number): { session: GameSession; ids: string[] } {
  let s = createSession({ decks: [BIG], storage: memoryStorage(), clock: () => NOW });
  s = updateMenu(updateMenu(s, openDeckSelect), (m) => selectDeck(m, BIG.id));
  const step = startRun(s);
  const spawn = step.effects.find((e) => e.type === 'spawnWave') as { cards: readonly { id: string }[] };
  const ids = spawn.cards.map((c) => c.id);
  let out = step.session;
  for (let i = 0; i < n; i++) {
    out = presented(out, ids[i], `e${i}`).session;
    out = correctOrb(out, ids[i]).session;
  }
  return { session: out, ids };
}

const chargeOf = (s: GameSession) => s.run?.run.charge;
/** Wave over the unanswered cards with the first revealed as the strike-slot target. */
function targeted(ids: string[]): Wave {
  const rest = ids.slice(5);
  const w = revealEnemy(tickWave(createWave(rest), 100), rest[0]);
  if (w.targetId === null) throw new Error('setup: no target');
  return w;
}
function untargeted(ids: string[]): Wave {
  const w = tickWave(createWave(ids.slice(5)), 1);
  if (w.active.length === 0) throw new Error('setup: no active enemy');
  if (w.targetId !== null) throw new Error('setup: unexpected target');
  return w;
}

// Covers: D7, S7, H-2
describe('ultimate-input: resolveUltimate fire gate', () => {
  for (const req of ['palm-push', 'grip', 'orb'] as const) {
    it(`charged with a strike-slot target: a ${req} request spends charge, knocks back, emits one ultimate`, () => {
      const { session, ids } = sessionWithCorrect(5);
      const wave = targeted(ids);
      const r = resolveUltimate(session, wave, [req]);
      expect(chargeOf(r.session)).toBe(0);
      expect(r.effects).toEqual([{ type: 'ultimate' }]);
      expect(r.wave).toEqual(ultimateKnockback(wave));
      expect(r.wave).not.toBe(wave);
    });
  }

  it('passes the wall spawn distance through to the knockback', () => {
    const { session, ids } = sessionWithCorrect(5);
    const wave = targeted(ids);
    const r = resolveUltimate(session, wave, ['grip'], { spawnDistance: 3.2 });
    expect(r.wave).toEqual(ultimateKnockback(wave, { spawnDistance: 3.2 }));
  });

  it('no strike-slot enemy: spends no charge, leaves the wave alone, emits nothing', () => {
    const { session, ids } = sessionWithCorrect(5);
    const wave = untargeted(ids);
    for (const req of ['palm-push', 'grip', 'orb'] as const) {
      const r = resolveUltimate(session, wave, [req]);
      expect(r.session).toBe(session);
      expect(r.wave).toBe(wave);
      expect(r.effects).toEqual([]);
      expect(chargeOf(r.session)).toBe(5);
    }
  });

  it('several inputs in the same frame fire exactly once', () => {
    const { session, ids } = sessionWithCorrect(5);
    const wave = targeted(ids);
    const r = resolveUltimate(session, wave, ['palm-push', 'grip', 'orb', 'grip']);
    expect(r.effects).toEqual([{ type: 'ultimate' }]);
    expect(chargeOf(r.session)).toBe(0);
    expect(r.wave).toEqual(ultimateKnockback(wave));
  });

  it('no requests this frame: nothing happens', () => {
    const { session, ids } = sessionWithCorrect(5);
    const wave = targeted(ids);
    const r = resolveUltimate(session, wave, []);
    expect(r.session).toBe(session);
    expect(r.wave).toBe(wave);
    expect(r.effects).toEqual([]);
  });

  it('charge below 5: a request is a no-op and the target is not knocked back', () => {
    const { session, ids } = sessionWithCorrect(4);
    const wave = targeted(ids);
    const r = resolveUltimate(session, wave, ['palm-push', 'grip', 'orb']);
    expect(r.session).toBe(session);
    expect(r.wave).toBe(wave);
    expect(r.effects).toEqual([]);
    expect(chargeOf(r.session)).toBe(4);
  });

  it('ended run: a request is a no-op even when charged with a target', () => {
    const { session: s0, ids } = sessionWithCorrect(5);
    let s = s0;
    for (let i = 5; i < 10; i++) {
      s = presented(s, ids[i], `e${i}`).session;
      s = wrongOrb(s, ids[i], BIG.cards.find((c) => c.id !== ids[i])!.answer).session;
    }
    expect(s.run?.run.status).toBe('lost');
    const wave = targeted(ids);
    const r = resolveUltimate(s, wave, ['orb']);
    expect(r.session).toBe(s);
    expect(r.wave).toBe(wave);
    expect(r.effects).toEqual([]);
  });

  it('a second frame right after firing is a no-op (charge spent)', () => {
    const { session, ids } = sessionWithCorrect(5);
    const first = resolveUltimate(session, targeted(ids), ['grip']);
    const second = resolveUltimate(first.session, first.wave, ['grip']);
    expect(second.session).toBe(first.session);
    expect(second.wave).toBe(first.wave);
    expect(second.effects).toEqual([]);
  });
});
