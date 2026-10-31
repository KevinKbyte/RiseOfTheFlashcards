// Requirement: each device premise (a..g) gets exactly one honest verdict -- PASS, FAIL,
// UNAVAILABLE or PENDING -- from its measured inputs, with inclusive bars where the contract
// says so (whisper p50 <= 1500 ms, frame-rate p5 >= 60), a strict bar for mic silence
// (peakRms > 0.001), and every result labelled as Quest 2 evidence because judges use Quest 3/3S.
// A verdict never claims PASS on evidence that does not prove the premise: whisper latency from a
// silent clip or empty transcript is UNAVAILABLE (no valid measurement); frame rate needs >= 300
// frames and is judged on the load-level-0 baseline only (other levels are evidence); persistence
// needs the IndexedDB counter to match the boot count; offline needs the page to have BOOTED offline
// under SW control (going offline on a live page proves nothing); controllers without hands is
// PENDING (prompt to show your hands -- one hand is enough), not an early FAIL. The frame-rate
// evidence labels the L0 baseline as the verdict and lists every level with its frame count.
import { describe, expect, it } from 'vitest';
import {
  FPS_MIN,
  MIC_SILENCE_RMS,
  PREMISE_TITLES,
  QUEST2_LABEL,
  WHISPER_P50_BAR_MS,
  arVerdict,
  fpsBoardVerdict,
  fpsVerdict,
  inputVerdict,
  makeResult,
  micVerdict,
  offlineVerdict,
  persistenceVerdict,
  whisperVerdict,
  type PremiseResult,
} from '../src/probe/verdict.js';

const EXPECTED_LABEL = 'Quest 2 evidence; judges use Quest 3/3S (guidelines.md:55,61)';

function expectShape(r: PremiseResult, id: PremiseResult['id'], status: PremiseResult['status']): void {
  expect(r.id).toBe(id);
  expect(r.status).toBe(status);
  expect(r.title).toBe(PREMISE_TITLES[id]);
  expect(r.label).toBe(EXPECTED_LABEL);
  expect(typeof r.evidence).toBe('string');
}

// Covers: SPIKE-a, SPIKE-b, SPIKE-c, SPIKE-d, SPIKE-e, SPIKE-f, SPIKE-g
describe('verdict constants and makeResult', () => {
  it('exposes the contract constants', () => {
    expect(QUEST2_LABEL).toBe(EXPECTED_LABEL);
    expect(WHISPER_P50_BAR_MS).toBe(1500);
    expect(FPS_MIN).toBe(60);
    expect(MIC_SILENCE_RMS).toBe(0.001);
  });

  it('titles every premise a..g', () => {
    expect(PREMISE_TITLES).toEqual({
      a: 'Mic in immersive session',
      b: 'Whisper tiny.en WebGPU p50',
      c: 'Input sources',
      d: 'Persistence',
      e: 'Frame rate',
      f: 'immersive-ar + planes/mesh',
      g: 'Offline reload',
    });
  });

  it('makeResult fills title from PREMISE_TITLES and always the Quest 2 label', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const) {
      const r = makeResult(id, 'PENDING', 'ev-' + id);
      expect(r).toEqual({
        id,
        title: PREMISE_TITLES[id],
        status: 'PENDING',
        evidence: 'ev-' + id,
        label: EXPECTED_LABEL,
      });
    }
  });
});

// Covers: SPIKE-a
describe('micVerdict', () => {
  const base = { supported: true, inSession: true, outcome: 'granted' as const, peakRms: 0.5 };

  it('UNAVAILABLE when getUserMedia is unsupported, regardless of other inputs', () => {
    expectShape(micVerdict({ ...base, supported: false }), 'a', 'UNAVAILABLE');
  });

  it('PENDING when no outcome yet', () => {
    expectShape(micVerdict({ ...base, outcome: null }), 'a', 'PENDING');
  });

  it('FAIL when permission is denied or errors', () => {
    expectShape(micVerdict({ ...base, outcome: 'denied' }), 'a', 'FAIL');
    expectShape(micVerdict({ ...base, outcome: 'error' }), 'a', 'FAIL');
  });

  it('FAIL when granted outside the immersive session', () => {
    expectShape(micVerdict({ ...base, inSession: false }), 'a', 'FAIL');
  });

  it('PASS when granted in-session with peakRms strictly above the silence bar', () => {
    expectShape(micVerdict({ ...base, peakRms: 0.0011 }), 'a', 'PASS');
  });

  it('FAIL (silent stream) when peakRms is at or below the bar', () => {
    expectShape(micVerdict({ ...base, peakRms: 0.001 }), 'a', 'FAIL');
    expectShape(micVerdict({ ...base, peakRms: 0 }), 'a', 'FAIL');
  });
});

