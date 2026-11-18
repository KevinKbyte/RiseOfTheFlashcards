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
import { addSceneLights } from './card-lighting.js';
import { QuestionPanel, showMessage } from './card-question-panel.js';
import { browserSession, shuffled } from './card-session.js';
import { CardSlash } from './card-slash.js';
import { UltimateInput } from './card-ultimate.js';
import { stepFrameClocks, type FrameClocks } from './flashcards/input-clock.js';
import { finishGamepad, mergePendingEnemy, swingGamepad } from './flashcards/finish-haptic.js';
import { mergeOrbPick } from './flashcards/orb-pick.js';
import { slashTargets } from './flashcards/slash-targets.js';
import { panelPrompt, showsAnswerOrbs } from './flashcards/stun-look.js';
import { resolveUltimate, ultimateOrb } from './flashcards/ultimate-input.js';
import { WallTracker } from './card-wall-tracker.js';
import { pickOrbs, type Card } from './flashcards/deck.js';
import { currentCard, hp, livesLabel } from './flashcards/pool.js';
import { cardToPresent, correctOutcome } from './flashcards/peel-present.js';
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
import { menuHeadingAfterNav, menuLayout, type MenuPick } from './card-menu.js';
import {
  answerTarget,
  createWave,
  isWaveCleared,
  slashEnemy,
  tickWave,
  type Wave,
  type WaveEnemy,
} from './flashcards/wave.js';

