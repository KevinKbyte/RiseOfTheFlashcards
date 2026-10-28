// HTTP helpers for the Vercel adapter (relay/api/_relay.mjs), kept here so tests can
// import them without pulling in the Upstash clients.
import { MAX_BODY_BYTES } from './validate.mjs';

// GET polling bucket (RELAY-009): a headset polling once per second never hits it.
export const POLL_RATE_LIMIT = Object.freeze({ limit: 120, windowSec: 60 });

// The code is the last segment of /pair/<code> or /api/pair/<code> (a rewrite may
// surface either), ignoring one trailing slash; the relay core validates its format.
export function codeFromPath(pathname) {
  return pathname.replace(/\/$/, '').split('/').pop();
}

const firstEntry =(value) => (value ?? '').split(',')[0].trim();

// Vercel sets x-vercel-forwarded-for itself, so a client-forged x-forwarded-for cannot
// choose its own rate-limit key; the other headers are fallbacks only.
export function clientKey(headers) {
  return (
    firstEntry(headers.get('x-vercel-forwarded-for')) ||
    firstEntry(headers.get('x-real-ip')) ||
    firstEntry(headers.get('x-forwarded-for')) ||
    'unknown'
  );
}

// Refuses an over-limit declared Content-Length before buffering the body; an
// undeclared or understated length is still caught by validateDeck's byte check.
export async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: `body exceeds ${MAX_BODY_BYTES} bytes` };
  }
  return { ok: true, body: await request.text() };
}
