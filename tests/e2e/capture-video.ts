// Emulator gameplay video: one scripted, human-paced run of the flashcard game in the IWER-emulated
// Quest 3 (start screen -> Start -> deck -> enemies -> correct answers by controller-tip slash -> one
// wrong orb (pip lost) -> ultimate charged to 5, glowing, fired (knockback) -> finish to the WIN
// screen), recorded with Playwright recordVideo (webm). Fallback clip for the submission, not a test:
// it is not an *.e2e.ts file, so `npm run test:e2e` never collects it.
//
// Run (repo root, Git Bash; CAPTURE_DIR is required and must be outside the repo):
//   CAPTURE_DIR=/abs/output/dir node tests/e2e/capture-video.mjs
// Optional: CAPTURE_GL=swiftshader (software WebGL, the e2e harness default; default here is the
// GPU via ANGLE D3D11, which keeps the game at full frame rate while ffmpeg encodes),
// CAPTURE_HEADED=1 (headed Chromium instead of headless), E2E_BASE_URL (reuse a running server).
// Writes <CAPTURE_DIR>/flashcards-gameplay-<stamp>.webm plus frame PNGs checked for non-blank
// content; the last stdout line is the video path.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import setup from './global-setup.js';
import { pickDeck, pressStart, revealNext } from './flow.js';
import { Game, LAUNCH_ARGS, type GameState, type Vec3 } from './harness.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const SIZE = { width: 1280, height: 720 };
const ULTIMATE_CHARGE = 5;
/** Encounter knockbackDistance: a revealed enemy closer than this has visibly crept in. */
const CREPT_IN = 2.0;
/** Pause between viewer-visible actions (ms). */
const BEAT = 1800;

const T0 = Date.now();
const log = (msg: string) => console.log(`[capture +${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`);
const GPU_ARGS = ['--use-angle=d3d11', '--ignore-gpu-blocklist'];
const beat = (ms = BEAT) => new Promise((r) => setTimeout(r, ms));
const add = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]];
const fmt = (p: Vec3) => `(${p.map((v) => v.toFixed(2)).join(', ')})`;
/** IWER synthetic room the clip is played in (IWER SEM built-in; see injectEnvironment). */
const ROOM = 'sunlit_living_room';
/**
 * Emulated vertical FOV (rad). IWER's default is pi/2; the game anchors its panel and enemies to the
 * head pose, so moving the head cannot pull the camera back. A wider lens shows the question panel,
 * the answer orbs, the health readout and every enemy at once.
 */
const FOVY = 1.9;

/** Points from a to b no more than `step` metres apart (excluding a). */
function line(a: Vec3, b: Vec3, step: number): Vec3[] {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(d / step));
  const out: Vec3[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

/**
 * Visible slash through the orb labelled `label`: glide the tip (slowly, above the orb row so it
 * touches nothing) to a point above the orb, then a fast downward swing through it.
 */
async function slash(g: Game, label: string, onSwing?: (phase: 'mid' | 'after') => Promise<void>): Promise<void> {
  const orb = await g.orbPivot(label);
  if (!orb) throw new Error(`slash: no orb ${label}`);
  const tip = await g.tip();
  const high = orb[1] + 0.375;
  // One point per XR frame: ~0.9 m/s glide and a ~4 m/s swing at 72 fps (slash needs >= 1.0 m/s).
  // The glide first pulls back toward the player (+Z) so it never passes through an orb.
  const lead: Vec3 = [orb[0], high, orb[2]];
  const back: Vec3 = [tip[0], tip[1], Math.max(tip[2], orb[2]) + 0.2];
  const up: Vec3 = [tip[0], high, back[2]];
  await g.sweepTip([...line(tip, back, 0.012), ...line(back, up, 0.012), ...line(up, lead, 0.012)]);
  await beat(350);
  if (!onSwing) {
    await g.sweepTip(line(lead, add(orb, -0.3), 0.06));
    return;
  }
  // Documented swing: stop just above the orb for a frame grab, then swing on through it.
  const above = add(orb, 0.12);
  await g.sweepTip(line(lead, above, 0.06));
  await onSwing('mid');
  await g.sweepTip(line(above, add(orb, -0.3), 0.06));
  await onSwing('after');
}

/** Right controller to its low-ahead rest pose (identity orientation), settled for 2 frames. */
async function restRight(g: Game): Promise<void> {
  await g.page.evaluate(() =>
    (window as any).IWER_DEVICE.remote.dispatch('set_transform', {
      device: 'controller-right',
      position: { x: 0.15, y: 1.1, z: -0.35 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    }),
  );
  await g.frames(2);
}

async function slashRight(g: Game, s: GameState, onSwing?: (phase: 'mid' | 'after') => Promise<void>): Promise<GameState> {
  const card = s.cardId;
  const cleared = (x: GameState) => x.cardId !== card || x.message;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await slash(g, s.answer!, attempt === 1 ? onSwing : undefined);
    const ok = await g.until(cleared, `card ${card} cleared`, 4000).then(() => true, () => false);
    if (ok) break;
    log(`slash on ${s.answer} attempt ${attempt} did not clear; retrying`);
    if (attempt === 3) throw new Error(`3 slashes on ${s.answer} did not clear card ${card}`);
  }
  const after = await g.until(cleared, `card ${card} cleared`);
  if (after.pips < s.pips) log(`WARN: pip lost during correct slash (${s.pips} -> ${after.pips})`);
  return after;
}

async function slashWrong(g: Game, s: GameState): Promise<GameState> {
  const wrong = s.orbs.find((o) => o.label !== s.answer)!;
  const handled = (x: GameState) => x.pips < s.pips || x.message || !x.orbs.some((o) => o.label === wrong.label);
  await slash(g, wrong.label);
  return g.until(handled, `wrong orb ${wrong.label} handled`, 6000);
}

/** Pixel standard deviation (0..255 luma) of a PNG, decoded in the page via a 2D canvas. */
async function lumaStdDev(g: Game, png: Buffer): Promise<number> {
  return g.page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 160, 90);
    const d = ctx.getImageData(0, 0, 160, 90).data;
    let sum = 0;
    let sq = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += y;
      sq += y * y;
    }
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sq / n - mean * mean));
  }, png.toString('base64'));
}

