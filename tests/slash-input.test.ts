// Requirement: the player slashes orbs and card-enemies with their hands (M1, M6: hands are the
// primary input) and optionally with controllers (SX), and both feed ONE classifier (slash.ts, same
// >= 1.0 m/s thresholds, spec S3). Each frame the hand index fingertips and each controller's tip
// (grip pose + CONTROLLER_TIP_OFFSET_M along the grip's forward -Z axis) become timestamped samples;
// a fast crossing through a target collider picks that target id (the caller maps it to correctOrb /
// wrongOrb / reveal), a slow crossing picks nothing. The four sources (left hand, right hand, left
// controller, right controller) keep separate sample buffers that never mix; a source missing from a
// frame (tracking lost) clears its buffer, so reappearing never makes a phantom segment across the
// gap. The slash cooldown (SLASH_COOLDOWN_S) is PER SOURCE, since slash.ts scopes it to one tracked
// path: one swing never picks twice, while the other hand can still slash. Samples taken while a
// source is cooling are dropped, so a crossing made during the cooldown never picks once it ends.
// Only a HIT starts it: classifying every frame, the fast approach before the orb reads as a miss,
// and letting that start the cooldown would swallow the crossing that follows. Trigger select on a
// target stays as the accessibility fallback and yields the same pick; a slash and a select on the
// same target in the same frame count once. A frame with no hands, no controllers and no select is a
// no-op. Pure: input state is never mutated. Units: metres, seconds.
import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_TIP_OFFSET_M,
  controllerTip,
  createSlashInput,
  stepSlashInput,
  type GripPose,
  type InputFrame,
  type SlashInputState,
} from '../src/flashcards/slash-input';
import { SLASH_COOLDOWN_S, SLASH_MIN_SPEED, type SlashTarget } from '../src/flashcards/slash';
import type { Vec3 } from '../src/flashcards/spawn';

const DT = 1 / 72;
const Y = 1.2;
const Z = -0.5;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

function orb(id: string, x: number, radius = 0.1): SlashTarget {
  return { id, pos: { x, y: Y, z: Z }, radius };
}

function at(x: number): Vec3 {
  return { x, y: Y, z: Z };
}

/** Grip pose whose tip (identity rotation) lands on the y=Y, z=Z line at the given x. */
function gripFor(x: number): GripPose {
  return { pos: { x, y: Y, z: Z + CONTROLLER_TIP_OFFSET_M }, quat: IDENTITY };
}

/** Runs frames in order, collecting every pick; returns the final state too. */
function run(
  frames: InputFrame[],
  targets: SlashTarget[],
  state: SlashInputState = createSlashInput(),
): { state: SlashInputState; picks: string[] } {
  const picks: string[] = [];
  let s = state;
  for (const f of frames) {
    const r = stepSlashInput(s, f, targets);
    picks.push(...r.picks);
    s = r.state;
  }
  return { state: s, picks };
}

/** Frames moving one point along +x from x0 to x1 at `speed` m/s, starting at t0. */
function sweep(
  x0: number,
  x1: number,
  speed: number,
  t0: number,
  toFrame: (x: number, t: number) => InputFrame,
): InputFrame[] {
  const n = Math.ceil(Math.abs(x1 - x0) / speed / DT);
  const dir = Math.sign(x1 - x0);
  const out: InputFrame[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + i * DT;
    out.push(toFrame(x0 + dir * speed * i * DT, t));
  }
  return out;
}

const rightHand = (x: number, t: number): InputFrame => ({ t, hands: { right: at(x) } });
const leftHand = (x: number, t: number): InputFrame => ({ t, hands: { left: at(x) } });
const rightCtrl = (x: number, t: number): InputFrame => ({ t, controllers: { right: gripFor(x) } });

