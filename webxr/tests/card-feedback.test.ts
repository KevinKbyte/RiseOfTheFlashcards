// Requirement: every time the player answers a card correctly there is feedback (CARDS-012): a short
// green burst (one flash sphere plus 6 shards) at the answered card, a short two-note rising tone
// (660 Hz then 990 Hz, about 150 ms in total), and a controller haptic pulse (intensity 0.6, 80 ms)
// where the gamepad has a haptic actuator. A burst disappears after about 0.4 s. At most 3 bursts
// show at once; a 4th correct answer recycles the oldest burst, so rapid answers never pile up
// scene objects. Missing audio support or a gamepad without haptics never breaks play. Audio starts
// only after an explicit unlock (browser autoplay rules), which resumes a suspended context.
// destroy() frees the shared geometry and material once and removes every burst from the scene.
//
// API contract for src/card-feedback.ts:
//   export class CorrectFeedback {
//     constructor(parent: Object3D);
//     unlockAudio(): void;
//     play(at: Vector3, gamepad?: unknown): void;
//     update(dt: number): void;   // seconds
//     destroy(): void;
//   }
// Each burst is one Object3D added directly to `parent`, positioned at `at`, with
// userData.iwsdkRuntimeOnly === true, containing 7 meshes (1 flash + 6 shards). Geometry and
// material instances are shared across bursts.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => await import('three'));

import { Object3D, Vector3, type BufferGeometry, type Material, type Mesh } from '@iwsdk/core';
import { CorrectFeedback } from '../src/card-feedback.js';

function runtimeBursts(parent: Object3D): Object3D[] {
  return parent.children.filter((c) => c.userData.iwsdkRuntimeOnly === true);
}

function visibleBursts(parent: Object3D): Object3D[] {
  return runtimeBursts(parent).filter((c) => c.visible);
}

function meshesOf(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

function sharedResources(parent: Object3D): { geometries: Set<BufferGeometry>; materials: Set<Material> } {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  for (const b of runtimeBursts(parent)) {
    for (const m of meshesOf(b)) {
      geometries.add(m.geometry);
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat);
    }
  }
  return { geometries, materials };
}

interface FakeOsc {
  freqs: number[];
  startAt: number | undefined;
  stopAt: number | undefined;
}