// Decks imported on the 2D page panel; every VR deck menu opening reads them from here.
// Stored decks load here at startup; panel changes go through updateMenu, which persists them.
let pageSession = browserSession();
const pageMenu = openImport(openDeckSelect(pageSession.menu));
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
  // `game` is capped per frame (creep, telegraph, flash); `input` is real elapsed time (slash, palm push).
  private clocks: FrameClocks = { game: 0, input: 0 };
  private readonly eye = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly headEuler = new Euler(0, 0, 0, 'YXZ');
  // Presses are recorded in the query callback and applied in update(), so entities are never
  // disposed while the input system is still dispatching to them.
  // One slot per kind per frame. Of two same-frame enemy presses only the last is kept (acceptable);
  // the first orb hit wins (mergeOrbPick) so a second hand cannot overwrite an answer.
  // The gamepad is captured in the press callback (trigger still held) or from the swinging hand; it
  // rumbles only if this turns out to be the finishing slash (finishGamepad). Hand tracking has none.
  private pendingEnemy: { id: string; gamepad: Gamepad | undefined } | null = null;
  private pendingOrb: Entity | null = null;
  private pendingUltimateOrb = false;
  private ultimate!: UltimateInput;
  private fxRoot!: Entity;
  private feedback!: CorrectFeedback;
  private readonly fxAt = new Vector3();
  private slash!: CardSlash;

  init(): void {
    this.enemies = new EnemyField(this.world);
    this.slash = new CardSlash(this.world);
    this.panel = new QuestionPanel(this.world);
    this.fxRoot = this.world.createTransformEntity(new Group());
    this.feedback = new CorrectFeedback(this.fxRoot.object3D!);
    this.ultimate = new UltimateInput(this.world);
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
    const { dt, ...clocks } = stepFrameClocks(this.clocks, delta);
    this.clocks = clocks;
    this.walls.refresh(this.queries.planes.entities);
    this.collectSlash();
    this.applySlash();
    this.applyOrb();
    this.applyUltimate(dt);
    this.feedback.update(dt);
    this.placeMenuForSession();
    if (this.message !== undefined) {
      this.updateAnchor();
      return;
    }

    const prevHits = this.targetHits();
    const before = this.wave;
    this.wave = tickWave(before, dt);
    // An enemy parked at the hold line reveals itself (auto-reveal): its card is presented here.
    if (cardToPresent(before, this.wave) !== null) this.presentTarget();
    if (this.wave.targetId !== null && this.targetHits() > prevHits) {
      // A strike landed: game-session costs the pip (may end the run). apply() flashes on a pip
      // change; flash here only when none came (pip cap), so one hit is one flash. A target with no
      // current card has nothing to grade, so the hit is skipped rather than charged to the enemy id.
      const cardId = this.currentCardId();
      if (cardId !== null) {
        const step = enemyHit(this.session, cardId);
        this.apply(step);
        const pipFlashed = step.effects.some((e) => e.type === 'pips');
        if (!pipFlashed && this.panel.isOpen && !this.menuOpen) this.panel.flash(this.panelLines());
      }
    } else this.panel.tickFlash(dt, () => this.panelLines());
    this.enemies.spawnMissing(this.wave, this.walls.walls, this.eye, () => this.readHead());
    this.enemies.update(this.wave, dt, this.clocks.game);
    this.updateAnchor();
  }

  destroy(): void {
    this.panel.clear();
    this.enemies.destroy();
    this.message?.dispose();
    this.message = undefined;
    this.feedback.destroy();
    this.ultimate.destroy();
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
    const orbs = this.panel.show(
      this.eye,
      this.readHead(),
      lines,
      picks.map((p) => p.label),
      picks.map((p) => p.orbKind),
    );
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
        this.wave = createWave(shuffled(effect.cards.map((c) => c.id)), { poolSizes: effect.poolSizes });
      } else if (effect.type === 'pips') {
        this.pips = effect.remaining;
        if (this.panel.isOpen && !this.menuOpen) this.panel.flash(this.panelLines());
      } else if (effect.type === 'endScreen') {
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
    if (this.ultimate.isOrb(entity)) this.pendingUltimateOrb = true;
    else if (id !== undefined) {
      const { left, right } = this.input.xr.gamepads;
      const pad = left?.getSelecting() ? left : right?.getSelecting() ? right : undefined;
      this.pendingEnemy = { id, gamepad: pad?.gamepad };
    } else if (this.panel.hasOrb(entity)) {
      this.pendingOrb = mergeOrbPick(this.pendingOrb, entity);
    }
  }

  // Slashes fill the same pending slots as trigger select, so a same-frame slash and select on one
  // target count once. Which enemies and orbs are slash targets this frame: slashTargets.
  private collectSlash(): void {
    const { orbs, enemyIds } = slashTargets(this.wave, [...this.panel.orbs()]);
    const hits = this.slash.step(this.clocks.input, orbs, enemyIds, (id, out) =>
      this.enemies.worldPosition(id, out),
    );
    for (const hit of hits) {
      if (hit.kind === 'enemy') {
        this.pendingEnemy = mergePendingEnemy(this.pendingEnemy, {
          id: hit.id,
          gamepad: swingGamepad(hit.handedness, this.input.xr.gamepads),
        });
      } else this.pendingOrb = mergeOrbPick(this.pendingOrb, hit.orb);
    }
  }

  // Selecting an enemy or slashing it (see collectSlash) reveals an advancing one, or knocks the top
  // card off the stunned target. slashEnemy() returns the same wave when neither applies.
  private applySlash(): void {
    const pending = this.pendingEnemy;
    if (pending === null) return;
    this.pendingEnemy = null;
    const { id, gamepad } = pending;
    const before = this.wave;
    const next = slashEnemy(before, id);
    if (next === before) return;
    this.wave = next;
    if (before.targetId !== id) {
      this.presentTarget();
      return;
    }
    // Finishing slash: the question panel shatters (CARDS-012) and the next card, or enemy, follows.
    const outcome = correctOutcome(before, next);
    if (!this.enemies.worldPosition(id, this.fxAt)) this.fxAt.copy(this.eye);
    this.feedback.play(this.fxAt, finishGamepad(before, next, id, gamepad));
    this.panel.clear();
    if (outcome.kind === 'defeated') this.enemies.remove(id);
    if (outcome.kind === 'peeled') this.presentTarget();
    else if (isWaveCleared(this.wave)) this.onWaveCleared();
  }

  // Reported once per reveal or pool peel; panel repaints (hit flash) never re-present the card.
  private presentTarget(): void {
    const cardId = this.currentCardId();
    const card = cardId === null ? undefined : this.cards.get(cardId);
    if (cardId === null || card === undefined) return;
    this.showPanel(card);
    this.apply(presented(this.session, cardId, `${cardId}#${++this.encounterSeq}`));
  }

  /** The target's current pool card: the one shown, graded and struck for. */
  private currentCardId(): string | null {
    const target = this.targetEnemy();
    return target === undefined ? null : currentCard(target.pool);
  }

  private targetEnemy(): WaveEnemy | undefined {
    const id = this.wave.targetId;
    return id === null ? undefined : this.wave.active.find((e) => e.id === id);
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
        this.openMenu(menuHeadingAfterNav(this.menuHeading, this.session));
      }
      return;
    }
    const cardId = this.currentCardId();
    const card = cardId === null ? undefined : this.cards.get(cardId);
    // A stunned card is already answered; its orbs wait out the finishing slash.
    if (cardId === null || card === undefined || this.targetEnemy()?.enc.phase === 'stunned') return;
    if (label !== card.answer) this.onWrongAnswer(orb, cardId, label);
    else this.onCorrectAnswer(cardId);
  }

  // Wrong orb: game-session costs a pip (once per encounter) and writes one Again rating.
  private onWrongAnswer(orb: Entity, targetId: string, label: string): void {
    // Removed first: a losing hit's end screen clears the panel and opens the menu.
    this.panel.removeOrb(orb);
    this.apply(wrongOrb(this.session, targetId, label));
  }

  // Correct orb: game-session writes the rating now; the target is stunned (attack stopped, no time
  // limit) until a slash knocks the card off (applySlash). The last card's WIN waits for that slash.
  private onCorrectAnswer(cardId: string): void {
    const step = correctOrb(this.session, cardId);
    this.wave = answerTarget(this.wave, true);
    this.apply(step);
    this.showStunLook();
  }

  // Stunned target (CARDS-012): its answer orbs go and the panel reads "SLASH IT" until the
  // finishing slash; the next card's showPanel brings back the question and fresh orbs.
  private showStunLook(): void {
    if (!showsAnswerOrbs(this.targetEnemy()?.enc.phase ?? null)) {
      for (const orb of [...this.panel.orbs()]) this.panel.removeOrb(orb);
    }
    this.panel.setLines(this.panelLines());
  }

  // Palm push, grip squeeze or orb select -> one fire per frame, only with a strike-slot target;
  // the knockback sends it back to the wave's emerge distance (D7, H-2).
  private applyUltimate(dt: number): void {
    const orbSelected = this.pendingUltimateOrb;
    this.pendingUltimateOrb = false;
    const requests = this.ultimate.collect(this.world.xrFrame, this.world.xrReferenceSpace, this.clocks.input, orbSelected);
    const targetId = this.wave.targetId;
    // A stunned card has no attack to push back, so the ultimate neither fires nor spends its charge.
    const live = this.targetEnemy()?.enc.phase === 'stunned' ? [] : requests;
    const r = resolveUltimate(this.session, this.wave, live, { spawnDistance: this.wave.cfg.spawnDistance });
    this.wave = r.wave;
    this.apply({ session: r.session, effects: r.effects });
    if (targetId !== null && r.effects.some((e) => e.type === 'ultimate')) {
      if (!this.enemies.worldPosition(targetId, this.fxAt)) this.fxAt.copy(this.eye);
      this.ultimate.pulse(this.fxAt);
    }
    this.ultimate.syncOrb(ultimateOrb(this.session.run?.run ?? null), this.eye, this.readHead(), this.clocks.game);
    this.ultimate.update(dt);
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
    const id = this.currentCardId();
    const question = id === null ? '' : (this.cards.get(id)?.prompt ?? '');
    const target = this.targetEnemy();
    const prompt = panelPrompt(target?.enc.phase ?? null, question);
    const pool = target?.pool;
    const cards = pool === undefined ? '' : `   ${livesLabel(hp(pool), pool.maxHp)}`;
    return [prompt, `Braincells: ${this.pips}${cards}`];
  }
}

