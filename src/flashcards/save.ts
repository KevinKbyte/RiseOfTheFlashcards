// Versioned FSRS save. parseSave is an untrusted-input boundary (localStorage is user-editable):
// it never throws. An invalid envelope yields an empty save; an invalid card drops only that card.
// Progress is per deck (decks.<deckId>.<cardId>). Deck ids are untrusted and may be "__proto__", so
// parsed deck maps are built on a null prototype and deck lookups are own-property checks only.
import type { CardState, DailyCounters, FsrsState } from './scheduler.js';

export const SAVE_VERSION = 2;
/** Flat format: cards keyed by card id alone, no deck. Still readable; migrated on load. */
const FLAT_VERSION = 1;
/** Hard cap on stored text; checked before JSON.parse so a huge value costs nothing to reject. */
export const MAX_SAVE_CHARS = 1_000_000;
/** Holds the first unreadable (corrupt or newer-version) live save, so a write never erases it. */
export const SAVE_BACKUP_KEY = 'flashcards.fsrs.save.backup';
/** 100 years in days: far above the 365-day max interval, far below absurd injected values. */
export const MAX_STABILITY = 36_500;
const SAVE_KEY = 'flashcards.fsrs.save';
const MAX_ID_CHARS = 200;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Full ISO-8601 date-time only; Date.parse alone accepts "1", "2020", free text, and +YYYYYY years.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const MIN_YEAR = 1970;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

export type CardMap = Record<string, CardState>;

export interface SaveData {
  version: typeof SAVE_VERSION;
  decks: Record<string, CardMap>;
  /** Flat-save progress for card ids no known deck contained yet; adopted by a later deck. */
  orphans: CardMap;
  counters: DailyCounters | null;
}

/** Minimal deck shape needed to place flat progress (a Deck fits). */
export interface KnownDeck {
  id: string;
  cards: readonly { id: string }[];
}

