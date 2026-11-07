// Per-frame slash input (M1, M6, SX): turns hand fingertips and controller tips into per-source
// sample buffers and feeds each one to the shared slash.ts classifier. Pure: returns a new state.
// Units: metres, seconds.
import {
  classifySlash,
  SLASH_COOLDOWN_S,
  SLASH_MAX_SAMPLE_GAP_S,
  SLASH_WINDOW_S,
  type SlashSample,
  type SlashTarget,
} from './slash';
import type { Vec3 } from './spawn';

/** Reach from the grip origin to the slashing tip, along the grip's forward (-Z) axis. */
export const CONTROLLER_TIP_OFFSET_M = 0.12;

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface GripPose {
  pos: Vec3;
  quat: Quat;
}

interface Sides<T> {
  left?: T | null;
  right?: T | null;
}

export interface InputFrame {
  t: number;
  /** Index fingertip positions; missing or null = not tracked this frame. */
  hands?: Sides<Vec3>;
  controllers?: Sides<GripPose>;
  /** Target id chosen by trigger select (accessibility fallback). */
  select?: string | null;
}

const SOURCES = ['leftHand', 'rightHand', 'leftController', 'rightController'] as const;
type Source = (typeof SOURCES)[number];

interface SourceState {
  samples: SlashSample[];
  lastSlashAt: number | null;
}

export type SlashInputState = Record<Source, SourceState>;

export interface SlashInputStep {
  state: SlashInputState;
  picks: string[];
}

export function createSlashInput(): SlashInputState {
  return {
    leftHand: { samples: [], lastSlashAt: null },
    rightHand: { samples: [], lastSlashAt: null },
    leftController: { samples: [], lastSlashAt: null },
    rightController: { samples: [], lastSlashAt: null },
  };
}

/** Grip position pushed CONTROLLER_TIP_OFFSET_M along the grip's rotated -Z axis. */
export function controllerTip(grip: GripPose): Vec3 {
  const { x, y, z, w } = grip.quat;
  const vz = -CONTROLLER_TIP_OFFSET_M;
  // v' = v + w*t + q x t, with t = 2 (q x v); v = (0, 0, vz).
  const tx = 2 * y * vz;
  const ty = -2 * x * vz;
  return {
    x: grip.pos.x + w * tx - z * ty,
    y: grip.pos.y + w * ty + z * tx,
    z: grip.pos.z + vz + x * ty - y * tx,
  };
}

function framePositions(f: InputFrame): Record<Source, Vec3 | null> {
  const lc = f.controllers?.left;
  const rc = f.controllers?.right;
  return {
    leftHand: f.hands?.left ?? null,
    rightHand: f.hands?.right ?? null,
    leftController: lc ? controllerTip(lc) : null,
    rightController: rc ? controllerTip(rc) : null,
  };
}

// Samples older than the classifier can ever look at are dropped so buffers stay bounded.
const KEEP_S = SLASH_WINDOW_S + SLASH_MAX_SAMPLE_GAP_S;

export function stepSlashInput(
  state: SlashInputState,
  frame: InputFrame,
  targets: SlashTarget[],
): SlashInputStep {
  const picks: string[] = [];
  if (frame.select) picks.push(frame.select);
  const positions = framePositions(frame);
  const next = {} as SlashInputState;
  for (const src of SOURCES) {
    const prev = state[src];
    const pos = positions[src];
    // Tracking lost: drop the path so reappearing never joins across the gap.
    if (!pos) {
      next[src] = { samples: [], lastSlashAt: prev.lastSlashAt };
      continue;
    }
    const last = prev.lastSlashAt;
    // Samples taken during this source's cooldown are dropped, so a crossing made while
    // cooling never picks once the cooldown ends.
    const cooling = (t: number) => last !== null && t - last < SLASH_COOLDOWN_S;
    const samples = [...prev.samples, { pos, t: frame.t }].filter(
      (s) => s.t >= frame.t - KEEP_S && !cooling(s.t),
    );
    const r = classifySlash(samples, targets);
    if (r.kind === 'hit') {
      next[src] = { samples, lastSlashAt: frame.t };
      if (!picks.includes(r.targetId)) picks.push(r.targetId);
    } else {
      next[src] = { samples, lastSlashAt: last };
    }
  }
  return { state: next, picks };
}
