/**
 * Premise f: immersive-ar support plus plane/mesh detection counts.
 *
 * launchXR() never throws: with a session already active it logs and returns, so the VR session is
 * ended first and we wait for world.session to clear. Whether AR actually started is only knowable
 * by polling world.session afterwards.
 */
import { SessionMode, type World } from '@iwsdk/core';
import { arVerdict, makeResult, type PremiseResult } from './verdict.js';

const EXIT_WAIT_MS = 5000;
const START_WAIT_MS = 15000;
const COUNT_WINDOW_MS = 10000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = performance.now() + timeoutMs;
  while (!cond()) {
    if (performance.now() > end) return false;
    await sleep(100);
  }
  return true;
}

type DetectingFrame = XRFrame & { detectedPlanes?: { size: number }; detectedMeshes?: { size: number } };

export class ArProbe {
  private arSupported: boolean | null = null;
  private planes: number | null = null;
  private meshes: number | null = null;
  private note = '';
  private running = false;

  constructor(
    private readonly world: World,
    private readonly report: (r: PremiseResult) => void,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  async checkSupport(): Promise<void> {
    const xr = navigator.xr;
    this.arSupported = xr ? await xr.isSessionSupported('immersive-ar').catch(() => false) : false;
    this.emit();
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    // Every row this run emits must reflect only this run's measurements.
    this.planes = null;
    this.meshes = null;
    this.note = '';
    try {
      if (this.arSupported === null) await this.checkSupport();
      if (!this.arSupported) return;
      // A lingering VR session must not be mistaken for the AR session we launch.
      const prev = this.world.session;
      if (prev) {
        this.world.exitXR();
        if (!(await waitFor(() => this.world.session === undefined, EXIT_WAIT_MS))) {
          this.note = 'VR exit timed out';
          this.emit(true);
          return;
        }
      }
      this.world.launchXR({
        sessionMode: SessionMode.ImmersiveAR,
        features: { planeDetection: true, meshDetection: true },
      });
      const started = () => this.world.session !== undefined && this.world.session !== prev;
      const session = (await waitFor(started, START_WAIT_MS)) ? this.world.session : undefined;
      if (!session) {
        this.note = 'AR session did not start (activation consumed?); use the 2D "Run AR probe" button';
        this.emit();
        return;
      }
      this.note = `AR running: look around the room (${COUNT_WINDOW_MS / 1000} s)`;
      this.emit(true);
      await this.count(session);
    } finally {
      this.running = false;
    }
  }

  private async count(session: XRSession): Promise<void> {
    let maxPlanes = 0;
    let maxMeshes = 0;
    let planeApi = false;
    let meshApi = false;
    const stop = this.world.onXRFrame((frame) => {
      const f = frame as DetectingFrame;
      if (f.detectedPlanes) {
        planeApi = true;
        if (f.detectedPlanes.size > maxPlanes) maxPlanes = f.detectedPlanes.size;
      }
      if (f.detectedMeshes) {
        meshApi = true;
        if (f.detectedMeshes.size > maxMeshes) maxMeshes = f.detectedMeshes.size;
      }
    });
    let endedEvent = false;
    const onEnd = () => {
      endedEvent = true;
    };
    session.addEventListener('end', onEnd);
    const ended = await waitFor(() => endedEvent || this.world.session !== session, COUNT_WINDOW_MS);
    session.removeEventListener('end', onEnd);
    stop();
    // Zero counts from a truncated window are not a measurement; never FAIL on them.
    if (ended) {
      this.note = 'AR session ended early; re-run';
      this.emit(true);
      return;
    }
    // A started AR session counts as measured: a missing detection API is a zero, not "unknown".
    this.planes = maxPlanes;
    this.meshes = maxMeshes;
    const features = (session.enabledFeatures ?? []).join(',') || 'none';
    this.note = `features=${features}; planeApi=${planeApi} meshApi=${meshApi}; ${COUNT_WINDOW_MS / 1000} s window`;
    this.emit();
  }

  /** `pending` forces PENDING while a run is in progress or aborted before measuring. */
  private emit(pending = false): void {
    const v = arVerdict({ arSupported: this.arSupported, planes: this.planes, meshes: this.meshes });
    const status = pending ? 'PENDING' : v.status;
    const counts = `planes=${String(this.planes)} meshes=${String(this.meshes)}`;
    this.report(this.note ? makeResult('f', status, `${counts}; ${this.note}`) : v);
  }
}
