// Pure glue for the cards scene (M11, D4, D5, D14): composes menu-flow, run-flow and review-flow so
// CardsSystem only forwards seam events and renders the plain-data effects. Never mutates input; an
// event that does not apply returns the same session object and no effects.
import type { Deck, DeckCard } from './deck-schema.js';
import { createMenu, masterySummary, startPlaying, type MasteryRow, type MenuState } from './menu-flow.js';
import { loadReview, startEncounter, submitAnswer, type Attempt, type Encounter, type ReviewState } from './review-flow.js';
import { startFlow, stepFlow, type RunFlowEffect, type RunFlowEvent, type RunFlowState } from './run-flow.js';
import { readDecks, writeDecks, type DeckRead } from './deck-store.js';
import { planPoolSizes } from './pool.js';
import { readSave, type SaveStorage } from './save.js';

export interface SessionEnv {
  decks: readonly Deck[];
  storage: SaveStorage;
  clock: () => Date;
  /** One readDecks result shared by every session on the page; given, the store is not re-read. */
  storedDecks?: DeckRead;
}

export type DeckSaveError = 'too-large' | 'failed';

export interface GameSession {
  readonly menu: MenuState;
  readonly run: RunFlowState | null;
  readonly review: ReviewState | null;
  /** Deck the current run plays. */
  readonly deck: Deck | null;
  /** Review encounter per card id, replaced on each new presentation. */
  readonly encounters: Readonly<Record<string, Encounter>>;
  /** Why the last deck-store write failed; null when it succeeded or none happened yet. */
  readonly deckSaveError: DeckSaveError | null;
}

/** spawnWave.poolSizes: cards per spawned enemy, spawn order, summing to cards.length (M2). */
export type SessionEffect =
  | { type: 'spawnWave'; cards: readonly DeckCard[]; poolSizes: readonly number[] }
  | RunFlowEffect;

export interface SessionStep {
  session: GameSession;
  effects: readonly SessionEffect[];
}

// The env (storage, clock) rides along non-enumerable: it is not session state, and a spread or
// JSON snapshot of the session must not see storage internals change underneath it.
const ENV = Symbol('env');
// decksReadFailed: the stored decks could not be read, so writing would clobber decks we never saw.
type InnerEnv = SessionEnv & { readonly decksReadFailed: boolean };
type WithEnv = GameSession & { readonly [ENV]: InnerEnv };

function envOf(s: GameSession): InnerEnv {
  return (s as WithEnv)[ENV];
}

function make(data: GameSession, env: InnerEnv): GameSession {
  const s = { ...data };
  Object.defineProperty(s, ENV, { value: env, enumerable: false });
  return s;
}

function next(s: GameSession, patch: Partial<GameSession>): GameSession {
  return make({ ...s, ...patch }, envOf(s));
}

const same = (session: GameSession): SessionStep => ({ session, effects: [] });

/** Stored decks replace bundled ones by id in place; the rest follow in stored order. */
function mergeDecks(bundled: readonly Deck[], stored: readonly Deck[]): readonly Deck[] {
  if (stored.length === 0) return bundled;
  // A Map keeps an id's first position but its last value: duplicate stored ids collapse, last wins.
  const byId = new Map(stored.map((d) => [d.id, d]));
  const merged = bundled.map((d) => byId.get(d.id) ?? d);
  const bundledIds = new Set(bundled.map((d) => d.id));
  return [...merged, ...[...byId.values()].filter((d) => !bundledIds.has(d.id))];
}

// JSON comparison: a key-order mismatch between equal decks only makes one look imported, which
// causes a needless store write; it never drops a deck.
/** Decks not identical to the bundled deck of the same id: imports and replacements of a starter. */
function importedDecks(decks: readonly Deck[], bundled: readonly Deck[]): Deck[] {
  const byId = new Map(bundled.map((d) => [d.id, JSON.stringify(d)]));
  return decks.filter((d) => byId.get(d.id) !== JSON.stringify(d));
}

export function createSession(env: SessionEnv): GameSession {
  const stored = env.storedDecks ?? readDecks(env.storage);
  const menu: MenuState = { ...createMenu(), decks: mergeDecks(env.decks, stored.decks) };
  const inner: InnerEnv = { ...env, decksReadFailed: stored.readFailed };
  return make({ menu, run: null, review: null, deck: null, encounters: {}, deckSaveError: null }, inner);
}

