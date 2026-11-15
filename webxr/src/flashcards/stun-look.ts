// Pure look rules for the stun (CARDS-012): panel text, answer-orb visibility and enemy glow by
// encounter phase. No DOM/IWSDK imports so it runs under vitest's node environment.

import type { Glow } from '../card-enemy.js';
import type { EncounterPhase } from './encounter.js';

export const STUN_PANEL_TEXT = 'SLASH IT';

/** `phase` is the target's phase, or null when there is no target. */
export function panelPrompt(phase: EncounterPhase | null, question: string): string {
  return phase === 'stunned' ? STUN_PANEL_TEXT : question;
}

export function showsAnswerOrbs(phase: EncounterPhase | null): boolean {
  return phase !== 'stunned';
}

export function enemyGlow(phase: EncounterPhase, isTarget: boolean): Glow {
  if (isTarget) {
    if (phase === 'stunned') return 'stunned';
    return phase === 'telegraph' ? 'telegraph' : 'target';
  }
  return phase === 'slashable' ? 'halted' : 'faint';
}
