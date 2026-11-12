// Requirement: the finishing-slash rumble goes to the controller that swung, so each frame's slash
// step reports, for every target picked by a CONTROLLER swing, which hand's controller picked it
// (`controllerHands[targetId]` = 'left' | 'right'). Hand-tracking picks and trigger-select picks have
// no controller swing and are absent from it (a hand has no haptic actuator). A frame with no picks
// reports an empty record. Pure, same as the rest of stepSlashInput.
//
// Seam change (src/flashcards/slash-input.ts):
//   SlashInputStep gains  controllerHands: Partial<Record<string, 'left' | 'right'>>
// card-slash.ts then carries it on SlashHit as `handedness`.
import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_TIP_OFFSET_M,
  createSlashInput,
  stepSlashInput,
  type GripPose,
  type InputFrame,
  type SlashInputState,
} from '../src/flashcards/slash-input';
import type { SlashTarget } from '../src/flashcards/slash';

const DT = 1 / 72;
const Y = 1.2;
const Z = -0.5;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

type Hands = Partial<Record<string, 'left' | 'right'>>;

function orb(id: string, x: number): SlashTarget {
  return { id, pos: { x, y: Y, z: Z }, radius: 0.1 };
}

function gripFor(x: number): GripPose {
  return { pos: { x, y: Y, z: Z + CONTROLLER_TIP_OFFSET_M }, quat: IDENTITY };
}

/** Frames sweeping one point along +x from -0.4 to 0.4 at 1.5 m/s. */
function sweep(toFrame: (x: number, t: number) => InputFrame): InputFrame[] {
  const out: InputFrame[] = [];
  const n = Math.ceil(0.8 / 1.5 / DT);
  for (let i = 0; i <= n; i++) out.push(toFrame(-0.4 + 1.5 * i * DT, i * DT));
  return out;
}

/** Runs frames, returning every pick with the controllerHands record of the frame that made it. */
function run(frames: InputFrame[], targets: SlashTarget[]): { picks: string[]; hands: Hands; empty: boolean } {
  let s: SlashInputState = createSlashInput();
  const picks: string[] = [];
  const hands: Hands = {};
  let empty = true;
  for (const f of frames) {
    const r = stepSlashInput(s, f, targets) as ReturnType<typeof stepSlashInput> & { controllerHands?: Hands };
    if (r.controllerHands === undefined) throw new Error('stepSlashInput does not report controllerHands');
    if (r.picks.length === 0) expect(r.controllerHands).toEqual({});
    else empty = false;
    picks.push(...r.picks);
    Object.assign(hands, r.controllerHands);
    s = r.state;
  }
  return { picks, hands, empty };
}

// Covers: CARDS-012, SX
describe('stepSlashInput reports which controller picked each target', () => {
  it('a right-controller swing reports right for the picked target', () => {
    const r = run(sweep((x, t) => ({ t, controllers: { right: gripFor(x) } })), [orb('a', 0)]);
    expect(r.picks).toEqual(['a']);
    expect(r.hands).toEqual({ a: 'right' });
  });

  it('a left-controller swing reports left for the picked target', () => {
    const r = run(sweep((x, t) => ({ t, controllers: { left: gripFor(x) } })), [orb('a', 0)]);
    expect(r.picks).toEqual(['a']);
    expect(r.hands).toEqual({ a: 'left' });
  });

  it('a hand-tracking fingertip pick has no controller hand', () => {
    const r = run(sweep((x, t) => ({ t, hands: { right: { x, y: Y, z: Z } } })), [orb('a', 0)]);
    expect(r.picks).toEqual(['a']);
    expect(r.hands).toEqual({});
  });

  it('a trigger-select pick has no controller hand', () => {
    const r = run([{ t: 0, select: 'a' }], [orb('a', 0)]);
    expect(r.picks).toEqual(['a']);
    expect(r.hands).toEqual({});
  });

  it('a frame with no picks reports an empty record', () => {
    const r = run([{ t: 0 }, { t: DT, controllers: { right: gripFor(0.4) } }], [orb('a', 0)]);
    expect(r.empty).toBe(true);
    expect(r.hands).toEqual({});
  });
});