// Covers: M1, M6, S3
describe('stepSlashInput hand fingertip source', () => {
  it('a fast right-fingertip crossing through an orb picks that orb exactly once', () => {
    const r = run(sweep(-0.4, 0.4, 1.5, 0, rightHand), [orb('a', 0)]);
    expect(r.picks).toEqual(['a']);
  });

  it('a fast left-fingertip crossing picks too', () => {
    const r = run(sweep(-0.4, 0.4, 1.5, 0, leftHand), [orb('a', 0)]);
    expect(r.picks).toEqual(['a']);
  });

  it('a slow crossing (below SLASH_MIN_SPEED) picks nothing', () => {
    const r = run(sweep(-0.4, 0.4, SLASH_MIN_SPEED * 0.5, 0, rightHand), [orb('a', 0)]);
    expect(r.picks).toEqual([]);
  });

  it('a fast swing that passes beside every target picks nothing', () => {
    const above: SlashTarget = { id: 'a', pos: { x: 0, y: Y + 0.5, z: Z }, radius: 0.1 };
    const r = run(sweep(-0.4, 0.4, 1.5, 0, rightHand), [above]);
    expect(r.picks).toEqual([]);
  });

  it('picks the target reached first along the swing', () => {
    const r = run(sweep(-0.4, 0.4, 1.5, 0, rightHand), [orb('far', 0.25), orb('near', -0.15)]);
    expect(r.picks).toEqual(['near']);
  });

  it('a held-still fingertip over a long idle stretch never picks', () => {
    const frames: InputFrame[] = [];
    for (let i = 0; i < 72 * 5; i++) frames.push(rightHand(0.001 * Math.sin(i), i * DT));
    expect(run(frames, [orb('a', 0)]).picks).toEqual([]);
  });
});

// Covers: M1, SX, S3
describe('controllerTip and the controller source', () => {
  it('CONTROLLER_TIP_OFFSET_M is a positive reach of at most 0.3 m', () => {
    expect(CONTROLLER_TIP_OFFSET_M).toBeGreaterThan(0);
    expect(CONTROLLER_TIP_OFFSET_M).toBeLessThanOrEqual(0.3);
  });

  it('identity grip: tip is the grip position pushed CONTROLLER_TIP_OFFSET_M along -Z', () => {
    const tip = controllerTip({ pos: { x: 1, y: 2, z: 3 }, quat: IDENTITY });
    expect(tip.x).toBeCloseTo(1, 9);
    expect(tip.y).toBeCloseTo(2, 9);
    expect(tip.z).toBeCloseTo(3 - CONTROLLER_TIP_OFFSET_M, 9);
  });

  it('a grip yawed +90 deg about Y points its tip along -X', () => {
    const s = Math.SQRT1_2;
    const tip = controllerTip({ pos: { x: 0, y: 1, z: 0 }, quat: { x: 0, y: s, z: 0, w: s } });
    expect(tip.x).toBeCloseTo(-CONTROLLER_TIP_OFFSET_M, 9);
    expect(tip.y).toBeCloseTo(1, 9);
    expect(tip.z).toBeCloseTo(0, 9);
  });

  it('a fast controller-tip swing through an orb picks it', () => {
    const r = run(sweep(-0.4, 0.4, 1.5, 0, rightCtrl), [orb('a', 0)]);
    expect(r.picks).toEqual(['a']);
  });

  it('the left controller picks too', () => {
    const leftCtrl = (x: number, t: number): InputFrame => ({ t, controllers: { left: gripFor(x) } });
    const r = run(sweep(-0.4, 0.4, 1.5, 0, leftCtrl), [orb('a', 0)]);
    expect(r.picks).toEqual(['a']);
  });

  it('uses the tip, not the grip: a grip passing the orb with its tip clear of it picks nothing', () => {
    // Grip itself on the orb line; the tip sits CONTROLLER_TIP_OFFSET_M forward of it.
    const r = run(
      sweep(-0.4, 0.4, 1.5, 0, (x, t) => ({ t, controllers: { right: { pos: at(x), quat: IDENTITY } } })),
      [orb('a', 0, CONTROLLER_TIP_OFFSET_M * 0.5)],
    );
    expect(r.picks).toEqual([]);
  });

  it('same classifier thresholds: a slow controller swing picks nothing', () => {
    const r = run(sweep(-0.4, 0.4, SLASH_MIN_SPEED * 0.5, 0, rightCtrl), [orb('a', 0)]);
    expect(r.picks).toEqual([]);
  });
});