// Passthrough for this page only: the probe page shares iwsdk.config.json, so the AR session, plane
// detection, and scene understanding are overridden here rather than in the shared config.
// planeDetection: true requests the feature as optional, so a headset with no Space Setup still
// starts a session (enemies then use the ring fallback). level/assets: undefined drop the probe
// scene and its preload manifest; with no level there is no background, so the AR renderer's
// transparent clear shows the room.
const SAVE_ERROR_TEXT = {
  none: '',
  'too-large': 'Imported decks are too large to save; they will be lost on reload.',
  failed: 'Could not save imported decks; they will be lost on reload.',
} as const;
const importRoot = document.getElementById('import-panel');
if (importRoot) {
  const saveStatus = document.createElement('p');
  saveStatus.setAttribute('role', 'status');
  importPanel = mountImportPanel(importRoot, {
    state: pageMenu,
    onChange: (s) => {
      pageSession = updateMenu(pageSession, () => s);
      pageDecks = s.decks;
      saveStatus.textContent = SAVE_ERROR_TEXT[pageSession.deckSaveError ?? 'none'];
    },
  });
  // A sibling of the panel's own container, so panel re-renders leave it in place.
  importRoot.appendChild(saveStatus);
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
  addSceneLights(world.scene);
  world.registerSystem(CardsSystem);
});
