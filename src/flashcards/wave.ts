// Pure multi-enemy wave: several encounters walk in at once and the player picks which one to
// reveal. No DOM/IWSDK imports; every function returns a new wave (or the same object when the
// action does not apply) and never mutates its input.
import {
  createEncounter,
  ENCOUNTER_DEFAULTS,
  slash,
  tick,
  type Encounter,
  type EncounterConfig,
} from './encounter.js';
import { createPool, damage, isDefeated, type Pool } from './pool.js';

export const DEFAULT_MAX_ACTIVE = 3;

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
  return { ...wave, active: wave.active.map((e) => ({ ...e, enc: tick(e.enc, dt) })) };
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

export function answerTarget(wave: Wave, correct: boolean): Wave {
  // The target is always answering or in its telegraph (slash() only leads there), so a correct
  // answer always peels its current card.
  if (!correct || wave.targetId === null) return wave;
  const idx = wave.active.findIndex((e) => e.id === wave.targetId);
  const target = wave.active[idx];
  const pool = damage(target.pool);
  if (!isDefeated(pool)) {
    // Next card is a fresh encounter (hit cap per encounter, telegraph cancelled), re-revealed in
    // place: pushed back to knockbackDistance only if closer.
    const enc = slash({ ...createEncounter(wave.cfg), distance: target.enc.distance });
    const active = wave.active.map((e, i) => (i === idx ? { ...e, enc, pool } : e));
    return { ...wave, active };
  }
  // Defeated: it leaves the wave instead of lingering in the 'cleared' phase.
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

export function isWaveCleared(wave: Wave): boolean {
  return wave.active.length === 0 && wave.queue.length === 0;
}