/** Samples frames from the finished webm in a fresh browser; returns its duration and frame stddevs. */
export async function inspectVideo(video: string, dir: string, headless: boolean, args: string[]): Promise<{ duration: number; stds: number[] }> {
  // file:// pages are opaque origins: without this flag the frame canvas is tainted.
  const browser = await chromium.launch({ headless, args: [...args, '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: SIZE });
    await page.goto(pathToFileURL(video).href);
    const info = await page.evaluate(async () => {
      const v = document.querySelector('video')!;
      v.pause();
      if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
      // Playwright webm has no duration header: seek far past the end to make the browser compute it.
      if (!Number.isFinite(v.duration)) {
        v.currentTime = 1e6;
        await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
      }
      return { duration: v.duration };
    });
    const stds: number[] = [];
    const fractions = [0.08, 0.3, 0.55, 0.8, 0.97];
    for (const f of fractions) {
      const shot = await page.evaluate(async (t) => {
        const v = document.querySelector('video')!;
        v.currentTime = t;
        await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d')!.drawImage(v, 0, 0);
        const small = document.createElement('canvas');
        small.width = 160;
        small.height = 90;
        const sctx = small.getContext('2d')!;
        sctx.drawImage(c, 0, 0, 160, 90);
        const d = sctx.getImageData(0, 0, 160, 90).data;
        let sum = 0;
        let sq = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          sum += y;
          sq += y * y;
        }
        const mean = sum / n;
        return { png: c.toDataURL('image/png'), std: Math.sqrt(Math.max(0, sq / n - mean * mean)), w: v.videoWidth, h: v.videoHeight };
      }, info.duration * f);
      const name = join(dir, `video-frame-${Math.round(f * 100)}pct.png`);
      writeFileSync(name, Buffer.from(shot.png.split(',')[1], 'base64'));
      log(`video frame at ${(info.duration * f).toFixed(1)}s (${shot.w}x${shot.h}) luma stddev ${shot.std.toFixed(1)} -> ${name}`);
      stds.push(shot.std);
    }
    return { duration: info.duration, stds };
  } finally {
    await browser.close();
  }
}

/**
 * Plays the clip inside IWER's synthetic room: the project config enables no emulator environment
 * (iwsdk.config.json dev.emulator.environment unset), so the dev plugin's injected runtime module
 * starts with `"sem": null`. Rewriting that one config field in the served module, for this
 * browser context only, installs IWER's SEM with ROOM. IWER draws the room under the game canvas
 * for the game's passthrough (alpha-blend) session. Returns false if the module had no such field.
 */
async function injectEnvironment(g: Game): Promise<boolean> {
  let patched = false;
  await g.context.route('**/@iwer-injection-runtime*', async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/"sem":\s*null/, `"sem": ${JSON.stringify({ defaultScene: ROOM })}`);
    patched ||= body.includes(ROOM);
    await route.fulfill({ response: res, body });
  });
  await g.reload();
  return patched;
}

