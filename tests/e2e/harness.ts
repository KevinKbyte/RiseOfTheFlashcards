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
  targetId: string | null;
  /** Card ids of the current wave (spawned + queued). */
  waveCards: string[];
  active: { id: string; pos: Vec3 | null }[];
  orbs: { label: string; pos: Vec3 }[];
  answer: string | null;
  runStatus: string | null;
  endTexts: string[];
  cam: Vec3;
  camForward: Vec3;
}

export type Target = { kind: 'orb'; label: string } | { kind: 'enemy'; id: string };

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
  H.hookEnd = () => {
    const s = H.sys();
    if (!s || s.__e2eHooked) return;
    s.__e2eHooked = true; s.__e2eEndTexts = [];
    const orig = s.endRun;
    s.endRun = function (text) { this.__e2eEndTexts.push(text); return orig.call(this, text); };
  };
  H.state = () => {
    const w = H.world(); const s = H.sys(); const V = H.V();
    H.hookEnd();
    const cam = new V(); w.camera.getWorldPosition(cam);
    const fwd = new V(0, 0, -1).applyQuaternion(w.camera.getWorldQuaternion(new (H.Q())()));
    const views = s.enemies.views;
    const target = s.wave.targetId;
    const card = target === null ? undefined : s.cards.get(target);
    const run = s.session.run;
    return {
      session: !!w.session,
      menuOpen: s.menuOpen,
      pips: s.pips,
      message: s.message !== undefined,
      targetId: target,
      waveCards: [...s.cards.keys()],
      active: s.wave.active.map((e) => { const v = views.get(e.id); return { id: e.id, pos: v && v.entity.object3D ? H.center(v.entity.object3D) : null }; }),
      orbs: [...s.panel.orbLabels.entries()].map(([e, label]) => ({ label, pos: H.center(e.object3D) })),
      answer: card ? card.answer : null,
      runStatus: run && run.run ? run.run.status : null,
      endTexts: s.__e2eEndTexts.slice(),
      cam: H.arr(cam),
      camForward: H.arr(fwd),
    };
  };
  H.targetPos = (t) => {
    const s = H.sys();
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

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export class Game {
  readonly errors: string[] = [];
  readonly retriedPresses: string[] = [];

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

  /** Fresh browser + context (empty localStorage), cards.html loaded and the world running. */
  static async launch(baseUrl: string): Promise<Game> {
    const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
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
    // Hold the right controller just in front of the head: from IWER's default hand position
    // (0.25,1.5,-0.4) the ray starts beside enemies standing at reach (0.6 m) and misses them.
    await this.page.evaluate(() =>
      (window as any).IWER_DEVICE.remote.dispatch('set_transform', {
        device: 'controller-right',
        position: { x: 0, y: 1.55, z: -0.05 },
      }),
    );
    await this.frames(5);
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
   * Real input: points the right controller ray at the target and clicks the trigger. With `done`,
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

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path });
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

/** Unit vector dot: >0 means `p` lies in the forward hemisphere of a viewer at `eye` facing `fwd`. */
export function forwardness(eye: Vec3, fwd: Vec3, p: Vec3): number {
  const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / len;
}