/** Any menu change to the deck list (import, replace, Undo) persists the imported decks. */
export function updateMenu(s: GameSession, fn: (m: MenuState) => MenuState): GameSession {
  const menu = fn(s.menu);
  if (menu === s.menu) return s;
  const env = envOf(s);
  if (menu.decks === s.menu.decks || env.decksReadFailed) return next(s, { menu });
  const imports = importedDecks(menu.decks, env.decks);
  // Key-order mismatch here only causes a needless store, never a drop.
  if (JSON.stringify(imports) === JSON.stringify(importedDecks(s.menu.decks, env.decks))) return next(s, { menu });
  const result = writeDecks(imports, env.storage);
  const deckSaveError = result.ok ? null : (result.reason ?? 'failed');
  return next(s, { menu, deckSaveError });
}

export function startRun(s: GameSession): SessionStep {
  const deck = s.menu.selectedDeck;
  const menu = startPlaying(s.menu);
  if (!deck || menu === s.menu) return same(s);
  const env = envOf(s);
  const review = loadReview(env.storage, deck.cards, env.clock(), { deckId: deck.id, knownDecks: s.menu.decks });
  const flow = startFlow({ cardIds: review.queue.ids });
  const byId = new Map(deck.cards.map((c) => [c.id, c]));
  const cards = flow.state.run.cards.flatMap((id) => byId.get(id) ?? []);
  return {
    session: next(s, { menu, run: flow.state, review, deck, encounters: {} }),
    effects: [{ type: 'spawnWave', cards, poolSizes: planPoolSizes(cards.length) }, ...flow.effects],
  };
}

function step(s: GameSession, event: RunFlowEvent): { run: RunFlowState; effects: readonly RunFlowEffect[] } | null {
  if (!s.run) return null;
  const result = stepFlow(s.run, event);
  return result.state === s.run ? null : { run: result.state, effects: result.effects };
}

export function presented(s: GameSession, cardId: string, encounterId: string): SessionStep {
  const r = step(s, { type: 'presented', cardId, encounterId });
  if (!r) return same(s);
  const encounters = { ...s.encounters, [cardId]: startEncounter(cardId) };
  return { session: next(s, { run: r.run, encounters }), effects: r.effects };
}

/** Run-flow decides whether the orb or hit counts; review-flow grades and persists it. */
function orb(s: GameSession, event: RunFlowEvent & { cardId: string }, attempt: Attempt): SessionStep {
  const { review, deck } = s;
  if (!review || !deck) return same(s);
  const r = step(s, event);
  if (!r) return same(s);
  const env = envOf(s);
  const { cardId } = event;
  const own = Object.prototype.hasOwnProperty.call(s.encounters, cardId);
  const encounter = own ? s.encounters[cardId] : startEncounter(cardId);
  const graded = submitAnswer(review, encounter, attempt, { deck: deck.cards, storage: env.storage, now: env.clock() });
  const encounters = { ...s.encounters, [cardId]: graded.encounter };
  return { session: next(s, { run: r.run, review: graded.state, encounters }), effects: r.effects };
}

export function wrongOrb(s: GameSession, cardId: string, label: string): SessionStep {
  return orb(s, { type: 'wrongOrb', cardId }, { kind: 'orb', label });
}

/** A landed strike costs a pip and rates the card Again, sharing the wrong orb's once-per-encounter flag. */
export function enemyHit(s: GameSession, cardId: string): SessionStep {
  return orb(s, { type: 'enemyHit', cardId }, { kind: 'hit' });
}

export function correctOrb(s: GameSession, cardId: string): SessionStep {
  const card = s.deck?.cards.find((c) => c.id === cardId);
  if (!card) return same(s);
  return orb(s, { type: 'correctOrb', cardId }, { kind: 'orb', label: card.answer });
}

export function waveCleared(s: GameSession): SessionStep {
  const r = step(s, { type: 'waveCleared' });
  return r ? { session: next(s, { run: r.run }), effects: r.effects } : same(s);
}

export function masteryRows(s: GameSession): MasteryRow[] {
  const save = s.review ? s.review.save : readSave(envOf(s).storage, s.menu.decks).save;
  return masterySummary(s.menu.decks, save.decks);
}

export function masteryText(s: GameSession): string[] {
  return masteryRows(s).map((row) => row.text);
}