// Covers: SPIKE-b
describe('whisperVerdict', () => {
  const ok = { webgpu: true, clipSilent: false, transcript: 'hello world' };

  it('UNAVAILABLE without WebGPU', () => {
    expectShape(whisperVerdict({ ...ok, webgpu: false, latenciesMs: [100] }), 'b', 'UNAVAILABLE');
  });

  it('PENDING with no latency samples', () => {
    expectShape(whisperVerdict({ ...ok, latenciesMs: [] }), 'b', 'PENDING');
  });

  it('PASS when p50 is exactly 1500 ms (inclusive bar)', () => {
    expectShape(whisperVerdict({ ...ok, latenciesMs: [1500] }), 'b', 'PASS');
    expectShape(whisperVerdict({ ...ok, latenciesMs: [1400, 1600] }), 'b', 'PASS');
  });

  it('FAIL when p50 is above 1500 ms', () => {
    expectShape(whisperVerdict({ ...ok, latenciesMs: [1500.5] }), 'b', 'FAIL');
    expectShape(whisperVerdict({ ...ok, latenciesMs: [900, 2000, 2100] }), 'b', 'FAIL');
  });

  it('evidence contains the rounded p50 in ms', () => {
    // p50 of [1000, 1499.6] = 1249.8 -> 1250
    const r = whisperVerdict({ ...ok, latenciesMs: [1000, 1499.6] });
    expect(r.evidence).toContain('1250');
    const r2 = whisperVerdict({ ...ok, latenciesMs: [2000, 2400, 2201.2] });
    expect(r2.evidence).toContain('2201');
  });

  it('UNAVAILABLE (silent clip) when the clip was silent, even if p50 meets the bar', () => {
    const r = whisperVerdict({ ...ok, clipSilent: true, latenciesMs: [800] });
    expectShape(r, 'b', 'UNAVAILABLE');
    expect(r.evidence).toContain('silent clip');
  });

  it('UNAVAILABLE (silent clip) even when p50 is over the bar -- no speech, no valid measurement', () => {
    const r = whisperVerdict({ ...ok, clipSilent: true, latenciesMs: [2500] });
    expectShape(r, 'b', 'UNAVAILABLE');
    expect(r.evidence).toContain('silent clip');
  });

  it('UNAVAILABLE (empty transcript) when the transcript is empty or whitespace-only', () => {
    for (const transcript of ['', '   ', ' \n\t ']) {
      const r = whisperVerdict({ ...ok, transcript, latenciesMs: [800] });
      expectShape(r, 'b', 'UNAVAILABLE');
      expect(r.evidence).toContain('empty transcript');
    }
  });

  it('silent clip takes precedence in evidence when the transcript is also empty', () => {
    const r = whisperVerdict({ ...ok, clipSilent: true, transcript: '', latenciesMs: [800] });
    expectShape(r, 'b', 'UNAVAILABLE');
    expect(r.evidence).toContain('silent clip');
  });

  it('still UNAVAILABLE (no WebGPU) and PENDING (no runs) before the clip checks', () => {
    expectShape(whisperVerdict({ ...ok, webgpu: false, clipSilent: true, latenciesMs: [800] }), 'b', 'UNAVAILABLE');
    expectShape(whisperVerdict({ ...ok, clipSilent: true, latenciesMs: [] }), 'b', 'PENDING');
  });

  it('PASS for a non-silent clip with a non-empty transcript and p50 <= 1500', () => {
    expectShape(whisperVerdict({ ...ok, transcript: ' the quick fox ', latenciesMs: [800] }), 'b', 'PASS');
  });
});

// Covers: SPIKE-c
describe('inputVerdict', () => {
  it('PASS when hands are seen (with or without controllers)', () => {
    expectShape(inputVerdict({ handsSeen: true, controllersSeen: false }), 'c', 'PASS');
    expectShape(inputVerdict({ handsSeen: true, controllersSeen: true }), 'c', 'PASS');
  });

  it('PENDING (not an early FAIL) when only controllers are seen, prompting to show hands', () => {
    const r = inputVerdict({ handsSeen: false, controllersSeen: true });
    expectShape(r, 'c', 'PENDING');
    // PASS needs only one hand, so the prompt must not ask for both.
    expect(r.evidence).toContain('controllers ok; put them down and show your hands');
    expect(r.evidence).not.toContain('both hands');
  });

  it('PENDING when nothing is seen', () => {
    expectShape(inputVerdict({ handsSeen: false, controllersSeen: false }), 'c', 'PENDING');
  });
});

