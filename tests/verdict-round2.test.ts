// Requirement: audio rows a/b and frame-rate row e never report a verdict the measurement does not
// support. Whisper (b) PASSes only on real speech: bracketed/parenthesised non-speech tokens such as
// "[BLANK_AUDIO]" or "(buzzing)" are stripped and at least one alphabetic word of length >= 2 must
// remain, else UNAVAILABLE "no speech in transcript; use Re-run audio". With no mic clip at all
// (mic denied/failed/suspended) b is UNAVAILABLE "no mic clip (see row a)". A whisper model that
// cannot be fetched (network/offline) is UNAVAILABLE "model not cached/offline"; any other whisper
// error (WebGPU, inference) stays FAIL. The mic (a) is PENDING "audio context suspended; tap Re-run
// audio" when the AudioContext is not running after resume, never a silent-stream FAIL. Re-run audio
// outside a live XR session does not run the probes: a shows PENDING "enter XR to re-run audio".
// Frame-rate metering is off while the AR probe runs or the session is immersive-ar.
import { describe, expect, it } from 'vitest';
import {
  PREMISE_TITLES,
  QUEST2_LABEL,
  audioRerunGate,
  classifyWhisperError,
  fpsMeteringActive,
  micVerdict,
  whisperVerdict,
} from '../src/probe/verdict.js';

// Covers: SPIKE-b
describe('whisperVerdict requires real speech in the transcript (S1.1)', () => {
  const ok = { webgpu: true, clipSilent: false, latenciesMs: [800] };
  const NO_SPEECH = 'no speech in transcript; use Re-run audio';

  it('UNAVAILABLE when the transcript is only bracketed or parenthesised non-speech tokens', () => {
    for (const transcript of ['[BLANK_AUDIO]', ' (buzzing) ', '[Music] (static)', ' [BLANK_AUDIO]  (wind) ']) {
      const r = whisperVerdict({ ...ok, transcript });
      expect(r.status, transcript).toBe('UNAVAILABLE');
      expect(r.evidence, transcript).toContain(NO_SPEECH);
    }
  });

  it('UNAVAILABLE when no alphabetic word of length >= 2 remains', () => {
    for (const transcript of [' a ', 'I', '123 456', '. , !', '[BLANK_AUDIO] a']) {
      const r = whisperVerdict({ ...ok, transcript });
      expect(r.status, transcript).toBe('UNAVAILABLE');
      expect(r.evidence, transcript).toContain(NO_SPEECH);
    }
  });

  it('PASS when a real word survives next to non-speech tokens', () => {
    for (const transcript of ['[BLANK_AUDIO] hello', '(buzzing) ok', ' The quick fox. ']) {
      const r = whisperVerdict({ ...ok, transcript });
      expect(r.status, transcript).toBe('PASS');
    }
  });

  it('accepts noise decoded as a short real word (" you") -- documented residual risk', () => {
    expect(whisperVerdict({ ...ok, transcript: ' you' }).status).toBe('PASS');
  });

  it('the speech gate does not change the latency bar: real speech over 1500 ms still FAILs', () => {
    expect(whisperVerdict({ ...ok, latenciesMs: [2000], transcript: 'hello there' }).status).toBe('FAIL');
  });
});

// Covers: SPIKE-b
describe('whisperVerdict with no mic clip (S1.4)', () => {
  const base = { webgpu: true, clipSilent: true, transcript: '' };

  it('UNAVAILABLE "no mic clip (see row a)" even with no timed runs', () => {
    const r = whisperVerdict({ ...base, hasClip: false, latenciesMs: [] });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.evidence).toContain('no mic clip (see row a)');
  });

  it('UNAVAILABLE "no mic clip" takes precedence over the silent-clip evidence', () => {
    const r = whisperVerdict({ ...base, hasClip: false, latenciesMs: [800] });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.evidence).toContain('no mic clip (see row a)');
    expect(r.evidence).not.toContain('silent clip');
  });

  it('hasClip omitted keeps the prior behaviour (clip assumed present)', () => {
    const r = whisperVerdict({ webgpu: true, clipSilent: false, transcript: 'hello world', latenciesMs: [800] });
    expect(r.status).toBe('PASS');
  });
});

