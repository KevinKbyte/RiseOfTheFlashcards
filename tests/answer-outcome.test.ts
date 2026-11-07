import { Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import {
  answerOutcome,
  classifyTranscript,
  type AnswerOutcome,
  type AnswerState,
  type VoiceResult,
} from '../src/flashcards/answer-outcome';
import type { MatchCard } from '../src/flashcards/matcher';

const deck: MatchCard[] = [
  { id: 'aff', answer: 'afferent', reject: ['efferent'] },
  { id: 'mito', answer: 'mitochondria' },
  { id: 'ion', answer: 'ion channel' },
  { id: 'syn', answer: 'synapse' },
];

const FRESH: AnswerState = Object.freeze({ againWritten: false, missed: false });

// Feeds a voice-attempt sequence through answerOutcome, threading state.
function run(results: VoiceResult[], start: AnswerState = FRESH): AnswerOutcome[] {
  const out: AnswerOutcome[] = [];
  let state = start;
  for (const r of results) {
    const o = answerOutcome(r, state);
    out.push(o);
    state = o.state;
  }
  return out;
}
const ratings = (results: VoiceResult[]) => run(results).map((o) => o.rating);

// Covers: MATCH-004, MATCH-005
// Requirement: a voice attempt is classified for the plan's D4 table: an empty transcript or
// one with no matchable characters (whitespace/punctuation only) is Didn't catch, never a
// matcher outcome and never an error; any other transcript gets the matcher's verdict
// (correct, wrong or miss) for that card.
describe('classifyTranscript (D4 Didn\'t catch vs matcher verdict)', () => {
  it.each(['', '   ', ' \t\n ', '?!...'])('%j -> didnt-catch', (transcript) => {
    expect(classifyTranscript({ deck, cardId: 'aff', transcript })).toBe('didnt-catch');
  });

  it('exact own answer -> correct', () => {
    expect(classifyTranscript({ deck, cardId: 'aff', transcript: 'Afferent!' })).toBe('correct');
  });

  it('another card\'s answer -> wrong', () => {
    expect(classifyTranscript({ deck, cardId: 'aff', transcript: 'synapse' })).toBe('wrong');
  });

  it('reject-list near miss -> wrong', () => {
    expect(classifyTranscript({ deck, cardId: 'aff', transcript: 'efferent' })).toBe('wrong');
  });

  it('unrelated non-empty answer -> miss', () => {
    expect(classifyTranscript({ deck, cardId: 'aff', transcript: 'banana' })).toBe('miss');
  });
});

// Covers: D4
// Requirement: per the plan's D4 answer-outcome table, each voice attempt in an encounter
// yields its outcome and at most one FSRS rating (Easy never emitted): a correct answer rates
// Good if it is the first scored attempt with only Didn't catch before it, Hard after any
// miss, and nothing if Again was already written; a wrong answer rates Again (written at once)
// if it is the first scored attempt, else nothing; a miss and a Didn't catch rate nothing, but
// a miss caps a later correct at Hard. The caller's state is never mutated.
describe('answerOutcome (D4 outcome + FSRS rating)', () => {
  it('fresh correct -> outcome correct, rating Good', () => {
    const o = answerOutcome('correct', FRESH);
    expect(o.outcome).toBe('correct');
    expect(o.rating).toBe(Rating.Good);
  });

  it('fresh wrong -> outcome wrong, rating Again, marks Again written', () => {
    const o = answerOutcome('wrong', FRESH);
    expect(o.outcome).toBe('wrong');
    expect(o.rating).toBe(Rating.Again);
    expect(o.state.againWritten).toBe(true);
  });

  it('fresh miss -> outcome miss, no rating, marks missed', () => {
    const o = answerOutcome('miss', FRESH);
    expect(o.outcome).toBe('miss');
    expect(o.rating).toBeNull();
    expect(o.state.missed).toBe(true);
  });

  it('fresh didnt-catch -> no rating, state unchanged', () => {
    const o = answerOutcome('didnt-catch', FRESH);
    expect(o.outcome).toBe('didnt-catch');
    expect(o.rating).toBeNull();
    expect(o.state).toEqual(FRESH);
  });

  it('didnt-catch then correct -> Good (Didn\'t catch does not cap)', () => {
    expect(ratings(['didnt-catch', 'didnt-catch', 'correct'])).toEqual([null, null, Rating.Good]);
  });

  it('miss then correct -> Hard', () => {
    expect(ratings(['miss', 'correct'])).toEqual([null, Rating.Hard]);
  });

  it('miss, didnt-catch, then correct -> Hard', () => {
    expect(ratings(['miss', 'didnt-catch', 'correct'])).toEqual([null, null, Rating.Hard]);
  });

  it('miss then wrong -> Again (still the first scored attempt)', () => {
    expect(ratings(['miss', 'wrong'])).toEqual([null, Rating.Again]);
  });

  it('wrong then wrong -> Again once, then nothing', () => {
    expect(ratings(['wrong', 'wrong'])).toEqual([Rating.Again, null]);
  });

  it('wrong then correct -> no second rating (Again already written)', () => {
    expect(ratings(['wrong', 'correct'])).toEqual([Rating.Again, null]);
  });

  it('miss, wrong, correct -> only the Again write', () => {
    expect(ratings(['miss', 'wrong', 'correct'])).toEqual([null, Rating.Again, null]);
  });

  it('never emits Easy and writes at most one rating per encounter', () => {
    const seqs: VoiceResult[][] = [
      ['correct'],
      ['wrong', 'miss', 'wrong', 'correct'],
      ['miss', 'miss', 'didnt-catch', 'correct'],
      ['didnt-catch', 'wrong', 'didnt-catch', 'correct'],
    ];
    for (const s of seqs) {
      const rs = ratings(s);
      expect(rs).not.toContain(Rating.Easy);
      expect(rs.filter((r) => r !== null).length).toBe(1);
    }
  });

  it('does not mutate the passed-in state', () => {
    const state: AnswerState = { againWritten: false, missed: false };
    answerOutcome('wrong', state);
    answerOutcome('miss', state);
    expect(state).toEqual({ againWritten: false, missed: false });
  });
});
