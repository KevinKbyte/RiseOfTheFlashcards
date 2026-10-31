/**
 * Per-premise verdicts for the device spike (pure; no DOM, no IWSDK).
 */
import { percentile } from './stats.js';

export type PremiseId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';
export type Status = 'PASS' | 'FAIL' | 'UNAVAILABLE' | 'PENDING';

export interface PremiseResult {
  id: PremiseId;
  title: string;
  status: Status;
  evidence: string;
  label: string;
}

export const QUEST2_LABEL = 'Quest 2 evidence; judges use Quest 3/3S (guidelines.md:55,61)';

export const PREMISE_TITLES: Record<PremiseId, string> = {
  a: 'Mic in immersive session',
  b: 'Whisper tiny.en WebGPU p50',
  c: 'Input sources',
  d: 'Persistence',
  e: 'Frame rate',
  f: 'immersive-ar + planes/mesh',
  g: 'Offline reload',
};

export const WHISPER_P50_BAR_MS = 1500;
export const FPS_MIN = 60;
export const FPS_MIN_FRAMES = 300;
export const MIC_SILENCE_RMS = 0.001;

export function makeResult(id: PremiseId, status: Status, evidence: string): PremiseResult {
  return { id, title: PREMISE_TITLES[id], status, evidence, label: QUEST2_LABEL };
}

export function micVerdict(i: {
  supported: boolean;
  inSession: boolean;
  outcome: 'granted' | 'denied' | 'error' | null;
  peakRms: number;
}): PremiseResult {
  if (!i.supported) return makeResult('a', 'UNAVAILABLE', 'getUserMedia unsupported');
  if (i.outcome === null) return makeResult('a', 'PENDING', 'not requested yet');
  if (i.outcome !== 'granted') return makeResult('a', 'FAIL', `permission ${i.outcome}`);
  if (!i.inSession) return makeResult('a', 'FAIL', 'granted outside immersive session');
  const ev = `peakRms=${i.peakRms.toFixed(4)}`;
  return i.peakRms > MIC_SILENCE_RMS
    ? makeResult('a', 'PASS', ev)
    : makeResult('a', 'FAIL', `silent stream, ${ev}`);
}

export function whisperVerdict(i: {
  webgpu: boolean;
  latenciesMs: readonly number[];
  clipSilent: boolean;
  transcript: string;
}): PremiseResult {
  if (!i.webgpu) return makeResult('b', 'UNAVAILABLE', 'no WebGPU adapter');
  if (i.latenciesMs.length === 0) return makeResult('b', 'PENDING', 'no timed runs yet');
  // Latency on silence or an empty decode is not a valid measurement of real transcription.
  if (i.clipSilent) return makeResult('b', 'UNAVAILABLE', 'silent clip; speak during recording');
  if (i.transcript.trim() === '') return makeResult('b', 'UNAVAILABLE', 'empty transcript');
  const p50 = percentile(i.latenciesMs, 50);
  const ev = `p50=${Math.round(p50)} ms over ${i.latenciesMs.length} runs (bar ${WHISPER_P50_BAR_MS} ms)`;
  return makeResult('b', p50 <= WHISPER_P50_BAR_MS ? 'PASS' : 'FAIL', ev);
}

export function inputVerdict(i: { handsSeen: boolean; controllersSeen: boolean }): PremiseResult {
  const ev = `hands=${i.handsSeen} controllers=${i.controllersSeen}`;
  if (i.handsSeen) return makeResult('c', 'PASS', ev);
  if (i.controllersSeen) {
    return makeResult('c', 'PENDING', `${ev}; controllers ok; put them down and show both hands`);
  }
  return makeResult('c', 'PENDING', ev);
}

export function persistenceVerdict(i: {
  bootCount: number;
  persisted: boolean | null;
  error?: string;
  idbPrev: unknown;
}): PremiseResult {
  const ev = `boots=${i.bootCount} persisted=${String(i.persisted)}`;
  if (typeof i.error === 'string' && i.error !== '') return makeResult('d', 'FAIL', `${ev} error=${i.error}`);
  const expected = i.bootCount - 1;
  if (i.bootCount >= 2 && i.idbPrev !== expected) {
    return makeResult('d', 'FAIL', `${ev} IDB lost (prev=${String(i.idbPrev)}, expected ${expected})`);
  }
  if (i.bootCount >= 2) return makeResult('d', 'PASS', ev);
  return makeResult('d', 'PENDING', `${ev} (reload to confirm)`);
}

export function fpsVerdict(i: { p50: number; p5: number; frames: number }): PremiseResult {
  if (i.frames === 0 || Number.isNaN(i.p5) || Number.isNaN(i.frames)) {
    return makeResult('e', 'PENDING', 'no frames measured');
  }
  if (i.frames < FPS_MIN_FRAMES) {
    return makeResult('e', 'PENDING', `collecting (${i.frames}/${FPS_MIN_FRAMES} frames)`);
  }
  const ev = `p50=${i.p50.toFixed(1)} p5=${i.p5.toFixed(1)} fps over ${i.frames} frames (bar p5>=${FPS_MIN})`;
  return makeResult('e', i.p5 >= FPS_MIN ? 'PASS' : 'FAIL', ev);
}

/** Status comes from the load-level-0 baseline only; heavier levels are evidence, not the verdict. */
export function fpsBoardVerdict(
  byLevel: ReadonlyMap<number, { p50: number; p5: number; frames: number }>,
): PremiseResult {
  const base = byLevel.get(0);
  if (!base) return makeResult('e', 'PENDING', 'no load-level-0 baseline yet');
  const levels = [...byLevel.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([lvl, s]) => `L${lvl} ${Math.round(s.p50)}/${Math.round(s.p5)}`)
    .join(' ');
  const l0 = fpsVerdict(base);
  return makeResult('e', l0.status, `${l0.evidence}; ${levels}`);
}

export function arVerdict(i: {
  arSupported: boolean | null;
  planes: number | null;
  meshes: number | null;
}): PremiseResult {
  if (i.arSupported === null) return makeResult('f', 'PENDING', 'AR support not checked');
  if (!i.arSupported) return makeResult('f', 'UNAVAILABLE', 'immersive-ar unsupported');
  if (i.planes === null && i.meshes === null) return makeResult('f', 'PENDING', 'AR supported; run AR probe');
  const ev = `planes=${String(i.planes)} meshes=${String(i.meshes)}`;
  return makeResult('f', (i.planes ?? 0) > 0 || (i.meshes ?? 0) > 0 ? 'PASS' : 'FAIL', ev);
}

export function offlineVerdict(i: {
  swSupported: boolean;
  controlled: boolean;
  online: boolean;
  bootedOffline: boolean;
}): PremiseResult {
  if (!i.swSupported) return makeResult('g', 'UNAVAILABLE', 'serviceWorker unsupported');
  if (!i.controlled) return makeResult('g', 'PENDING', 'page not SW-controlled yet (reload once)');
  // Only a boot without network proves the SW served the app; a live page going offline proves nothing.
  if (i.bootedOffline) return makeResult('g', 'PASS', 'booted offline under SW control');
  if (i.online) return makeResult('g', 'PENDING', 'controlled; enable airplane mode and reload');
  return makeResult('g', 'PENDING', 'offline now but booted online; reload while offline');
}
