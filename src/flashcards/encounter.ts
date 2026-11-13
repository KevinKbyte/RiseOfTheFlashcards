// Pure encounter loop for one flashcard enemy: no DOM/IWSDK imports so it runs under vitest's node
// environment. Time advances only through explicit tick(dt) calls; every function returns a new
// state (or the same object when the action does not apply) and never mutates its input.

import { PANEL_LAYOUT } from './panel-layout.js';

export type EncounterPhase = 'advancing' | 'slashable' | 'answering' | 'telegraph' | 'stunned';

export interface EncounterConfig {
  spawnDistance: number;
  reachDistance: number;
  strikeDistance: number;
  knockbackDistance: number;
  /** m/s while walking in. */
  advanceSpeed: number;
  /** Knockback-to-strike creep time; >= 6 s no-speech cap + 2 s grading timeout. */
  creepSeconds: number;
  telegraphSeconds: number;
}

export interface Encounter {
  readonly phase: EncounterPhase;
  /** Enemy distance from the player, metres. */
  readonly distance: number;
  readonly hits: number;
  readonly telegraphLeft: number;
  readonly cfg: Readonly<EncounterConfig>;
  /** Stunned only: distance at the stun and dt accumulated since, so the lunge is frame-size independent. */
  readonly stunFrom?: number;
  readonly stunElapsed?: number;
}

export const ENCOUNTER_DEFAULTS: Readonly<EncounterConfig> = Object.freeze({
  spawnDistance: 3.0,
  reachDistance: 0.7,
  strikeDistance: 0.7,
  knockbackDistance: 2.0,
  advanceSpeed: 1.0,
  creepSeconds: 8,
  telegraphSeconds: 2,
});

export const PANEL = Object.freeze({
  distance: PANEL_LAYOUT.distanceM,
  pitchBelowDeg: PANEL_LAYOUT.pitchBelowDeg,
  opacity: 0.7,
  deadzoneDeg: 20,
});

/** Seconds a stunned enemy takes to lunge (eased) to the hold line. */
export const LUNGE_S = 0.3;

const MAX_HITS = 1;
const TWO_PI = 2 * Math.PI;

export function createEncounter(cfg: Readonly<EncounterConfig> = ENCOUNTER_DEFAULTS): Encounter {
  // Creep speed divides by creepSeconds; 0 or NaN would produce Infinity/NaN distances.
  if (!Number.isFinite(cfg.creepSeconds) || cfg.creepSeconds <= 0) {
    throw new RangeError(`creepSeconds must be finite and > 0, got ${cfg.creepSeconds}`);
  }
  return { phase: 'advancing', distance: cfg.spawnDistance, hits: 0, telegraphLeft: 0, cfg };
}

export function tick(enc: Encounter, dt: number): Encounter {
  if (!Number.isFinite(dt) || dt < 0) {
    throw new RangeError(`dt must be finite and >= 0, got ${dt}`);
  }
  const { cfg } = enc;
  switch (enc.phase) {
    case 'advancing': {
      const distance = enc.distance - cfg.advanceSpeed * dt;
      if (distance <= cfg.reachDistance) {
        return { ...enc, phase: 'slashable', distance: cfg.reachDistance };
      }
      return { ...enc, distance };
    }
    case 'answering': {
      // Fixed speed regardless of where the reveal happened: an early reveal from beyond
      // knockbackDistance just takes longer than creepSeconds to arrive.
      const creepSpeed = (cfg.knockbackDistance - cfg.strikeDistance) / cfg.creepSeconds;
      const distance = enc.distance - creepSpeed * dt;
      // Excess dt past the strike point is dropped so the telegraph always runs its full length.
      if (distance <= cfg.strikeDistance) {
        return {
          ...enc,
          phase: 'telegraph',
          distance: cfg.strikeDistance,
          telegraphLeft: cfg.telegraphSeconds,
        };
      }
      return { ...enc, distance };
    }
    case 'telegraph': {
      const telegraphLeft = enc.telegraphLeft - dt;
      if (telegraphLeft <= 0) {
        return {
          ...enc,
          phase: 'answering',
          distance: cfg.knockbackDistance,
          hits: Math.min(MAX_HITS, enc.hits + 1),
          telegraphLeft: 0,
        };
      }
      return { ...enc, telegraphLeft };
    }
    case 'stunned': {
      const from = enc.stunFrom;
      const stunElapsed = (enc.stunElapsed ?? 0) + dt;
      // No stunFrom: no lunge anchor, so it holds its current distance. Only ever toward the
      // player: a stun at or inside the hold line stays put.
      if (from === undefined || from <= cfg.reachDistance) return { ...enc, stunElapsed };
      if (stunElapsed >= LUNGE_S) return { ...enc, stunElapsed, distance: cfg.reachDistance };
      const t = stunElapsed / LUNGE_S;
      const eased = t * t * (3 - 2 * t);
      return { ...enc, stunElapsed, distance: from + (cfg.reachDistance - from) * eased };
    }
    case 'slashable':
      return enc;
  }
}

/**
 * Reveal the card: valid while walking in (any distance) or waiting at reach. Closer than
 * knockbackDistance the enemy is pushed back to it; farther away it keeps its distance, so an
 * early reveal buys extra time at the same fixed creep speed.
 */
export function slash(enc: Encounter): Encounter {
  if (enc.phase !== 'advancing' && enc.phase !== 'slashable') return enc;
  const distance = Math.max(enc.distance, enc.cfg.knockbackDistance);
  return { ...enc, phase: 'answering', distance };
}

/**
 * Correct answer in time: the attack stops (a pending telegraph is cancelled) and the card waits,
 * with no time limit, for the slash that knocks it off. The lunge to the hold line starts on the
 * next tick.
 */
export function stun(enc: Encounter): Encounter {
  if (enc.phase !== 'answering' && enc.phase !== 'telegraph') return enc;
  return { ...enc, phase: 'stunned', telegraphLeft: 0, stunFrom: enc.distance, stunElapsed: 0 };
}

function wrapAngle(a: number): number {
  let r = a % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  else if (r < -Math.PI) r += TWO_PI;
  return r;
}

/**
 * Lazy-follow yaw for a world-placed panel: it holds still while the head yaw is within the
 * deadzone of the panel yaw, otherwise turns just enough to put the head at the deadzone edge.
 * Angles in radians; result wrapped into [-PI, PI].
 */
export function panelYaw(
  currentYaw: number,
  headYaw: number,
  deadzone: number = (PANEL.deadzoneDeg * Math.PI) / 180,
): number {
  const finite = Number.isFinite(currentYaw) && Number.isFinite(headYaw);
  if (!finite || !Number.isFinite(deadzone) || deadzone < 0) {
    throw new RangeError('panelYaw needs finite angles and a finite deadzone >= 0');
  }
  const diff = wrapAngle(headYaw - currentYaw);
  if (Math.abs(diff) <= deadzone) return currentYaw;
  return wrapAngle(currentYaw + diff - Math.sign(diff) * deadzone);
}
