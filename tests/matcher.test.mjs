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
//   1. hedge guard ("or"/"and" token absent from this card's answer) -> wrong
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
// chars, nearest and >=0.1 ahead of other cards) is correct, a hit on another card, on this
// card's reject list, or a hedged "X or Y"/"X and Y" answer is wrong, and anything else is
// a miss.
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
