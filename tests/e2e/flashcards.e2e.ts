// Requirement: the flashcard game is playable end to end on an emulated Quest 3 with real controller
// input: the page loads without console errors and enters XR with the deck menu in front of the
// player behind a start screen whose 'Start' orb leads to deck select; pointing the ray at a deck orb and pulling the trigger starts a wave of card enemies;
// selecting an enemy reveals its question panel; a wrong orb costs one shield pip and is removed, the
// right orb clears the card (with feedback; on a multi-card enemy the next pool card is then shown); clearing all 12 cards shows the win message and losing
// all 5 shields shows "Shields down. Try again."; progress is saved per deck to localStorage under
// flashcards.fsrs.save (other decks' progress untouched), survives a reload unchanged, and cards
// already answered correctly are not served again in the next run that day.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { forwardness, Game } from './harness.js';
import { answerRight, answerWrong, DECK, pickDeck, pressStart, revealNext, START } from './flow.js';

const SAVE_KEY = 'flashcards.fsrs.save';
const DECK_ID = 'world-capitals';
const RUN_CARDS = 12;
const START_PIPS = 5;
const LOSE_TEXT = 'Shields down. Try again.';
const WIN_TEXTS = ['Day cleared! Well done.', 'Deck conquered! Every card mastered.'];
const SHOTS = process.env.E2E_SCREENSHOT_DIR ?? join(tmpdir(), 'flashcards-e2e');
mkdirSync(SHOTS, { recursive: true });

let game: Game | undefined;
afterEach(async () => {
  if (game?.retriedPresses.length) console.warn(`[e2e] retried presses: ${game.retriedPresses.join('; ')}`);
  await game?.close();
  game = undefined;
});

async function open(): Promise<Game> {
  game = await Game.launch(inject('baseUrl'));
  await game.enterXR();
  await pressStart(game);
  return game;
}

function readSave(g: Game): Promise<string | null> {
  return g.page.evaluate((k) => window.localStorage.getItem(k), SAVE_KEY);
}

