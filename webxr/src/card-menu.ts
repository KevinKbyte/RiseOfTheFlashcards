/**
 * Maps the session's menu screen to the panel's lines and orbs: the start screen (title, mastery
 * lines, Start/Mastery orbs), the mastery screen, and deck select. cards.ts renders the result.
 */
import { masteryText, type GameSession } from './flashcards/game-session.js';
import { deckOptions } from './flashcards/menu-flow.js';
import { pressBack, pressMastery, pressStart, START_TITLE, startScreenView } from './flashcards/start-screen.js';

export type MenuPick =
  | { kind: 'deck'; deckId: string }
  | { kind: 'nav'; press: (s: GameSession) => GameSession };

/** Navigation orbs (Start, Mastery, Back) are styled apart from deck orbs. */
export type OrbKind = 'action' | 'deck';

export interface MenuLayout {
  lines: string[];
  picks: { label: string; pick: MenuPick; orbKind: OrbKind }[];
}

const BACK = { label: 'Back', pick: { kind: 'nav', press: pressBack }, orbKind: 'action' } as const;

/** `s` is the session after a nav press: reaching the start screen spends a "Play again?" heading. */
export function menuHeadingAfterNav(heading: string, s: GameSession): string {
  return s.menu.screen === 'start' ? START_TITLE : heading;
}

/** `heading` titles the deck-select screen (e.g. "Play again?" after a run). */
export function menuLayout(s: GameSession, heading: string): MenuLayout {
  const view = startScreenView(s);
  if (view) {
    return {
      lines: [view.title, ...view.masteryLines],
      picks: view.actions.map((a) => ({
        label: a.label,
        pick: { kind: 'nav', press: a.id === 'start' ? pressStart : pressMastery },
        orbKind: 'action',
      })),
    };
  }
  if (s.menu.screen === 'mastery') return { lines: ['Mastery', ...masteryText(s)], picks: [BACK] };
  const decks = deckOptions(s.menu).map((o) => ({
    label: o.title,
    pick: { kind: 'deck', deckId: o.id } as const,
    orbKind: 'deck' as const,
  }));
  return { lines: [heading, 'Pick a deck to start'], picks: [...decks, BACK] };
}
