// Drives cards.html in headless Chromium with the IWER-emulated Quest 3 the page installs in dev:
// launch, enter XR, read the CardsSystem state, and answer with real controller input (aim the
// right controller's ray at a target, then pull and release the trigger).
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export type Vec3 = [number, number, number];

export interface GameState {
  session: boolean;
  menuOpen: boolean;
  pips: number;
  message: boolean;
  /** Revealed enemy id (its first card's id; stays fixed while later pool cards are peeled). */
  targetId: string | null;
  /** The revealed enemy's current pool card: the one shown, graded and answered. */
  cardId: string | null;
  /** Card ids of the current wave (spawned + queued). */
  waveCards: string[];
  /** `cards`: the enemy's remaining pool cards, current first; `total`: its starting card count; `phase`: its encounter phase. */
  active: { id: string; pos: Vec3 | null; cards: string[]; total: number; phase: string }[];
  /** Card ids still queued behind the field (later stacks), in spawn order. */
  queue: string[];
  /** Card count of every stack still to fight: field stacks' starting counts, then the queued stacks. */
  stacks: number[];
  /** The revealed target answered correctly and waiting for the finishing slash. */
  stunned: boolean;
  /** Text lines last painted on the question panel (show or repaint); null while no question panel is drawn. */
  panelText: string[] | null;
  orbs: { label: string; pos: Vec3 }[];
  answer: string | null;
  runStatus: string | null;
  /** Run already won but the WIN screen is held until the last enemy's finishing slash; null outside a run. */
  winPending: boolean | null;
  endTexts: string[];
  cam: Vec3;
  camForward: Vec3;
  /** Run ultimate charge and correct count; null outside a run. */
  charge: number | null;
  correct: number | null;
  /** Centre of the ultimate orb while it shows, else null. */
  ultimateOrb: Vec3 | null;
  /** Whether the shown ultimate orb is lit (bright ready glow) rather than dim; null while no orb shows. */
  ultimateGlow: boolean | null;
  /** Revealed enemy's distance from the player (metres), and the wave's spawn distance. */
  targetDistance: number | null;
  spawnDistance: number;
  /** Ultimate shockwaves played so far (knockback feedback). */
  pulses: number;
  /** Revealed target and its distance captured in the frame of the latest shockwave, or null before any. */
  lastPulse: { targetId: string | null; targetDistance: number | null } | null;
}

export type Target = { kind: 'orb'; label: string } | { kind: 'enemy'; id: string } | { kind: 'ultimate' };

/**
 * One slash classifier step: the controller tip it sampled (grip + 0.12 m along grip -Z) and the
 * slash input clock (s). `tip` is null on a step that kept no sample (post-slash cooldown or
 * untracked controller), which also resets the classifier's path.
 */
export interface TipSample {
  tip: Vec3 | null;
  clock: number;
}