// Covers: CARDS-012, CARDS-004, CARDS-005
describe('flashcards emulator playthrough (IWER Quest 3, real controller input)', () => {
  it('loads without console errors and enters XR', async () => {
    const g = await open();
    const s = await g.state();
    await g.screenshot(join(SHOTS, 'load-xr.png'));
    expect(s.session).toBe(true);
    expect(s.orbs.map((o) => o.label)).toContain(DECK);
    expect(g.errors).toEqual([]);
  });

  it('the first menu after entering XR is the start screen: a Start orb and no deck orbs', async () => {
    game = await Game.launch(inject('baseUrl'));
    await game.enterXR();
    const s = await game.until((x) => x.menuOpen && x.orbs.length > 0, 'first menu');
    const labels = s.orbs.map((o) => o.label);
    expect(labels).toContain(START);
    expect(labels).not.toContain(DECK);
    expect(game.errors).toEqual([]);
  });

  // RED until the deck menu is re-placed when the XR session starts: today it stays where the
  // non-XR camera (0,1.6,1) put it at startup, i.e. behind the XR head at (0,1.6,0) facing -Z.
  it('deck menu faces the player after entering XR', async () => {
    const g = await open();
    const s = await g.state();
    const behind = s.orbs.filter((o) => forwardness(s.cam, s.camForward, o.pos) <= 0).map((o) => o.label);
    expect(behind, `deck orbs behind the XR head (cam ${s.cam}, forward ${s.camForward})`).toEqual([]);
  });

  it('picking a deck spawns a wave of card enemies, and revealing one shows its question panel', async () => {
    const g = await open();
    const started = await pickDeck(g);
    expect(started.waveCards).toHaveLength(RUN_CARDS);
    expect(started.active.length).toBeGreaterThan(0);
    expect(started.pips).toBe(START_PIPS);
    const shown = await revealNext(g);
    await g.screenshot(join(SHOTS, 'question.png'));
    expect(shown.orbs.length).toBeGreaterThanOrEqual(2);
    expect(shown.orbs.map((o) => o.label)).toContain(shown.answer);
    expect(g.errors).toEqual([]);
  });

  it('a wrong orb costs one pip and is removed; the correct orb clears the card', async () => {
    const g = await open();
    await pickDeck(g);
    const shown = await revealNext(g);
    const { label, after } = await answerWrong(g, shown);
    expect(after.pips).toBe(START_PIPS - 1);
    expect(after.orbs.map((o) => o.label)).not.toContain(label);
    expect(after.targetId).toBe(shown.targetId);
    const cleared = await answerRight(g, after);
    expect(cleared.cardId).not.toBe(shown.cardId);
    expect(cleared.active.flatMap((e) => e.cards)).not.toContain(shown.cardId);
    expect(cleared.pips).toBe(START_PIPS - 1);
    expect(g.errors).toEqual([]);
  });

  // RED until run-flow/game-session handle a landed enemy strike (enemyHit) and the scene forwards it.
  it('an unanswered card costs one pip when the enemy strike lands', async () => {
    const g = await open();
    await pickDeck(g);
    const shown = await revealNext(g);
    expect(shown.pips).toBe(START_PIPS);
    // Creep (8 s) + telegraph (2 s) from the reveal; no answer is given meanwhile.
    const struck = await g.until((x) => x.pips < START_PIPS, 'enemy strike lands', 30_000);
    expect(struck.pips).toBe(START_PIPS - 1);
    expect(struck.targetId).toBe(shown.targetId);
    expect(g.errors).toEqual([]);
  }, 120_000);

  it('clearing all 12 cards shows the win message', async () => {
    const g = await open();
    await pickDeck(g);
    let s = await g.state();
    for (let i = 0; i < RUN_CARDS && !s.message; i++) s = await answerRight(g, await revealNext(g));
    s = await g.until((x) => x.message, 'end message');
    await g.screenshot(join(SHOTS, 'win.png'));
    expect(s.runStatus).toBe('won');
    expect(s.endTexts).toHaveLength(1);
    expect(WIN_TEXTS).toContain(s.endTexts[0]);
    expect(s.menuOpen).toBe(true);
    expect(g.errors).toEqual([]);
  }, 600_000);

  it('losing all 5 shields shows the lose message', async () => {
    const g = await open();
    await pickDeck(g);
    let s = await g.state();
    for (let i = 0; i < RUN_CARDS && !s.message; i++) {
      const { after } = await answerWrong(g, await revealNext(g));
      s = after.message ? after : await answerRight(g, after);
    }
    s = await g.until((x) => x.message, 'end message');
    await g.screenshot(join(SHOTS, 'lose.png'));
    expect(s.runStatus).toBe('lost');
    expect(s.pips).toBe(0);
    expect(s.endTexts).toEqual([LOSE_TEXT]);
    expect(g.errors).toEqual([]);
  }, 600_000);

  it('the save survives a reload unchanged and correctly answered cards are not served again', async () => {
    const g = await open();
    const pre = await readSave(g);
    const preDecks: Record<string, unknown> = pre ? (JSON.parse(pre).decks ?? {}) : {};
    await pickDeck(g);
    const answered: string[] = [];
    for (let i = 0; i < 3; i++) {
      const shown = await revealNext(g);
      answered.push(shown.cardId!);
      await answerRight(g, shown);
    }
    const before = await readSave(g);
    expect(before).not.toBeNull();
    const saved = JSON.parse(before!);
    expect(saved.version).toBe(2);
    expect(Object.keys(saved.decks[DECK_ID] ?? {})).toEqual(expect.arrayContaining(answered));
    const otherIds = new Set([...Object.keys(saved.decks), ...Object.keys(preDecks)].filter((id) => id !== DECK_ID));
    for (const id of otherIds) expect(saved.decks[id], `deck ${id} touched by a ${DECK_ID} run`).toEqual(preDecks[id]);

    await g.reload();
    expect(await readSave(g)).toBe(before);
    await g.enterXR();
    await pressStart(g);
    const next = await pickDeck(g);
    expect(next.waveCards.length).toBeGreaterThan(0);
    expect(next.waveCards.filter((id) => answered.includes(id))).toEqual([]);
    expect(g.errors).toEqual([]);
  });
});
