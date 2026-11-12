// Requirement: a correct answer shows the stun (CARDS-012, amended 2026-11-12). While the revealed
// target is stunned its glow switches to a stun glow distinct from the answering glow (both were
// cyan before) and from every other glow, its answer orbs are removed, and the answer panel text
// changes from the question to exactly "SLASH IT". Every other phase keeps today's look: answering
// shows the question with its orbs and the cyan target glow, the telegraph its red swing, a parked
// non-target the yellow halted glow, a walker the faint glow. With no target the panel keeps the
// question and the orbs.
//
// New seam (pure, no DOM/IWSDK; loaded per test so a missing module fails each test readably):
//   src/flashcards/stun-look.ts
//     export const STUN_PANEL_TEXT = 'SLASH IT';
//     export function panelPrompt(phase: EncounterPhase | null, question: string): string;
//         // STUN_PANEL_TEXT while 'stunned', else `question` unchanged (null = no target)
//     export function showsAnswerOrbs(phase: EncounterPhase | null): boolean;
//         // false only while 'stunned'
//     export function enemyGlow(phase: EncounterPhase, isTarget: boolean): Glow;
//         // Glow from src/card-enemy.ts (type-only import), extended with 'stunned':
//         // target: 'stunned' -> 'stunned', 'telegraph' -> 'telegraph', else 'target';
//         // non-target: 'slashable' -> 'halted', else 'faint'
//   cards.ts panelLines() uses panelPrompt for line 1 and hides the orbs per showsAnswerOrbs;
//   card-enemy-field.ts update() picks the glow with enemyGlow (colour pinned in
//   tests/card-enemy-stun-glow.test.ts).
import { describe, expect, it } from 'vitest';
import type { EncounterPhase } from '../src/flashcards/encounter.js';

interface StunLook {
  STUN_PANEL_TEXT: string;
  panelPrompt: (phase: EncounterPhase | null, question: string) => string;
  showsAnswerOrbs: (phase: EncounterPhase | null) => boolean;
  enemyGlow: (phase: EncounterPhase, isTarget: boolean) => string;
}

const MODULE = '../src/flashcards/stun-look.js';

async function look(): Promise<StunLook> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  } catch {
    throw new Error('src/flashcards/stun-look.ts does not exist yet');
  }
  for (const name of ['panelPrompt', 'showsAnswerOrbs', 'enemyGlow']) {
    if (typeof mod[name] !== 'function') throw new Error(`stun-look does not export ${name}()`);
  }
  if (typeof mod.STUN_PANEL_TEXT !== 'string') throw new Error('stun-look does not export STUN_PANEL_TEXT');
  return mod as unknown as StunLook;
}

const ALL_PHASES: readonly EncounterPhase[] = ['advancing', 'slashable', 'answering', 'telegraph', 'stunned', 'cleared'];
const NOT_STUNNED = ALL_PHASES.filter((p) => p !== 'stunned');
const QUESTION = 'What is the capital of France?';

// Covers: CARDS-012
describe('stun look: panel text', () => {
  it('STUN_PANEL_TEXT is exactly "SLASH IT"', async () => {
    expect((await look()).STUN_PANEL_TEXT).toBe('SLASH IT');
  });

  it('a stunned target shows "SLASH IT" instead of the question', async () => {
    expect((await look()).panelPrompt('stunned', QUESTION)).toBe('SLASH IT');
  });

  it('a stunned target shows "SLASH IT" even for an empty question', async () => {
    expect((await look()).panelPrompt('stunned', '')).toBe('SLASH IT');
  });

  it.each(NOT_STUNNED)('%s keeps the question text unchanged', async (phase) => {
    expect((await look()).panelPrompt(phase, QUESTION)).toBe(QUESTION);
  });

  it('no target keeps the question text unchanged (empty stays empty)', async () => {
    const m = await look();
    expect(m.panelPrompt(null, QUESTION)).toBe(QUESTION);
    expect(m.panelPrompt(null, '')).toBe('');
  });
});

// Covers: CARDS-012
describe('stun look: answer orbs', () => {
  it('a stunned target shows no answer orbs', async () => {
    expect((await look()).showsAnswerOrbs('stunned')).toBe(false);
  });

  it('an answering target still shows its orbs', async () => {
    expect((await look()).showsAnswerOrbs('answering')).toBe(true);
  });

  it.each(NOT_STUNNED)('%s keeps the orbs', async (phase) => {
    expect((await look()).showsAnswerOrbs(phase)).toBe(true);
  });

  it('no target keeps the orbs', async () => {
    expect((await look()).showsAnswerOrbs(null)).toBe(true);
  });
});

// Covers: CARDS-012, CARDS-010
describe('stun look: enemy glow', () => {
  it('a stunned target glows "stunned", not the answering "target" glow', async () => {
    const m = await look();
    expect(m.enemyGlow('stunned', true)).toBe('stunned');
    expect(m.enemyGlow('answering', true)).toBe('target');
  });

  it('the stun glow is used by no other phase, target or not', async () => {
    const m = await look();
    for (const phase of NOT_STUNNED) {
      expect(m.enemyGlow(phase, true), `${phase} target`).not.toBe('stunned');
      expect(m.enemyGlow(phase, false), `${phase} non-target`).not.toBe('stunned');
    }
  });

  it('every other phase keeps today\'s glow', async () => {
    const m = await look();
    expect(m.enemyGlow('telegraph', true)).toBe('telegraph');
    expect(m.enemyGlow('answering', true)).toBe('target');
    expect(m.enemyGlow('slashable', false)).toBe('halted');
    expect(m.enemyGlow('advancing', false)).toBe('faint');
    expect(m.enemyGlow('answering', false)).toBe('faint');
  });
});
