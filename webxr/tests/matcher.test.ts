// Port of meta-vr-start-dev-2026/game relay/tests/normalize.test.mjs + tests/matcher.test.mjs.
// Fixtures tests/fixtures/matcher/{normalize,matcher-golden}.json are verbatim copies of the
// game repo's tests/fixtures/*.json -- the shared contract; never edit one side only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { match, normalize, type MatchCard, type MatchResult } from '../src/flashcards/matcher';

interface NormCase {
  input: string;
  expected: string;
}
interface GoldenCase {
  name: string;
  deck: MatchCard[];
  cardId: string;
  transcript: string;
  expected: MatchResult;
}

const readFixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/matcher/${name}`, import.meta.url), 'utf8')) as T;

const normCases = readFixture<NormCase[]>('normalize.json');
const goldenCases = readFixture<GoldenCase[]>('matcher-golden.json');

// Covers: NORM-001
// Requirement: answer text is normalized identically on the relay and on the device
// (NFKD, drop combining marks, lowercase, punctuation -> space, collapse whitespace,
// trim), with the shared normalize.json fixture as the single contract.
describe('normalize (shared fixture contract)', () => {
  it('fixture holds at least 20 well-formed cases', () => {
    expect(Array.isArray(normCases)).toBe(true);
    expect(normCases.length).toBeGreaterThanOrEqual(20);
    for (const c of normCases) {
      expect(typeof c.input).toBe('string');
      expect(typeof c.expected).toBe('string');
    }
  });

  it.each(normCases.map((c, i) => [i + 1, c] as const))('case %i: %j', (_i, c) => {
    expect(normalize(c.input)).toBe(c.expected);
  });

  it('is idempotent over every fixture input', () => {
    for (const c of normCases) {
      const once = normalize(c.input);
      expect(normalize(once)).toBe(once);
    }
  });
});

// Covers: MATCH-001, MATCH-002, MATCH-003, MATCH-004
// Requirement: a spoken answer is graded deterministically against the deck: an exact
// normalized match (article-stripped, accent/case/punctuation-insensitive) to this card's
// answer or alias is correct, a close fuzzy match (>=4 chars, ratio >=0.85, same first 4
// chars, nearest and >=0.1 ahead of other cards, an exact 0.1 margin included) is correct, a
// hit on another card, on this card's reject list, or a hedged "X or Y"/"X and Y" answer
// (an "or"/"and" absent from the card's answer and every alias) is wrong, and anything else
// is a miss. Precedence: hedge, reject, exact own, exact other, fuzzy own, fuzzy other, miss.
describe('answer matcher golden cases', () => {
  it('golden file has >=40 cases with unique names and valid outcomes', () => {
    expect(goldenCases.length).toBeGreaterThanOrEqual(40);
    expect(new Set(goldenCases.map((c) => c.name)).size).toBe(goldenCases.length);
    for (const c of goldenCases) expect(['correct', 'wrong', 'miss']).toContain(c.expected);
  });

  it.each(goldenCases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(match({ deck: c.deck, cardId: c.cardId, transcript: c.transcript })).toBe(c.expected);
  });
});

// Validation errors must be deliberate, not a crash from touching a bad value mid-grading.
function expectRejects(input: unknown, ErrorType: typeof TypeError | typeof RangeError): void {
  let caught: unknown;
  try {
    match(input as Parameters<typeof match>[0]);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ErrorType);
  expect((caught as Error).message).not.toMatch(/Cannot read|is not a function|is not iterable/);
}

const okDeck = (): MatchCard[] => [
  { id: 'aff', answer: 'afferent', aliases: ['sensory'] },
  { id: 'mito', answer: 'mitochondria' },
];

// Covers: MATCH-005
// Requirement: match() refuses malformed input up front instead of guessing a grade -- a
// TypeError for a non-array deck, a malformed card anywhere in the deck (not an object with
// string id and answer, or aliases/reject that are not string arrays), an unknown cardId, a
// non-string transcript, or a transcript that normalizes to nothing (punctuation/whitespace
// only; the caller shows Didn't catch); a RangeError when the normalized transcript key is
// longer than 200 chars, while exactly 200 is graded normally.
describe('answer matcher input limits', () => {
  it('non-array deck -> TypeError', () => {
    expectRejects({ deck: { aff: { id: 'aff', answer: 'afferent' } }, cardId: 'aff', transcript: 'afferent' }, TypeError);
  });

  it('null card elsewhere in the deck -> TypeError', () => {
    expectRejects({ deck: [...okDeck(), null], cardId: 'aff', transcript: 'afferent' }, TypeError);
  });

  it('card with non-string answer -> TypeError', () => {
    expectRejects({ deck: [...okDeck(), { id: 'n', answer: 42 }], cardId: 'aff', transcript: 'afferent' }, TypeError);
  });

  it('card with non-string id -> TypeError', () => {
    expectRejects({ deck: [...okDeck(), { id: 7, answer: 'seven' }], cardId: 'aff', transcript: 'afferent' }, TypeError);
  });

  it('aliases given as a string instead of an array -> TypeError', () => {
    expectRejects({ deck: [{ id: 'mm', answer: 'Myanmar', aliases: 'Burma' }, okDeck()[1]], cardId: 'mm', transcript: 'Burma' }, TypeError);
  });

  it('aliases array holding a non-string -> TypeError', () => {
    expectRejects({ deck: [{ id: 'mm', answer: 'Myanmar', aliases: ['Burma', 5] }, okDeck()[1]], cardId: 'mm', transcript: 'Burma' }, TypeError);
  });

  it('reject given as a string instead of an array -> TypeError', () => {
    expectRejects({ deck: [{ id: 'aff', answer: 'afferent', reject: 'efferent' }, okDeck()[1]], cardId: 'aff', transcript: 'efferent' }, TypeError);
  });

  it('aliases: null (present but not an array) -> TypeError', () => {
    expectRejects({ deck: [{ id: 'mm', answer: 'Myanmar', aliases: null }, okDeck()[1]], cardId: 'mm', transcript: 'Myanmar' }, TypeError);
  });

  it('reject: null (present but not an array) -> TypeError', () => {
    expectRejects({ deck: [{ id: 'aff', answer: 'afferent', reject: null }, okDeck()[1]], cardId: 'aff', transcript: 'afferent' }, TypeError);
  });

  it('missing cardId -> TypeError', () => {
    expectRejects({ deck: okDeck(), transcript: 'afferent' }, TypeError);
  });

  it('cardId not in deck -> TypeError', () => {
    expectRejects({ deck: okDeck(), cardId: 'nope', transcript: 'afferent' }, TypeError);
  });

  it('non-string transcript -> TypeError', () => {
    expectRejects({ deck: okDeck(), cardId: 'aff', transcript: 42 }, TypeError);
  });

  it('punctuation-only transcript -> TypeError', () => {
    expectRejects({ deck: okDeck(), cardId: 'aff', transcript: '?!...' }, TypeError);
  });

  it('whitespace-only transcript -> TypeError', () => {
    expectRejects({ deck: okDeck(), cardId: 'aff', transcript: ' \t\n ' }, TypeError);
  });

  it('normalized transcript key of 201 chars -> RangeError', () => {
    expectRejects({ deck: okDeck(), cardId: 'aff', transcript: 'b'.repeat(201) }, RangeError);
  });

  it('normalized transcript key of exactly 200 chars is graded', () => {
    expect(match({ deck: okDeck(), cardId: 'aff', transcript: 'b'.repeat(200) })).toBe('miss');
  });

  it('limit applies to the normalized key, not the raw transcript', () => {
    expect(match({ deck: okDeck(), cardId: 'aff', transcript: `  ${'b'.repeat(200)}!!!  ` })).toBe('miss');
  });
});