// Covers: SPIKE-b
describe('classifyWhisperError (S1.5)', () => {
  const MODEL = 'model not cached/offline';

  it('network/fetch failures loading the model are UNAVAILABLE "model not cached/offline"', () => {
    const errors: unknown[] = [
      new TypeError('Failed to fetch'),
      new Error('NetworkError when attempting to fetch resource.'),
      new Error('network error'),
      new Error('Could not FETCH model file'),
      'Failed to fetch',
    ];
    for (const e of errors) {
      const r = classifyWhisperError(e);
      expect(r.id).toBe('b');
      expect(r.title).toBe(PREMISE_TITLES.b);
      expect(r.label).toBe(QUEST2_LABEL);
      expect(r.status, String(e)).toBe('UNAVAILABLE');
      expect(r.evidence, String(e)).toContain(MODEL);
    }
  });

  it('WebGPU and inference errors stay FAIL and carry the error message', () => {
    for (const [e, text] of [
      [new Error('WebGPU device lost'), 'WebGPU device lost'],
      [new RangeError('Invalid input shape [1,80,3000]'), 'Invalid input shape'],
      ['GPUValidationError: buffer too large', 'buffer too large'],
    ] as const) {
      const r = classifyWhisperError(e);
      expect(r.id).toBe('b');
      expect(r.status, text).toBe('FAIL');
      expect(r.evidence, text).toContain(text);
      expect(r.evidence, text).not.toContain(MODEL);
    }
  });
});

// Covers: SPIKE-a
describe('micVerdict with a suspended AudioContext (S1.3)', () => {
  const base = { supported: true, inSession: true, outcome: 'granted' as const };
  const SUSPENDED = 'audio context suspended; tap Re-run audio';

  it('PENDING, not a silent-stream FAIL, when the context is not running after resume', () => {
    for (const ctxState of ['suspended', 'interrupted', 'closed']) {
      const r = micVerdict({ ...base, peakRms: 0, ctxState });
      expect(r.status, ctxState).toBe('PENDING');
      expect(r.evidence, ctxState).toContain(SUSPENDED);
      expect(r.evidence, ctxState).not.toContain('silent stream');
    }
  });

  it('a running context keeps the normal silence judgement', () => {
    expect(micVerdict({ ...base, peakRms: 0, ctxState: 'running' }).status).toBe('FAIL');
    expect(micVerdict({ ...base, peakRms: 0.5, ctxState: 'running' }).status).toBe('PASS');
  });

  it('a denied permission is still FAIL regardless of the context state', () => {
    expect(micVerdict({ ...base, outcome: 'denied', peakRms: 0, ctxState: 'suspended' }).status).toBe('FAIL');
  });
});

// Covers: SPIKE-a
describe('audioRerunGate (S1.6)', () => {
  it('outside a live XR session: returns a PENDING row a "enter XR to re-run audio"', () => {
    const r = audioRerunGate(false);
    expect(r).not.toBeNull();
    expect(r!.id).toBe('a');
    expect(r!.status).toBe('PENDING');
    expect(r!.evidence).toContain('enter XR to re-run audio');
  });

  it('inside a live XR session: returns null (proceed with the audio probes)', () => {
    expect(audioRerunGate(true)).toBeNull();
  });
});

// Covers: SPIKE-e
describe('fpsMeteringActive (S2.3)', () => {
  const on = { recording: true, audioBusy: false, arRunning: false, immersiveAr: false };

  it('meters only while recording with nothing else loading the device', () => {
    expect(fpsMeteringActive(on)).toBe(true);
    expect(fpsMeteringActive({ ...on, recording: false })).toBe(false);
    expect(fpsMeteringActive({ ...on, audioBusy: true })).toBe(false);
  });

  it('is off while the AR probe is running', () => {
    expect(fpsMeteringActive({ ...on, arRunning: true })).toBe(false);
  });

  it('is off while the session mode is immersive-ar', () => {
    expect(fpsMeteringActive({ ...on, immersiveAr: true })).toBe(false);
  });
});
