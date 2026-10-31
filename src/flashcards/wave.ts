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

export const DEFAULT_MAX_ACTIVE = 3;

export interface WaveEnemy {
  readonly id: string;
  readonly enc: Encounter;
}

export interface Wave {
  /** Spawn order; refills append at the end. */
  readonly active: readonly WaveEnemy[];
  /** Card ids not yet spawned, deck order. */
  readonly queue: readonly string[];
  /** The single revealed enemy, if any. */
  readonly targetId: string | null;
  readonly maxActive: number;
  readonly cfg: Readonly<EncounterConfig>;
}

export function createWave(
  deck: readonly string[],
  opts: { maxActive?: number; cfg?: Readonly<EncounterConfig> } = {},
): Wave {
  const maxActive = opts.maxActive ?? DEFAULT_MAX_ACTIVE;
  const cfg = opts.cfg ?? ENCOUNTER_DEFAULTS;
  if (!Number.isInteger(maxActive) || maxActive < 1) {
    throw new RangeError(`maxActive must be an integer >= 1, got ${maxActive}`);
  }
  if (new Set(deck).size !== deck.length) {
    throw new RangeError('deck contains a duplicate card id');
  }
  // Validate cfg even when the deck is empty, so a bad config never hides behind an empty deck.
  createEncounter(cfg);
  const active = deck.slice(0, maxActive).map((id) => ({ id, enc: createEncounter(cfg) }));
  return { active, queue: deck.slice(maxActive), targetId: null, maxActive, cfg };
}

export function tickWave(wave: Wave, dt: number): Wave {
  if (!Number.isFinite(dt) || dt < 0) {
    throw new RangeError(`dt must be finite and >= 0, got ${dt}`);
  }
  return { ...wave, active: wave.active.map((e) => ({ id: e.id, enc: tick(e.enc, dt) })) };
}

export function revealEnemy(wave: Wave, id: string): Wave {
  if (wave.targetId !== null) return wave;
  const idx = wave.active.findIndex((e) => e.id === id);
  if (idx < 0) return wave;
  const enc = slash(wave.active[idx].enc);
  if (enc === wave.active[idx].enc) return wave;
  const active = wave.active.map((e, i) => (i === idx ? { id, enc } : e));
  return { ...wave, active, targetId: id };
}

export function answerTarget(wave: Wave, correct: boolean): Wave {
  // The target is always answering or in its telegraph (slash() only leads there), so a correct
  // answer always clears it; it leaves the wave instead of lingering in the 'cleared' phase.
  if (!correct || wave.targetId === null) return wave;
  const kept = wave.active.filter((e) => e.id !== wave.targetId);
  const refill = wave.queue.slice(0, wave.maxActive - kept.length);
  return {
    ...wave,
    active: [...kept, ...refill.map((id) => ({ id, enc: createEncounter(wave.cfg) }))],
    queue: wave.queue.slice(refill.length),
    targetId: null,
  };
}

export function isWaveCleared(wave: Wave): boolean {
  return wave.active.length === 0 && wave.queue.length === 0;
}