// Covers: M1, M6, SX
describe('stepSlashInput per-source buffers and tracking loss', () => {
  it('left and right fingertips are never joined into one path', () => {
    // Each hand holds still on its own side; mixing them would yield fast segments through x=0.
    const frames: InputFrame[] = [];
    for (let i = 0; i < 40; i++) frames.push({ t: i * DT, hands: { left: at(-0.4), right: at(0.4) } });
    expect(run(frames, [orb('a', 0)]).picks).toEqual([]);
  });

  it('a hand and the controller on the same side are never joined into one path', () => {
    const frames: InputFrame[] = [];
    for (let i = 0; i < 40; i++) {
      frames.push({ t: i * DT, hands: { right: at(-0.4) }, controllers: { right: gripFor(0.4) } });
    }
    expect(run(frames, [orb('a', 0)]).picks).toEqual([]);
  });

  it('left and right controllers are never joined into one path', () => {
    const frames: InputFrame[] = [];
    for (let i = 0; i < 40; i++) {
      frames.push({ t: i * DT, controllers: { left: gripFor(-0.4), right: gripFor(0.4) } });
    }
    expect(run(frames, [orb('a', 0)]).picks).toEqual([]);
  });

  it('a hand slash still picks while the other hand and both controllers are tracked', () => {
    const frames = sweep(-0.4, 0.4, 1.5, 0, (x, t) => ({
      t,
      hands: { right: at(x), left: at(-0.9) },
      controllers: { left: gripFor(-0.9), right: gripFor(0.9) },
    }));
    expect(run(frames, [orb('a', 0)]).picks).toEqual(['a']);
  });

  it('tracking lost for one frame clears the buffer: no phantom segment across the gap', () => {
    // Gap of 2 frames (< SLASH_MAX_SAMPLE_GAP_S), so only clearing the buffer prevents the jump.
    const frames: InputFrame[] = [
      rightHand(-0.4, 0),
      rightHand(-0.4, DT),
      { t: 2 * DT, hands: {} },
      rightHand(0.4, 3 * DT),
      rightHand(0.4, 4 * DT),
    ];
    expect(run(frames, [orb('a', 0)]).picks).toEqual([]);
  });

  it('a null pose counts as tracking lost the same as a missing one', () => {
    const frames: InputFrame[] = [
      rightHand(-0.4, 0),
      rightHand(-0.4, DT),
      { t: 2 * DT, hands: { right: null } },
      rightHand(0.4, 3 * DT),
    ];
    expect(run(frames, [orb('a', 0)]).picks).toEqual([]);
  });

  it('a controller that drops out for one frame does not jump either', () => {
    const frames: InputFrame[] = [
      rightCtrl(-0.4, 0),
      rightCtrl(-0.4, DT),
      { t: 2 * DT, controllers: { right: null } },
      rightCtrl(0.4, 3 * DT),
    ];
    expect(run(frames, [orb('a', 0)]).picks).toEqual([]);
  });

  it('only the lost source is cleared: the other hand mid-swing still picks', () => {
    const frames = sweep(-0.4, 0.4, 1.5, 0, (x, t) => ({
      t,
      // The left hand flickers in and out; the right hand's swing is untouched.
      hands: Math.round(t / DT) % 2 === 0 ? { right: at(x), left: at(-0.9) } : { right: at(x) },
    }));
    expect(run(frames, [orb('a', 0)]).picks).toEqual(['a']);
  });

  it('after reappearing, a fresh fast swing picks normally', () => {
    const lost = run([rightHand(-0.4, 0), { t: DT }], [orb('a', 0)]);
    const r = run(sweep(-0.4, 0.4, 1.5, 0.5, rightHand), [orb('a', 0)], lost.state);
    expect(r.picks).toEqual(['a']);
  });
});

// Covers: M1, S3
describe('stepSlashInput cooldown is per source and starts on a hit', () => {
  it('one long swing through two orbs picks only the first', () => {
    // 'a' entered at t ~0.13; 'b' (0.15..0.35) is fully crossed before that hand's cooldown ends.
    const r = run(sweep(-0.4, 0.45, 1.5, 0, rightHand), [orb('a', -0.1), orb('b', 0.25)]);
    expect(r.picks).toEqual(['a']);
  });

  it('the same hand swinging back inside SLASH_COOLDOWN_S picks nothing', () => {
    const fwd = sweep(-0.4, 0.0, 1.5, 0, rightHand);
    const first = run(fwd, [orb('a', 0)]);
    expect(first.picks).toEqual(['a']);
    // 'a' is entered at x = -0.1, t = 0.2; the fast back-swing through 'b' ends before 0.2 + cooldown.
    const back = sweep(0.0, -0.3, 3, fwd[fwd.length - 1].t + DT, rightHand);
    expect(back[back.length - 1].t).toBeLessThan(0.2 + SLASH_COOLDOWN_S);
    expect(run(back, [orb('b', -0.2)], first.state).picks).toEqual([]);
  });

  it('a long fast approach that misses first does not block the crossing that follows', () => {
    // 0.4 s of fast travel (well past SLASH_WINDOW_S) before the fingertip reaches the orb.
    const r = run(sweep(-0.8, 0.4, 1.5, 0, rightHand), [orb('a', 0, 0.05)]);
    expect(r.picks).toEqual(['a']);
  });

  it('the other hand is not blocked by one hand cooldown', () => {
    // Left fingertip lags the right by 0.15 m (0.1 s) on a line 0.5 m higher, through its own orb.
    const frames = sweep(-0.4, 0.4, 1.5, 0, (x, t) => ({
      t,
      hands: { right: at(x), left: { x: x - 0.15, y: Y + 0.5, z: Z } },
    }));
    const b: SlashTarget = { id: 'b', pos: { x: 0, y: Y + 0.5, z: Z }, radius: 0.1 };
    expect(run(frames, [orb('a', 0), b]).picks).toEqual(['a', 'b']);
  });

  it('after the cooldown elapses the same hand picks again', () => {
    const first = run(sweep(-0.4, 0.4, 1.5, 0, rightHand), [orb('a', 0)]);
    const again = run(sweep(-0.4, 0.4, 1.5, 2, rightHand), [orb('b', 0)], first.state);
    expect(again.picks).toEqual(['b']);
  });
});

