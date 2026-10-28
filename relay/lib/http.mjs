// HTTP helpers for the Vercel adapter (relay/api/_relay.mjs), kept here so tests can
// import them without pulling in the Upstash clients.

// GET polling bucket (RELAY-009): a headset polling once per second never hits it.
export const POLL_RATE_LIMIT = Object.freeze({ limit: 120, windowSec: 60 });