/**
 * Hides page DOM overlays on top of the XR canvas: every body child that holds no canvas (IWER
 * DevUI, the page's import panel), now and whenever one is added, plus the non-canvas layer inside
 * IWER's fixed canvas stack (a shadow-root host carrying the "Remote Control Active" badge and the
 * blue screen-edge glow). IWER has no runtime switch for these, so this is CSS only.
 */
async function hideOverlays(g: Game): Promise<string[]> {
  return g.page.evaluate(() => {
    const hidden: string[] = [];
    const hideEl = (el: HTMLElement, what: string) => {
      if (el.dataset.captureHidden) return;
      el.dataset.captureHidden = '1';
      hidden.push(what);
      el.style.setProperty('display', 'none', 'important');
    };
    const hide = (el: Element) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.tagName === 'CANVAS' || el.tagName === 'SCRIPT' || el.id === 'scene-container') return;
      if (el.querySelector('canvas')) {
        // Canvas stack: keep the canvases, drop the overlay layers between them.
        for (const c of Array.from(el.children)) {
          if (c instanceof HTMLElement && c.tagName !== 'CANVAS' && !c.querySelector('canvas')) {
            hideEl(c, `${el.tagName.toLowerCase()} > ${c.tagName.toLowerCase()}${c.shadowRoot ? ' (shadow host)' : ''}`);
          }
        }
        return;
      }
      hideEl(el, `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`);
    };
    const sweep = () => Array.from(document.body.children).forEach(hide);
    sweep();
    new MutationObserver(sweep).observe(document.body, { childList: true, subtree: true });
    return hidden;
  });
}

async function shoot(g: Game, dir: string, name: string, shots: { name: string; std: number }[]): Promise<void> {
  const path = join(dir, `shot-${String(shots.length + 1).padStart(2, '0')}-${name}.png`);
  const png = await g.page.screenshot({ path });
  const std = await lumaStdDev(g, png);
  shots.push({ name: path, std });
  log(`screenshot ${path} luma stddev ${std.toFixed(1)}`);
}

