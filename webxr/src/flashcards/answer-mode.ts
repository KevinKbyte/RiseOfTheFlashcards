// Plan M10/D2/D4: answer mode (silent slash orbs vs voice), the orb trigger and orb scoring.
// Silent is the default because the IWSDK build ships voice OFF. Pure: never mutates input.
import { Rating } from 'ts-fsrs';
import type { AnswerState, VoiceResult } from './answer-outcome.js';

export type AnswerMode = 'silent' | 'voice';

export interface ModeState {
  readonly mode: AnswerMode;
  /** Mic permission was refused: silent is latched and voice can no longer be chosen. */
  readonly micDenied: boolean;
}

export function initialModeState(): ModeState {
  return { mode: 'silent', micDenied: false };
}

/** Same object when the mode is unchanged or the switch is refused (voice after a mic denial). */
export function setMode(s: ModeState, mode: AnswerMode): ModeState {
  if (s.mode === mode || (mode === 'voice' && s.micDenied)) return s;
  return { ...s, mode };
}

export function toggleMode(s: ModeState): ModeState {
  return setMode(s, s.mode === 'silent' ? 'voice' : 'silent');
}

export function denyMic(s: ModeState): ModeState {
  return s.micDenied && s.mode === 'silent' ? s : { mode: 'silent', micDenied: true };
}

/** 'stt-error': a hard STT failure (error callback / no final transcript) for this card. */
export type VoiceAttempt = VoiceResult | 'stt-error';

const VOICE_TRIES_BEFORE_ORBS = 2;

/** D4 orb trigger: silent at once; voice after 2 non-correct attempts or one hard STT error. */
export function showOrbs(mode: AnswerMode, attempts: readonly VoiceAttempt[]): boolean {
  if (mode === 'silent' || attempts.includes('stt-error')) return true;
  return attempts.filter((a) => a !== 'correct').length >= VOICE_TRIES_BEFORE_ORBS;
}

export interface OrbState extends AnswerState {
  readonly didntCatch: boolean;
}

/** D4 orb scoring; at most one Again per encounter, Easy never emitted. */
export function orbOutcome(
  pick: 'correct' | 'wrong',
  mode: AnswerMode,
  state: OrbState,
): { rating: Rating | null; state: OrbState } {
  const { againWritten, missed, didntCatch } = state;
  if (pick === 'wrong') {
    return { rating: againWritten ? null : Rating.Again, state: { againWritten: true, missed, didntCatch } };
  }
  let rating: Rating | null = null;
  if (!againWritten) {
    if (mode === 'silent') rating = missed ? Rating.Hard : Rating.Good;
    // Voice orbs only appear after misses/errors; a Hard-STT-only encounter writes nothing.
    else if (missed || didntCatch) rating = Rating.Hard;
  }
  return { rating, state: { againWritten, missed, didntCatch } };
}
