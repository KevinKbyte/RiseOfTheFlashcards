// Versioned FSRS save. parseSave is an untrusted-input boundary (localStorage is user-editable):
// it never throws and returns an empty save for anything that is not a fully valid current save.
import type { CardState, DailyCounters, FsrsState } from './scheduler.js';

export const SAVE_VERSION = 1;
/** Hard cap on stored text; checked before JSON.parse so a huge value costs nothing to reject. */
export const MAX_SAVE_CHARS = 1_000_000;
const SAVE_KEY = 'flashcards.fsrs.save';
const MAX_ID_CHARS = 200;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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
const isDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isState = (v: unknown): v is FsrsState => v === 0 || v === 1 || v === 2 || v === 3;

function parseCard(v: unknown): CardState | null {
  if (!isObj(v)) return null;
  const { stability, difficulty, state, reps, lapses, due, lastReview } = v;
  const ok =
    typeof stability === 'number' && Number.isFinite(stability) && stability > 0 &&
    typeof difficulty === 'number' && Number.isFinite(difficulty) &&
    isState(state) && isCount(reps) && isCount(lapses) && isDate(due) && isDate(lastReview);
  return ok ? { stability, difficulty, state, reps, lapses, due, lastReview } : null;
}

function parseCards(v: unknown): Record<string, CardState> | null {
  if (!isObj(v)) return null;
  const out: Record<string, CardState> = {};
  for (const [id, raw] of Object.entries(v)) {
    // Skip prototype-bearing keys: assigning `out['__proto__']` would swap out's prototype.
    if (FORBIDDEN_KEYS.has(id) || id.length === 0 || id.length > MAX_ID_CHARS) continue;
    const card = parseCard(raw);
    if (card === null) return null;
    out[id] = card;
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

/** Parse untrusted save text; any defect yields an empty save. Never throws. */
export function parseSave(input: unknown): SaveData {
  if (typeof input !== 'string' || input.length > MAX_SAVE_CHARS) return emptySave();
  const raw = parseJson(input);
  if (!isObj(raw) || raw.version !== SAVE_VERSION) return emptySave();
  const cards = parseCards(raw.cards);
  const counters = parseCounters(raw.counters);
  if (cards === null || counters === undefined) return emptySave();
  return { version: SAVE_VERSION, cards, counters };
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

/** Persist the save; returns false (never throws) when storage is missing or rejects the write. */
export function writeSave(data: SaveData, storage?: SaveStorage): boolean {
  try {
    const s = storage ?? defaultStorage();
    if (!s) return false;
    s.setItem(SAVE_KEY, serializeSave(data));
    return true;
  } catch {
    return false;
  }
}