export async function main(): Promise<number> {
  const raw = process.env.CAPTURE_DIR;
  if (!raw) {
    console.error('capture-video: CAPTURE_DIR is not set. Set it to an absolute output directory outside the repo, e.g.\n  CAPTURE_DIR=/tmp/flashcards-video node tests/e2e/capture-video.mjs');
    return 2;
  }
  const dir = resolve(raw);
  const rel = relative(ROOT, dir);
  if (!rel.startsWith('..') && !isAbsolute(rel)) {
    console.error(`capture-video: CAPTURE_DIR (${dir}) is inside the repo (${ROOT}); choose a directory outside it.`);
    return 2;
  }
  mkdirSync(dir, { recursive: true });
  const headless = process.env.CAPTURE_HEADED !== '1';
  const args = process.env.CAPTURE_GL === 'swiftshader' ? LAUNCH_ARGS : GPU_ARGS;
  log(`mode: ${headless ? 'headless' : 'headed'} chromium, args ${args.join(' ')}`);

  let base = '';
  const teardown = await setup({ provide: (_k, v) => (base = v) });
  let game: Game | undefined;
  try {
    // Warm the dev server's module transforms so the recorded clip does not open on a long load.
    const warm = await Game.launch(base, { headless, args, viewport: SIZE });
    await warm.close();

    const t0 = Date.now();
    game = await Game.launch(base, { headless, args, viewport: SIZE, recordVideo: { dir, size: SIZE } });
    const g = game;
    const shots: { name: string; std: number }[] = [];
    log(`synthetic room ${ROOM}: ${(await injectEnvironment(g)) ? 'injected' : 'NOT injected (no "sem": null in the runtime module)'}`);
    await g.enterXR();
    await g.page.evaluate((f) => ((window as any).IWER_DEVICE.fovy = f), FOVY);
    const hidden = await hideOverlays(g);
    log(`DOM overlays hidden: ${hidden.length ? hidden.join(', ') : 'none found'}`);

    // Start screen.
    await g.until((s) => s.menuOpen && s.orbs.some((o) => o.label === 'Start'), 'start screen');
    await beat(2500);
    await shoot(g, dir, 'start', shots);
    await pressStart(g);
    log('deck menu');
    await beat();
    let s = await pickDeck(g);
    log(`run started: ${s.waveCards.length} cards, ${s.pips} pips`);
    // Rest the right controller low and ahead: Game.enterXR holds it 5 cm before the eye (the menu
    // presses need that), where it fills the bottom of the frame. Each enemy reveal aims from here.
    await restRight(g);
    await beat(2500);
    await shoot(g, dir, 'enemies', shots);
    s = await g.state();
    log(`enemy centres (world): ${s.active.map((e) => `${e.id} ${e.pos ? fmt(e.pos) : '-'}`).join('; ')}; camera ${fmt(s.cam)}`);

    let wrongDone = false;
    let ultimateDone = false;
    let swingDone = false;
    for (let i = 0; i < 40 && !s.message; i++) {
      // Back to the rest pose first: a slash leaves the hand at its swing end below the orb row, and
      // from the low right the ray up to a right-side enemy passes through the ultimate orb
      // (eye + (0.35, -0.2, -0.45)), which takes the press instead.
      await restRight(g);
      s = await revealNext(g);
      log(`revealed ${s.cardId} (answer ${s.answer}); charge ${s.charge}, pips ${s.pips}`);
      await beat(1400);

      if (!ultimateDone && (s.charge ?? 0) >= ULTIMATE_CHARGE) {
        const ready = await g.until(
          (x) => x.ultimateGlow === true && x.targetDistance !== null && x.targetDistance <= CREPT_IN,
          'ultimate glowing with the revealed enemy crept in',
          30_000,
        );
        log(`ultimate glowing; enemy at ${ready.targetDistance?.toFixed(2)} m`);
        await shoot(g, dir, 'ultimate-glow', shots);
        await beat(1200);
        await g.aimAndSelect({ kind: 'ultimate' }, (x) => x.charge === 0);
        await g.frames(4);
        s = await g.state();
        log(`ultimate fired: enemy at ${s.targetDistance?.toFixed(2)} m, pulses ${s.pulses}`);
        await shoot(g, dir, 'knockback', shots);
        ultimateDone = true;
        await beat(2500);
        s = await g.state();
        if (s.message || s.cardId === null) continue;
      }

      if (!wrongDone && (s.correct ?? 0) >= 2) {
        s = await slashWrong(g, s);
        log(`wrong orb: pips ${s.pips}`);
        await shoot(g, dir, 'wrong', shots);
        wrongDone = true;
        await beat(1500);
        if (s.message) break;
      }

      let swingShots: ((phase: 'mid' | 'after') => Promise<void>) | undefined;
      if (!swingDone) {
        swingDone = true;
        const answer = s.answer!;
        swingShots = async (phase) => {
          const tip = await g.tip();
          const orb = await g.orbPivot(answer);
          log(`swing ${phase}: tip ${fmt(tip)}, orb ${answer} ${orb ? fmt(orb) : 'gone'}`);
          await shoot(g, dir, `slash-${phase}`, shots);
        };
      }
      s = await slashRight(g, s, swingShots);
      log(`correct: ${s.correct} correct, charge ${s.charge}, pips ${s.pips}`);
      await beat(700);
    }
    s = await g.until((x) => x.message, 'end message', 60_000);
    log(`run over: ${s.runStatus}; ${JSON.stringify(s.endTexts)}`);
    await beat(1000);
    await shoot(g, dir, 'end', shots);
    await beat(2500);
    if (g.errors.length) log(`page errors: ${g.errors.join(' | ')}`);

    log(`gameplay done after ${((Date.now() - t0) / 1000).toFixed(1)} s; finalizing video`);
    const video = g.page.video();
    await g.context.close();
    const raw = await video!.path();
    await g.close();
    game = undefined;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const final = join(dir, `flashcards-gameplay-${stamp}.webm`);
    renameSync(raw, final);
    log(`recorded ${((Date.now() - t0) / 1000).toFixed(1)} s wall clock`);

    const { duration, stds } = await inspectVideo(final, dir, headless, args);
    log(`video duration ${duration.toFixed(1)} s, ${SIZE.width}x${SIZE.height}`);
    const blankShots = shots.filter((x) => x.std < 4);
    const blankFrames = stds.filter((x) => x < 4);
    if (blankShots.length || blankFrames.length >= 2) {
      console.error(`capture-video: blank output (screenshots ${blankShots.length}/${shots.length}, video frames ${blankFrames.length}/${stds.length} uniform)`);
      console.log(final);
      return 1;
    }
    if (s.runStatus !== 'won' || !ultimateDone || !wrongDone) {
      console.error(`capture-video: script incomplete (status ${s.runStatus}, ultimate ${ultimateDone}, wrong ${wrongDone})`);
      console.log(final);
      return 1;
    }
    console.log(final);
    return 0;
  } finally {
    await game?.close().catch(() => {});
    teardown();
  }
}
