// Requirement: the game ships bundled starter decks so a player (or judge) can play with no import
// (M11, A8). There are at least 2 (scope-ladder floor; A10 topics: Opposites, World Capitals, Basic
// Science). Every starter deck passes parseDeck unchanged (already normalized), deck ids and card ids
// are unique across all bundled decks (card ids key per-card progress), each deck has >= 10 cards
// with unique prompts, and every card can be shown with a full set of 4 distinct answer orbs.
// No spec-cache ID exists for starter decks yet; plan IDs M11 and A10 are cited instead.
import { describe, expect, it } from 'vitest';
import { createDeck, pickOrbs } from '../src/flashcards/deck.js';
import { parseDeck } from '../src/flashcards/deck-schema.js';
import { STARTER_DECKS } from '../src/flashcards/starter-decks.js';

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

const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// Covers: M11, A10
describe('STARTER_DECKS', () => {
  it('bundles at least 2 decks', () => {
    expect(STARTER_DECKS.length).toBeGreaterThanOrEqual(2);
  });

  it('has unique deck ids', () => {
    const ids = STARTER_DECKS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has card ids unique across all bundled decks', () => {
    const ids = STARTER_DECKS.flatMap((d) => d.cards.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every deck passes the schema unchanged (authored already normalized)', () => {
    for (const deck of STARTER_DECKS) {
      const result = parseDeck(deck);
      if (!result.ok) throw new Error(`${deck.id}: ${result.error}`);
      expect(result.deck).toEqual(deck);
    }
  });

  it('every deck has at least 10 cards with unique prompts', () => {
    for (const deck of STARTER_DECKS) {
      expect(deck.cards.length, deck.id).toBeGreaterThanOrEqual(10);
      const prompts = deck.cards.map((c) => key(c.prompt));
      expect(new Set(prompts).size, deck.id).toBe(prompts.length);
    }
  });

  it('every card gets 4 distinct answer orbs including its own answer', () => {
    const rng = seeded(7);
    for (const deck of STARTER_DECKS) {
      for (const card of deck.cards) {
        const labels = pickOrbs(card, deck.cards, rng).map((o) => o.label);
        expect(labels, `${deck.id}/${card.id}`).toHaveLength(4);
        expect(new Set(labels.map(key)).size, `${deck.id}/${card.id}`).toBe(4);
        expect(labels).toContain(card.answer);
      }
    }
  });

  it('every deck starts a playable round', () => {
    for (const deck of STARTER_DECKS) {
      const state = createDeck(deck.cards, seeded(1));
      expect(state.finished, deck.id).toBe(false);
      expect(state.current, deck.id).not.toBeNull();
      expect(state.orbs, deck.id).toHaveLength(4);
    }
  });
});
