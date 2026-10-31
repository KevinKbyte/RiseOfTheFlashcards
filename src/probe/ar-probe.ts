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

  async checkSupport(): Promise<void> {
    const xr = navigator.xr;
    this.arSupported = xr ? await xr.isSessionSupported('immersive-ar').catch(() => false) : false;
    this.emit();
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (this.arSupported === null) await this.checkSupport();
      if (!this.arSupported) return;
      if (this.world.session) {
        this.world.exitXR();
        await waitFor(() => this.world.session === undefined, EXIT_WAIT_MS);
      }
      this.world.launchXR({
        sessionMode: SessionMode.ImmersiveAR,
        features: { planeDetection: true, meshDetection: true },
      });
      const session = (await waitFor(() => this.world.session !== undefined, START_WAIT_MS))
        ? this.world.session
        : undefined;
      if (!session) {
        this.note = 'AR session did not start (activation consumed?); use the 2D "Run AR probe" button';
        this.emit();
        return;
      }
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
    await sleep(COUNT_WINDOW_MS);
    stop();
    // A started AR session counts as measured: a missing detection API is a zero, not "unknown".
    this.planes = maxPlanes;
    this.meshes = maxMeshes;
    const features = (session.enabledFeatures ?? []).join(',') || 'none';
    this.note = `features=${features}; planeApi=${planeApi} meshApi=${meshApi}; ${COUNT_WINDOW_MS / 1000} s window`;
    this.emit();
  }

  private emit(): void {
    const v = arVerdict({ arSupported: this.arSupported, planes: this.planes, meshes: this.meshes });
    this.report(this.note ? makeResult('f', v.status, `${v.evidence}; ${this.note}`) : v);
  }
}
