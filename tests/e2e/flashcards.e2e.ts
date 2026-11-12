// Requirement: the flashcard game is playable end to end on an emulated Quest 3 with real controller
// input: the page loads without console errors and enters XR with the deck menu in front of the
// player behind a start screen whose 'Start' orb leads to deck select; pointing the ray at a deck orb
// and pulling the trigger starts a run fought one stack at a time: a single card enemy (12 cards ->
// stacks of 3, 4 and a 5-card boss) walks into the centre slot and shows its card by itself when it
// parks at the hold line (an early select still reveals it), with the HUD line `Shields: N   Cards r/t`;
// a wrong orb costs one shield pip and is removed while the card stays; the right orb only stuns the
// enemy (panel and orbs stay, further orb hits are ignored, nothing is removed) and selecting the
// stunned enemy knocks the card off: the next card of the same enemy shows (`Cards r/t` down by one)
// or, on its last card, the enemy leaves and the next stack walks into the centre slot; a select on a
// revealed, not stunned enemy does nothing; the win message shows only after the last finishing
// select, and losing all 5 shields shows "Shields down. Try again."; progress is saved per deck to
// localStorage under flashcards.fsrs.save (other decks' progress untouched), survives a reload
// unchanged, and cards already answered correctly are not served again in the next run that day.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { forwardness, Game, type GameState } from './harness.js';
import {
  answerRight,
  answerWrong,
  cardsLabel,
  DECK,
  finishTarget,
  hudLine,
  isLastCard,
  pickDeck,
  pressStart,
  revealEarly,
  revealNext,
  START,
  stunTarget,
} from './flow.js';
import { readPanelLayout } from './layout-helpers.js';

const SAVE_KEY = 'flashcards.fsrs.save';
const DECK_ID = 'world-capitals';
const RUN_CARDS = 12;
/** src/flashcards/pool.ts planPoolSizes(12): regular stacks of 3 (leftover 1 joins the last), then the 5-card boss. */
const RUN_STACKS = [3, 4, 5];
/** src/flashcards/fan.ts FAN_SLOT_BEARINGS_DEG index of the 0 deg (straight ahead) slot. */
const CENTRE_SLOT = 1;
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

const hud = (pips: number, remaining: number, total: number) => `Shields: ${pips}   ${cardsLabel(remaining, total)}`;

/** Fan slot of the enemy view `id`, read from the drawn enemy field. */
async function slotOf(g: Game, id: string): Promise<number | null | undefined> {
  return (await readPanelLayout(g.page)).enemies.find((e) => e.id === id)?.slot;
}

function readSave(g: Game): Promise<string | null> {
  return g.page.evaluate((k) => window.localStorage.getItem(k), SAVE_KEY);
}

