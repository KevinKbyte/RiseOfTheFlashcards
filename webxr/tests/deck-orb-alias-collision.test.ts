// Requirement: exactly one answer orb is right. A distractor orb is never a label the matcher
// would accept for the current card -- not another card's answer that equals one of this card's
// aliases ("Kiev" when the card is Kyiv / alias Kiev), and not another card's answer that only
// differs from this card's answer by case/accents/punctuation. Otherwise saying the distractor
// grades correct and two orbs are both right. The card still gets 4 orbs when the pool allows.
import { describe, expect, it } from 'vitest';
import { pickOrbs } from '../src/flashcards/deck.js';
import type { DeckCard } from '../src/flashcards/deck-schema.js';
import { match } from '../src/flashcards/matcher.js';

function seeded(seed: number): () => number {
  // mulberry32: deterministic [0, 1) stream
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const others: DeckCard[] = [
  { id: 'fr', prompt: 'Capital of France?', answer: 'Paris' },
  { id: 'it', prompt: 'Capital of Italy?', answer: 'Rome' },
  { id: 'jp', prompt: 'Capital of Japan?', answer: 'Tokyo' },
  { id: 'eg', prompt: 'Capital of Egypt?', answer: 'Cairo' },
];

function acceptedDistractors(card: DeckCard, deck: DeckCard[]): string[] {
  const hits: string[] = [];
  for (let seed = 1; seed <= 30; seed++) {
    const orbs = pickOrbs(card, deck, seeded(seed));
    expect(orbs, `seed ${seed}`).toHaveLength(4);
    for (const { label } of orbs) {
      if (label === card.answer) continue;
      if (match({ deck, cardId: card.id, transcript: label }) === 'correct') hits.push(label);
    }
  }
  return [...new Set(hits)];
}

// Covers: CARDS-002
describe('pickOrbs / distractors the matcher would accept', () => {
  it('never offers another card\'s answer that equals this card\'s alias', () => {
    const kyiv: DeckCard = { id: 'ua', prompt: 'Capital of Ukraine?', answer: 'Kyiv', aliases: ['Kiev'] };
    const kiev: DeckCard = { id: 'kv', prompt: 'Old spelling of the Ukrainian capital?', answer: 'Kiev' };
    expect(acceptedDistractors(kyiv, [kyiv, kiev, ...others])).toEqual([]);
  });

  it('never offers another card\'s answer that differs from this answer only by case or accent', () => {
    const br: DeckCard = { id: 'br', prompt: 'Capital of Brazil?', answer: 'Brasilia' };
    const brAccent: DeckCard = { id: 'br2', prompt: 'Brazil\'s capital city?', answer: 'Bras\u00edlia' };
    expect(acceptedDistractors(br, [br, brAccent, ...others])).toEqual([]);
  });
});
