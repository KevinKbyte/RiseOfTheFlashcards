// Start-screen menu (M11, A10, D5): a pure state machine the 3D layer only renders. Every function
// returns a new state (or the same object when the action does not apply) and never mutates input.
// All text (titles, errors, prompts) is plain data; the UI renders it via textContent, never HTML.
import { parseDeck } from './deck-schema.js';
import type { Deck } from './deck-schema.js';
import {
  applyBlockReason,
  applyResolution,
  canApply,
  cancelConfirm,
  choiceOf,
  createResolver,
  dropCount,
  keepFirstInEveryGroup,
  requestConfirm,
  setChoice,
  undoResolution,
} from './deck-dedupe.js';
import type { Choice, ResolverState } from './deck-dedupe.js';
import { MAX_SAVE_CHARS } from './save.js';
import type { CardState } from './scheduler.js';
import { STARTER_DECKS } from './starter-decks.js';

/** FSRS stability (days) at which a Review card counts as mastered: the usual "mature card" interval. */
export const MASTERED_STABILITY_DAYS = 21;

/** Import text shares the save-data cap so a pasted deck can never exceed what a save can hold. */
export const MAX_IMPORT_CHARS = MAX_SAVE_CHARS;

export type Screen =
  | 'start'
  | 'deck-select'
  | 'import'
  | 'dedupe'
  | 'confirm-replace'
  | 'ready'
  | 'playing'
  | 'mastery';

export interface ReplaceUndo {
  decks: readonly Deck[];
  selectedDeck: Deck | null;
}

export interface MenuState {
  screen: Screen;
  decks: readonly Deck[];
  selectedDeck: Deck | null;
  importText: string;
  importError: string | null;
  resolver: ResolverState | null;
  /** Imported deck whose id clashes with an existing deck, awaiting confirm/cancel. */
  pendingReplace?: Deck | null;
  /** Snapshot taken by confirmReplace so undoReplace can restore it exactly. */
  replaceUndo?: ReplaceUndo | null;
}

export interface ReplaceView {
  existingTitle: string;
  newTitle: string;
}

export interface DeckOption {
  id: string;
  title: string;
}

export interface DedupeCopyView {
  index: number;
  prompt: string;
  answer: string;
  choice: Choice;
}

export interface DedupeView {
  phase: ResolverState['phase'];
  groups: { id: string; copies: DedupeCopyView[] }[];
  dropCount: number;
  canApply: boolean;
  applyBlockReason: string | null;
  canUndo: boolean;
}

export interface MasteryRow {
  deckId: string;
  title: string;
  newCount: number;
  learningCount: number;
  masteredCount: number;
  text: string;
}

export function createMenu(): MenuState {
  return {
    screen: 'start',
    decks: STARTER_DECKS,
    selectedDeck: null,
    importText: '',
    importError: null,
    resolver: null,
  };
}

export function backToStart(state: MenuState): MenuState {
  return {
    ...state,
    screen: 'start',
    selectedDeck: null,
    importText: '',
    importError: null,
    resolver: null,
    pendingReplace: null,
    replaceUndo: null,
  };
}

export function openDeckSelect(state: MenuState): MenuState {
  if (state.screen === 'playing') return state;
  return { ...state, screen: 'deck-select', importText: '', importError: null, resolver: null };
}

export function openMastery(state: MenuState): MenuState {
  if (state.screen !== 'start') return state;
  return { ...state, screen: 'mastery' };
}

export function deckOptions(state: MenuState): DeckOption[] {
  return state.decks.map((deck) => ({ id: deck.id, title: deck.title }));
}

export function selectDeck(state: MenuState, deckId: string): MenuState {
  if (state.screen !== 'deck-select') return state;
  const deck = state.decks.find((d) => d.id === deckId);
  if (!deck) return state;
  return { ...state, screen: 'ready', selectedDeck: deck };
}

export function startPlaying(state: MenuState): MenuState {
  if (state.screen !== 'ready' || !state.selectedDeck) return state;
  return { ...state, screen: 'playing' };
}

export function openImport(state: MenuState): MenuState {
  if (state.screen !== 'deck-select') return state;
  return { ...state, screen: 'import', importText: '', importError: null };
}

export function setImportText(state: MenuState, text: string): MenuState {
  if (state.screen !== 'import') return state;
  return { ...state, importText: text, importError: null };
}

/** Adds (or replaces, by id) an imported deck, selects it, and goes to ready. */
function addAndSelect(state: MenuState, deck: Deck): MenuState {
  const decks = [...state.decks.filter((d) => d.id !== deck.id), deck];
  return {
    ...state,
    screen: 'ready',
    decks,
    selectedDeck: deck,
    importText: '',
    importError: null,
    resolver: null,
    pendingReplace: null,
    replaceUndo: null,
  };
}

/** An id clash never replaces silently: it asks first via the confirm-replace screen. */
function addOrAskReplace(state: MenuState, deck: Deck): MenuState {
  if (!state.decks.some((d) => d.id === deck.id)) return addAndSelect(state, deck);
  return { ...state, screen: 'confirm-replace', pendingReplace: deck, resolver: null };
}

