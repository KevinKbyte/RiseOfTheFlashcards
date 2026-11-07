// Pure glue for the cards scene (M11, D4, D5, D14): composes menu-flow, run-flow and review-flow so
// CardsSystem only forwards seam events and renders the plain-data effects. Never mutates input; an
// event that does not apply returns the same session object and no effects.
import type { Deck, DeckCard } from './deck-schema.js';
import { createMenu, masterySummary, startPlaying, type MenuState } from './menu-flow.js';
import { loadReview, startEncounter, submitAnswer, type Attempt, type Encounter, type ReviewState } from './review-flow.js';
import { startFlow, stepFlow, type RunFlowEffect, type RunFlowEvent, type RunFlowState } from './run-flow.js';
import { readSave, type SaveStorage } from './save.js';

export interface SessionEnv {
  decks: readonly Deck[];
  storage: SaveStorage;
  clock: () => Date;
}

export interface GameSession {
  readonly menu: MenuState;
  readonly run: RunFlowState | null;
  readonly review: ReviewState | null;
  /** Deck the current run plays. */
  readonly deck: Deck | null;
  /** Review encounter per card id, replaced on each new presentation. */
  readonly encounters: Readonly<Record<string, Encounter>>;
}

export type SessionEffect = { type: 'spawnWave'; cards: readonly DeckCard[] } | RunFlowEffect;

export interface SessionStep {
  session: GameSession;
  effects: readonly SessionEffect[];
}

// The env (storage, clock) rides along non-enumerable: it is not session state, and a spread or
// JSON snapshot of the session must not see storage internals change underneath it.
const ENV = Symbol('env');
type WithEnv = GameSession & { readonly [ENV]: SessionEnv };

function envOf(s: GameSession): SessionEnv {
  return (s as WithEnv)[ENV];
}

function make(data: GameSession, env: SessionEnv): GameSession {
  const s = { ...data };
  Object.defineProperty(s, ENV, { value: env, enumerable: false });
  return s;
}

function next(s: GameSession, patch: Partial<GameSession>): GameSession {
  return make({ ...s, ...patch }, envOf(s));
}

const same = (session: GameSession): SessionStep => ({ session, effects: [] });

export function createSession(env: SessionEnv): GameSession {
  const menu: MenuState = { ...createMenu(), decks: env.decks };
  return make({ menu, run: null, review: null, deck: null, encounters: {} }, env);
}

export function updateMenu(s: GameSession, fn: (m: MenuState) => MenuState): GameSession {
  const menu = fn(s.menu);
  return menu === s.menu ? s : next(s, { menu });
}

export function startRun(s: GameSession): SessionStep {
  const deck = s.menu.selectedDeck;
  const menu = startPlaying(s.menu);
  if (!deck || menu === s.menu) return same(s);
  const env = envOf(s);
  const review = loadReview(env.storage, deck.cards, env.clock());
  const flow = startFlow({ cardIds: review.queue.ids });
  const cards = flow.state.run.cards.flatMap((id) => deck.cards.filter((c) => c.id === id));
  return {
    session: next(s, { menu, run: flow.state, review, deck, encounters: {} }),
    effects: [{ type: 'spawnWave', cards }, ...flow.effects],
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

/** Run-flow decides whether the orb counts; review-flow grades and persists it. */
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

export function correctOrb(s: GameSession, cardId: string): SessionStep {
  const card = s.deck?.cards.find((c) => c.id === cardId);
  if (!card) return same(s);
  return orb(s, { type: 'correctOrb', cardId }, { kind: 'orb', label: card.answer });
}

export function waveCleared(s: GameSession): SessionStep {
  const r = step(s, { type: 'waveCleared' });
  return r ? { session: next(s, { run: r.run }), effects: r.effects } : same(s);
}

export function masteryText(s: GameSession): string[] {
  const save = s.review ? s.review.save : readSave(envOf(s).storage).save;
  return masterySummary(s.menu.decks, save.cards).map((row) => row.text);
}
