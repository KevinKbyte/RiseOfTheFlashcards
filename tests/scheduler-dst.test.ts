// Requirement: the study day rolls over at 04:00 LOCAL wall-clock time, including on DST
// transition days (spring-forward 2026-03-08 and fall-back 2026-11-01 in America/New_York):
// 03:59 local is still the previous study day, 04:00 local starts the new one.
// Separate file because it switches process.env.TZ for the duration of the file.
// No spec-cache ID exists yet for FSRS scheduling; Covers tags cite plan IDs
// (docs/plans/2026-10-28-vr-flashcard-game.md D5).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { studyDay } from '../src/flashcards/scheduler.js';

let prevTz: string | undefined;

// Covers: D5
describe('studyDay rollover on DST days (America/New_York)', () => {
  beforeAll(() => {
    prevTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  });

  it('TZ switch took effect (guard)', () => {
    expect(new Date('2026-03-08T07:59:00Z').getHours()).toBe(3);
  });

  it('spring forward 2026-03-08: 03:59 EDT -> previous day, 04:00 EDT -> new day', () => {
    expect(studyDay(new Date('2026-03-08T07:59:00Z'))).toBe('2026-03-07');
    expect(studyDay(new Date('2026-03-08T08:00:00Z'))).toBe('2026-03-08');
  });

  it('fall back 2026-11-01: both 01:30 instants and 03:59 EST -> previous day, 04:00 EST -> new day', () => {
    expect(studyDay(new Date('2026-11-01T05:30:00Z'))).toBe('2026-10-31');
    expect(studyDay(new Date('2026-11-01T06:30:00Z'))).toBe('2026-10-31');
    expect(studyDay(new Date('2026-11-01T08:59:00Z'))).toBe('2026-10-31');
    expect(studyDay(new Date('2026-11-01T09:00:00Z'))).toBe('2026-11-01');
  });
});
