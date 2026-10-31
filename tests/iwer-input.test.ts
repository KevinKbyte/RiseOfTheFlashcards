// @vitest-environment jsdom
// Requirement: classifyInputSources must agree with what a real WebXR runtime reports -- an
// IWER-emulated Meta Quest 3 in hand-tracking mode yields two hands and no controllers, and in
// controller mode yields two controllers and no hands.
//
// Headless limitation (jsdom): XRSession.inputSources is only populated inside IWER's frame
// loop, which returns early until renderState.baseLayer holds an XRWebGLLayer with a real
// WebGL context (getParameter/clear/canvas). jsdom has no WebGL, so a session's own
// inputSources stay empty here. These tests therefore (1) drive a real immersive-vr session
// request through the installed IWER runtime (navigator.xr) to prove it is granted with
// hand-tracking, and (2) classify the device's real IWER XRInputSource objects
// (XRDevice.inputSources -- the exact objects the session exposes once frames run). An inert
// WebGL2RenderingContext constructor is stubbed only so installRuntime can patch its prototype. Session
// inputSources under a live frame loop are verified on-device / in the browser, not here.
import { XRDevice, metaQuest3 } from 'iwer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyInputSources } from '../src/probe/input-sources.js';

let device: XRDevice;
let session: XRSession | null = null;

beforeEach(() => {
  // installRuntime patches WebGL2RenderingContext.prototype.makeXRCompatible; jsdom has no
  // WebGL, so provide an inert constructor (removed again by unstubAllGlobals).
  if (typeof (globalThis as Record<string, unknown>).WebGL2RenderingContext === 'undefined') {
    vi.stubGlobal('WebGL2RenderingContext', class WebGL2RenderingContext {});
  }
  device = new XRDevice(metaQuest3);
  device.installRuntime({ globalObject: globalThis, forceInstall: true });
});

afterEach(async () => {
  if (session) {
    await session.end().catch(() => undefined);
    session = null;
  }
  device.uninstallRuntime();
  vi.unstubAllGlobals();
});

// Covers: SPIKE-c
describe('IWER Quest 3 input sources through classifyInputSources', () => {
  it('grants an immersive-vr session with hand-tracking via the installed runtime', async () => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    expect(xr).toBeDefined();
    expect(await xr!.isSessionSupported('immersive-vr')).toBe(true);
    session = await xr!.requestSession('immersive-vr', { optionalFeatures: ['hand-tracking'] });
    expect(session.enabledFeatures).toContain('hand-tracking');
  });

  it('classifies hand mode as two hands and no controllers', () => {
    device.primaryInputMode = 'hand';
    const r = classifyInputSources(device.inputSources);
    expect([...r.hands].sort()).toEqual(['left', 'right']);
    expect(r.controllers).toEqual([]);
  });

  it('classifies controller mode as two controllers and no hands', () => {
    device.primaryInputMode = 'controller';
    const r = classifyInputSources(device.inputSources);
    expect([...r.controllers].sort()).toEqual(['left', 'right']);
    expect(r.hands).toEqual([]);
  });

  it('follows a live switch from controllers to hands on the same device', () => {
    device.primaryInputMode = 'controller';
    expect(classifyInputSources(device.inputSources).hands).toEqual([]);
    device.primaryInputMode = 'hand';
    expect(classifyInputSources(device.inputSources).hands).toHaveLength(2);
  });
});
