// Imported-deck persistence (M11, A10, S2). Stored text is untrusted (localStorage is user-editable),
// so every deck is re-validated through parseDeck on load. Backup rules mirror save.ts: an
// unreadable live payload is copied aside before a write replaces it, never silently erased.
import { parseDeck, type Deck } from './deck-schema.js';
import type { SaveStorage } from './save.js';

export const DECK_STORE_KEY = 'flashcards.decks';
/** Holds the first unreadable (corrupt or newer-version) live payload, so a write never erases it. */
export const DECK_STORE_BACKUP_KEY = 'flashcards.decks.backup';
export const DECK_STORE_VERSION = 1;
/** Checked before JSON.parse so a huge value costs nothing to reject; well under a 5 MB origin quota. */
export const MAX_DECK_STORE_CHARS = 2_000_000;

export interface DeckRead {
  decks: Deck[];
  /** True when storage threw on read: the store may hold decks we could not see. */
  readFailed: boolean;
}

export type DeckWrite = { ok: true } | { ok: false; reason?: 'too-large' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valid decks, or null when the envelope (size, JSON, version, decks array) is unreadable. */
function parseStore(text: string): Deck[] | null {
  if (text.length > MAX_DECK_STORE_CHARS) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.version !== DECK_STORE_VERSION || !Array.isArray(raw.decks)) return null;
  // One bad deck is skipped, not fatal: the rest of the user's imports still load.
  return raw.decks.flatMap((d) => {
    const r = parseDeck(d);
    return r.ok ? [r.deck] : [];
  });
}

/** Load stored decks; missing or unreadable text yields none. Never throws. */
export function readDecks(storage: SaveStorage): DeckRead {
  try {
    const text = storage.getItem(DECK_STORE_KEY);
    return { decks: text === null ? [] : (parseStore(text) ?? []), readFailed: false };
  } catch {
    return { decks: [], readFailed: true };
  }
}

/** See save.ts backupUnreadable: false means the live text has nowhere safe to go. */
function backupUnreadable(s: SaveStorage): boolean {
  const live = s.getItem(DECK_STORE_KEY);
  if (live === null || parseStore(live) !== null) return true;
  if (s.getItem(DECK_STORE_BACKUP_KEY) !== null) return false;
  s.setItem(DECK_STORE_BACKUP_KEY, live);
  return true;
}

/** Persist the decks; never throws. A payload over the cap is refused before storage is touched. */
export function writeDecks(decks: readonly Deck[], storage: SaveStorage): DeckWrite {
  try {
    const text = JSON.stringify({ version: DECK_STORE_VERSION, decks });
    // A later read rejects text over the cap, so writing it would turn the decks into "unreadable".
    if (text.length > MAX_DECK_STORE_CHARS) return { ok: false, reason: 'too-large' };
    if (!backupUnreadable(storage)) return { ok: false };
    storage.setItem(DECK_STORE_KEY, text);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
