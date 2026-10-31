// Requirement: the AR probe (row f) reports only counts measured by the current run. Every run
// starts from planes/meshes = null, so a PENDING row or a failed re-run never shows a previous run's
// counts. If the AR session ends (session 'end' event, or world.session no longer the probe's
// session) before the 10 s counting window closes, f is PENDING "AR session ended early; re-run",
// never a FAIL on zero counts. The probe exposes whether a run is in progress so frame-rate metering
// can pause during it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', () => ({ SessionMode: { ImmersiveAR: 'immersive-ar', ImmersiveVR: 'immersive-vr' } }));

import { ArProbe } from '../src/probe/ar-probe.js';
import type { PremiseResult } from '../src/probe/verdict.js';

type FrameCb = (frame: unknown) => void;

class FakeSession extends EventTarget {
  enabledFeatures = ['plane-detection', 'mesh-detection'];
}

function fakeWorld(opts: { startsSession: () => boolean }) {
  const frameCbs = new Set<FrameCb>();
  const world = {
    session: undefined as FakeSession | undefined,
    exitXR: vi.fn(() => {
      world.session = undefined;
    }),
    launchXR: vi.fn(() => {
      if (opts.startsSession()) world.session = new FakeSession();
    }),
    onXRFrame: (cb: FrameCb) => {
      frameCbs.add(cb);
      return () => frameCbs.delete(cb);
    },
    frame: (planes: number, meshes: number) => {
      for (const cb of frameCbs) cb({ detectedPlanes: { size: planes }, detectedMeshes: { size: meshes } });
    },
  };
  return world;
}

function setup(startsSession: () => boolean) {
  const world = fakeWorld({ startsSession });
  const reports: PremiseResult[] = [];
  const probe = new ArProbe(world as never, (r) => reports.push(r));
  return { world, reports, probe, last: () => reports[reports.length - 1] };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  vi.stubGlobal('navigator', { xr: { isSessionSupported: async () => true } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Covers: SPIKE-f
describe('ArProbe.run resets counts at the start of every run (S2.1)', () => {
  it('a re-run whose AR session never starts does not show the previous run counts', async () => {
    let start = true;
    const t = setup(() => start);
    const first = t.probe.run();
    await vi.advanceTimersByTimeAsync(500);
    t.world.frame(3, 2);
    await vi.advanceTimersByTimeAsync(11000);
    await first;
    expect(t.last().status).toBe('PASS');
    expect(t.last().evidence).toContain('planes=3 meshes=2');

    t.world.session = undefined;
    start = false;
    const reportsBefore = t.reports.length;
    const second = t.probe.run();
    await vi.advanceTimersByTimeAsync(20000);
    await second;
    const fresh = t.reports.slice(reportsBefore);
    expect(fresh.length).toBeGreaterThan(0);
    for (const r of fresh) {
      expect(r.evidence).not.toContain('planes=3');
      expect(r.status).not.toBe('PASS');
    }
    expect(t.last().evidence).toContain('planes=null meshes=null');
  });

  it('the PENDING "AR running" row of a re-run shows null counts, not stale ones', async () => {
    const t = setup(() => true);
    const first = t.probe.run();
    await vi.advanceTimersByTimeAsync(500);
    t.world.frame(4, 0);
    await vi.advanceTimersByTimeAsync(11000);
    await first;

    t.world.session = undefined;
    const reportsBefore = t.reports.length;
    const second = t.probe.run();
    await vi.advanceTimersByTimeAsync(500);
    const running = t.reports.slice(reportsBefore).filter((r) => r.evidence.includes('AR running'));
    expect(running.length).toBeGreaterThan(0);
    for (const r of running) {
      expect(r.status).toBe('PENDING');
      expect(r.evidence).toContain('planes=null meshes=null');
    }
    await vi.advanceTimersByTimeAsync(11000);
    await second;
  });
});

// Covers: SPIKE-f
describe('ArProbe.run when the AR session ends inside the counting window (S2.2)', () => {
  it('session "end" event before 10 s -> PENDING "AR session ended early; re-run", never FAIL', async () => {
    const t = setup(() => true);
    const run = t.probe.run();
    await vi.advanceTimersByTimeAsync(500);
    const session = t.world.session!;
    expect(session).toBeDefined();
    await vi.advanceTimersByTimeAsync(2000);
    t.world.session = undefined;
    session.dispatchEvent(new Event('end'));
    await vi.advanceTimersByTimeAsync(11000);
    await run;
    expect(t.reports.some((r) => r.status === 'FAIL')).toBe(false);
    expect(t.last().status).toBe('PENDING');
    expect(t.last().evidence).toContain('AR session ended early; re-run');
  });

  it('world.session replaced (no end event) before 10 s -> same PENDING, never FAIL', async () => {
    const t = setup(() => true);
    const run = t.probe.run();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(2000);
    t.world.session = new FakeSession();
    await vi.advanceTimersByTimeAsync(11000);
    await run;
    expect(t.reports.some((r) => r.status === 'FAIL')).toBe(false);
    expect(t.last().status).toBe('PENDING');
    expect(t.last().evidence).toContain('AR session ended early; re-run');
  });

  it('a session that lasts the full window with zero detections is still a FAIL', async () => {
    const t = setup(() => true);
    const run = t.probe.run();
    await vi.advanceTimersByTimeAsync(500);
    t.world.frame(0, 0);
    await vi.advanceTimersByTimeAsync(11000);
    await run;
    expect(t.last().status).toBe('FAIL');
  });
});

// Covers: SPIKE-e, SPIKE-f
describe('ArProbe.isRunning (S2.3 seam: fps metering pauses during the AR probe)', () => {
  it('is true while a run is in progress and false before and after', async () => {
    const t = setup(() => true);
    expect(t.probe.isRunning).toBe(false);
    const run = t.probe.run();
    await vi.advanceTimersByTimeAsync(500);
    expect(t.probe.isRunning).toBe(true);
    await vi.advanceTimersByTimeAsync(11000);
    await run;
    expect(t.probe.isRunning).toBe(false);
  });
});
