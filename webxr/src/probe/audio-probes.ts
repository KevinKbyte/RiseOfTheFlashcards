/**
 * Premises a (mic inside the immersive session) and b (Whisper tiny.en on WebGPU).
 */
// Same-origin ORT runtime: transformers.js defaults wasmPaths to cdn.jsdelivr.net, which breaks
// offline reload (premise g) and adds a third-party fetch. Vite emits these as hashed dist assets.
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { percentile, rms } from './stats.js';
import {
  SPEECH_RMS,
  classifyWhisperError,
  makeResult,
  micVerdict,
  whisperVerdict,
  type PremiseResult,
} from './verdict.js';

const CLIP_MS = 3000;
const WHISPER_RATE = 16000;
const CLIP_SAMPLES = (WHISPER_RATE * CLIP_MS) / 1000;
const TIMED_RUNS = 5;
// ctx.resume() can hang without user activation; record anyway and report the context state.
const RESUME_TIMEOUT_MS = 2000;

export type StatusFn = (text: string) => void;

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
  try {
    await Promise.race([ctx.resume(), sleep(RESUME_TIMEOUT_MS)]);
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
    return { peakRms, clip: resampleTo16k(raw.subarray(0, written), ctx.sampleRate), ctxState };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export async function runMicProbe(
  inSession: () => boolean,
  onStatus: StatusFn,
): Promise<{ result: PremiseResult; clip: Float32Array | null; peakRms: number }> {
  const supported = typeof navigator.mediaDevices?.getUserMedia === 'function';
  if (!supported) {
    const result = micVerdict({ supported, inSession: inSession(), outcome: null, peakRms: 0 });
    return { result, clip: null, peakRms: 0 };
  }
  const permBefore = await micPermissionState();
  onStatus('waiting for mic permission (tap Allow)');
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
    return { result: makeResult('a', v.status, ev), clip: null, peakRms: 0 };
  }
  const grantMs = Math.round(performance.now() - t0);
  const grantedInSession = inSession();
  try {
    onStatus('RECORDING 3 s - SPEAK NOW');
    const { peakRms, clip, ctxState } = await capture(stream);
    const v = micVerdict({ supported, inSession: grantedInSession, outcome: 'granted', peakRms, ctxState });
    const ev =
      `${v.evidence}; perm before=${permBefore} after=${await micPermissionState()}; ` +
      `grant ${grantMs} ms (long = prompt shown); audioCtx=${ctxState}`;
    // A non-running context recorded nothing; handing on its zeros would let b judge fake silence.
    const usable = ctxState === 'running';
    return { result: makeResult('a', v.status, ev), clip: usable ? clip : null, peakRms };
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

export async function runWhisperProbe(
  clip: Float32Array | null,
  peakRms: number,
  onStatus: StatusFn,
): Promise<PremiseResult> {
  const clipSilent = clip === null || peakRms < SPEECH_RMS;
  const hasClip = clip !== null;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null;
  if (!adapter || !hasClip) {
    return whisperVerdict({ webgpu: adapter !== null, latenciesMs: [], clipSilent, transcript: '', hasClip });
  }
  const input = clip;
  try {
    const t0 = performance.now();
    const { pipeline, env } = await import('@huggingface/transformers');
    if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { mjs: ortMjsUrl, wasm: ortWasmUrl };
    const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
      device: 'webgpu',
      progress_callback: (p) => {
        if (p.status === 'progress_total') onStatus(`downloading model ${Math.floor(p.progress)}%`);
      },
    });
    const loadMs = Math.round(performance.now() - t0);
    onStatus(`running whisper 1 warm-up + ${TIMED_RUNS} runs...`);
    await asr(input);
    const latenciesMs: number[] = [];
    let text = '';
    for (let i = 0; i < TIMED_RUNS; i++) {
      const start = performance.now();
      const out = await asr(input);
      latenciesMs.push(performance.now() - start);
      text = (Array.isArray(out) ? out[0] : out)?.text ?? '';
    }
    const v = whisperVerdict({ webgpu: true, latenciesMs, clipSilent, transcript: text });
    // An UNAVAILABLE verdict omits latency; keep the raw p50 as context, not as the verdict.
    const raw = v.status === 'UNAVAILABLE' ? `; raw p50=${Math.round(percentile(latenciesMs, 50))} ms` : '';
    const ev =
      `${v.evidence}${raw}; load ${loadMs} ms; peakRms=${peakRms.toFixed(4)}; ` +
      `text="${text.trim().slice(0, 40)}"`;
    return makeResult('b', v.status, ev);
  } catch (e) {
    return classifyWhisperError(e);
  }
}