// Page-side helpers, installed before any page script runs so they survive reloads. They only read
// the world through window.FRAMEWORK_MCP_RUNTIME and drive input through window.IWER_DEVICE.
const PAGE_HELPERS = `
(() => {
  const H = {};
  H.world = () => window.FRAMEWORK_MCP_RUNTIME && window.FRAMEWORK_MCP_RUNTIME.world;
  H.sys = () => { const w = H.world(); return w && w.systems.find((s) => s.constructor.name === 'CardsSystem'); };
  H.V = () => H.world().camera.position.constructor;
  H.Q = () => H.world().camera.quaternion.constructor;
  H.arr = (v) => [v.x, v.y, v.z];
  // Centre of an object's meshes (world space), so the ray aims at what is drawn, not the pivot.
  H.center = (obj) => {
    const V = H.V();
    obj.updateWorldMatrix(true, true);
    const acc = new V(); let n = 0;
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      acc.add(o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld)); n++;
    });
    if (n === 0) { obj.getWorldPosition(acc); return H.arr(acc); }
    return H.arr(acc.multiplyScalar(1 / n));
  };
  // Drawn lightness (HSL, 0..1) of the first coloured mesh under obj: what the player sees as dim vs lit.
  H.lightness = (obj) => {
    let l = null;
    obj.traverse((o) => {
      if (l !== null || !o.isMesh || !o.material || !o.material.color) return;
      l = o.material.color.getHSL({ h: 0, s: 0, l: 0 }).l;
    });
    return l;
  };
  // Dim orb is ~0.27 lightness, the ready glow ~0.53 and brighter while it pulses.
  H.GLOW_LIGHTNESS = 0.4;
  H.hookEnd = () => {
    const s = H.sys();
    if (!s || s.__e2eHooked) return;
    s.__e2eHooked = true; s.__e2eEndTexts = [];
    const orig = s.endRun;
    s.endRun = function (text) { this.__e2eEndTexts.push(text); return orig.call(this, text); };
    s.__e2ePulses = 0; s.__e2eLastPulse = null;
    // Lines the question panel actually painted: show() paints them, repaint() re-paints (hit flash),
    // clear() removes the panel.
    const p = s.panel; s.__e2ePanelText = null;
    const origShow = p.show; const origRepaint = p.repaint; const origClear = p.clear;
    p.show = function (eye, yaw, lines, ...rest) { s.__e2ePanelText = [...lines]; return origShow.call(this, eye, yaw, lines, ...rest); };
    p.repaint = function (lines) { if (this.panelMesh) s.__e2ePanelText = [...lines]; return origRepaint.call(this, lines); };
    p.clear = function () { s.__e2ePanelText = null; return origClear.call(this); };
    const u = s.ultimate; const origPulse = u.pulse;
    // pulse() runs in the firing frame right after the knockback is applied to s.wave, so the
    // target distance read here is the knockback result before any later creep.
    u.pulse = function (at) {
      s.__e2ePulses++;
      const id = s.wave.targetId;
      const e = id === null ? undefined : s.wave.active.find((x) => x.id === id);
      s.__e2eLastPulse = { targetId: id, targetDistance: e ? e.enc.distance : null };
      return origPulse.call(this, at);
    };
  };
  H.state = () => {
    const w = H.world(); const s = H.sys(); const V = H.V();
    H.hookEnd();
    const cam = new V(); w.camera.getWorldPosition(cam);
    const fwd = new V(0, 0, -1).applyQuaternion(w.camera.getWorldQuaternion(new (H.Q())()));
    const views = s.enemies.views;
    const target = s.wave.targetId;
    const targetEnemy = target === null ? undefined : s.wave.active.find((e) => e.id === target);
    const cardId = targetEnemy && targetEnemy.pool.cards.length > 0 ? targetEnemy.pool.cards[0] : null;
    const card = cardId === null ? undefined : s.cards.get(cardId);
    const run = s.session.run;
    const orbObj = s.ultimate.orb && s.ultimate.orb.object3D;
    const orbL = orbObj ? H.lightness(orbObj) : null;
    return {
      session: !!w.session,
      menuOpen: s.menuOpen,
      pips: s.pips,
      message: s.message !== undefined,
      targetId: target,
      cardId,
      waveCards: [...s.cards.keys()],
      active: s.wave.active.map((e) => { const v = views.get(e.id); return { id: e.id, pos: v && v.entity.object3D ? H.center(v.entity.object3D) : null, cards: [...e.pool.cards], total: e.pool.maxHp, phase: e.enc.phase }; }),
      queue: [...s.wave.queue],
      stacks: [...s.wave.active.map((e) => e.pool.maxHp), ...s.wave.queueSizes],
      stunned: !!targetEnemy && targetEnemy.enc.phase === 'stunned',
      panelText: s.menuOpen || !s.__e2ePanelText ? null : s.__e2ePanelText.slice(),
      orbs: [...s.panel.orbLabels.entries()].map(([e, label]) => ({ label, pos: H.center(e.object3D) })),
      answer: card ? card.answer : null,
      runStatus: run && run.run ? run.run.status : null,
      winPending: run ? !!run.winPending : null,
      endTexts: s.__e2eEndTexts.slice(),
      cam: H.arr(cam),
      camForward: H.arr(fwd),
      charge: run && run.run ? run.run.charge : null,
      correct: run && run.run ? run.run.correct : null,
      ultimateOrb: orbObj ? H.center(orbObj) : null,
      ultimateGlow: orbL === null ? null : orbL > H.GLOW_LIGHTNESS,
      targetDistance: targetEnemy ? targetEnemy.enc.distance : null,
      spawnDistance: s.wave.cfg.spawnDistance,
      pulses: s.__e2ePulses,
      lastPulse: s.__e2eLastPulse,
    };
  };
  H.targetPos = (t) => {
    const s = H.sys();
    if (t.kind === 'ultimate') {
      const o = s.ultimate.orb;
      return o && o.object3D ? H.center(o.object3D) : null;
    }
    if (t.kind === 'orb') {
      for (const [e, label] of s.panel.orbLabels) if (label === t.label) return H.center(e.object3D);
      return null;
    }
    const v = s.enemies.views.get(t.id);
    return v && v.entity.object3D ? H.center(v.entity.object3D) : null;
  };
  // Point the right controller's ray at the target through IWER's remote-control interface. Writing
  // controllers.right.quaternion directly does not stick: in manual control mode the DevUI re-applies
  // its own pose every frame, while a remote command captures the device (DevUI goes passive).
  H.aim = async (t) => {
    const p = H.targetPos(t); if (!p) return false;
    await window.IWER_DEVICE.remote.dispatch('look_at', { device: 'controller-right', target: { x: p[0], y: p[1], z: p[2] } });
    return true;
  };
  // Cosine between the ray space's forward and the direction to the target (1 = dead on).
  H.rayAlign = (t) => {
    const p = H.targetPos(t); if (!p) return -2;
    const V = H.V(); const rs = H.world().player.raySpaces.right;
    const o = new V(); rs.getWorldPosition(o);
    const f = new V(0, 0, -1).applyQuaternion(rs.getWorldQuaternion(new (H.Q())()));
    return f.dot(new V(p[0], p[1], p[2]).sub(o).normalize());
  };
  H.rayDebug = () => {
    const rs = H.world().player.raySpaces.right; const c = window.IWER_DEVICE.controllers.right;
    const o = new (H.V())(); rs.getWorldPosition(o);
    const q = rs.getWorldQuaternion(new (H.Q())());
    return { rayPos: H.arr(o), rayQuat: [q.x, q.y, q.z, q.w], ctrlPos: H.arr(c.position), ctrlQuat: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w] };
  };
  // Answer orb pivot (the slash collider centre; H.center would include the label mesh).
  H.orbPivot = (label) => {
    for (const [e, l] of H.sys().panel.orbLabels) {
      if (l !== label || !e.object3D) continue;
      const v = new (H.V())(); e.object3D.getWorldPosition(v); return H.arr(v);
    }
    return null;
  };
  // Controller slash tip in world space, as src/card-slash.ts samples it: grip pose + 0.12 m along grip -Z.
  H.tip = () => {
    const g = H.world().player.gripSpaces.right; const V = H.V();
    const p = new V(); g.getWorldPosition(p);
    const q = g.getWorldQuaternion(new (H.Q())());
    return H.arr(p.add(new V(0, 0, -0.12).applyQuaternion(q)));
  };
  // Moves the right controller so its tip visits each world point, one IWER set_transform per XR
  // frame at a fixed orientation. Returns the right-controller samples the slash classifier itself
  // recorded during the sweep (tip in world space, slash input clock = CardsSystem clocks.input,
  // real elapsed seconds), read from CardSlash state right after each step(), so the trace is
  // exactly the path and timing the classifier judged, not a separate read that can straddle frames.
  // With stepS, CardsSystem.update receives exactly stepS as its frame delta during the sweep, so
  // the slash input clock (and every speed and sample gap the classifier sees) is wall-clock free.
  H.sweepTip = async (points, stepS) => {
    const dev = window.IWER_DEVICE; const c = dev.controllers.right; const V = H.V();
    const orientation = { x: 0, y: 0, z: 0, w: 1 };
    await dev.remote.dispatch('set_transform', { device: 'controller-right', orientation });
    await H.frames(3);
    const origin = H.world().playerEntity.object3D.matrixWorld;
    const inv = origin.clone().invert();
    const lifted = new V(c.position.x, c.position.y, c.position.z).applyMatrix4(origin);
    const delta = new V(...H.tip()).sub(lifted);
    const sys = H.sys(); const slash = sys.slash; const origStep = slash.step;
    const hadOwnUpdate = Object.prototype.hasOwnProperty.call(sys, 'update'); const origUpdate = sys.update;
    if (stepS !== undefined) sys.update = function (_delta, ...rest) { return origUpdate.call(this, stepS, ...rest); };
    const trace = [];
    slash.step = function (...args) {
      const hits = origStep.apply(this, args);
      const ss = this.state && this.state.rightController && this.state.rightController.samples;
      const last = ss && ss.length ? ss[ss.length - 1] : null;
      trace.push(last ? { tip: [last.pos.x, last.pos.y, last.pos.z], clock: last.t } : { tip: null, clock: args[0] });
      return hits;
    };
    try {
      for (const p of points) {
        const r = new V(p[0], p[1], p[2]).sub(delta).applyMatrix4(inv);
        await dev.remote.dispatch('set_transform', { device: 'controller-right', position: { x: r.x, y: r.y, z: r.z }, orientation });
        await H.frames(1);
      }
      await H.frames(1);
    } finally {
      slash.step = origStep;
      if (hadOwnUpdate) sys.update = origUpdate; else delete sys.update;
    }
    return trace;
  };
  H.trigger = (v) => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: 'controller-right', value: v });
  // Resolves after n XR frames (the session drives rendering once XR is entered).
  H.frames = (n) => new Promise((done) => {
    const w = H.world(); let left = n;
    const raf = w.session ? (cb) => w.session.requestAnimationFrame(cb) : (cb) => requestAnimationFrame(cb);
    const tick = () => (--left <= 0 ? done(true) : raf(tick));
    raf(tick);
  });
  window.__e2e = H;
})();
`;