/** localStorage-shaped dependency, injectable for tests. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptySave(): SaveData {
  return { version: SAVE_VERSION, decks: Object.create(null), orphans: {}, counters: null };
}

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** One deck's card progress; {} when the deck has none. Own-property read only. */
export function deckCards(save: SaveData, deckId: string): CardMap {
  return own(save.decks, deckId) ? save.decks[deckId] : {};
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isDate = (v: unknown): v is string =>
  typeof v === 'string' && ISO_RE.test(v) && Number(v.slice(0, 4)) >= MIN_YEAR && !Number.isNaN(Date.parse(v));
const isState = (v: unknown): v is FsrsState => v === 0 || v === 1 || v === 2 || v === 3;
const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && v >= min && v <= max;

function parseCard(v: unknown): CardState | null {
  if (!isObj(v)) return null;
  const { stability, difficulty, state, reps, lapses, due, lastReview } = v;
  const ok =
    inRange(stability, Number.MIN_VALUE, MAX_STABILITY) && inRange(difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY) &&
    isState(state) && isCount(reps) && isCount(lapses) && isDate(due) && isDate(lastReview);
  return ok ? { stability, difficulty, state, reps, lapses, due, lastReview } : null;
}

/** Invalid cards are skipped individually so one defect never discards the rest of the progress. */
function parseCards(v: unknown): Record<string, CardState> | null {
  if (!isObj(v)) return null;
  const out: Record<string, CardState> = {};
  for (const [id, raw] of Object.entries(v)) {
    // Skip prototype-bearing keys: assigning `out['__proto__']` would swap out's prototype.
    if (FORBIDDEN_KEYS.has(id) || id.length === 0 || id.length > MAX_ID_CHARS) continue;
    const card = parseCard(raw);
    if (card !== null) out[id] = card;
  }
  return out;
}

/** Deck ids are not filtered by FORBIDDEN_KEYS: the null-prototype map stores "__proto__" as data. */
function parseDecks(v: unknown): Record<string, CardMap> | null {
  if (!isObj(v)) return null;
  const out: Record<string, CardMap> = Object.create(null);
  for (const [id, raw] of Object.entries(v)) {
    if (id.length === 0 || id.length > MAX_ID_CHARS) continue;
    const cards = parseCards(raw);
    if (cards !== null) out[id] = cards;
  }
  return out;
}

/**
 * Copy each orphan under every known deck containing its card id (a deck's own progress wins), and
 * return the orphans no known deck claimed. Mutates `decks`, which the caller just built.
 */
function adoptOrphans(decks: Record<string, CardMap>, orphans: CardMap, known: readonly KnownDeck[]): CardMap {
  const left: CardMap = { ...orphans };
  for (const deck of known) {
    for (const { id } of deck.cards) {
      if (!own(orphans, id)) continue;
      if (!own(decks, deck.id)) decks[deck.id] = {};
      if (!own(decks[deck.id], id)) decks[deck.id][id] = orphans[id];
      delete left[id];
    }
  }
  return left;
}

/** undefined = invalid; null = no counters saved. */
function parseCounters(v: unknown): DailyCounters | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  const { day, newCount, reviewCount } = v;
  const ok = typeof day === 'string' && DAY_RE.test(day) && isCount(newCount) && isCount(reviewCount);
  return ok ? { day, newCount, reviewCount } : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Valid save, or null when the envelope (JSON, version, decks or flat cards map, counters) is
 * unreadable. A flat save is a migration source: all its cards start as orphans, then known decks
 * adopt them, so a card in no known deck is kept rather than dropped.
 */
function parseEnvelope(input: unknown, known: readonly KnownDeck[] = []): SaveData | null {
  if (typeof input !== 'string' || input.length > MAX_SAVE_CHARS) return null;
  const raw = parseJson(input);
  if (!isObj(raw)) return null;
  let decks: Record<string, CardMap> | null;
  let orphans: CardMap | null;
  if (raw.version === SAVE_VERSION) {
    decks = parseDecks(raw.decks);
    orphans = parseCards(raw.orphans) ?? {};
  } else if (raw.version === FLAT_VERSION) {
    decks = Object.create(null) as Record<string, CardMap>;
    orphans = parseCards(raw.cards);
  } else {
    return null;
  }
  const counters = parseCounters(raw.counters);
  if (decks === null || orphans === null || counters === undefined) return null;
  return { version: SAVE_VERSION, decks, orphans: adoptOrphans(decks, orphans, known), counters };
}

/** Parse untrusted save text; an unreadable envelope yields an empty save. Never throws. */
export function parseSave(input: unknown, knownDecks?: readonly KnownDeck[]): SaveData {
  return parseEnvelope(input, knownDecks) ?? emptySave();
}

/** Reading globalThis.localStorage itself can throw (e.g. blocked storage), so callers wrap this. */
function defaultStorage(): SaveStorage | undefined {
  return (globalThis as { localStorage?: SaveStorage }).localStorage ?? undefined;
}

export interface SaveRead {
  save: SaveData;
  /** True when storage threw on read: the stored save may hold progress we could not see. */
  readFailed: boolean;
}

/** Load the save, distinguishing a throwing read from a missing or unreadable save. Never throws. */
export function readSave(storage?: SaveStorage, knownDecks?: readonly KnownDeck[]): SaveRead {
  try {
    const s = storage ?? defaultStorage();
    return { save: s ? parseSave(s.getItem(SAVE_KEY), knownDecks) : emptySave(), readFailed: false };
  } catch {
    return { save: emptySave(), readFailed: true };
  }
}

/** Load the save; missing or failing storage degrades to an empty save. */
export function loadSave(storage?: SaveStorage, knownDecks?: readonly KnownDeck[]): SaveData {
  return readSave(storage, knownDecks).save;
}

/**
 * Copy an unreadable live save to SAVE_BACKUP_KEY before it is overwritten. Returns false when a
 * backup already holds an earlier unreadable save: the live text then has nowhere safe to go, so
 * the caller must not overwrite it. A throwing setItem propagates so the caller aborts.
 */
function backupUnreadable(s: SaveStorage): boolean {
  const live = s.getItem(SAVE_KEY);
  if (live === null || parseEnvelope(live) !== null) return true;
  if (s.getItem(SAVE_BACKUP_KEY) !== null) return false;
  s.setItem(SAVE_BACKUP_KEY, live);
  return true;
}

/** Persist the save; returns false (never throws) when storage is missing or rejects the write. */
export function writeSave(data: SaveData, storage?: SaveStorage): boolean {
  try {
    const s = storage ?? defaultStorage();
    if (!s || !backupUnreadable(s)) return false;
    s.setItem(SAVE_KEY, serializeSave(data));
    return true;
  } catch {
    return false;
  }
}
