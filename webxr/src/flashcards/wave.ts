// Pure enemy wave: one enemy at a time by default (a larger maxActive lets the player pick which
// to reveal), each carrying a stack of cards. No DOM/IWSDK imports; every function returns a new
// wave (or the same object when the action does not apply) and never mutates its input.
import {
  createEncounter,
  ENCOUNTER_DEFAULTS,
  slash,
  stun,
  tick,
  type Encounter,
  type EncounterConfig,
} from './encounter.js';
import { createPool, damage, isDefeated, type Pool } from './pool.js';
import { RING_FALLBACK_DISTANCE } from './spawn.js';

export const DEFAULT_MAX_ACTIVE = 1;

export interface WaveEnemy {
  /** The enemy's first card; stays the id while later cards are peeled. */
  readonly id: string;
  readonly enc: Encounter;
  readonly pool: Pool;
}

export interface Wave {
  /** Spawn order; refills append at the end. */
  readonly active: readonly WaveEnemy[];
  /** Card ids not yet spawned, deck order. */
  readonly queue: readonly string[];
  /** Pool sizes for the enemies still to spawn from the queue, spawn order; missing -> 1. */
  readonly queueSizes: readonly number[];
  /** The single revealed enemy, if any. */
  readonly targetId: string | null;
  readonly maxActive: number;
  readonly cfg: Readonly<EncounterConfig>;
}

/** Spawns up to `count` enemies from the queue head, each taking its pool size of cards. */
function spawn(
  queue: readonly string[],
  sizes: readonly number[],
  count: number,
  cfg: Readonly<EncounterConfig>,
): { enemies: WaveEnemy[]; queue: readonly string[]; queueSizes: readonly number[] } {
  const enemies: WaveEnemy[] = [];
  let at = 0;
  while (enemies.length < count && at < queue.length) {
    const cards = queue.slice(at, at + (sizes[enemies.length] ?? 1));
    at += cards.length;
    enemies.push({ id: cards[0], enc: createEncounter(cfg), pool: createPool(cards) });
  }
  return { enemies, queue: queue.slice(at), queueSizes: sizes.slice(enemies.length) };
}

export function createWave(
  deck: readonly string[],
  opts: { maxActive?: number; cfg?: Readonly<EncounterConfig>; poolSizes?: readonly number[] } = {},
): Wave {
  const maxActive = opts.maxActive ?? DEFAULT_MAX_ACTIVE;
  const cfg = opts.cfg ?? ENCOUNTER_DEFAULTS;
  if (!Number.isInteger(maxActive) || maxActive < 1) {
    throw new RangeError(`maxActive must be an integer >= 1, got ${maxActive}`);
  }
  if (new Set(deck).size !== deck.length) {
    throw new RangeError('deck contains a duplicate card id');
  }
  const poolSizes = opts.poolSizes ?? [];
  for (const size of poolSizes) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError(`pool size must be an integer >= 1, got ${size}`);
  }
  // Validate cfg even when the deck is empty, so a bad config never hides behind an empty deck.
  createEncounter(cfg);
  const { enemies, queue, queueSizes } = spawn(deck, poolSizes, maxActive, cfg);
  return { active: enemies, queue, queueSizes, targetId: null, maxActive, cfg };
}

export function tickWave(wave: Wave, dt: number): Wave {
  if (!Number.isFinite(dt) || dt < 0) {
    throw new RangeError(`dt must be finite and >= 0, got ${dt}`);
  }
  const ticked = { ...wave, active: wave.active.map((e) => ({ ...e, enc: tick(e.enc, dt) })) };
  // With nothing revealed, the first enemy parked at the hold line shows its card by itself.
  const parked = ticked.targetId === null ? ticked.active.find((e) => e.enc.phase === 'slashable') : undefined;
  return parked === undefined ? ticked : revealEnemy(ticked, parked.id);
}

export function revealEnemy(wave: Wave, id: string): Wave {
  if (wave.targetId !== null) return wave;
  const idx = wave.active.findIndex((e) => e.id === id);
  if (idx < 0) return wave;
  const enc = slash(wave.active[idx].enc);
  if (enc === wave.active[idx].enc) return wave;
  const active = wave.active.map((e, i) => (i === idx ? { ...e, enc } : e));
  return { ...wave, active, targetId: id };
}

/** A correct answer stuns the target (attack stopped); its card stays on until slashed off. */
export function answerTarget(wave: Wave, correct: boolean): Wave {
  if (!correct || wave.targetId === null) return wave;
  const idx = wave.active.findIndex((e) => e.id === wave.targetId);
  const enc = stun(wave.active[idx].enc);
  if (enc === wave.active[idx].enc) return wave;
  return { ...wave, active: wave.active.map((e, i) => (i === idx ? { ...e, enc } : e)) };
}

/**
 * A slash on an enemy: reveals one that is still walking in or parked (when nothing is revealed),
 * or knocks the top card off a stunned target. Anything else returns the same object.
 */
export function slashEnemy(wave: Wave, id: string): Wave {
  const idx = wave.active.findIndex((e) => e.id === id);
  if (idx < 0) return wave;
  if (id !== wave.targetId || wave.active[idx].enc.phase !== 'stunned') return revealEnemy(wave, id);
  const target = wave.active[idx];
  const pool = damage(target.pool);
  if (!isDefeated(pool)) {
    // Next card is a fresh encounter (hit cap per encounter, telegraph cancelled), re-revealed in
    // place: pushed back to knockbackDistance only if closer.
    const enc = slash({ ...createEncounter(wave.cfg), distance: target.enc.distance });
    const active = wave.active.map((e, i) => (i === idx ? { ...e, enc, pool } : e));
    return { ...wave, active };
  }
  // Defeated: it leaves the wave.
  const kept = wave.active.filter((_, i) => i !== idx);
  const refill = spawn(wave.queue, wave.queueSizes, wave.maxActive - kept.length, wave.cfg);
  return {
    ...wave,
    active: [...kept, ...refill.enemies],
    queue: refill.queue,
    queueSizes: refill.queueSizes,
    targetId: null,
  };
}

/**
 * Ultimate: pushes the revealed target back toward its spawn (never pulled forward) and cancels its
 * in-flight attack. It stays the target with its hits and pool, so creep resumes from there.
 * @throws {RangeError} when `opts.spawnDistance` is not finite and > 0.
 */
export function ultimateKnockback(wave: Wave, opts: { spawnDistance?: number } = {}): Wave {
  const spawnDistance = opts.spawnDistance ?? RING_FALLBACK_DISTANCE;
  if (!Number.isFinite(spawnDistance) || spawnDistance <= 0) {
    throw new RangeError(`spawnDistance must be finite and > 0, got ${spawnDistance}`);
  }
  const idx = wave.targetId === null ? -1 : wave.active.findIndex((e) => e.id === wave.targetId);
  // A stunned target has no attack to cancel, and the ultimate never finishes its card.
  if (idx < 0 || wave.active[idx].enc.phase === 'stunned') return wave;
  const target = wave.active[idx];
  const enc: Encounter = {
    ...target.enc,
    phase: 'answering',
    telegraphLeft: 0,
    distance: Math.max(target.enc.distance, spawnDistance),
  };
  const active = wave.active.map((e, i) => (i === idx ? { ...e, enc } : e));
  return { ...wave, active };
}

export function isWaveCleared(wave: Wave): boolean {
  return wave.active.length === 0 && wave.queue.length === 0;
}
