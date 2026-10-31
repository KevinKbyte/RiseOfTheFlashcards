// Requirement: the VR flashcard prototype presents capital-city cards one at a time with 4 answer
// orbs (1 correct + 3 distractors taken from OTHER cards' answers, no duplicates, shuffled
// deterministically by an injected rng). Picking the correct orb clears the card and presents the
// next; picking a wrong orb removes only that orb and keeps the same card. Small decks get as many
// orbs as answers exist; an empty or fully-cleared deck is finished. All functions are pure.
// CARDS-* IDs are prototype-local (no spec-cache home yet).
import { describe, expect, it } from 'vitest';
import {
  CAPITALS,
  chooseAnswer,
  createDeck,
  pickOrbs,
  type Card,
  type DeckState,
} from '../src/flashcards/deck.js';

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

const labels = (s: DeckState) => s.orbs.map((o) => o.label);
const correctOrb = (s: DeckState) => s.orbs.find((o) => o.label === s.current!.answer)!;
const wrongOrb = (s: DeckState) => s.orbs.find((o) => o.label !== s.current!.answer)!;

function clearCurrent(s: DeckState, rng: () => number): DeckState {
  return chooseAnswer(s, correctOrb(s).id, rng).state;
}

// Covers: CARDS-001
describe('createDeck / deck draw', () => {
  it('CAPITALS fixture has 10 cards with unique ids and unique answers', () => {
    expect(CAPITALS).toHaveLength(10);
    expect(new Set(CAPITALS.map((c) => c.id)).size).toBe(10);
    expect(new Set(CAPITALS.map((c) => c.answer)).size).toBe(10);
    for (const c of CAPITALS) {
      expect(c.prompt.length).toBeGreaterThan(0);
      expect(c.answer.length).toBeGreaterThan(0);
    }
  });

  it('presents one card from the deck with all cards still remaining', () => {
    const s = createDeck(CAPITALS, seeded(1));
    expect(s.finished).toBe(false);
    expect(s.current).not.toBeNull();
    expect(CAPITALS.map((c) => c.id)).toContain(s.current!.id);
    expect(s.remaining).toHaveLength(10);
    expect(s.remaining.map((c) => c.id)).toContain(s.current!.id);
  });

  it('empty deck is finished immediately with no card and no orbs', () => {
    const s = createDeck([], seeded(1));
    expect(s.finished).toBe(true);
    expect(s.current).toBeNull();
    expect(s.orbs).toEqual([]);
    expect(s.remaining).toEqual([]);
  });

  it('presents every card exactly once before finishing', () => {
    const rng = seeded(7);
    let s = createDeck(CAPITALS, rng);
    const seen: string[] = [];
    while (!s.finished) {
      seen.push(s.current!.id);
      s = clearCurrent(s, rng);
    }
    expect(seen).toHaveLength(10);
    expect(new Set(seen)).toEqual(new Set(CAPITALS.map((c) => c.id)));
  });

  it('draw order is deterministic for the same seed', () => {
    const run = (seed: number) => {
      const rng = seeded(seed);
      let s = createDeck(CAPITALS, rng);
      const order: string[] = [];
      while (!s.finished) {
        order.push(s.current!.id);
        s = clearCurrent(s, rng);
      }
      return order;
    };
    expect(run(42)).toEqual(run(42));
  });

  it('does not mutate the input cards array', () => {
    const cards = CAPITALS.map((c) => ({ ...c }));
    const snapshot = cards.map((c) => ({ ...c }));
    createDeck(cards, seeded(3));
    expect(cards).toEqual(snapshot);
  });
});

