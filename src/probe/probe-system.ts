/**
 * Orchestrates premises a..g, renders the probe panel, and owns the per-frame meter.
 */
import { createSystem, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { ArProbe } from './ar-probe.js';
import { runMicProbe, runWhisperProbe } from './audio-probes.js';
import { mountDomMirror } from './dom-mirror.js';
import { classifyInputSources } from './input-sources.js';
import { FrameMeter, LOAD_STEP, LoadField } from './load-probe.js';
import { watchOffline } from './offline.js';
import { runPersistenceProbe } from './persistence.js';
import { ResultBoard } from './results.js';
import { fpsFromFrameDeltas } from './stats.js';
import { fpsVerdict, inputVerdict, makeResult, type PremiseResult, type Status } from './verdict.js';

const STATUS_COLORS: Record<Status, string> = {
  PASS: '#4ade80',
  FAIL: '#f87171',
  UNAVAILABLE: '#fbbf24',
  PENDING: '#9ca3af',
};
const EVIDENCE_MAX = 120;

type FpsStats = ReturnType<typeof fpsFromFrameDeltas>;

export class ProbeSystem extends createSystem({}) {
  private readonly board = new ResultBoard();
  private readonly meter = new FrameMeter();
  private readonly fpsByLevel = new Map<number, FpsStats>();
  private load!: LoadField;
  private ar!: ArProbe;
  private panel: UIKitMLAsset | undefined;
  private session: XRSession | undefined;
  private recording = false;
  private audioStarted = false;
  private handsSeen = false;
  private controllersSeen = false;

  init(): void {
    const report = (r: PremiseResult) => this.board.set(r);
    this.load = new LoadField(this.world);
    this.ar = new ArProbe(this.world, report);
    this.panel = this.world.getSceneObject<UIKitMLAsset>('probe-panel');
    const mirror = mountDomMirror(() => void this.ar.run());
    const fpsTimer = setInterval(() => this.summarizeFps(), 1000);

    this.cleanupFuncs.push(
      this.board.onChange((all) => {
        mirror.render(all);
        this.renderPanel(all);
      }),
      mirror.dispose,
      watchOffline(report),
      () => clearInterval(fpsTimer),
      () => this.detachSession(),
      () => this.load.dispose(),
      ...this.wirePanel(),
      this.world.visibilityState.subscribe((state) => this.onVisibility(state)),
    );

    void runPersistenceProbe().then(report);
    void this.ar.checkSupport();
  }

  update(delta: number): void {
    // Allocation-free: a typed-array write only.
    if (this.recording) this.meter.push(delta * 1000);
  }

  private wirePanel(): Array<() => void> {
    const panel = this.panel;
    if (!panel) return [];
    const bind = (id: string, fn: () => void) => {
      const el = panel.getElementById(id);
      el?.addEventListener('click', fn);
      return () => el?.removeEventListener('click', fn);
    };
    return [
      bind('load-minus', () => this.setLoad(this.load.level - LOAD_STEP)),
      bind('load-plus', () => this.setLoad(this.load.level + LOAD_STEP)),
      bind('ar-button', () => void this.ar.run()),
    ];
  }

  private setLoad(level: number): void {
    this.load.setLevel(level);
    this.meter.reset();
    this.panel?.getElementById('load-value')?.setProperties({ text: `load ${this.load.level}` });
  }

  private renderPanel(all: readonly PremiseResult[]): void {
    const panel = this.panel;
    if (!panel) return;
    panel.getElementById('probe-label')?.setProperties({ text: all[0].label });
    for (const r of all) {
      panel.getElementById(`row-${r.id}-status`)?.setProperties({ text: r.status, color: STATUS_COLORS[r.status] });
      const ev = r.evidence.length > EVIDENCE_MAX ? r.evidence.slice(0, EVIDENCE_MAX - 3) + '...' : r.evidence;
      panel.getElementById(`row-${r.id}-evidence`)?.setProperties({ text: ev });
    }
  }

  private onVisibility(state: VisibilityState): void {
    const inXR = state !== VisibilityState.NonImmersive && this.world.session !== undefined;
    if (inXR !== this.recording) this.meter.reset();
    this.recording = inXR;
    if (inXR && this.world.session !== this.session) this.attachSession(this.world.session as XRSession);
    if (!inXR) this.detachSession();
  }

  private attachSession(session: XRSession): void {
    this.detachSession();
    this.session = session;
    session.addEventListener('inputsourceschange', this.onInputSources);
    this.onInputSources();
    if (!this.audioStarted) {
      this.audioStarted = true;
      void this.runAudio();
    }
  }

  private detachSession(): void {
    this.session?.removeEventListener('inputsourceschange', this.onInputSources);
    this.session = undefined;
  }

  private readonly onInputSources = (): void => {
    if (!this.session) return;
    const { hands, controllers } = classifyInputSources(this.session.inputSources);
    if (hands.length > 0) this.handsSeen = true;
    if (controllers.length > 0) this.controllersSeen = true;
    const v = inputVerdict({ handsSeen: this.handsSeen, controllersSeen: this.controllersSeen });
    const now = `now hands=[${hands.join(',')}] controllers=[${controllers.join(',')}]`;
    this.board.set(makeResult('c', v.status, `${v.evidence}; ${now}`));
  };

  private async runAudio(): Promise<void> {
    // Mic is requested only once the immersive session is live: that is the premise under test.
    const { result, clip } = await runMicProbe(() => this.world.session !== undefined);
    this.board.set(result);
    this.board.set(makeResult('b', 'PENDING', 'loading whisper-tiny.en (webgpu)...'));
    this.board.set(await runWhisperProbe(clip));
  }

  private summarizeFps(): void {
    if (!this.recording) return;
    const stats = fpsFromFrameDeltas(this.meter.snapshot());
    if (stats.frames === 0) return;
    this.fpsByLevel.set(this.load.level, stats);
    const v = fpsVerdict(stats);
    const levels = [...this.fpsByLevel]
      .sort((x, y) => x[0] - y[0])
      .map(([level, s]) => `L${level} ${s.p50.toFixed(0)}/${s.p5.toFixed(0)}`)
      .join(' ');
    this.board.set(makeResult('e', v.status, `load=${this.load.level} ${v.evidence}; p50/p5 by load: ${levels}`));
  }
}