function stubAudioContext(state: 'running' | 'suspended' = 'running') {
  const oscillators: FakeOsc[] = [];
  const contexts: FakeAudioContext[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  class FakeAudioContext {
    state = state;
    currentTime = 0;
    destination = { connect: vi.fn() };
    // Like a real context, the state flips only once the resume promise settles, not synchronously.
    resume = vi.fn(async () => {
      await Promise.resolve();
      this.state = 'running';
    });
    constructor() {
      contexts.push(this);
    }
    createOscillator() {
      const rec: FakeOsc = { freqs: [], startAt: undefined, stopAt: undefined };
      oscillators.push(rec);
      let v = 440;
      const frequency = {
        ...param(),
        get value() {
          return v;
        },
        set value(x: number) {
          v = x;
          rec.freqs.push(x);
        },
        setValueAtTime: vi.fn((x: number) => {
          rec.freqs.push(x);
        }),
      };
      return {
        type: 'sine',
        frequency,
        detune: param(),
        connect: vi.fn((n: unknown) => n),
        disconnect: vi.fn(),
        start: vi.fn((t?: number) => {
          rec.startAt = t ?? 0;
        }),
        stop: vi.fn((t?: number) => {
          rec.stopAt = t ?? 0;
        }),
        addEventListener: vi.fn(),
        onended: null,
      };
    }
    createGain() {
      return { gain: param(), connect: vi.fn((n: unknown) => n), disconnect: vi.fn() };
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { oscillators, contexts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Covers: CARDS-012
describe('CorrectFeedback burst lifetime and pool', () => {
  it('play adds a visible burst at the answered position with a flash plus 6 shards', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    const at = new Vector3(0.5, 1.4, -2);
    fx.play(at);
    const bursts = visibleBursts(scene);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].getWorldPosition(new Vector3()).distanceTo(at)).toBeLessThan(1e-6);
    expect(meshesOf(bursts[0])).toHaveLength(7);
  });

  it('a burst is still visible at 0.3 s and gone (hidden or removed) after 0.5 s', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    fx.play(new Vector3());
    fx.update(0.3);
    expect(visibleBursts(scene)).toHaveLength(1);
    fx.update(0.2);
    expect(visibleBursts(scene)).toHaveLength(0);
  });

  it('time spent in many small frames ends the burst the same as one large step', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    fx.play(new Vector3());
    for (let i = 0; i < 18; i++) fx.update(1 / 60); // ~0.3 s
    expect(visibleBursts(scene)).toHaveLength(1);
    for (let i = 0; i < 15; i++) fx.update(1 / 60); // ~0.55 s total
    expect(visibleBursts(scene)).toHaveLength(0);
  });

  it('three rapid plays show three bursts at once', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    for (let i = 0; i < 3; i++) fx.play(new Vector3(i, 0, 0));
    expect(visibleBursts(scene)).toHaveLength(3);
  });

  it('a 4th play recycles the oldest burst: still 3 visible, the first position is gone', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    for (let i = 1; i <= 4; i++) fx.play(new Vector3(i, 0, 0));
    const xs = visibleBursts(scene)
      .map((b) => Math.round(b.getWorldPosition(new Vector3()).x))
      .sort((a, b) => a - b);
    expect(xs).toEqual([2, 3, 4]);
  });

  it('the recycled burst restarts its lifetime: after 0.3 s more only the newest-played ones remain', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    fx.play(new Vector3(1, 0, 0));
    fx.update(0.2);
    fx.play(new Vector3(2, 0, 0));
    fx.play(new Vector3(3, 0, 0));
    fx.play(new Vector3(4, 0, 0)); // recycles x=1, which was 0.2 s old
    fx.update(0.3); // x=1 would have expired at 0.5 total; the recycled burst is only 0.3 s old
    expect(visibleBursts(scene)).toHaveLength(3);
  });

  it('many plays never grow the scene past 3 burst objects', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    for (let i = 0; i < 20; i++) {
      fx.play(new Vector3(i, 0, 0));
      fx.update(0.05);
    }
    expect(runtimeBursts(scene).length).toBeLessThanOrEqual(3);
    expect(visibleBursts(scene).length).toBeLessThanOrEqual(3);
  });

  it('update with no bursts and with dt 0 does not throw', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    expect(() => fx.update(0)).not.toThrow();
    expect(() => fx.update(0.016)).not.toThrow();
  });

  it('burst objects are runtime-only and share one geometry/material set across bursts', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    fx.play(new Vector3(0, 0, 0));
    const one = sharedResources(scene);
    fx.play(new Vector3(1, 0, 0));
    fx.play(new Vector3(2, 0, 0));
    const three = sharedResources(scene);
    expect(runtimeBursts(scene)).toHaveLength(3);
    expect(three.geometries.size).toBe(one.geometries.size);
    expect(three.materials.size).toBe(one.materials.size);
    for (const g of three.geometries) expect(one.geometries.has(g)).toBe(true);
    for (const m of three.materials) expect(one.materials.has(m)).toBe(true);
  });
});

// Covers: CARDS-012
describe('CorrectFeedback tone', () => {
  it('construction alone does not create an AudioContext (autoplay rules)', () => {
    const audio = stubAudioContext();
    new CorrectFeedback(new Object3D());
    expect(audio.contexts).toHaveLength(0);
  });

  it('without AudioContext, unlockAudio and play are silent no-ops', () => {
    vi.stubGlobal('AudioContext', undefined);
    const fx = new CorrectFeedback(new Object3D());
    expect(() => fx.unlockAudio()).not.toThrow();
    expect(() => fx.play(new Vector3())).not.toThrow();
  });

  it('after unlock, play schedules two oscillators rising 660 Hz then 990 Hz within ~150 ms', () => {
    const audio = stubAudioContext();
    const fx = new CorrectFeedback(new Object3D());
    fx.unlockAudio();
    fx.play(new Vector3());
    expect(audio.oscillators).toHaveLength(2);
    const [lo, hi] = audio.oscillators;
    expect(lo.freqs).toContain(660);
    expect(hi.freqs).toContain(990);
    expect(lo.startAt).toBeDefined();
    expect(hi.startAt).toBeDefined();
    expect(hi.startAt!).toBeGreaterThan(lo.startAt!);
    expect(lo.stopAt).toBeDefined();
    expect(hi.stopAt).toBeDefined();
    const total = Math.max(lo.stopAt!, hi.stopAt!) - lo.startAt!;
    expect(total).toBeGreaterThan(0.1);
    expect(total).toBeLessThanOrEqual(0.2);
  });

  it('unlockAudio twice reuses one AudioContext', () => {
    const audio = stubAudioContext();
    const fx = new CorrectFeedback(new Object3D());
    fx.unlockAudio();
    fx.unlockAudio();
    expect(audio.contexts).toHaveLength(1);
  });

  it('unlockAudio resumes a suspended context', () => {
    const audio = stubAudioContext('suspended');
    const fx = new CorrectFeedback(new Object3D());
    fx.unlockAudio();
    expect(audio.contexts).toHaveLength(1);
    expect(audio.contexts[0].resume).toHaveBeenCalled();
  });

  it('unlockAudio does not call resume on an already running context', () => {
    const audio = stubAudioContext('running');
    const fx = new CorrectFeedback(new Object3D());
    fx.unlockAudio();
    expect(audio.contexts[0].resume).not.toHaveBeenCalled();
  });
});

