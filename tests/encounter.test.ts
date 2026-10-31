// Requirement: each flashcard is guarded by an enemy that walks in from 3 m. When it is within
// reach (0.6 m) the player can slash it; the slash knocks it back to 2 m and its card pops out as a
// see-through panel ~1 m away, slightly below eye level, fixed in the room and turning to face the
// player only when they look more than 20 degrees away. While the player answers, the enemy creeps
// back over at least 8 s (6 s no-speech cap + 2 s grading timeout); reaching 0.5 m starts a 2 s
// telegraph, then the hit lands (at most 1 hit per encounter) and the enemy is knocked back to 2 m.
// A correct answer (also during the telegraph, cancelling the hit) clears the encounter.
// All functions are pure and time advances only through explicit dt ticks.
// CARDS-* IDs are prototype-local (no spec-cache home yet).
import { describe, expect, it } from 'vitest';
import {
  createEncounter,
  ENCOUNTER_DEFAULTS,
  PANEL,
  panelYaw,
  resolveCorrect,
  slash,
  tick,
  type EncounterPhase,
} from '../src/flashcards/encounter.js';

type Enc = ReturnType<typeof createEncounter>;

const D = ENCOUNTER_DEFAULTS;
const DZ = (20 * Math.PI) / 180;

function slashable(): Enc {
  const enc = tick(createEncounter(), 10);
  expect(enc.phase).toBe('slashable');
  return enc;
}

function answering(): Enc {
  const enc = slash(slashable());
  expect(enc.phase).toBe('answering');
  return enc;
}

function telegraph(): Enc {
  const enc = tick(answering(), D.creepSeconds);
  expect(enc.phase).toBe('telegraph');
  return enc;
}

function cleared(): Enc {
  const enc = resolveCorrect(answering());
  expect(enc.phase).toBe('cleared');
  return enc;
}

function snapshot(enc: Enc): Enc {
  return JSON.parse(JSON.stringify(enc)) as Enc;
}

// Covers: CARDS-004
describe('encounter config and creation', () => {
  it('ENCOUNTER_DEFAULTS has the agreed distances, speed and timings', () => {
    expect(ENCOUNTER_DEFAULTS).toEqual({
      spawnDistance: 3.0,
      reachDistance: 0.6,
      strikeDistance: 0.5,
      knockbackDistance: 2.0,
      advanceSpeed: 1.0,
      creepSeconds: 8,
      telegraphSeconds: 2,
    });
  });

  it('creep lasts at least 8 s (6 s no-speech cap + 2 s grading timeout)', () => {
    expect(ENCOUNTER_DEFAULTS.creepSeconds).toBeGreaterThanOrEqual(8);
  });

  it('createEncounter() starts advancing at spawn distance with no hits', () => {
    expect(createEncounter()).toEqual({
      phase: 'advancing',
      distance: 3.0,
      hits: 0,
      telegraphLeft: 0,
      cfg: ENCOUNTER_DEFAULTS,
    });
  });

  it('createEncounter(cfg) uses the supplied config', () => {
    const cfg = { ...ENCOUNTER_DEFAULTS, spawnDistance: 5 };
    const enc = createEncounter(cfg);
    expect(enc.distance).toBe(5);
    expect(enc.cfg).toEqual(cfg);
    expect(enc.phase).toBe<EncounterPhase>('advancing');
  });
});

// Covers: CARDS-004
describe('tick: advancing', () => {
  it('moves the enemy closer at advanceSpeed', () => {
    const enc = tick(createEncounter(), 1);
    expect(enc.phase).toBe('advancing');
    expect(enc.distance).toBeCloseTo(2.0, 10);
  });

  it('is still advancing just before reach (2.39 s)', () => {
    const enc = tick(createEncounter(), 2.39);
    expect(enc.phase).toBe('advancing');
    expect(enc.distance).toBeGreaterThan(D.reachDistance);
  });

  it('becomes slashable at reach, clamped to reachDistance', () => {
    const enc = tick(createEncounter(), 2.41);
    expect(enc.phase).toBe('slashable');
    expect(enc.distance).toBe(D.reachDistance);
  });

  it('a huge dt clamps at reachDistance instead of overshooting', () => {
    const enc = tick(createEncounter(), 1000);
    expect(enc.phase).toBe('slashable');
    expect(enc.distance).toBe(D.reachDistance);
    expect(enc.hits).toBe(0);
  });

  it('reaches slashable after ~2.4 s of small ticks', () => {
    let enc = createEncounter();
    let t = 0;
    for (let i = 0; i < 1000 && enc.phase === 'advancing'; i++) {
      enc = tick(enc, 0.01);
      t += 0.01;
    }
    expect(enc.phase).toBe('slashable');
    expect(t).toBeGreaterThan(2.39);
    expect(t).toBeLessThan(2.42);
  });
});

