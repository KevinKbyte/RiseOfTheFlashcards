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

export function whisperVerdict(i: { webgpu: boolean; latenciesMs: readonly number[] }): PremiseResult {
  if (!i.webgpu) return makeResult('b', 'UNAVAILABLE', 'no WebGPU adapter');
  if (i.latenciesMs.length === 0) return makeResult('b', 'PENDING', 'no timed runs yet');
  const p50 = percentile(i.latenciesMs, 50);
  const ev = `p50=${Math.round(p50)} ms over ${i.latenciesMs.length} runs (bar ${WHISPER_P50_BAR_MS} ms)`;
  return makeResult('b', p50 <= WHISPER_P50_BAR_MS ? 'PASS' : 'FAIL', ev);
}

export function inputVerdict(i: { handsSeen: boolean; controllersSeen: boolean }): PremiseResult {
  const ev = `hands=${i.handsSeen} controllers=${i.controllersSeen}`;
  if (i.handsSeen) return makeResult('c', 'PASS', ev);
  if (i.controllersSeen) return makeResult('c', 'FAIL', `${ev} (no hand tracking seen)`);
  return makeResult('c', 'PENDING', ev);
}

export function persistenceVerdict(i: {
  bootCount: number;
  persisted: boolean | null;
  error?: string;
}): PremiseResult {
  const ev = `boots=${i.bootCount} persisted=${String(i.persisted)}`;
  if (typeof i.error === 'string' && i.error !== '') return makeResult('d', 'FAIL', `${ev} error=${i.error}`);
  if (i.bootCount >= 2) return makeResult('d', 'PASS', ev);
  return makeResult('d', 'PENDING', `${ev} (reload to confirm)`);
}

export function fpsVerdict(i: { p50: number; p5: number; frames: number }): PremiseResult {
  if (i.frames === 0 || Number.isNaN(i.p5) || Number.isNaN(i.frames)) {
    return makeResult('e', 'PENDING', 'no frames measured');
  }
  const ev = `p50=${i.p50.toFixed(1)} p5=${i.p5.toFixed(1)} fps over ${i.frames} frames (bar p5>=${FPS_MIN})`;
  return makeResult('e', i.p5 >= FPS_MIN ? 'PASS' : 'FAIL', ev);
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

export function offlineVerdict(i: { swSupported: boolean; controlled: boolean; online: boolean }): PremiseResult {
  if (!i.swSupported) return makeResult('g', 'UNAVAILABLE', 'serviceWorker unsupported');
  if (!i.controlled) return makeResult('g', 'PENDING', 'page not SW-controlled yet (reload once)');
  if (i.online) return makeResult('g', 'PENDING', 'controlled; enable airplane mode and reload');
  return makeResult('g', 'PASS', 'loaded offline under SW control');
}