export function replaceView(state: MenuState): ReplaceView | null {
  const pending = state.pendingReplace;
  if (state.screen !== 'confirm-replace' || !pending) return null;
  const existing = state.decks.find((d) => d.id === pending.id);
  if (!existing) return null;
  return { existingTitle: existing.title, newTitle: pending.title };
}

export function confirmReplace(state: MenuState): MenuState {
  if (state.screen !== 'confirm-replace' || !state.pendingReplace) return state;
  const replaceUndo: ReplaceUndo = { decks: state.decks, selectedDeck: state.selectedDeck };
  return { ...addAndSelect(state, state.pendingReplace), replaceUndo };
}

export function cancelReplace(state: MenuState): MenuState {
  if (state.screen !== 'confirm-replace') return state;
  return { ...state, screen: 'import', pendingReplace: null };
}

export function undoReplace(state: MenuState): MenuState {
  const undo = state.replaceUndo;
  if (state.screen !== 'ready' || !undo) return state;
  return {
    ...state,
    screen: 'deck-select',
    decks: undo.decks,
    selectedDeck: undo.selectedDeck,
    replaceUndo: null,
  };
}

export function submitImport(state: MenuState): MenuState {
  if (state.screen !== 'import') return state;
  // Checked before JSON.parse so oversized paste never costs a full parse.
  if (state.importText.length > MAX_IMPORT_CHARS) {
    return { ...state, importError: `deck text is too large (over ${MAX_IMPORT_CHARS} characters)` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(state.importText);
  } catch {
    return { ...state, importError: 'deck text is not valid JSON' };
  }
  const result = parseDeck(raw);
  if (result.ok) return addOrAskReplace(state, result.deck);
  if ('kind' in result) return { ...state, screen: 'dedupe', resolver: createResolver(result.deck) };
  return { ...state, importError: result.error };
}

function onResolver(state: MenuState, step: (r: ResolverState) => ResolverState): MenuState {
  if (state.screen !== 'dedupe' || !state.resolver) return state;
  const resolver = step(state.resolver);
  return resolver === state.resolver ? state : { ...state, resolver };
}

export function dedupeSetChoice(state: MenuState, cardIndex: number, choice: Choice): MenuState {
  return onResolver(state, (r) => setChoice(r, cardIndex, choice));
}

export function dedupeKeepFirst(state: MenuState): MenuState {
  return onResolver(state, keepFirstInEveryGroup);
}

export function dedupeRequestConfirm(state: MenuState): MenuState {
  return onResolver(state, requestConfirm);
}

export function dedupeCancelConfirm(state: MenuState): MenuState {
  return onResolver(state, cancelConfirm);
}

export function dedupeConfirm(state: MenuState): MenuState {
  return onResolver(state, applyResolution);
}

export function dedupeUndo(state: MenuState): MenuState {
  return onResolver(state, undoResolution);
}

export function dedupeContinue(state: MenuState): MenuState {
  if (state.screen !== 'dedupe' || state.resolver?.phase !== 'applied') return state;
  return addOrAskReplace(state, state.resolver.deck);
}

const EMPTY_VIEW: DedupeView = {
  phase: 'selecting',
  groups: [],
  dropCount: 0,
  canApply: false,
  applyBlockReason: null,
  canUndo: false,
};

export function dedupeView(state: MenuState): DedupeView {
  const r = state.resolver;
  if (state.screen !== 'dedupe' || !r) return EMPTY_VIEW;
  return {
    phase: r.phase,
    groups: r.groups.map((group) => ({
      id: group.id,
      copies: group.copies.map((copy) => ({
        index: copy.index,
        prompt: copy.prompt,
        answer: copy.answer,
        choice: choiceOf(r, copy.index),
      })),
    })),
    dropCount: dropCount(r),
    canApply: canApply(r),
    applyBlockReason: applyBlockReason(r),
    canUndo: r.phase === 'applied',
  };
}

/** New = no state or FSRS 0; Mastered = Review (2) at >= MASTERED_STABILITY_DAYS; else Learning. */
export function masterySummary(
  decks: readonly Deck[],
  progress: Readonly<Record<string, Readonly<Record<string, CardState>>>>,
): MasteryRow[] {
  const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
  return decks.map((deck) => {
    // Each deck counts only its own progress map; a deck id like "toString" must not hit a prototype.
    const cards = own(progress, deck.id) ? progress[deck.id] : {};
    let newCount = 0;
    let learningCount = 0;
    let masteredCount = 0;
    for (const card of deck.cards) {
      // Own-property lookup only: a card id like "toString" must not hit Object.prototype.
      const st = own(cards, card.id) ? cards[card.id] : undefined;
      if (!st || st.state === 0) newCount += 1;
      else if (st.state === 2 && st.stability >= MASTERED_STABILITY_DAYS) masteredCount += 1;
      else learningCount += 1;
    }
    const text = `${deck.title}: ${newCount} new, ${learningCount} learning, ${masteredCount} mastered`;
    return { deckId: deck.id, title: deck.title, newCount, learningCount, masteredCount, text };
  });
}