// Covers: SPIKE-d
describe('persistenceVerdict', () => {
  it('FAIL when an error is reported, even after a reload', () => {
    expectShape(
      persistenceVerdict({ bootCount: 3, persisted: true, idbPrev: 2, error: 'QuotaExceededError' }),
      'd',
      'FAIL',
    );
  });

  it('PASS once the boot count reaches 2 and IDB held the previous boot count', () => {
    expectShape(persistenceVerdict({ bootCount: 2, persisted: true, idbPrev: 1 }), 'd', 'PASS');
    expectShape(persistenceVerdict({ bootCount: 7, persisted: false, idbPrev: 6 }), 'd', 'PASS');
  });

  it('FAIL (IDB lost) when the stored previous count does not equal bootCount - 1', () => {
    const r = persistenceVerdict({ bootCount: 3, persisted: true, idbPrev: 1 });
    expectShape(r, 'd', 'FAIL');
    expect(r.evidence).toContain('IDB lost (prev=1, expected 2)');
  });

  it('FAIL (IDB lost) when IDB returned nothing on a reload', () => {
    const r = persistenceVerdict({ bootCount: 2, persisted: true, idbPrev: undefined });
    expectShape(r, 'd', 'FAIL');
    expect(r.evidence).toContain('IDB lost (prev=undefined, expected 1)');
  });

  it('FAIL (IDB lost) on a type mismatch -- the comparison is strict', () => {
    const r = persistenceVerdict({ bootCount: 2, persisted: true, idbPrev: '1' });
    expectShape(r, 'd', 'FAIL');
    expect(r.evidence).toContain('IDB lost');
  });

  it('PENDING on first boot with no IDB value yet (reload once)', () => {
    expectShape(persistenceVerdict({ bootCount: 1, persisted: null, idbPrev: undefined }), 'd', 'PENDING');
    expectShape(persistenceVerdict({ bootCount: 0, persisted: true, idbPrev: undefined }), 'd', 'PENDING');
  });

  it('evidence includes the persisted value', () => {
    for (const persisted of [true, false, null]) {
      const r = persistenceVerdict({ bootCount: 2, persisted, idbPrev: 1 });
      expect(r.evidence).toContain(String(persisted));
    }
  });
});

// Covers: SPIKE-e
describe('fpsVerdict', () => {
  it('PENDING with no frames', () => {
    expectShape(fpsVerdict({ p50: Number.NaN, p5: Number.NaN, frames: 0 }), 'e', 'PENDING');
  });

  it('PENDING when p5 is NaN', () => {
    expectShape(fpsVerdict({ p50: 72, p5: Number.NaN, frames: 10 }), 'e', 'PENDING');
  });

  it('PENDING (collecting) below the 300-frame minimum, even when p5 would pass or fail', () => {
    for (const p5 of [72, 30]) {
      const r = fpsVerdict({ p50: 72, p5, frames: 299 });
      expectShape(r, 'e', 'PENDING');
      expect(r.evidence).toContain('collecting');
    }
  });

  it('PASS when p5 is exactly 60 (inclusive bar) at the 300-frame minimum', () => {
    expectShape(fpsVerdict({ p50: 72, p5: 60, frames: 300 }), 'e', 'PASS');
    expectShape(fpsVerdict({ p50: 90, p5: 88, frames: 1000 }), 'e', 'PASS');
  });

  it('FAIL when p5 is below 60', () => {
    expectShape(fpsVerdict({ p50: 72, p5: 59.99, frames: 300 }), 'e', 'FAIL');
  });
});

