/**
 * Passthrough (AR) flashcard page: a wave of cartoon-faced card enemies emerges from detected walls
 * (or an even ring when no walls are known) and walks toward the player along its own bearing.
 * Selecting any enemy at any distance (controller trigger, hand pinch ray, or mouse) reveals it as
 * the single target; its question pops out on a see-through panel with answer orbs below it.
 *
 * Composition root: wave state lives here; menu, run and FSRS review rules live in the pure
 * game-session, which this system feeds seam events and whose effects it renders. Rendering is
 * delegated to EnemyField (enemies), QuestionPanel (panel, orbs, messages) and WallTracker (XR planes).
 */
import {
  Euler,
  Group,
  Pressed,
  Quaternion,
  RayInteractable,
  SessionMode,
  Vector3,
  World,
  XRPlane,
  createSystem,
  type Entity,
  type WorldOptions,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { EnemyField } from './card-enemy-field.js';
import { CorrectFeedback } from './card-feedback.js';
import { QuestionPanel, showMessage } from './card-question-panel.js';
import { browserSession, shuffled } from './card-session.js';
import { WallTracker } from './card-wall-tracker.js';
import { pickOrbs, type Card } from './flashcards/deck.js';
import {
  correctOrb,
  enemyHit,
  masteryText,
  presented,
  startRun,
  updateMenu,
  waveCleared,
  wrongOrb,
  type GameSession,
  type SessionStep,
} from './flashcards/game-session.js';
import { backToStart, openDeckSelect, openImport, selectDeck } from './flashcards/menu-flow.js';
import { mountImportPanel, type ImportPanelHandle } from './import-panel.js';
import { menuLayout, type MenuPick } from './card-menu.js';
import {
  answerTarget,
  createWave,
  isWaveCleared,
  revealEnemy,
  tickWave,
  type Wave,
} from './flashcards/wave.js';

const MAX_DT = 0.1;

// Decks imported on the 2D page panel; every VR deck menu opening reads them from here.
const pageMenu = openImport(openDeckSelect(browserSession().menu));
let pageDecks = pageMenu.decks;
let importPanel: ImportPanelHandle | undefined;

export class CardsSystem extends createSystem({
  pressed: { required: [RayInteractable, Pressed] },
  planes: { required: [XRPlane] },
}) {
  private wave: Wave = createWave([]);
  private readonly cards = new Map<string, Card>();
  private session!: GameSession;
  /** The panel is showing the deck menu (orbs are deck titles), not a question. */
  private menuOpen = false;
  private menuHeading = '';
  // The XR session the menu was last placed for; a new session re-places it at the XR head.
  private placedFor: XRSession | undefined;
  private sessionSeen: XRSession | undefined;
  // Menu orb -> pick, so duplicate deck titles still start the deck that was picked.
  private readonly menuPicks = new Map<Entity, MenuPick>();
  private pips = 0;
  // Each reveal is one presentation; the counter makes its encounter id unique for the run-flow.
  private encounterSeq = 0;
  private enemies!: EnemyField;
  private panel!: QuestionPanel;
  private readonly walls = new WallTracker();
  private message: Entity | undefined;
  private clock = 0;
  private readonly eye = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly headEuler = new Euler(0, 0, 0, 'YXZ');
  // Presses are recorded in the query callback and applied in update(), so entities are never
  // disposed while the input system is still dispatching to them.
  // One slot per kind per frame: of two same-frame presses only the last is kept; acceptable.
  private pendingEnemyId: string | null = null;
  private pendingOrb: Entity | null = null;
  // Captured in the press callback, while the answering trigger or pinch is still held.
  private pendingGamepad: Gamepad | undefined;
  private fxRoot!: Entity;
  private feedback!: CorrectFeedback;
  private readonly fxAt = new Vector3();

  init(): void {
    this.enemies = new EnemyField(this.world);
    this.panel = new QuestionPanel(this.world);
    this.fxRoot = this.world.createTransformEntity(new Group());
    this.feedback = new CorrectFeedback(this.fxRoot.object3D!);
    this.session = browserSession();
    this.openMenu('Flashcard Defense');
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => this.onPress(entity)),
      this.queries.planes.subscribe('qualify', () => this.walls.markDirty()),
      this.queries.planes.subscribe('disqualify', () => this.walls.markDirty()),
    );
  }

  // tickWave() is pure and returns a fresh wave each frame: a tiny allocation accepted for the
  // prototype in exchange for a fully unit-tested wave loop.
  update(delta: number): void {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_DT) : 0;
    this.clock += dt;
    this.walls.refresh(this.queries.planes.entities);
    this.applyReveal();
    this.applyOrb();
    this.feedback.update(dt);
    this.placeMenuForSession();
    if (this.message !== undefined) {
      this.updateAnchor();
      return;
    }

    const prevHits = this.targetHits();
    this.wave = tickWave(this.wave, dt);
    const targetId = this.wave.targetId;
    if (targetId !== null && this.targetHits() > prevHits) {
      // A strike landed: flash the hit, then let game-session cost the pip (may end the run).
      this.panel.flash(this.panelLines());
      this.apply(enemyHit(this.session, targetId));
    } else this.panel.tickFlash(dt, () => this.panelLines());
    this.enemies.spawnMissing(this.wave, this.walls.walls, this.eye, () => this.readHead());
    this.enemies.update(this.wave, dt, this.clock);
    this.updateAnchor();
  }

  destroy(): void {
    this.panel.clear();
    this.enemies.destroy();
    this.message?.dispose();
    this.message = undefined;
    this.feedback.destroy();
    this.fxRoot.dispose();
    super.destroy();
  }

  /** Renders the current menu screen (start, mastery or deck select) on the question panel. */
  private openMenu(heading: string): void {
    // Decks imported on the 2D page join the menu without changing which screen it shows.
    this.session = updateMenu(this.session, (m) => ({ ...m, decks: pageDecks }));
    this.panel.clear();
    this.menuOpen = true;
    this.menuHeading = heading;
    this.placedFor = this.world.session;
    const { lines, picks } = menuLayout(this.session, heading);
    const orbs = this.panel.show(this.eye, this.readHead(), lines, picks.map((p) => p.label));
    this.menuPicks.clear();
    orbs.forEach((orb, i) => this.menuPicks.set(orb, picks[i].pick));
  }

  // The startup menu is placed from the non-XR camera; once a session starts, re-open it at the
  // XR head so the deck orbs are in front of the player rather than behind. The camera only takes
  // the XR pose when the session's first frame renders, so the re-place waits one frame.
  private placeMenuForSession(): void {
    const session = this.world.session;
    const seen = this.sessionSeen;
    this.sessionSeen = session;
    // The 2D import panel must not take input behind the headset while a session runs.
    if (session !== seen) importPanel?.setHidden(session !== undefined);
    if (!this.menuOpen || session === undefined || session !== seen || session === this.placedFor) return;
    this.openMenu(this.menuHeading);
  }

  // The selected deck's FSRS queue (via game-session) decides what enters the wave.
  private startRun(deckId: string): void {
    const step = startRun(updateMenu(this.session, (m) => selectDeck(m, deckId)));
    if (step.session.menu.screen !== 'playing') return;
    this.menuOpen = false;
    this.panel.clear();
    this.message?.dispose();
    this.message = undefined;
    this.clearEnemies();
    this.apply(step);
  }

  /** Renders the plain-data effects game-session returns for each seam event. */
  private apply(step: SessionStep): void {
    this.session = step.session;
    for (const effect of step.effects) {
      if (effect.type === 'spawnWave') {
        this.cards.clear();
        for (const card of effect.cards) this.cards.set(card.id, card);
        this.wave = createWave(shuffled(effect.cards.map((c) => c.id)));
      } else if (effect.type === 'pips') {
        this.pips = effect.remaining;
        if (this.panel.isOpen && !this.menuOpen) this.panel.flash(this.panelLines());
      } else {
        this.endRun(effect.text);
      }
    }
  }

  private endRun(text: string): void {
    this.clearEnemies();
    this.message?.dispose();
    this.message = showMessage(this.world, this.eye, this.readHead(), [text, ...masteryText(this.session)]);
    this.session = updateMenu(this.session, (m) => openDeckSelect(backToStart({ ...m, decks: pageDecks })));
    this.openMenu('Play again?');
  }

  private clearEnemies(): void {
    for (const enemy of this.wave.active) this.enemies.remove(enemy.id);
    this.wave = createWave([]);
  }

  private onPress(entity: Entity): void {
    this.feedback.unlockAudio();
    const id = this.enemies.idOf(entity);
    if (id !== undefined) this.pendingEnemyId = id;
    else if (this.panel.hasOrb(entity)) {
      this.pendingOrb = entity;
      const { left, right } = this.input.xr.gamepads;
      const pad = left?.getSelecting() ? left : right?.getSelecting() ? right : undefined;
      this.pendingGamepad = pad?.gamepad;
    }
  }

  // Selecting an enemy stands in for a slash; a real swing gesture is a later slice. revealEnemy()
  // returns the same wave when another enemy is already the target or the phase does not allow it.
  private applyReveal(): void {
    const id = this.pendingEnemyId;
    if (id === null) return;
    this.pendingEnemyId = null;
    const next = revealEnemy(this.wave, id);
    if (next === this.wave) return;
    this.wave = next;
    const card = this.cards.get(id);
    if (card === undefined) return;
    this.showPanel(card);
    // Reported here, once per reveal; panel repaints (hit flash) never re-present the card.
    this.apply(presented(this.session, id, `${id}#${++this.encounterSeq}`));
  }

  private applyOrb(): void {
    const orb = this.pendingOrb;
    if (orb === null) return;
    this.pendingOrb = null;
    const label = this.panel.labelOf(orb);
    if (label === undefined) return;
    if (this.menuOpen) {
      const pick = this.menuPicks.get(orb);
      if (pick?.kind === 'deck') this.startRun(pick.deckId);
      else if (pick?.kind === 'nav') {
        this.session = pick.press(this.session);
        this.openMenu(this.menuHeading);
      }
      return;
    }
    const targetId = this.wave.targetId;
    const card = targetId === null ? undefined : this.cards.get(targetId);
    if (targetId === null || card === undefined) return;
    if (label !== card.answer) this.onWrongAnswer(orb, targetId, label);
    else this.onCorrectAnswer(targetId);
  }

  // Wrong orb: game-session costs a pip (once per encounter) and writes one Again rating.
  private onWrongAnswer(orb: Entity, targetId: string, label: string): void {
    // Removed first: a losing hit's end screen clears the panel and opens the menu.
    this.panel.removeOrb(orb);
    this.apply(wrongOrb(this.session, targetId, label));
  }

  // Correct orb: game-session clears the card and writes its rating; the last card is the WIN.
  private onCorrectAnswer(targetId: string): void {
    const step = correctOrb(this.session, targetId);
    this.wave = answerTarget(this.wave, true);
    if (!this.enemies.worldPosition(targetId, this.fxAt)) this.fxAt.copy(this.eye);
    this.feedback.play(this.fxAt, this.pendingGamepad);
    this.panel.clear();
    this.enemies.remove(targetId);
    this.apply(step);
    if (isWaveCleared(this.wave)) this.onWaveCleared();
  }

  private onWaveCleared(): void {
    this.apply(waveCleared(this.session));
  }

  private targetHits(): number {
    const id = this.wave.targetId;
    if (id === null) return 0;
    return this.wave.active.find((e) => e.id === id)?.enc.hits ?? 0;
  }

  private readHead(): number {
    this.world.camera.getWorldPosition(this.eye);
    this.world.camera.getWorldQuaternion(this.headQuat);
    return this.headEuler.setFromQuaternion(this.headQuat, 'YXZ').y;
  }

  private showPanel(card: Card): void {
    const headYaw = this.readHead();
    const lines = this.panelLines();
    const pool = this.session.deck?.cards ?? [card];
    const labels = pickOrbs(card, pool, Math.random).map((orb) => orb.label);
    this.panel.show(this.eye, headYaw, lines, labels);
    this.updateAnchor();
  }

  // The head is only read while the panel is open.
  private updateAnchor(): void {
    if (this.panel.isOpen) this.panel.followHead(this.readHead());
  }

  private panelLines(): string[] {
    const id = this.wave.targetId;
    const prompt = id === null ? '' : (this.cards.get(id)?.prompt ?? '');
    return [prompt, `Shields: ${this.pips}   Hits: ${this.targetHits()}`];
  }
}

// Passthrough for this page only: the probe page shares iwsdk.config.json, so the AR session, plane
// detection, and scene understanding are overridden here rather than in the shared config.
// planeDetection: true requests the feature as optional, so a headset with no Space Setup still
// starts a session (enemies then use the ring fallback). level/assets: undefined drop the probe
// scene and its preload manifest; with no level there is no background, so the AR renderer's
// transparent clear shows the room.
const importRoot = document.getElementById('import-panel');
if (importRoot) {
  importPanel = mountImportPanel(importRoot, {
    state: pageMenu,
    onChange: (s) => {
      pageDecks = s.decks;
    },
  });
}

type XRConfig = Exclude<WorldOptions['xr'], false | undefined>;
const baseXr: XRConfig = projectOptions.xr || {};

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  ...projectOptions,
  level: undefined,
  assets: undefined,
  xr: {
    ...baseXr,
    sessionMode: SessionMode.ImmersiveAR,
    features: { ...baseXr.features, planeDetection: true },
  },
  features: { ...projectOptions.features, sceneUnderstanding: true },
}).then((world) => {
  world.registerSystem(CardsSystem);
});
