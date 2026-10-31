// MATCH-001..004: deterministic answer grading. Precedence when several rules apply is fixed
// in tests/matcher.test.mjs (hedge, reject, exact own, exact other, fuzzy own, fuzzy other, miss).
import { normalize } from './normalize.mjs';

const FUZZY_MIN_CHARS = 4;
const FUZZY_MIN_RATIO = 0.85;
const FUZZY_MIN_MARGIN = 0.1;
const HEDGE_TOKENS = new Set(['or', 'and']);

// NORM-001 plus one leading article, kept when nothing would remain ("the A" -> "a").
function key(s) {
  const n = normalize(s);
  const m = n.match(/^(?:a|an|the) (.+)$/u);
  return m ? m[1] : n;
}

function levenshtein(a, b) {
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

const ratio = (a, b) => 1 - levenshtein(a, b) / Math.max(a.length, b.length);

function fuzzyHit(t, candidate, score, rivalScore) {
  return (
    candidate !== null &&
    t.length >= FUZZY_MIN_CHARS &&
    candidate.length >= FUZZY_MIN_CHARS &&
    score >= FUZZY_MIN_RATIO &&
    t.slice(0, FUZZY_MIN_CHARS) === candidate.slice(0, FUZZY_MIN_CHARS) &&
    score - rivalScore >= FUZZY_MIN_MARGIN
  );
}

function validate(deck, cardId, transcript) {
  if (!Array.isArray(deck)) throw new TypeError('deck must be an array');
  const card = deck.find((c) => c && c.id === cardId);
  if (!card) throw new TypeError('cardId not found in deck');
  if (typeof transcript !== 'string' || transcript.trim() === '') {
    throw new TypeError('transcript must be a non-empty string');
  }
  return card;
}

export function match({ deck, cardId, transcript }) {
  const card = validate(deck, cardId, transcript);
  const t = key(transcript);

  // Candidate key -> ids of every card owning it as answer or alias.
  const owners = new Map();
  for (const c of deck) {
    for (const s of [c.answer, ...(c.aliases ?? [])]) {
      const k = key(s);
      if (!owners.has(k)) owners.set(k, new Set());
      owners.get(k).add(c.id);
    }
  }

  const answerTokens = new Set(key(card.answer).split(' '));
  if (t.split(' ').some((w) => HEDGE_TOKENS.has(w) && !answerTokens.has(w))) return 'wrong';
  if ((card.reject ?? []).some((r) => key(r) === t)) return 'wrong';
  if (owners.has(t)) return owners.get(t).has(cardId) ? 'correct' : 'wrong';

  let own = null;
  let ownScore = -1;
  let other = null;
  let otherScore = -1;
  for (const [k, ids] of owners) {
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
