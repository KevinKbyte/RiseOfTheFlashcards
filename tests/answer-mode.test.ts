// No spec-cache ID covers silent mode / the orb trigger yet; Covers tags cite plan IDs (M10, D2, D4),
// as answer-outcome/run-flow/review-flow tests do.
//
// API contract for src/flashcards/answer-mode.ts (pure, no three.js/DOM; never mutates input):
//   export type AnswerMode = 'silent' | 'voice';
//   export interface ModeState { readonly mode: AnswerMode; readonly micDenied: boolean }
//   export function initialModeState(): ModeState;               // { mode: 'silent', micDenied: false }
//   export function setMode(s: ModeState, mode: AnswerMode): ModeState;  // same object when unchanged/refused
//   export function toggleMode(s: ModeState): ModeState;
//   export function denyMic(s: ModeState): ModeState;             // latches silent
//   export type VoiceAttempt = VoiceResult | 'stt-error';         // VoiceResult from answer-outcome
//   export function showOrbs(mode: AnswerMode, attempts: readonly VoiceAttempt[]): boolean;
//   export interface OrbState extends AnswerState { readonly didntCatch: boolean }
//   export function orbOutcome(pick: 'correct' | 'wrong', mode: AnswerMode, state: OrbState):
//     { rating: Rating | null; state: OrbState };
import { Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import {
  denyMic,
  initialModeState,
  orbOutcome,
  setMode,
  showOrbs,
  toggleMode,
  type ModeState,
  type OrbState,
  type VoiceAttempt,
} from '../src/flashcards/answer-mode';

const FRESH: OrbState = Object.freeze({ againWritten: false, missed: false, didntCatch: false });

// Covers: M10, D2
// Requirement: silent mode (slash answer orbs) is the default because the IWSDK build ships voice
// OFF; the player can switch between silent and voice at any time; a microphone permission denial
// latches silent mode, after which switching back to voice is refused (no-op). Silent latches
// automatically ONLY on mic denial, never on its own.
describe('answer mode: default, toggle, mic-denial latch', () => {
  it('starts in silent mode with no mic denial', () => {
    expect(initialModeState()).toEqual({ mode: 'silent', micDenied: false });
  });

  it('the player can switch to voice and back to silent', () => {
    const voice = setMode(initialModeState(), 'voice');
    expect(voice.mode).toBe('voice');
    expect(setMode(voice, 'silent').mode).toBe('silent');
  });

  it('toggleMode flips silent <-> voice', () => {
    const s0 = initialModeState();
    const s1 = toggleMode(s0);
    expect(s1.mode).toBe('voice');
    expect(toggleMode(s1).mode).toBe('silent');
  });

  it('setting the current mode returns the same state object', () => {
    const s = initialModeState();
    expect(setMode(s, 'silent')).toBe(s);
  });

  it('mic denial in voice mode drops to silent and marks the denial', () => {
    const denied = denyMic(setMode(initialModeState(), 'voice'));
    expect(denied).toEqual({ mode: 'silent', micDenied: true });
  });

  it('after mic denial, switching back to voice is refused (same object, still silent)', () => {
    const denied = denyMic(initialModeState());
    expect(denied.mode).toBe('silent');
    expect(setMode(denied, 'voice')).toBe(denied);
    expect(toggleMode(denied)).toBe(denied);
    expect(toggleMode(denied).mode).toBe('silent');
  });

  it('never mutates the state it is given', () => {
    const s: ModeState = Object.freeze({ mode: 'voice', micDenied: false });
    expect(() => {
      setMode(s, 'silent');
      toggleMode(s);
      denyMic(s);
    }).not.toThrow();
    expect(s).toEqual({ mode: 'voice', micDenied: false });
  });
});

// Covers: M10, D4
// Requirement: orb trigger (plan D4). Silent mode shows the answer orbs immediately. Voice mode
// shows them after any 2 non-correct voice attempts in one encounter (wrong, miss, Didn't catch, in
// any mix) so a player who keeps answering wrong is never stuck taking hits, or at once after a
// single hard STT error (error callback / no final transcript) for this card.
describe('showOrbs (orb trigger predicate)', () => {
  it('silent mode -> orbs immediately, before any attempt', () => {
    expect(showOrbs('silent', [])).toBe(true);
  });

  it('voice mode with no attempts -> no orbs', () => {
    expect(showOrbs('voice', [])).toBe(false);
  });

  it.each<VoiceAttempt>(['wrong', 'miss', 'didnt-catch'])('voice mode after one %s -> no orbs yet', (a) => {
    expect(showOrbs('voice', [a])).toBe(false);
  });

  it.each<[string, VoiceAttempt[]]>([
    ['wrong + miss', ['wrong', 'miss']],
    ['miss + didnt-catch', ['miss', 'didnt-catch']],
    ['wrong + wrong', ['wrong', 'wrong']],
    ['didnt-catch + didnt-catch', ['didnt-catch', 'didnt-catch']],
  ])('voice mode after %s -> orbs', (_label, attempts) => {
    expect(showOrbs('voice', attempts)).toBe(true);
  });

  it('voice mode after a single hard STT error -> orbs immediately', () => {
    expect(showOrbs('voice', ['stt-error'])).toBe(true);
  });
});

// Covers: M10, D4
// Requirement: orb scoring per the plan's D4 table. Silent mode: a correct first pick rates Good.
// Voice mode (orbs only appear after misses/errors): a correct orb rates Hard if a miss or Didn't
// catch preceded and no Again was written, else nothing (a Hard-STT-only encounter writes nothing).
// A wrong orb rates Again only if it is the first scored attempt (no Again written yet), in either
// mode; at most one Again per encounter.
describe('orbOutcome (orb pick -> FSRS rating by mode)', () => {
  it('silent first pick correct -> Good', () => {
    expect(orbOutcome('correct', 'silent', FRESH).rating).toBe(Rating.Good);
  });

  it('silent: wrong orb then correct orb -> Again once, then nothing', () => {
    const w = orbOutcome('wrong', 'silent', FRESH);
    expect(w.rating).toBe(Rating.Again);
    expect(w.state.againWritten).toBe(true);
    expect(orbOutcome('correct', 'silent', w.state).rating).toBeNull();
  });

  it('voice: correct orb after a miss -> Hard', () => {
    expect(orbOutcome('correct', 'voice', { ...FRESH, missed: true }).rating).toBe(Rating.Hard);
  });

  it('voice: correct orb after Didn\'t catch only -> Hard (D4 Orb correct row)', () => {
    expect(orbOutcome('correct', 'voice', { ...FRESH, didntCatch: true }).rating).toBe(Rating.Hard);
  });

  it('voice: correct orb with no miss or Didn\'t catch (Hard-STT-only encounter) -> no rating', () => {
    expect(orbOutcome('correct', 'voice', FRESH).rating).toBeNull();
  });

  it('voice: correct orb after an Again was written -> no rating', () => {
    expect(orbOutcome('correct', 'voice', { againWritten: true, missed: true, didntCatch: true }).rating).toBeNull();
  });

  it.each<'silent' | 'voice'>(['silent', 'voice'])('%s: wrong orb as first scored attempt -> Again', (mode) => {
    const o = orbOutcome('wrong', mode, { ...FRESH, missed: true });
    expect(o.rating).toBe(Rating.Again);
    expect(o.state.againWritten).toBe(true);
  });

  it.each<'silent' | 'voice'>(['silent', 'voice'])('%s: wrong orb after an Again -> no rating', (mode) => {
    expect(orbOutcome('wrong', mode, { ...FRESH, againWritten: true }).rating).toBeNull();
  });

  it('never emits Easy and never mutates the given state', () => {
    const states: OrbState[] = [
      FRESH,
      { againWritten: false, missed: true, didntCatch: false },
      { againWritten: false, missed: false, didntCatch: true },
      { againWritten: true, missed: true, didntCatch: true },
    ];
    for (const st of states) {
      const frozen = Object.freeze({ ...st });
      for (const mode of ['silent', 'voice'] as const) {
        for (const pick of ['correct', 'wrong'] as const) {
          expect(orbOutcome(pick, mode, frozen).rating).not.toBe(Rating.Easy);
        }
      }
      expect(frozen).toEqual(st);
    }
  });
});
