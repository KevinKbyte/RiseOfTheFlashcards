// Deck schema gate (M11, S2): every deck the game loads -- bundled or imported -- passes parseDeck
// first. Deck JSON is an untrusted-input boundary, so parseDeck never throws and copies only
// allowlisted fields. Caps mirror relay/lib/validate.mjs (RELAY-004/RELAY-010).
import type { Card } from './deck.js';

export const MAX_CARDS = 500;
export const MAX_TITLE_CHARS = 120;
export const MAX_FIELD_CHARS = 200;
export const MAX_ALIAS_CHARS = 100;
export const MAX_ALIASES = 10;
export const MAX_ID_CHARS = 64;
/** Every card must be able to show 4 distinct answer orbs. */
export const MIN_DISTINCT_ANSWERS = 4;

export interface DeckCard extends Card {
  aliases?: string[];
}

export interface Deck {
  id: string;
  title: string;
  cards: DeckCard[];
}

export interface DuplicateCopy {
  index: number;
  prompt: string;
  answer: string;
}

export interface DuplicateGroup {
  id: string;
  copies: DuplicateCopy[];
}

// Duplicate ids are still ok:false so callers that only check .ok never load them, but they carry
// the normalized deck so the dedupe UI (deck-dedupe.ts) can resolve them instead of rejecting.
export type ParseResult =
  | { ok: true; deck: Deck }
  | { ok: false; error: string }
  | { ok: false; kind: 'duplicates'; error: string; deck: Deck; groups: DuplicateGroup[] };

class DeckError extends Error {}

const NUMERIC = /^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function text(value: unknown, label: string, cap: number): string {
  if (typeof value !== 'string') throw new DeckError(`${label} must be a string`);
  const out = normalize(value);
  if (out.length === 0) throw new DeckError(`${label} must not be blank`);
  if (out.length > cap) throw new DeckError(`${label} exceeds ${cap} characters`);
  return out;
}

function aliasList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new DeckError(`${label} must be an array of strings`);
  if (value.length > MAX_ALIASES) throw new DeckError(`${label} exceeds ${MAX_ALIASES} entries`);
  return value.map((a, i) => text(a, `${label}[${i}]`, MAX_ALIAS_CHARS));
}

function parseCard(raw: unknown, index: number): DeckCard {
  const label = `card ${index}`;
  if (!isRecord(raw)) throw new DeckError(`${label} must be an object`);
  const answer = text(raw.answer, `${label} answer`, MAX_FIELD_CHARS);
  if (NUMERIC.test(answer)) throw new DeckError(`${label} answer must not be purely numeric`);
  const out: DeckCard = {
    id: text(raw.id, `${label} id`, MAX_ID_CHARS),
    prompt: text(raw.prompt, `${label} prompt`, MAX_FIELD_CHARS),
    answer,
  };
  if (raw.aliases !== undefined) out.aliases = aliasList(raw.aliases, `${label} aliases`);
  return out;
}

function parseCards(raw: unknown): DeckCard[] {
  if (!Array.isArray(raw)) throw new DeckError('cards must be an array');
  if (raw.length === 0) throw new DeckError('deck must have at least one card');
  if (raw.length > MAX_CARDS) throw new DeckError(`deck exceeds ${MAX_CARDS} cards`);
  const cards = raw.map(parseCard);
  // Checked before duplicates: dropping copies never adds distinct answers, so this error wins.
  const answers = new Set(cards.map((c) => c.answer.toLowerCase()));
  if (answers.size < MIN_DISTINCT_ANSWERS) {
    throw new DeckError(`deck needs at least ${MIN_DISTINCT_ANSWERS} distinct answers`);
  }
  return cards;
}

/** Cards sharing a normalized (trimmed, whitespace-collapsed, case-sensitive) id, in first-seen order. */
export function findDuplicateGroups(cards: readonly DeckCard[]): DuplicateGroup[] {
  const byId = new Map<string, DuplicateCopy[]>();
  cards.forEach((card, index) => {
    const id = normalize(card.id);
    const copies = byId.get(id) ?? [];
    copies.push({ index, prompt: card.prompt, answer: card.answer });
    byId.set(id, copies);
  });
  return [...byId].filter(([, copies]) => copies.length > 1).map(([id, copies]) => ({ id, copies }));
}

export function parseDeck(input: unknown): ParseResult {
  try {
    if (!isRecord(input)) throw new DeckError('deck must be an object');
    const deck: Deck = {
      id: text(input.id, 'deck id', MAX_ID_CHARS),
      title: text(input.title, 'deck title', MAX_TITLE_CHARS),
      cards: parseCards(input.cards),
    };
    const groups = findDuplicateGroups(deck.cards);
    if (groups.length > 0) {
      const error = `duplicate card id ${groups.map((g) => `"${g.id}"`).join(', ')}`;
      return { ok: false, kind: 'duplicates', error, deck, groups };
    }
    return { ok: true, deck };
  } catch (err) {
    // Non-DeckError only from hostile objects (throwing getters); the contract is still "never throws".
    return { ok: false, error: err instanceof DeckError ? err.message : 'deck is malformed' };
  }
}
