// RELAY-004: server-side deck validation. Error strings never echo deck content.
import { normalize } from './normalize.mjs';

export const MAX_BODY_BYTES = 200 * 1024;
export const MAX_CARDS = 500;
export const MIN_DISTINCT_BACKS = 4;
const RICH_TEXT_TAG = /<\/?[A-Za-z][^>]*>/;

const reject = (status, error) => ({ ok: false, status, error });

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// Returns an error message for the card, or null when it is well-formed.
function cardError(card, index) {
  const where = `card ${index + 1}`;
  if (!isPlainObject(card)) return `${where} must be an object`;
  if (!isNonBlankString(card.front)) return `${where}: front must be a non-empty string`;
  if (!isNonBlankString(card.back)) return `${where}: back must be a non-empty string`;
  for (const field of ['aliases', 'reject']) {
    if (card[field] !== undefined && !isStringList(card[field])) {
      return `${where}: ${field} must be a list of strings`;
    }
  }
  const strings = [card.front, card.back, ...(card.aliases ?? []), ...(card.reject ?? [])];
  if (strings.some((s) => RICH_TEXT_TAG.test(s))) return `${where} contains a rich-text tag`;
  return null;
}

export function validateDeck(body) {
  if (typeof body !== 'string') return reject(400, 'body must be text');
  // Size is checked before parsing so oversized input never reaches JSON.parse.
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return reject(413, `body exceeds ${MAX_BODY_BYTES} bytes`);
  }

  let deck;
  try {
    deck = JSON.parse(body);
  } catch {
    return reject(400, 'body is not valid JSON');
  }

  if (!isPlainObject(deck)) return reject(400, 'deck must be a JSON object');
  if (deck.version !== 1) return reject(400, 'version must be 1');
  if (typeof deck.title !== 'string') return reject(400, 'title must be a string');
  if (RICH_TEXT_TAG.test(deck.title)) return reject(400, 'title contains a rich-text tag');
  if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
    return reject(400, 'cards must be a non-empty list');
  }
  if (deck.cards.length > MAX_CARDS) return reject(400, `at most ${MAX_CARDS} cards allowed`);

  for (const [index, card] of deck.cards.entries()) {
    const error = cardError(card, index);
    if (error) return reject(400, error);
  }

  const distinctBacks = new Set(deck.cards.map((card) => normalize(card.back)));
  if (distinctBacks.size < MIN_DISTINCT_BACKS) {
    return reject(400, `at least ${MIN_DISTINCT_BACKS} distinct answers required`);
  }

  return { ok: true, deck };
}
