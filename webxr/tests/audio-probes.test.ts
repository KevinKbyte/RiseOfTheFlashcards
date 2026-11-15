// Requirement: the audio probes never turn a measurement artefact into a verdict. A mic clip counts
// as speech only if its peak 50 ms window RMS is >= 0.01 (quieter clips are UNAVAILABLE "silent
// clip; speak during recording"). An AudioContext that is not running after resume makes row a
// PENDING "audio context suspended; tap Re-run audio" and yields no clip (not a silent-stream FAIL).
// Row b with no clip is UNAVAILABLE "no mic clip (see row a)". A whisper model that cannot be
// fetched (offline / network) is UNAVAILABLE "model not cached/offline"; other errors stay FAIL.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pipelineMock = vi.fn();
vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
  env: { backends: { onnx: { wasm: {} } } },
}));

import { runMicProbe, runWhisperProbe } from '../src/probe/audio-probes.js';

const noop = () => undefined;

function speechClip(): Float32Array {
  const clip = new Float32Array(48000);
  for (let i = 0; i < clip.length; i++) clip[i] = 0.2 * Math.sin(i / 5);
  return clip;
}

function stubGpuAndAsr(text = 'hello world') {
  vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({}) } });
  pipelineMock.mockResolvedValue(async () => ({ text }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  pipelineMock.mockReset();
  vi.useRealTimers();
});

// Covers: SPIKE-b
describe('runWhisperProbe speech gate at peak RMS 0.01 (S1.2)', () => {
  it('a clip with peakRms 0.005 is UNAVAILABLE "silent clip" even with a transcript', async () => {
    stubGpuAndAsr();
    const r = await runWhisperProbe(speechClip(), 0.005, noop);
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.evidence).toContain('silent clip; speak during recording');
  });

  it('a clip just below 0.01 is still silent', async () => {
    stubGpuAndAsr();
    const r = await runWhisperProbe(speechClip(), 0.0099, noop);
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.evidence).toContain('silent clip');
  });

  it('a clip at exactly 0.01 counts as speech (inclusive bar)', async () => {
    stubGpuAndAsr();
    const r = await runWhisperProbe(speechClip(), 0.01, noop);
    expect(r.evidence).not.toContain('silent clip');
  });
});

// Covers: SPIKE-b
describe('runWhisperProbe with no mic clip (S1.4)', () => {
  it('UNAVAILABLE "no mic clip (see row a)" and whisper is not judged on synthetic silence', async () => {
    stubGpuAndAsr();
    const r = await runWhisperProbe(null, 0, noop);
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.evidence).toContain('no mic clip (see row a)');
  });
});

// Covers: SPIKE-b
describe('runWhisperProbe error classification (S1.5)', () => {
  it('model fetch failure (offline) is UNAVAILABLE "model not cached/offline"', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({}) } });
    pipelineMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await runWhisperProbe(speechClip(), 0.2, noop);
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.evidence).toContain('model not cached/offline');
  });

  it('an inference error stays FAIL', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({}) } });
    pipelineMock.mockResolvedValue(async () => {
      throw new Error('WebGPU device lost');
    });
    const r = await runWhisperProbe(speechClip(), 0.2, noop);
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('WebGPU device lost');
  });
});

class FakeSuspendedAudioContext {
  state = 'suspended';
  sampleRate = 48000;
  destination = {};
  resume() {
    return new Promise<void>(() => undefined);
  }
  createMediaStreamSource() {
    return { connect: noop, disconnect: noop };
  }
  createAnalyser() {
    return { fftSize: 2048, getFloatTimeDomainData: noop };
  }
  createScriptProcessor() {
    return { connect: noop, disconnect: noop, onaudioprocess: null };
  }
  close() {
    return Promise.resolve();
  }
}

// Covers: SPIKE-a
describe('runMicProbe with an AudioContext that stays suspended (S1.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const stop = vi.fn();
    vi.stubGlobal('AudioContext', FakeSuspendedAudioContext);
    vi.stubGlobal('navigator', {
      permissions: { query: async () => ({ state: 'granted' }) },
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
    });
  });

  it('row a is PENDING "audio context suspended; tap Re-run audio" and no clip is returned', async () => {
    const p = runMicProbe(() => true, noop);
    await vi.advanceTimersByTimeAsync(10000);
    const { result, clip } = await p;
    expect(result.id).toBe('a');
    expect(result.status).toBe('PENDING');
    expect(result.evidence).toContain('audio context suspended; tap Re-run audio');
    expect(result.evidence).not.toContain('silent stream');
    expect(clip).toBeNull();
  });
});
