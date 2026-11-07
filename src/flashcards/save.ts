// Versioned FSRS save. parseSave is an untrusted-input boundary (localStorage is user-editable):
// it never throws. An invalid envelope yields an empty save; an invalid card drops only that card.
import type { CardState, DailyCounters, FsrsState } from './scheduler.js';

export const SAVE_VERSION = 1;
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

export interface SaveData {
  version: typeof SAVE_VERSION;
  cards: Record<string, CardState>;
  counters: DailyCounters | null;
}

/** localStorage-shaped dependency, injectable for tests. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptySave(): SaveData {
  return { version: SAVE_VERSION, cards: {}, counters: null };
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

/** Valid save, or null when the envelope (JSON, version, cards map, counters) is unreadable. */
function parseEnvelope(input: unknown): SaveData | null {
  if (typeof input !== 'string' || input.length > MAX_SAVE_CHARS) return null;
  const raw = parseJson(input);
  if (!isObj(raw) || raw.version !== SAVE_VERSION) return null;
  const cards = parseCards(raw.cards);
  const counters = parseCounters(raw.counters);
  if (cards === null || counters === undefined) return null;
  return { version: SAVE_VERSION, cards, counters };
}

/** Parse untrusted save text; an unreadable envelope yields an empty save. Never throws. */
export function parseSave(input: unknown): SaveData {
  return parseEnvelope(input) ?? emptySave();
}

/** Reading globalThis.localStorage itself can throw (e.g. blocked storage), so callers wrap this. */
function defaultStorage(): SaveStorage | undefined {
  return (globalThis as { localStorage?: SaveStorage }).localStorage ?? undefined;
}

/** Load the save; missing or failing storage degrades to an empty save. */
export function loadSave(storage?: SaveStorage): SaveData {
  try {
    const s = storage ?? defaultStorage();
    return s ? parseSave(s.getItem(SAVE_KEY)) : emptySave();
  } catch {
    return emptySave();
  }
}

/**
 * Copy an unreadable live save to SAVE_BACKUP_KEY before it is overwritten. An existing backup is
 * kept; a throwing setItem propagates so the caller aborts rather than erasing the live text.
 */
function backupUnreadable(s: SaveStorage): void {
  const live = s.getItem(SAVE_KEY);
  if (live === null || parseEnvelope(live) !== null || s.getItem(SAVE_BACKUP_KEY) !== null) return;
  s.setItem(SAVE_BACKUP_KEY, live);
}

/** Persist the save; returns false (never throws) when storage is missing or rejects the write. */
export function writeSave(data: SaveData, storage?: SaveStorage): boolean {
  try {
    const s = storage ?? defaultStorage();
    if (!s) return false;
    backupUnreadable(s);
    s.setItem(SAVE_KEY, serializeSave(data));
    return true;
  } catch {
    return false;
  }
}