// Covers: CARDS-012
describe('CorrectFeedback haptics', () => {
  it('pulses the first haptic actuator at 0.6 for 80 ms', () => {
    const pulse = vi.fn(async () => true);
    const fx = new CorrectFeedback(new Object3D());
    fx.play(new Vector3(), { hapticActuators: [{ pulse }] });
    expect(pulse).toHaveBeenCalledTimes(1);
    expect(pulse).toHaveBeenCalledWith(0.6, 80);
  });

  it.each([
    ['undefined gamepad', undefined],
    ['null gamepad', null],
    ['gamepad without hapticActuators', {}],
    ['gamepad with empty hapticActuators', { hapticActuators: [] }],
    ['actuator without pulse', { hapticActuators: [{}] }],
  ])('play does not throw and still shows the burst with %s', (_label, gamepad) => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    expect(() => fx.play(new Vector3(), gamepad)).not.toThrow();
    expect(visibleBursts(scene)).toHaveLength(1);
  });
});

// Covers: CARDS-012
describe('CorrectFeedback destroy', () => {
  it('disposes each shared geometry and material exactly once and removes bursts from the parent', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    for (let i = 0; i < 3; i++) fx.play(new Vector3(i, 0, 0));
    const { geometries, materials } = sharedResources(scene);
    expect(geometries.size).toBeGreaterThan(0);
    expect(materials.size).toBeGreaterThan(0);
    const spies = [...geometries, ...materials].map((r) => vi.spyOn(r, 'dispose'));
    fx.destroy();
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    expect(runtimeBursts(scene)).toHaveLength(0);
  });

  it('destroy before any play does not throw and leaves the parent empty', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    expect(() => fx.destroy()).not.toThrow();
    expect(runtimeBursts(scene)).toHaveLength(0);
  });
});

// Covers: CARDS-012
describe('CorrectFeedback audio and runtime-only guards', () => {
  it('while the context is still suspended at play time, no oscillator is scheduled', () => {
    const audio = stubAudioContext('suspended');
    const fx = new CorrectFeedback(new Object3D());
    fx.unlockAudio(); // resume() is pending; the context still reports 'suspended'
    expect(audio.contexts[0].state).toBe('suspended');
    fx.play(new Vector3());
    expect(audio.oscillators).toHaveLength(0);
  });

  it('once resume() has settled and the context is running, play schedules the tone', async () => {
    const audio = stubAudioContext('suspended');
    const fx = new CorrectFeedback(new Object3D());
    fx.unlockAudio();
    await audio.contexts[0].resume.mock.results[0].value;
    expect(audio.contexts[0].state).toBe('running');
    fx.play(new Vector3());
    expect(audio.oscillators).toHaveLength(2);
  });

  it('every flash and shard mesh, not only the burst group, is runtime-only', () => {
    const scene = new Object3D();
    const fx = new CorrectFeedback(scene);
    fx.play(new Vector3());
    const meshes = meshesOf(runtimeBursts(scene)[0]);
    expect(meshes).toHaveLength(7);
    for (const m of meshes) expect(m.userData.iwsdkRuntimeOnly).toBe(true);
  });

  it('a rejected resume() does not surface as an unhandled rejection', async () => {
    const audio = stubAudioContext('suspended');
    const fx = new CorrectFeedback(new Object3D());
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      fx.unlockAudio(); // creates the context; replace its resume before the call that rejects
      // A plain function, not vi.fn: the spy observes promise results, which would mark the
      // rejection as handled and hide the bug.
      let rejectedCalls = 0;
      const ctx = audio.contexts[0] as unknown as { resume: () => Promise<void> };
      ctx.resume = () => {
        rejectedCalls += 1;
        return Promise.reject(new Error('resume blocked'));
      };
      fx.unlockAudio();
      expect(rejectedCalls).toBe(1);
      // One macrotask turn: Node reports unhandled rejections after the microtask queue drains.
      await new Promise<void>((resolve) => setImmediate(resolve));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toHaveLength(0);
  });
});