// Covers: CARDS-004
describe('tick: slashable and cleared wait', () => {
  it('slashable does not move or change on tick', () => {
    const enc = slashable();
    expect(tick(enc, 5)).toEqual(enc);
  });

  it('cleared does not change on tick', () => {
    const enc = cleared();
    expect(tick(enc, 5)).toEqual(enc);
  });
});

// Covers: CARDS-004
describe('tick: answering creep', () => {
  it('creeps at (knockback - strike) / creepSeconds', () => {
    const enc = tick(answering(), 4);
    expect(enc.phase).toBe('answering');
    expect(enc.distance).toBeCloseTo(2.0 - (1.5 / 8) * 4, 10);
  });

  it('reaching strikeDistance starts the telegraph', () => {
    const enc = tick(answering(), 8);
    expect(enc.phase).toBe('telegraph');
    expect(enc.distance).toBe(D.strikeDistance);
    expect(enc.telegraphLeft).toBe(D.telegraphSeconds);
    expect(enc.hits).toBe(0);
  });

  it('excess dt is not carried into the telegraph', () => {
    const enc = tick(answering(), 100);
    expect(enc.phase).toBe('telegraph');
    expect(enc.distance).toBe(D.strikeDistance);
    expect(enc.telegraphLeft).toBe(D.telegraphSeconds);
    expect(enc.hits).toBe(0);
  });
});

// Covers: CARDS-004
describe('tick: telegraph and hit', () => {
  it('counts the telegraph down without hitting early', () => {
    const enc = tick(telegraph(), 1.5);
    expect(enc.phase).toBe('telegraph');
    expect(enc.telegraphLeft).toBeCloseTo(0.5, 10);
    expect(enc.hits).toBe(0);
  });

  it('lands the hit when the telegraph runs out and knocks the enemy back', () => {
    const enc = tick(telegraph(), 2);
    expect(enc.phase).toBe('answering');
    expect(enc.hits).toBe(1);
    expect(enc.distance).toBe(D.knockbackDistance);
    expect(enc.telegraphLeft).toBe(0);
  });

  it('caps hits at 1 per encounter', () => {
    const first = tick(telegraph(), 2);
    const second = tick(tick(first, 8), 2);
    expect(second.phase).toBe('answering');
    expect(second.hits).toBe(1);
  });
});

