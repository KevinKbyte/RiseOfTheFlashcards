// Start screen (M11): pure view model and navigation over GameSession; src/cards.ts only renders it.
// Never mutates input; actions that do not apply return the same object.
import { masteryRows, updateMenu, type GameSession } from './game-session.js';
import { backToStart, openDeckSelect, openMastery } from './menu-flow.js';

export type StartActionId = 'start' | 'mastery';

export interface StartAction {
  id: StartActionId;
  label: string;
}

export interface StartScreenView {
  title: string;
  actions: StartAction[];
  masteryLines: string[];
}

export const START_TITLE = 'Flashcard Defense';
const NO_PROGRESS = 'No progress yet: pick a deck and start a run';

const ACTIONS: readonly StartAction[] = [
  { id: 'start', label: 'Start' },
  { id: 'mastery', label: 'Mastery' },
];

export function startScreenView(s: GameSession): StartScreenView | null {
  if (s.menu.screen !== 'start') return null;
  const rows = masteryRows(s);
  const touched = rows.some((r) => r.learningCount + r.masteredCount > 0);
  return {
    title: START_TITLE,
    actions: ACTIONS.map((a) => ({ ...a })),
    masteryLines: touched ? rows.map((r) => r.text) : [NO_PROGRESS],
  };
}

export function pressStart(s: GameSession): GameSession {
  if (s.menu.screen !== 'start') return s;
  return updateMenu(s, openDeckSelect);
}

export function pressMastery(s: GameSession): GameSession {
  return updateMenu(s, openMastery);
}

export function pressBack(s: GameSession): GameSession {
  if (s.menu.screen !== 'deck-select' && s.menu.screen !== 'mastery') return s;
  return updateMenu(s, backToStart);
}