// Covers: CARDS-012, CARDS-004, CARDS-005, CARDS-010
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

  it('deck menu faces the player after entering XR', async () => {
    const g = await open();
    const s = await g.state();
    const behind = s.orbs.filter((o) => forwardness(s.cam, s.camForward, o.pos) <= 0).map((o) => o.label);
    expect(behind, `deck orbs behind the XR head (cam ${s.cam}, forward ${s.camForward})`).toEqual([]);
  });

  it('picking a deck puts one stacked enemy in the centre slot, and it shows its card by itself at the hold line', async () => {
    const g = await open();
    const started = await pickDeck(g);
    expect(started.waveCards).toHaveLength(RUN_CARDS);
    expect(started.stacks).toEqual(RUN_STACKS);
    expect(started.active).toHaveLength(1);
    expect(started.active[0].cards).toHaveLength(RUN_STACKS[0]);
    expect(started.pips).toBe(START_PIPS);
    // No input from here on: the enemy walks in, parks and reveals its own card.
    const shown = await revealNext(g);
    await g.screenshot(join(SHOTS, 'question.png'));
    expect(shown.targetId).toBe(started.active[0].id);
    expect(shown.active).toHaveLength(1);
    expect(shown.orbs.length).toBeGreaterThanOrEqual(2);
    expect(shown.orbs.map((o) => o.label)).toContain(shown.answer);
    expect(hudLine(shown)).toBe(hud(START_PIPS, RUN_STACKS[0], RUN_STACKS[0]));
    expect(await slotOf(g, shown.targetId!), 'lone enemy fan slot').toBe(CENTRE_SLOT);
    expect(g.errors).toEqual([]);
  });

  it('an early select on the walking enemy still reveals its card', async () => {
    const g = await open();
    await pickDeck(g);
    const { before, after } = await revealEarly(g);
    expect(after.targetId).toBe(before.active.find((e) => e.phase === 'advancing')!.id);
    expect(after.orbs.map((o) => o.label)).toContain(after.answer);
    expect(g.errors).toEqual([]);
  });

  it('a wrong orb costs one pip and is removed; a correct orb only stuns; the finishing select knocks the card off', async () => {
    const g = await open();
    await pickDeck(g);
    const shown = await revealNext(g);
    const { label, after } = await answerWrong(g, shown);
    expect(after.pips).toBe(START_PIPS - 1);
    expect(after.orbs.map((o) => o.label)).not.toContain(label);
    expect(after.targetId).toBe(shown.targetId);
    expect(after.cardId).toBe(shown.cardId);
    expect(after.stunned).toBe(false);

    // A select on the revealed, not stunned enemy does nothing.
    await g.aimAndSelect({ kind: 'enemy', id: after.targetId! });
    await g.frames(10);
    const idle = await g.state();
    expect(idle.cardId).toBe(after.cardId);
    expect(idle.stunned).toBe(false);
    expect(idle.orbs.map((o) => o.label).sort()).toEqual(after.orbs.map((o) => o.label).sort());
    expect(idle.active[0].cards).toEqual(after.active[0].cards);

    const stunned = await stunTarget(g, idle);
    expect(stunned.message).toBe(false);
    expect(stunned.stunned).toBe(true);
    expect(stunned.correct).toBe((idle.correct ?? 0) + 1);
    expect(stunned.targetId).toBe(shown.targetId);
    expect(stunned.cardId).toBe(shown.cardId);
    expect(stunned.active.map((e) => e.id)).toEqual([shown.targetId]);
    expect(stunned.active[0].cards).toEqual(idle.active[0].cards);
    expect(stunned.orbs.map((o) => o.label).sort(), 'panel orbs stay up while stunned').toEqual(idle.orbs.map((o) => o.label).sort());
    expect(stunned.panelText).not.toBeNull();

    // Further orb hits on a stunned card are ignored: no pip, no orb removed, still stunned.
    const other = stunned.orbs.find((o) => o.label !== stunned.answer)!;
    await g.aimAndSelect({ kind: 'orb', label: other.label });
    await g.frames(10);
    const ignored = await g.state();
    expect(ignored.pips).toBe(stunned.pips);
    expect(ignored.stunned).toBe(true);
    expect(ignored.cardId).toBe(shown.cardId);
    expect(ignored.correct).toBe(stunned.correct);
    expect(ignored.orbs.map((o) => o.label).sort()).toEqual(stunned.orbs.map((o) => o.label).sort());

    const cleared = await finishTarget(g, ignored);
    expect(cleared.targetId).toBe(shown.targetId);
    expect(cleared.cardId).not.toBe(shown.cardId);
    expect(cleared.active.flatMap((e) => e.cards)).not.toContain(shown.cardId);
    expect(cleared.stunned).toBe(false);
    expect(cleared.pips).toBe(START_PIPS - 1);
    expect(g.errors).toEqual([]);
  });

  it('Cards r/t counts down by one per finishing select, and a knocked-out stack is replaced by the next in the centre slot', async () => {
    const g = await open();
    await pickDeck(g);
    let s = await revealNext(g);
    const first = s.targetId!;
    const total = RUN_STACKS[0];
    for (let remaining = total; remaining >= 1; remaining--) {
      expect(s.targetId).toBe(first);
      expect(hudLine(s), `HUD before finishing card ${total - remaining + 1}`).toBe(hud(START_PIPS, remaining, total));
      const stunned = await stunTarget(g, s);
      expect(stunned.active.map((e) => e.id), 'stunned enemy stays on the field').toEqual([first]);
      expect(stunned.active[0].cards).toHaveLength(remaining);
      expect(hudLine(stunned), 'a correct orb does not count a card off').toBe(hud(START_PIPS, remaining, total));
      s = await finishTarget(g, stunned);
      expect(s.message).toBe(false);
      if (remaining > 1) {
        expect(s.targetId).toBe(first);
        expect(s.active[0].cards).toHaveLength(remaining - 1);
        expect(hudLine(s)).toBe(hud(START_PIPS, remaining - 1, total));
      }
    }
    expect(s.active.map((e) => e.id)).not.toContain(first);
    const next = await revealNext(g);
    expect(next.targetId).not.toBe(first);
    expect(next.active).toHaveLength(1);
    expect(next.active[0].total).toBe(RUN_STACKS[1]);
    expect(next.stacks).toEqual(RUN_STACKS.slice(1));
    expect(hudLine(next)).toBe(hud(START_PIPS, RUN_STACKS[1], RUN_STACKS[1]));
    expect(await slotOf(g, next.targetId!), 'next stack fan slot').toBe(CENTRE_SLOT);
    expect(g.errors).toEqual([]);
  }, 300_000);

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

  it('clearing all 12 cards shows the win message, only after the last finishing select', async () => {
    const g = await open();
    await pickDeck(g);
    let s: GameState = await g.state();
    let reachedLast = false;
    for (let i = 0; i < RUN_CARDS && !s.message; i++) {
      const shown = await revealNext(g);
      if (!isLastCard(shown)) {
        s = await answerRight(g, shown);
        expect(s.message, `run ended after card ${i + 1} of ${RUN_CARDS}`).toBe(false);
        continue;
      }
      reachedLast = true;
      expect(i, 'last card reached after the other 11').toBe(RUN_CARDS - 1);
      await stunTarget(g, shown);
      await g.frames(10);
      const waiting = await g.state();
      expect(waiting.message, 'end screen before the last finishing select').toBe(false);
      expect(waiting.endTexts).toEqual([]);
      expect(waiting.stunned).toBe(true);
      expect(waiting.runStatus).not.toBe('won');
      s = await finishTarget(g, waiting);
    }
    expect(reachedLast, 'the last card was reached').toBe(true);
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
  }, 300_000);
});
