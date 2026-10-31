/**
 * Premises a (mic inside the immersive session) and b (Whisper tiny.en on WebGPU).
 */
import { rms } from './stats.js';
import { makeResult, micVerdict, whisperVerdict, type PremiseResult } from './verdict.js';

const CLIP_MS = 3000;
const WHISPER_RATE = 16000;
const CLIP_SAMPLES = (WHISPER_RATE * CLIP_MS) / 1000;
const TIMED_RUNS = 5;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const msg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

async function micPermissionState(): Promise<string> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    // Some browsers do not expose 'microphone' to the Permissions API.
    return 'unknown';
  }
}

/** Linear-interpolation resample into a fixed 3 s, 16 kHz clip (zero-padded). */
function resampleTo16k(input: Float32Array, rate: number): Float32Array {
  const out = new Float32Array(CLIP_SAMPLES);
  const ratio = rate / WHISPER_RATE;
  for (let i = 0; i < CLIP_SAMPLES; i++) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    if (lo + 1 >= input.length) break;
    out[i] = input[lo] + (input[lo + 1] - input[lo]) * (pos - lo);
  }
  return out;
}

async function capture(stream: MediaStream): Promise<{ peakRms: number; clip: Float32Array; ctxState: string }> {
  const ctx = new AudioContext();
  await ctx.resume();
  const ctxState = ctx.state;
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  const frame = new Float32Array(analyser.fftSize);
  const raw = new Float32Array(Math.ceil((ctx.sampleRate * CLIP_MS) / 1000));
  let written = 0;
  // ScriptProcessor is deprecated but needs no worklet module file; it only copies samples.
  const recorder = ctx.createScriptProcessor(4096, 1, 1);
  recorder.onaudioprocess = (ev) => {
    const ch = ev.inputBuffer.getChannelData(0);
    const n = Math.min(ch.length, raw.length - written);
    if (n > 0) raw.set(ch.subarray(0, n), written);
    written += n;
  };
  source.connect(analyser);
  source.connect(recorder);
  recorder.connect(ctx.destination);
  let peakRms = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(frame);
    const level = rms(frame);
    if (level > peakRms) peakRms = level;
  }, 50);
  await sleep(CLIP_MS);
  clearInterval(timer);
  recorder.onaudioprocess = null;
  source.disconnect();
  recorder.disconnect();
  await ctx.close();
  return { peakRms, clip: resampleTo16k(raw.subarray(0, written), ctx.sampleRate), ctxState };
}

export async function runMicProbe(
  inSession: () => boolean,
): Promise<{ result: PremiseResult; clip: Float32Array | null }> {
  const supported = typeof navigator.mediaDevices?.getUserMedia === 'function';
  if (!supported) {
    return { result: micVerdict({ supported, inSession: inSession(), outcome: null, peakRms: 0 }), clip: null };
  }
  const permBefore = await micPermissionState();
  const t0 = performance.now();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    const outcome = e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'error';
    const v = micVerdict({ supported, inSession: inSession(), outcome, peakRms: 0 });
    const ev = `${v.evidence}; ${msg(e)}; perm before=${permBefore}; ${Math.round(performance.now() - t0)} ms`;
    return { result: makeResult('a', v.status, ev), clip: null };
  }
  const grantMs = Math.round(performance.now() - t0);
  const grantedInSession = inSession();
  try {
    const { peakRms, clip, ctxState } = await capture(stream);
    const v = micVerdict({ supported, inSession: grantedInSession, outcome: 'granted', peakRms });
    const ev =
      `${v.evidence}; perm before=${permBefore} after=${await micPermissionState()}; ` +
      `grant ${grantMs} ms (long = prompt shown); audioCtx=${ctxState}`;
    return { result: makeResult('a', v.status, ev), clip };
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

export async function runWhisperProbe(clip: Float32Array | null): Promise<PremiseResult> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null;
  if (!adapter) return whisperVerdict({ webgpu: false, latenciesMs: [] });
  const input = clip ?? new Float32Array(CLIP_SAMPLES);
  try {
    const t0 = performance.now();
    const { pipeline } = await import('@huggingface/transformers');
    const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
      device: 'webgpu',
    });
    const loadMs = Math.round(performance.now() - t0);
    await asr(input);
    const latenciesMs: number[] = [];
    let text = '';
    for (let i = 0; i < TIMED_RUNS; i++) {
      const start = performance.now();
      const out = await asr(input);
      latenciesMs.push(performance.now() - start);
      text = (Array.isArray(out) ? out[0] : out)?.text ?? '';
    }
    const v = whisperVerdict({ webgpu: true, latenciesMs });
    const ev = `${v.evidence}; load ${loadMs} ms; clip=${clip ? 'mic' : 'silence'}; text="${text.trim().slice(0, 40)}"`;
    return makeResult('b', v.status, ev);
  } catch (e) {
    return makeResult('b', 'FAIL', `whisper error: ${msg(e)}`);
  }
}
