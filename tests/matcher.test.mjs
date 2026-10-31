import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { match } from '../relay/lib/matcher.mjs';

// Contract under test:
//   match({ deck, cardId, transcript }) -> 'correct' | 'wrong' | 'miss'
//   deck: array of cards { id, answer, aliases?: string[], reject?: string[] }
//   cardId: id of the card being answered; transcript: non-empty top STT hypothesis.
// An empty transcript is "Didn't catch" (plan D4), outside the matcher, so no case covers it.
//
// The spec leaves precedence open when several rules apply; the matcher uses this fixed order:
//   1. hedge guard ("or"/"and" token absent from every one of this card's answer + aliases) -> wrong
//   2. exact key hit on this card's reject list -> wrong
//   3. exact key hit on a candidate owned by this card (shared ones too) -> correct
//   4. exact key hit on a candidate owned only by other cards -> wrong
//   5. fuzzy rule resolving to a candidate owned by this card -> correct
//   6. fuzzy rule resolving to a candidate owned by another card -> wrong
//   7. anything else -> miss
const cases = JSON.parse(readFileSync(new URL('./fixtures/matcher-golden.json', import.meta.url), 'utf8'));

// Covers: MATCH-001, MATCH-002, MATCH-003, MATCH-004
// Requirement: a spoken answer is graded deterministically against the deck: an exact
// normalized match (article-stripped, accent/case/punctuation-insensitive) to this card's
// answer or alias is correct, a close fuzzy match (>=4 chars, ratio >=0.85, same first 4
// chars, nearest and >=0.1 ahead of other cards, an exact 0.1 margin included) is correct, a
// hit on another card, on this card's reject list, or a hedged "X or Y"/"X and Y" answer
// (an "or"/"and" absent from the card's answer and every alias) is wrong, and anything else
// is a miss.
describe('answer matcher golden cases', () => {
  test('golden file has >=40 cases with unique names and valid outcomes', () => {
    assert.ok(cases.length >= 40, `only ${cases.length} cases`);
    assert.equal(new Set(cases.map((c) => c.name)).size, cases.length);
    for (const c of cases) assert.ok(['correct', 'wrong', 'miss'].includes(c.expected), c.name);
  });

  for (const c of cases) {
    test(`${c.name}: "${c.transcript}" -> ${c.expected}`, () => {
      assert.equal(match({ deck: c.deck, cardId: c.cardId, transcript: c.transcript }), c.expected);
    });
  }
});

// Validation errors must be deliberate, not a crash from touching a bad value mid-grading.
function assertRejects(input, ErrorType) {
  assert.throws(
    () => match(input),
    (err) => {
      assert.ok(err instanceof ErrorType, `expected ${ErrorType.name}, got ${err?.constructor?.name}: ${err?.message}`);
      assert.doesNotMatch(err.message, /Cannot read|is not a function|is not iterable/);
      return true;
    },
  );
}

const okDeck = () => [
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
  test('non-array deck -> TypeError', () => {
    assertRejects({ deck: { aff: { id: 'aff', answer: 'afferent' } }, cardId: 'aff', transcript: 'afferent' }, TypeError);
  });

  test('null card elsewhere in the deck -> TypeError', () => {
    assertRejects({ deck: [...okDeck(), null], cardId: 'aff', transcript: 'afferent' }, TypeError);
  });

  test('card with non-string answer -> TypeError', () => {
    assertRejects({ deck: [...okDeck(), { id: 'n', answer: 42 }], cardId: 'aff', transcript: 'afferent' }, TypeError);
  });

  test('card with non-string id -> TypeError', () => {
    assertRejects({ deck: [...okDeck(), { id: 7, answer: 'seven' }], cardId: 'aff', transcript: 'afferent' }, TypeError);
  });

  test('aliases given as a string instead of an array -> TypeError', () => {
    assertRejects({ deck: [{ id: 'mm', answer: 'Myanmar', aliases: 'Burma' }, okDeck()[1]], cardId: 'mm', transcript: 'Burma' }, TypeError);
  });

  test('aliases array holding a non-string -> TypeError', () => {
    assertRejects({ deck: [{ id: 'mm', answer: 'Myanmar', aliases: ['Burma', 5] }, okDeck()[1]], cardId: 'mm', transcript: 'Burma' }, TypeError);
  });

  test('reject given as a string instead of an array -> TypeError', () => {
    assertRejects({ deck: [{ id: 'aff', answer: 'afferent', reject: 'efferent' }, okDeck()[1]], cardId: 'aff', transcript: 'efferent' }, TypeError);
  });

  test('missing cardId -> TypeError', () => {
    assertRejects({ deck: okDeck(), transcript: 'afferent' }, TypeError);
  });

  test('cardId not in deck -> TypeError', () => {
    assertRejects({ deck: okDeck(), cardId: 'nope', transcript: 'afferent' }, TypeError);
  });

  test('non-string transcript -> TypeError', () => {
    assertRejects({ deck: okDeck(), cardId: 'aff', transcript: 42 }, TypeError);
  });

  test('punctuation-only transcript -> TypeError', () => {
    assertRejects({ deck: okDeck(), cardId: 'aff', transcript: '?!...' }, TypeError);
  });

  test('whitespace-only transcript -> TypeError', () => {
    assertRejects({ deck: okDeck(), cardId: 'aff', transcript: ' \t\n ' }, TypeError);
  });

  test('normalized transcript key of 201 chars -> RangeError', () => {
    assertRejects({ deck: okDeck(), cardId: 'aff', transcript: 'b'.repeat(201) }, RangeError);
  });

  test('normalized transcript key of exactly 200 chars is graded', () => {
    assert.equal(match({ deck: okDeck(), cardId: 'aff', transcript: 'b'.repeat(200) }), 'miss');
  });

  test('limit applies to the normalized key, not the raw transcript', () => {
    assert.equal(match({ deck: okDeck(), cardId: 'aff', transcript: `  ${'b'.repeat(200)}!!!  ` }), 'miss');
  });
});
