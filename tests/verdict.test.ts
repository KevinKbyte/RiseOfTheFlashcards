// Requirement: each device premise (a..g) gets exactly one honest verdict -- PASS, FAIL,
// UNAVAILABLE or PENDING -- from its measured inputs, with inclusive bars where the contract
// says so (whisper p50 <= 1500 ms, frame-rate p5 >= 60), a strict bar for mic silence
// (peakRms > 0.001), and every result labelled as Quest 2 evidence because judges use Quest 3/3S.
import { describe, expect, it } from 'vitest';
import {
  FPS_MIN,
  MIC_SILENCE_RMS,
  PREMISE_TITLES,
  QUEST2_LABEL,
  WHISPER_P50_BAR_MS,
  arVerdict,
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
  it('UNAVAILABLE without WebGPU', () => {
    expectShape(whisperVerdict({ webgpu: false, latenciesMs: [100] }), 'b', 'UNAVAILABLE');
  });

  it('PENDING with no latency samples', () => {
    expectShape(whisperVerdict({ webgpu: true, latenciesMs: [] }), 'b', 'PENDING');
  });

  it('PASS when p50 is exactly 1500 ms (inclusive bar)', () => {
    expectShape(whisperVerdict({ webgpu: true, latenciesMs: [1500] }), 'b', 'PASS');
    expectShape(whisperVerdict({ webgpu: true, latenciesMs: [1400, 1600] }), 'b', 'PASS');
  });

  it('FAIL when p50 is above 1500 ms', () => {
    expectShape(whisperVerdict({ webgpu: true, latenciesMs: [1500.5] }), 'b', 'FAIL');
    expectShape(whisperVerdict({ webgpu: true, latenciesMs: [900, 2000, 2100] }), 'b', 'FAIL');
  });

  it('evidence contains the rounded p50 in ms', () => {
    // p50 of [1000, 1499.6] = 1249.8 -> 1250
    const r = whisperVerdict({ webgpu: true, latenciesMs: [1000, 1499.6] });
    expect(r.evidence).toContain('1250');
    const r2 = whisperVerdict({ webgpu: true, latenciesMs: [2000, 2400, 2201.2] });
    expect(r2.evidence).toContain('2201');
  });
});

// Covers: SPIKE-c
describe('inputVerdict', () => {
  it('PASS when hands are seen (with or without controllers)', () => {
    expectShape(inputVerdict({ handsSeen: true, controllersSeen: false }), 'c', 'PASS');
    expectShape(inputVerdict({ handsSeen: true, controllersSeen: true }), 'c', 'PASS');
  });

  it('FAIL when only controllers are seen', () => {
    expectShape(inputVerdict({ handsSeen: false, controllersSeen: true }), 'c', 'FAIL');
  });

  it('PENDING when nothing is seen', () => {
    expectShape(inputVerdict({ handsSeen: false, controllersSeen: false }), 'c', 'PENDING');
  });
});

// Covers: SPIKE-d
describe('persistenceVerdict', () => {
  it('FAIL when an error is reported, even after a reload', () => {
    expectShape(persistenceVerdict({ bootCount: 3, persisted: true, error: 'QuotaExceededError' }), 'd', 'FAIL');
  });

  it('PASS once the boot count reaches 2 (survived a reload)', () => {
    expectShape(persistenceVerdict({ bootCount: 2, persisted: true }), 'd', 'PASS');
    expectShape(persistenceVerdict({ bootCount: 7, persisted: false }), 'd', 'PASS');
  });

  it('PENDING on first boot (reload to confirm)', () => {
    expectShape(persistenceVerdict({ bootCount: 1, persisted: null }), 'd', 'PENDING');
    expectShape(persistenceVerdict({ bootCount: 0, persisted: true }), 'd', 'PENDING');
  });

  it('evidence includes the persisted value', () => {
    for (const persisted of [true, false, null]) {
      const r = persistenceVerdict({ bootCount: 2, persisted });
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

  it('PASS when p5 is exactly 60 (inclusive bar)', () => {
    expectShape(fpsVerdict({ p50: 72, p5: 60, frames: 100 }), 'e', 'PASS');
    expectShape(fpsVerdict({ p50: 90, p5: 88, frames: 100 }), 'e', 'PASS');
  });

  it('FAIL when p5 is below 60', () => {
    expectShape(fpsVerdict({ p50: 72, p5: 59.99, frames: 100 }), 'e', 'FAIL');
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
  it('UNAVAILABLE without service-worker support', () => {
    expectShape(offlineVerdict({ swSupported: false, controlled: true, online: false }), 'g', 'UNAVAILABLE');
  });

  it('PENDING when the page is not SW-controlled yet', () => {
    expectShape(offlineVerdict({ swSupported: true, controlled: false, online: false }), 'g', 'PENDING');
  });

  it('PENDING when controlled but still online (airplane mode + reload)', () => {
    expectShape(offlineVerdict({ swSupported: true, controlled: true, online: true }), 'g', 'PENDING');
  });

  it('PASS when controlled and loaded offline', () => {
    expectShape(offlineVerdict({ swSupported: true, controlled: true, online: false }), 'g', 'PASS');
  });
});