// Covers: CARDS-004
describe('tick: dt validation and purity', () => {
  it.each([-0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'dt %s throws RangeError',
    (dt) => {
      expect(() => tick(createEncounter(), dt)).toThrow(RangeError);
    },
  );

  it.each([
    ['advancing', () => createEncounter()],
    ['slashable', slashable],
    ['answering', answering],
    ['telegraph', telegraph],
    ['cleared', cleared],
  ] as const)('dt 0 leaves %s unchanged', (_name, make) => {
    const enc = make();
    expect(tick(enc, 0)).toEqual(enc);
  });

  it.each([
    ['advancing', () => createEncounter()],
    ['answering', answering],
    ['telegraph', telegraph],
  ] as const)('tick never mutates its %s input', (_name, make) => {
    const enc = make();
    const before = snapshot(enc);
    tick(enc, 1);
    tick(enc, 100);
    expect(enc).toEqual(before);
  });
});

// Covers: CARDS-004
describe('slash', () => {
  it('from slashable: knocks back to knockbackDistance and starts answering', () => {
    const enc = slashable();
    const before = snapshot(enc);
    const next = slash(enc);
    expect(next.phase).toBe('answering');
    expect(next.distance).toBe(D.knockbackDistance);
    expect(next.hits).toBe(0);
    expect(enc).toEqual(before);
  });

  it.each([
    ['advancing', () => createEncounter()],
    ['answering', answering],
    ['telegraph', telegraph],
    ['cleared', cleared],
  ] as const)('from %s returns the same object', (_name, make) => {
    const enc = make();
    expect(slash(enc)).toBe(enc);
  });
});

// Covers: CARDS-004
describe('resolveCorrect', () => {
  it('from answering clears the encounter', () => {
    const enc = answering();
    const before = snapshot(enc);
    const next = resolveCorrect(enc);
    expect(next.phase).toBe('cleared');
    expect(next.hits).toBe(0);
    expect(enc).toEqual(before);
  });

  it('during the telegraph clears it and cancels the hit', () => {
    const next = resolveCorrect(telegraph());
    expect(next.phase).toBe('cleared');
    expect(next.hits).toBe(0);
    expect(tick(next, 10).hits).toBe(0);
  });

  it('after a landed hit keeps hits unchanged', () => {
    const hit = tick(telegraph(), 2);
    const next = resolveCorrect(hit);
    expect(next.phase).toBe('cleared');
    expect(next.hits).toBe(1);
  });

  it.each([
    ['advancing', () => createEncounter()],
    ['slashable', slashable],
    ['cleared', cleared],
  ] as const)('from %s returns the same object', (_name, make) => {
    const enc = make();
    expect(resolveCorrect(enc)).toBe(enc);
  });
});

// Covers: CARDS-004
describe('full encounter loop with defaults', () => {
  it('advance -> slash -> creep -> telegraph -> hit -> second cycle keeps hits at 1', () => {
    let enc = createEncounter();
    let t = 0;
    while (enc.phase === 'advancing' && t < 10) {
      enc = tick(enc, 0.1);
      t += 0.1;
    }
    expect(enc.phase).toBe('slashable');
    expect(t).toBeCloseTo(2.4, 0);

    enc = slash(enc);
    expect(enc.phase).toBe('answering');
    expect(enc.distance).toBe(2.0);

    enc = tick(enc, 8);
    expect(enc.phase).toBe('telegraph');
    enc = tick(enc, 2);
    expect(enc.phase).toBe('answering');
    expect(enc.hits).toBe(1);
    expect(enc.distance).toBe(2.0);

    enc = tick(enc, 8);
    expect(enc.phase).toBe('telegraph');
    enc = tick(enc, 2);
    expect(enc.phase).toBe('answering');
    expect(enc.hits).toBe(1);

    enc = resolveCorrect(enc);
    expect(enc.phase).toBe('cleared');
  });
});

// Covers: CARDS-005
describe('PANEL constants', () => {
  it('panel sits 1 m away, 15 deg below eye level, 70% opaque, 20 deg yaw deadzone', () => {
    expect(PANEL).toEqual({ distance: 1.0, pitchBelowDeg: 15, opacity: 0.7, deadzoneDeg: 20 });
  });
});

// Covers: CARDS-005
describe('panelYaw', () => {
  it('stays put while the head is inside the deadzone', () => {
    expect(panelYaw(0, 0.2)).toBe(0);
    expect(panelYaw(1, 1 - 0.3)).toBe(1);
  });

  it('stays put exactly at the deadzone edge', () => {
    expect(panelYaw(0, DZ)).toBe(0);
    expect(panelYaw(0, -DZ)).toBe(0);
  });

  it('turns just enough to put the head at the deadzone edge', () => {
    expect(panelYaw(0, 0.5)).toBeCloseTo(0.5 - DZ, 10);
    expect(panelYaw(0, -0.5)).toBeCloseTo(-0.5 + DZ, 10);
  });

  it('treats a small diff across +/-PI as small (no spin the long way round)', () => {
    expect(panelYaw(3.0, -3.0)).toBe(3.0);
  });

  it('wraps the result into [-PI, PI] when turning across +/-PI', () => {
    const diff = -2.5 + 2 * Math.PI - 3.0;
    const expected = 3.0 + diff - DZ - 2 * Math.PI;
    const got = panelYaw(3.0, -2.5);
    expect(got).toBeCloseTo(expected, 10);
    expect(got).toBeGreaterThanOrEqual(-Math.PI);
    expect(got).toBeLessThanOrEqual(Math.PI);
  });

  it('honours a custom deadzone', () => {
    expect(panelYaw(0, 0.5, 0.6)).toBe(0);
    expect(panelYaw(0, 0.5, 0.1)).toBeCloseTo(0.4, 10);
  });

  it('always leaves the head within the deadzone and the yaw within [-PI, PI]', () => {
    for (let c = -3.1; c <= 3.1; c += 0.37) {
      for (let h = -3.1; h <= 3.1; h += 0.29) {
        const y = panelYaw(c, h);
        expect(y).toBeGreaterThanOrEqual(-Math.PI);
        expect(y).toBeLessThanOrEqual(Math.PI);
        let d = h - y;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        expect(Math.abs(d)).toBeLessThanOrEqual(DZ + 1e-9);
      }
    }
  });

  it.each([
    [Number.NaN, 0, DZ],
    [0, Number.NaN, DZ],
    [Number.POSITIVE_INFINITY, 0, DZ],
    [0, Number.NEGATIVE_INFINITY, DZ],
    [0, 0, Number.NaN],
  ])('non-finite input (%s, %s, %s) throws RangeError', (c, h, dz) => {
    expect(() => panelYaw(c, h, dz)).toThrow(RangeError);
  });
});
