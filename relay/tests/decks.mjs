// Deck builders shared by the relay tests.

export function makeCards(count) {
  return Array.from({ length: count }, (_, i) => ({ front: `Question ${i}`, back: `Answer ${i}` }));
}

export function makeDeck(cards = makeCards(4), extra = {}) {
  return { version: 1, title: 'Sample deck', cards, ...extra };
}

export function deckBody(cards, extra) {
  return JSON.stringify(makeDeck(cards, extra));
}
