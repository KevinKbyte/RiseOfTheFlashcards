// Requirement: invisible Unicode format characters (\p{Cf}: zero-width space U+200B, soft hyphen
// U+00AD, zero-width joiner U+200D, BOM U+FEFF) never change a grade. normalize() drops them, so
// an answer pasted with a soft hyphen or a transcript carrying a zero-width space still matches
// the plain answer, and an input made only of them normalizes to nothing.
import { describe, expect, it } from 'vitest';
import { match, normalize, type MatchCard } from '../src/flashcards/matcher.js';

const deck: MatchCard[] = [
  { id: 'fr', answer: 'Paris' },
  { id: 'it', answer: 'Ro\u00adme' },
  { id: 'jp', answer: 'Tokyo' },
];

// Covers: NORM-001
describe('normalize drops Unicode format characters', () => {
  it('removes zero-width space, soft hyphen, zero-width joiner and BOM', () => {
    expect(normalize('Par\u200bis')).toBe('paris');
    expect(normalize('Bras\u00adilia')).toBe('brasilia');
    expect(normalize('To\u200dkyo\ufeff')).toBe('tokyo');
  });

  it('input of only format characters normalizes to empty', () => {
    expect(normalize('\u200b\u00ad\ufeff')).toBe('');
  });
});

// Covers: MATCH-001
describe('match ignores Unicode format characters', () => {
  it('transcript with a zero-width space grades correct', () => {
    expect(match({ deck, cardId: 'fr', transcript: 'Par\u200bis' })).toBe('correct');
  });

  it('answer containing a soft hyphen matches the plain spoken answer', () => {
    expect(match({ deck, cardId: 'it', transcript: 'Rome' })).toBe('correct');
  });
});
