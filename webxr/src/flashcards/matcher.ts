// TypeScript port of meta-vr-start-dev-2026/game relay/lib/{normalize,matcher}.mjs. The shared
// fixtures in tests/fixtures/matcher/ are the contract; change both sides together.
// MATCH-001..005: precedence when several rules apply is fixed by MATCH-003
// (hedge, reject, exact own, exact other, fuzzy own, fuzzy other, miss).

export interface MatchCard {
  id: string;
  answer: string;
  aliases?: string[];
  reject?: string[];
}

export type MatchResult = 'correct' | 'wrong' | 'miss';

export interface MatchInput {
  deck: MatchCard[];
  cardId: string;
  transcript: string;
}

const FUZZY_MIN_CHARS = 4;
const FUZZY_MIN_RATIO = 0.85;
const FUZZY_MIN_MARGIN = 0.1;
// Float subtraction (0.95 - 0.85 = 0.0999...) must not fail an exact 0.1 margin (MATCH-002).
const MARGIN_EPSILON = 1e-9;
// Below this length ratio a candidate cannot reach FUZZY_MIN_RATIO, so levenshtein is skipped.
const MIN_LENGTH_RATIO = 0.75;
export const MAX_KEY_CHARS = 200;
const HEDGE_TOKENS = new Set(['or', 'and']);

// NORM-001: NFKD, drop combining marks and invisible format chars (ZWSP, soft hyphen, BOM),
// lowercase, punctuation -> space, collapse, trim.
export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase()
    .replace(/\p{P}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

// NORM-001 plus one leading article, kept when nothing would remain ("the A" -> "a").
export function matchKey(s: string): string {
  const n = normalize(s);
  const m = n.match(/^(?:a|an|the) (.+)$/u);
  return m ? m[1] : n;
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

const ratio = (a: string, b: string): number => 1 - levenshtein(a, b) / Math.max(a.length, b.length);

function fuzzyHit(t: string, candidate: string | null, score: number, rivalScore: number): boolean {
  return (
    candidate !== null &&
    t.length >= FUZZY_MIN_CHARS &&
    candidate.length >= FUZZY_MIN_CHARS &&
    score >= FUZZY_MIN_RATIO &&
    t.slice(0, FUZZY_MIN_CHARS) === candidate.slice(0, FUZZY_MIN_CHARS) &&
    score - rivalScore >= FUZZY_MIN_MARGIN - MARGIN_EPSILON
  );
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');

function validateCard(c: unknown): asserts c is MatchCard {
  if (c === null || typeof c !== 'object') throw new TypeError('each card must be an object');
  const r = c as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.answer !== 'string') {
    throw new TypeError('each card needs a string id and string answer');
  }
  if (r.aliases !== undefined && !isStringArray(r.aliases)) throw new TypeError('aliases must be an array of strings');
  if (r.reject !== undefined && !isStringArray(r.reject)) throw new TypeError('reject must be an array of strings');
}

function validate(input: unknown): { deck: MatchCard[]; card: MatchCard; t: string } {
  const { deck, cardId, transcript } = (input ?? {}) as Partial<Record<keyof MatchInput, unknown>>;
  if (!Array.isArray(deck)) throw new TypeError('deck must be an array');
  deck.forEach(validateCard);
  const cards = deck as MatchCard[];
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw new TypeError('cardId not found in deck');
  if (typeof transcript !== 'string') throw new TypeError('transcript must be a string');
  const t = matchKey(transcript);
  if (t === '') throw new TypeError('transcript has no matchable characters');
  if (t.length > MAX_KEY_CHARS) throw new RangeError(`transcript key exceeds ${MAX_KEY_CHARS} chars`);
  return { deck: cards, card, t };
}

// Candidate key -> ids of every card owning it as answer or alias.
function ownersByKey(deck: MatchCard[]): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const c of deck) {
    for (const s of [c.answer, ...(c.aliases ?? [])]) {
      const k = matchKey(s);
      let ids = owners.get(k);
      if (!ids) owners.set(k, (ids = new Set()));
      ids.add(c.id);
    }
  }
  return owners;
}

function isHedge(t: string, card: MatchCard): boolean {
  const cardTokens = new Set([card.answer, ...(card.aliases ?? [])].flatMap((s) => matchKey(s).split(' ')));
  return t.split(' ').some((w) => HEDGE_TOKENS.has(w) && !cardTokens.has(w));
}

function fuzzyGrade(t: string, cardId: string, owners: Map<string, Set<string>>): MatchResult {
  let own: string | null = null;
  let ownScore = -1;
  let other: string | null = null;
  let otherScore = -1;
  for (const [k, ids] of owners) {
    if (Math.min(t.length, k.length) / Math.max(t.length, k.length) < MIN_LENGTH_RATIO) continue;
    const r = ratio(t, k);
    if (ids.has(cardId)) {
      if (r > ownScore) [own, ownScore] = [k, r];
    } else if (r > otherScore) {
      [other, otherScore] = [k, r];
    }
  }
  if (fuzzyHit(t, own, ownScore, otherScore)) return 'correct';
  if (fuzzyHit(t, other, otherScore, ownScore)) return 'wrong';
  return 'miss';
}

export function match(input: MatchInput): MatchResult {
  const { deck, card, t } = validate(input);
  if (isHedge(t, card)) return 'wrong';
  if ((card.reject ?? []).some((r) => matchKey(r) === t)) return 'wrong';
  const owners = ownersByKey(deck);
  const exact = owners.get(t);
  if (exact) return exact.has(card.id) ? 'correct' : 'wrong';
  return fuzzyGrade(t, card.id, owners);
}
