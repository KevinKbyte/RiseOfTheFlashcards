// Plan D4: classify one voice attempt and decide its FSRS rating. At most one rating per
// encounter, Easy never emitted. Pure: state is threaded by the caller, never mutated.
import { Rating } from 'ts-fsrs';
import { match, matchKey, type MatchInput, type MatchResult } from './matcher.js';

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

// Empty or punctuation/whitespace-only transcripts are Didn't catch, never a matcher error.
export function classifyTranscript(input: MatchInput): VoiceResult {
  if (typeof input.transcript === 'string' && matchKey(input.transcript) === '') return 'didnt-catch';
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
    default:
      return { outcome: result, rating: null, state: { againWritten, missed } };
  }
}
