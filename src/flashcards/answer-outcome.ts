// Plan D4: classify one voice attempt and decide its FSRS rating. At most one rating per
// encounter, Easy never emitted. Pure: state is threaded by the caller, never mutated.
import { Rating } from 'ts-fsrs';
import { match, matchKey, MAX_KEY_CHARS, type MatchInput, type MatchResult } from './matcher.js';

export type VoiceResult = MatchResult | 'didnt-catch';

export interface AnswerState {
  readonly againWritten: boolean;
  readonly missed: boolean;
}

export interface AnswerOutcome {
  outcome: VoiceResult;
  rating: Rating | null;
  state: AnswerState;
}

// Empty, punctuation/whitespace-only, or over-cap transcripts are Didn't catch, never a matcher error.
export function classifyTranscript(input: MatchInput): VoiceResult {
  if (typeof input.transcript === 'string') {
    const key = matchKey(input.transcript);
    if (key === '' || key.length > MAX_KEY_CHARS) return 'didnt-catch';
  }
  return match(input);
}

export function answerOutcome(result: VoiceResult, state: AnswerState): AnswerOutcome {
  const { againWritten, missed } = state;
  switch (result) {
    case 'correct':
      // A correct answer ends the encounter, so state needs no "rated" marker afterwards.
      return { outcome: result, rating: againWritten ? null : missed ? Rating.Hard : Rating.Good, state: { againWritten, missed } };
    case 'wrong':
      return { outcome: result, rating: againWritten ? null : Rating.Again, state: { againWritten: true, missed } };
    case 'miss':
      return { outcome: result, rating: null, state: { againWritten, missed: true } };
    case 'didnt-catch':
      return { outcome: result, rating: null, state: { againWritten, missed } };
    default: {
      const unreachable: never = result;
      throw new Error(`unhandled voice result: ${String(unreachable)}`);
    }
  }
}