// Covers: M1, M10
describe('stepSlashInput trigger-select fallback', () => {
  it('a select on a target yields that pick with no hands or controllers', () => {
    const r = stepSlashInput(createSlashInput(), { t: 0, select: 'a' }, [orb('a', 0)]);
    expect(r.picks).toEqual(['a']);
  });

  it('a select picks the same id as a slash on that target', () => {
    const slash = run(sweep(-0.4, 0.4, 1.5, 0, rightHand), [orb('a', 0)]);
    const select = stepSlashInput(createSlashInput(), { t: 0, select: 'a' }, [orb('a', 0)]);
    expect(select.picks).toEqual(slash.picks);
  });

  it('a slash and a select on the same target in the same frame count once', () => {
    const frames = sweep(-0.4, 0.4, 1.5, 0, rightHand);
    // Find the frame on which the slash lands, then replay it with a select on the same target.
    let s = createSlashInput();
    let hitIdx = -1;
    for (let i = 0; i < frames.length; i++) {
      const r = stepSlashInput(s, frames[i], [orb('a', 0)]);
      if (r.picks.length > 0) {
        hitIdx = i;
        break;
      }
      s = r.state;
    }
    expect(hitIdx).toBeGreaterThanOrEqual(0);
    const both = stepSlashInput(s, { ...frames[hitIdx], select: 'a' }, [orb('a', 0)]);
    expect(both.picks).toEqual(['a']);
  });

  it('two hands slashing the same target in the same frame count once', () => {
    const frames = sweep(-0.4, 0.4, 1.5, 0, (x, t) => ({ t, hands: { right: at(x), left: at(x) } }));
    expect(run(frames, [orb('a', 0)]).picks).toEqual(['a']);
  });

  it('a null select is no pick', () => {
    const r = stepSlashInput(createSlashInput(), { t: 0, select: null }, [orb('a', 0)]);
    expect(r.picks).toEqual([]);
  });
});

// Covers: M1, M6
describe('stepSlashInput no input and purity', () => {
  it('no hands, no controllers, no select: no pick and an unchanged empty state', () => {
    const fresh = createSlashInput();
    const r = stepSlashInput(fresh, { t: 1 }, [orb('a', 0)]);
    expect(r.picks).toEqual([]);
    expect(r.state).toEqual(createSlashInput());
  });

  it('empty hand and controller maps behave the same as missing ones', () => {
    const r = stepSlashInput(createSlashInput(), { t: 1, hands: {}, controllers: {} }, [orb('a', 0)]);
    expect(r.picks).toEqual([]);
    expect(r.state).toEqual(createSlashInput());
  });

  it('an all-absent frame after a swing start picks nothing and leaves no path behind', () => {
    const started = run([rightHand(-0.4, 0), rightHand(-0.38, DT)], [orb('a', 0)]);
    const lost = stepSlashInput(started.state, { t: 2 * DT }, [orb('a', 0)]);
    expect(lost.picks).toEqual([]);
    expect(stepSlashInput(lost.state, rightHand(0.4, 3 * DT), [orb('a', 0)]).picks).toEqual([]);
  });

  it('no targets: a fast swing picks nothing', () => {
    expect(run(sweep(-0.4, 0.4, 1.5, 0, rightHand), []).picks).toEqual([]);
  });

  it('never mutates the input state', () => {
    const first = sweep(-0.4, -0.2, 1.5, 0, rightHand);
    const mid = run(first, [orb('a', 0)]).state;
    const before = JSON.stringify(mid);
    const frames = sweep(-0.2, 0.4, 1.5, first[first.length - 1].t + DT, rightHand);
    run(frames, [orb('a', 0)], mid);
    expect(JSON.stringify(mid)).toBe(before);
  });
});