// Covers: SPIKE-e
describe('fpsBoardVerdict (status from load level 0 only)', () => {
  const s = (p50: number, p5: number, frames = 600) => ({ p50, p5, frames });

  it('PENDING when there is no level-0 baseline', () => {
    expectShape(fpsBoardVerdict(new Map()), 'e', 'PENDING');
    expectShape(fpsBoardVerdict(new Map([[50, s(72, 70)]])), 'e', 'PENDING');
  });

  it('PASS when L0 p5 >= 60 even though a heavier level fails', () => {
    const r = fpsBoardVerdict(new Map([[0, s(72, 71)], [200, s(45, 30)]]));
    expectShape(r, 'e', 'PASS');
  });

  it('FAIL when L0 p5 < 60 even though other levels pass', () => {
    const r = fpsBoardVerdict(new Map([[0, s(70, 55)], [50, s(90, 88)]]));
    expectShape(r, 'e', 'FAIL');
  });

  it('PENDING (collecting) when L0 has fewer than 300 frames', () => {
    const r = fpsBoardVerdict(new Map([[0, s(72, 71, 120)], [50, s(72, 71)]]));
    expectShape(r, 'e', 'PENDING');
    expect(r.evidence).toContain('collecting');
  });

  it('evidence lists every level ascending as rounded p50/p5 with its frame count', () => {
    const r = fpsBoardVerdict(
      new Map([
        [200, s(45.2, 29.6, 310)],
        [0, s(72.4, 70.6, 600)],
        [50, s(70, 66.4, 120)],
      ]),
    );
    expect(r.evidence).toContain('L0 72/71 (n=600) L50 70/66 (n=120) L200 45/30 (n=310)');
  });

  it('evidence labels the baseline as the L0 verdict with its bar, with no load= prefix', () => {
    const r = fpsBoardVerdict(new Map([[0, s(72.4, 70.6, 600)], [50, s(70, 66.4, 120)]]));
    expect(r.evidence.startsWith('L0 verdict: p50=72.4 p5=70.6 over 600 frames (bar p5>=60)')).toBe(true);
    expect(r.evidence).not.toContain('load=');
  });
});

// Covers: SPIKE-f
describe('arVerdict', () => {
  it('PENDING when AR support is not yet known', () => {
    expectShape(arVerdict({ arSupported: null, planes: 3, meshes: 1 }), 'f', 'PENDING');
  });

  it('UNAVAILABLE when immersive-ar is unsupported', () => {
    expectShape(arVerdict({ arSupported: false, planes: null, meshes: null }), 'f', 'UNAVAILABLE');
  });

  it('PENDING when supported but neither planes nor meshes have been counted', () => {
    expectShape(arVerdict({ arSupported: true, planes: null, meshes: null }), 'f', 'PENDING');
  });

  it('PASS when any planes or meshes are detected', () => {
    expectShape(arVerdict({ arSupported: true, planes: 1, meshes: null }), 'f', 'PASS');
    expectShape(arVerdict({ arSupported: true, planes: null, meshes: 2 }), 'f', 'PASS');
    expectShape(arVerdict({ arSupported: true, planes: 0, meshes: 4 }), 'f', 'PASS');
  });

  it('FAIL when counted and zero detected', () => {
    expectShape(arVerdict({ arSupported: true, planes: 0, meshes: 0 }), 'f', 'FAIL');
    expectShape(arVerdict({ arSupported: true, planes: 0, meshes: null }), 'f', 'FAIL');
  });
});

// Covers: SPIKE-g
describe('offlineVerdict', () => {
  const base = { swSupported: true, controlled: true, online: false, bootedOffline: true };

  it('UNAVAILABLE without service-worker support', () => {
    expectShape(offlineVerdict({ ...base, swSupported: false }), 'g', 'UNAVAILABLE');
  });

  it('PENDING when the page is not SW-controlled yet', () => {
    expectShape(offlineVerdict({ ...base, controlled: false, bootedOffline: false }), 'g', 'PENDING');
  });

  it('PENDING when controlled but still online (airplane mode + reload)', () => {
    const r = offlineVerdict({ ...base, online: true, bootedOffline: false });
    expectShape(r, 'g', 'PENDING');
    expect(r.evidence).toBe('controlled; enable airplane mode and reload');
  });

  it('PENDING (reload) when the live page went offline after an online boot', () => {
    const r = offlineVerdict({ ...base, online: false, bootedOffline: false });
    expectShape(r, 'g', 'PENDING');
    expect(r.evidence).toContain('reload');
  });

  it('PASS when the page booted offline under SW control', () => {
    expectShape(offlineVerdict(base), 'g', 'PASS');
  });

  it('PASS stays once the network returns -- the offline boot is the proof', () => {
    expectShape(offlineVerdict({ ...base, online: true }), 'g', 'PASS');
  });
});