// Covers: CARDS-002
describe('pickOrbs / distractor pick', () => {
  it('returns exactly 4 orbs: the correct answer once plus 3 other cards\' answers', () => {
    const card = CAPITALS[0];
    const orbs = pickOrbs(card, CAPITALS, seeded(1));
    expect(orbs).toHaveLength(4);
    const ls = orbs.map((o) => o.label);
    expect(ls.filter((l) => l === card.answer)).toHaveLength(1);
    const otherAnswers = CAPITALS.filter((c) => c.id !== card.id).map((c) => c.answer);
    for (const l of ls.filter((l) => l !== card.answer)) expect(otherAnswers).toContain(l);
  });

  it('has no duplicate labels and unique orb ids', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const orbs = pickOrbs(CAPITALS[seed % 10], CAPITALS, seeded(seed));
      expect(new Set(orbs.map((o) => o.label)).size).toBe(orbs.length);
      expect(new Set(orbs.map((o) => o.id)).size).toBe(orbs.length);
    }
  });

  it('never repeats a distractor even when two other cards share an answer', () => {
    const cards: Card[] = [
      { id: 'a', prompt: 'A?', answer: 'X' },
      { id: 'b', prompt: 'B?', answer: 'Y' },
      { id: 'c', prompt: 'C?', answer: 'Y' },
      { id: 'd', prompt: 'D?', answer: 'Z' },
    ];
    const orbs = pickOrbs(cards[0], cards, seeded(5));
    const ls = orbs.map((o) => o.label);
    expect(new Set(ls).size).toBe(ls.length);
    expect(ls.sort()).toEqual(['X', 'Y', 'Z']);
  });

  it('is deterministic for the same seed', () => {
    const a = pickOrbs(CAPITALS[3], CAPITALS, seeded(99));
    const b = pickOrbs(CAPITALS[3], CAPITALS, seeded(99));
    expect(a).toEqual(b);
  });

  it('shuffles: the correct orb is not always in the same slot across seeds', () => {
    const slots = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const orbs = pickOrbs(CAPITALS[0], CAPITALS, seeded(seed));
      slots.add(orbs.findIndex((o) => o.label === CAPITALS[0].answer));
    }
    expect(slots.size).toBeGreaterThan(1);
  });

  it('uses as many distractors as available when the deck has fewer than 4 cards', () => {
    const two = CAPITALS.slice(0, 2);
    expect(pickOrbs(two[0], two, seeded(1)).map((o) => o.label).sort()).toEqual(
      [two[0].answer, two[1].answer].sort(),
    );
    const one = CAPITALS.slice(0, 1);
    expect(pickOrbs(one[0], one, seeded(1)).map((o) => o.label)).toEqual([one[0].answer]);
  });

  it('createDeck presents the current card with its 4 orbs', () => {
    const s = createDeck(CAPITALS, seeded(11));
    expect(s.orbs).toHaveLength(4);
    expect(labels(s).filter((l) => l === s.current!.answer)).toHaveLength(1);
  });

  it('the last card of a 10-card deck still gets 4 orbs (distractors from cleared cards)', () => {
    const rng = seeded(13);
    let s = createDeck(CAPITALS, rng);
    for (let i = 0; i < 9; i++) s = clearCurrent(s, rng);
    expect(s.remaining).toHaveLength(1);
    expect(s.orbs).toHaveLength(4);
    expect(labels(s)).toContain(s.current!.answer);
  });
});

// Covers: CARDS-003
describe('chooseAnswer / answer outcome', () => {
  it('correct choice removes the card and presents a different next card with fresh orbs', () => {
    const rng = seeded(21);
    const s0 = createDeck(CAPITALS, rng);
    const { state: s1, outcome } = chooseAnswer(s0, correctOrb(s0).id, rng);
    expect(outcome).toBe('correct');
    expect(s1.remaining).toHaveLength(9);
    expect(s1.remaining.map((c) => c.id)).not.toContain(s0.current!.id);
    expect(s1.current!.id).not.toBe(s0.current!.id);
    expect(s1.orbs).toHaveLength(4);
    expect(labels(s1)).toContain(s1.current!.answer);
  });

  it('wrong choice removes only that orb; same card stays; correct orb is kept', () => {
    const rng = seeded(22);
    const s0 = createDeck(CAPITALS, rng);
    const wrong = wrongOrb(s0);
    const { state: s1, outcome } = chooseAnswer(s0, wrong.id, rng);
    expect(outcome).toBe('wrong');
    expect(s1.current).toEqual(s0.current);
    expect(s1.remaining).toHaveLength(10);
    expect(s1.orbs.map((o) => o.id)).toEqual(s0.orbs.filter((o) => o.id !== wrong.id).map((o) => o.id));
    expect(labels(s1)).toContain(s0.current!.answer);
  });

  it('after all 3 wrong orbs are picked only the correct orb remains, and it advances', () => {
    const rng = seeded(23);
    let s = createDeck(CAPITALS, rng);
    const first = s.current!.id;
    for (let i = 0; i < 3; i++) s = chooseAnswer(s, wrongOrb(s).id, rng).state;
    expect(s.orbs).toHaveLength(1);
    expect(s.orbs[0].label).toBe(s.current!.answer);
    s = clearCurrent(s, rng);
    expect(s.current!.id).not.toBe(first);
    expect(s.remaining).toHaveLength(9);
  });

  it('clearing all 10 cards finishes the deck with no card and no orbs', () => {
    const rng = seeded(24);
    let s = createDeck(CAPITALS, rng);
    for (let i = 0; i < 10; i++) {
      expect(s.finished).toBe(false);
      s = clearCurrent(s, rng);
    }
    expect(s.finished).toBe(true);
    expect(s.current).toBeNull();
    expect(s.orbs).toEqual([]);
    expect(s.remaining).toEqual([]);
  });

  it('an unknown orb id is ignored and leaves the state unchanged', () => {
    const rng = seeded(25);
    const s0 = createDeck(CAPITALS, rng);
    const { state, outcome } = chooseAnswer(s0, 'no-such-orb', rng);
    expect(outcome).toBe('ignored');
    expect(state).toEqual(s0);
  });

  it('choosing on a finished deck is ignored', () => {
    const s0 = createDeck([], seeded(1));
    const { state, outcome } = chooseAnswer(s0, 'anything', seeded(1));
    expect(outcome).toBe('ignored');
    expect(state.finished).toBe(true);
  });

  it('does not mutate the input state', () => {
    const rng = seeded(26);
    const s0 = createDeck(CAPITALS, rng);
    const before = JSON.parse(JSON.stringify(s0));
    chooseAnswer(s0, wrongOrb(s0).id, rng);
    chooseAnswer(s0, correctOrb(s0).id, rng);
    expect(JSON.parse(JSON.stringify(s0))).toEqual(before);
  });
});
