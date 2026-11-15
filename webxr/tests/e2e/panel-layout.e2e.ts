// Requirement: on an emulated Quest 3, the question panel stays fully readable while enemies are
// parked in front of the player: with a card's question showing and an enemy halted at its goal in
// the centre fan slot, no parked enemy's projected on-screen outline (per mesh: face, rim, halo)
// overlaps the question panel's projected outline, and wherever an enemy sits above the panel's
// horizontal span its lowest point clears the panel top by at least 2 deg (the centre enemy must not
// cover the top of the question text).
import { afterEach, describe, expect, inject, it } from 'vitest';
import { pickDeck, pressStart, revealNext } from './flow.js';
import { Game } from './harness.js';
import {
  formatBox,
  formatPoly,
  isDrawnBox,
  lowestYInSlab,
  polysIntersect,
  readPanelLayout,
  tanToDeg,
  type PanelLayout,
} from './layout-helpers.js';

/** src/flashcards/fan.ts FAN_SLOT_BEARINGS_DEG index of the 0 deg (straight ahead) slot. */
const CENTRE_SLOT = 1;
/** Minimum clear gap between the panel top and an enemy above it, in view degrees. */
const MIN_GAP_DEG = 2;

let game: Game | undefined;
afterEach(async () => {
  if (game?.retriedPresses.length) console.warn(`[e2e] retried presses: ${game.retriedPresses.join('; ')}`);
  await game?.close();
  game = undefined;
});

/** Polls the layout (frame-stepped, no fixed sleep) until the predicate holds. */
async function untilLayout(g: Game, pred: (l: PanelLayout) => boolean, what: string, timeoutMs = 60_000): Promise<PanelLayout> {
  const deadline = Date.now() + timeoutMs;
  let last = await readPanelLayout(g.page);
  while (!pred(last)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}; last layout: ${JSON.stringify(last)}`);
    await g.frames(2);
    last = await readPanelLayout(g.page);
  }
  return last;
}

const centreParked = (l: PanelLayout) => l.enemies.some((e) => e.slot === CENTRE_SLOT && e.parked && isDrawnBox(e.box));

// Covers: ENC-003, CARDS-010
describe('question panel layout on the emulated Quest 3', () => {
  it('no parked enemy covers the question panel while the centre fan slot is occupied', async () => {
    game = await Game.launch(inject('baseUrl'));
    const g = game;
    await g.enterXR();
    await pressStart(g);
    await pickDeck(g);

    await untilLayout(g, centreParked, 'an enemy parked at its goal in the centre fan slot');
    await revealNext(g);
    const layout = await untilLayout(
      g,
      (l) => l.questionShown && isDrawnBox(l.panel) && centreParked(l),
      'question shown with the centre fan slot enemy parked',
    );
    expect((await g.state()).message, 'run ended before the layout check').toBe(false);

    const panel = layout.panel!;
    expect(isDrawnBox(panel), `panel box drawn and in front: ${formatBox(panel)}`).toBe(true);
    expect(layout.panelPolys.length, 'panel has a projected outline').toBeGreaterThan(0);
    const panelPts = layout.panelPolys.flat();
    const panelTop = Math.max(...panelPts.map(([, y]) => y));
    const panelXLo = Math.min(...panelPts.map(([x]) => x));
    const panelXHi = Math.max(...panelPts.map(([x]) => x));
    const panelDesc = layout.panelPolys.map(formatPoly).join(' + ');
    const parked = layout.enemies.filter((e) => e.parked);
    const centre = parked.filter((e) => e.slot === CENTRE_SLOT);
    expect(centre.length, `centre slot enemy parked: ${JSON.stringify(layout.enemies.map((e) => [e.id, e.slot, e.parked]))}`).toBe(1);
    expect(isDrawnBox(centre[0].box) && centre[0].polys.length > 0, 'centre slot enemy drawn').toBe(true);
    for (const e of parked) {
      expect(isDrawnBox(e.box), `enemy ${e.id} (slot ${e.slot}) box drawn and in front: ${formatBox(e.box)}`).toBe(true);
      expect(e.polys.length, `enemy ${e.id} (slot ${e.slot}) has projected meshes`).toBeGreaterThan(0);
      let lowest: number | null = null;
      for (const [i, poly] of e.polys.entries()) {
        for (const pp of layout.panelPolys) {
          expect(
            polysIntersect(poly, pp),
            `parked enemy ${e.id} (slot ${e.slot}) mesh ${i} outline ${formatPoly(poly)} overlaps question panel outline ${formatPoly(pp)}`,
          ).toBe(false);
        }
        const y = lowestYInSlab(poly, panelXLo, panelXHi);
        if (y !== null && (lowest === null || y < lowest)) lowest = y;
      }
      const gap = lowest === null ? null : tanToDeg(lowest) - tanToDeg(panelTop);
      console.log(`[e2e] enemy ${e.id} slot ${e.slot}: gap above panel ${gap === null ? 'n/a (outside panel x span)' : `${gap.toFixed(2)} deg`}`);
      if (gap !== null) {
        expect(
          gap,
          `parked enemy ${e.id} (slot ${e.slot}) lowest point over the panel span is ${gap.toFixed(2)} deg above the panel top (need >= ${MIN_GAP_DEG}); enemy ${e.polys.map(formatPoly).join(' + ')} panel ${panelDesc}`,
        ).toBeGreaterThanOrEqual(MIN_GAP_DEG);
      }
    }
    expect(g.errors).toEqual([]);
  }, 600_000);
});