export interface LaunchOptions {
  headless?: boolean;
  args?: string[];
  viewport?: { width: number; height: number };
  recordVideo?: { dir: string; size: { width: number; height: number } };
}

export const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** Right controller rest pose (local position, identity orientation): just in front of the head. */
export const REST_POSE: Vec3 = [0, 1.55, -0.05];

export class Game {
  readonly errors: string[] = [];
  readonly retriedPresses: string[] = [];
  /**
   * Where every aimed select starts: the right controller returns here (identity orientation) before
   * it is turned toward a target, so a press never aims from wherever a slash sweep left the hand.
   * From IWER's default hand position (0.25,1.5,-0.4) the ray starts beside enemies standing at
   * reach (0.7 m) and misses them.
   */
  restPose: Vec3 = REST_POSE;

  private constructor(
    readonly browser: Browser,
    readonly context: BrowserContext,
    readonly page: Page,
    private readonly url: string,
  ) {
    page.on('console', (m) => {
      if (m.type() === 'error') this.errors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => this.errors.push(`pageerror: ${e.message}`));
  }

  /**
   * Fresh browser + context (empty localStorage), cards.html loaded and the world running. `opts`
   * is for the video capture script (headed mode, viewport, recordVideo); tests use the defaults.
   */
  static async launch(baseUrl: string, opts: LaunchOptions = {}): Promise<Game> {
    const browser = await chromium.launch({ headless: opts.headless ?? true, args: opts.args ?? LAUNCH_ARGS });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: opts.viewport ?? { width: 1280, height: 800 },
      ...(opts.recordVideo ? { recordVideo: opts.recordVideo } : {}),
    });
    await context.addInitScript({ content: PAGE_HELPERS });
    const page = await context.newPage();
    const game = new Game(browser, context, page, `${baseUrl}/cards.html`);
    await game.load();
    return game;
  }

  async load(): Promise<void> {
    await this.page.goto(this.url);
    await this.page.waitForFunction(() => !!(window as any).__e2e?.sys(), null, { timeout: 60_000 });
  }

  async reload(): Promise<void> {
    await this.page.reload();
    await this.page.waitForFunction(() => !!(window as any).__e2e?.sys(), null, { timeout: 60_000 });
  }

  /** Clicks IWER's "Enter XR" overlay button (top centre) until the immersive session is live. */
  async enterXR(): Promise<void> {
    await this.page.waitForFunction(() => {
      const w = (window as any).__e2e.world();
      return !!(window as any).IWER_DEVICE && !!w.renderer;
    }, null, { timeout: 30_000 });
    for (let i = 0; i < 10; i++) {
      await this.page.mouse.click(640, 27);
      const ok = await this.page
        .waitForFunction(() => !!(window as any).__e2e.world().session, null, { timeout: 3000 })
        .then(() => true, () => false);
      if (ok) break;
    }
    await this.rest(5);
  }

  /** Right controller to `restPose` with identity orientation, settled for `frames` XR frames. */
  async rest(frames = 2): Promise<void> {
    const [x, y, z] = this.restPose;
    await this.page.evaluate(
      (p) =>
        (window as any).IWER_DEVICE.remote.dispatch('set_transform', {
          device: 'controller-right',
          position: p,
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        }),
      { x, y, z },
    );
    await this.frames(frames);
  }

  state(): Promise<GameState> {
    return this.page.evaluate(() => (window as any).__e2e.state());
  }

  frames(n: number): Promise<unknown> {
    return this.page.evaluate((k) => (window as any).__e2e.frames(k), n);
  }

  /** Waits (polling, no fixed sleep) until the predicate over the game state holds. */
  async until(pred: (s: GameState) => boolean, what: string, timeoutMs = 30_000): Promise<GameState> {
    const deadline = Date.now() + timeoutMs;
    let last = await this.state();
    while (!pred(last)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}; last state: ${JSON.stringify(last)}`);
      await this.frames(2);
      last = await this.state();
    }
    return last;
  }

  /**
   * Real input: returns the right controller to its rest pose, points its ray at the target and
   * clicks the trigger. With `done`,
   * clicks again (up to `maxPresses`) until the predicate holds; every click beyond the first is
   * logged in `retriedPresses` so a swallowed press stays visible in the report.
   */
  async aimAndSelect(target: Target, done?: (s: GameState) => boolean, maxPresses = 3): Promise<number> {
    for (let press = 1; ; press++) {
      await this.pressAt(target);
      if (!done) return press;
      const ok = await this.until(done, `effect of press ${press} on ${JSON.stringify(target)}`, 4000).then(
        () => true,
        () => false,
      );
      if (ok) {
        if (press > 1) this.retriedPresses.push(`${JSON.stringify(target)} needed ${press} presses`);
        return press;
      }
      if (press >= maxPresses) throw new Error(`aimAndSelect: ${maxPresses} presses on ${JSON.stringify(target)} had no effect`);
    }
  }

  private async pressAt(target: Target): Promise<void> {
    const page = this.page;
    await this.rest();
    const aimed = await page.evaluate((t) => (window as any).__e2e.aim(t), target);
    if (!aimed) throw new Error(`aimAndSelect: target not found ${JSON.stringify(target)}`);
    const deadline = Date.now() + 10_000;
    for (;;) {
      const align = await page.evaluate((t) => {
        (window as any).__e2e.aim(t);
        return (window as any).__e2e.rayAlign(t);
      }, target);
      if (align > 0.9995) break;
      if (Date.now() > deadline) {
        const dbg = await page.evaluate(() => (window as any).__e2e.rayDebug());
        throw new Error(`aimAndSelect: ray never aligned with ${JSON.stringify(target)} (cos ${align}); ${JSON.stringify(dbg)}`);
      }
      await this.frames(1);
    }
    await this.frames(2);
    await page.evaluate((t) => (window as any).__e2e.aim(t), target);
    await page.evaluate(() => (window as any).__e2e.trigger(1));
    await this.frames(3);
    await page.evaluate(() => (window as any).__e2e.trigger(0));
    await this.frames(3);
  }

  /** World pivot of the answer orb labelled `label` (its slash collider centre), or null. */
  orbPivot(label: string): Promise<Vec3 | null> {
    return this.page.evaluate((l) => (window as any).__e2e.orbPivot(l), label);
  }

  /** Current controller slash tip in world space. */
  tip(): Promise<Vec3> {
    return this.page.evaluate(() => (window as any).__e2e.tip());
  }

  /**
   * Real input: sweeps the right controller tip through `points`, one point per XR frame. With
   * `stepS`, every frame of the sweep advances the slash input clock by exactly `stepS` seconds.
   */
  async sweepTip(points: Vec3[], stepS?: number): Promise<TipSample[]> {
    const trace: TipSample[] = await this.page.evaluate(
      ([pts, step]) => (window as any).__e2e.sweepTip(pts, step ?? undefined),
      [points, stepS ?? null] as const,
    );
    const bad = trace.findIndex((s) => typeof s.clock !== 'number' || !Number.isFinite(s.clock));
    if (bad >= 0) {
      throw new Error(
        `sweepTip sample ${bad} has no finite clock (${String(trace[bad].clock)}): CardsSystem.clocks.input missing or renamed?`,
      );
    }
    if (trace.length === 0) throw new Error('sweepTip: CardSlash.step never ran during the sweep (CardsSystem.slash renamed?)');
    return trace;
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path });
  }

  /**
   * Closes the page first (stops the XR render loop that keeps SwiftShader busy), then the browser.
   * Each step is bounded: on a loaded machine browser.close() has hung past the 120 s hook timeout,
   * failing a test that had already passed. A browser still closing after the bound is left to
   * Playwright's exit cleanup, with a warning.
   */
  async close(): Promise<void> {
    const bounded = async (what: string, p: Promise<unknown>, ms: number): Promise<void> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<'late'>((done) => (timer = setTimeout(() => done('late'), ms)));
      const r = await Promise.race([p.then(() => 'ok' as const, () => 'ok' as const), late]);
      clearTimeout(timer);
      if (r === 'late') console.warn(`[e2e] ${what} still pending after ${ms} ms; left to process exit`);
    };
    await bounded('page.close', this.page.close({ runBeforeUnload: false }), 30_000);
    await bounded('browser.close', this.browser.close(), 60_000);
  }
}

/** Unit vector dot: >0 means `p` lies in the forward hemisphere of a viewer at `eye` facing `fwd`. */
export function forwardness(eye: Vec3, fwd: Vec3, p: Vec3): number {
  const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / len;
}
