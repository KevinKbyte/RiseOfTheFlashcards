/** Browser-side setup for the cards scene's game-session: real storage, real clock, bundled decks. */
import { createSession, type GameSession } from './flashcards/game-session.js';
import type { SaveStorage } from './flashcards/save.js';
import { STARTER_DECKS } from './flashcards/starter-decks.js';

// Touching window.localStorage itself can throw (blocked storage), so it is resolved per call,
// inside readSave/writeSave's own guards, rather than once at startup.
const browserStorage: SaveStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

export function browserSession(): GameSession {
  return createSession({ decks: STARTER_DECKS, storage: browserStorage, clock: () => new Date() });
}

export function shuffled<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
