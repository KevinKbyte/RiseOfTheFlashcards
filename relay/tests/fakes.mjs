// Test-owned fakes for the relay's injected collaborators (store, rate limiter,
// logger, clock). Deterministic: time only moves when a test calls advance().

export function createFakeClock(startMs = 0) {
  let now = startMs;
  return {
    now: () => now,
    advance(ms) {
      now += ms;
    },
  };
}

// In-memory Redis stand-in. Every operation yields one microtask before acting,
// so concurrent callers interleave; the act itself is synchronous, hence atomic.
export function createFakeStore(clock) {
  const entries = new Map();
  const tick = () => Promise.resolve();

  function live(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (clock.now() >= entry.expiresAt) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  return {
    async setIfAbsent(key, value, ttlSec) {
      await tick();
      if (!Number.isInteger(ttlSec) || ttlSec <= 0) {
        throw new TypeError(`ttlSec must be a positive integer, got ${ttlSec}`);
      }
      if (live(key)) return false;
      entries.set(key, { value: String(value), expiresAt: clock.now() + ttlSec * 1000 });
      return true;
    },
    async get(key) {
      await tick();
      const entry = live(key);
      return entry ? entry.value : null;
    },
    async setIfEquals(key, expected, value) {
      await tick();
      const entry = live(key);
      if (!entry || entry.value !== expected) return false;
      entry.value = String(value);
      return true;
    },
    async getDel(key) {
      await tick();
      const entry = live(key);
      if (!entry) return null;
      entries.delete(key);
      return entry.value;
    },
  };
}

// Fixed window per ip, opened by the ip's first request in the window.
export function createFakeRateLimiter(clock, { limit = 10, windowMs = 60_000 } = {}) {
  const windows = new Map();
  return {
    async limit(ip) {
      const now = clock.now();
      let window = windows.get(ip);
      if (!window || now - window.start >= windowMs) {
        window = { start: now, count: 0 };
        windows.set(ip, window);
      }
      window.count += 1;
      return { success: window.count <= limit };
    },
  };
}

export function createSpyLogger() {
  const calls = [];
  const record = (level) => (...args) => {
    calls.push({ level, args });
  };
  return { calls, info: record('info'), warn: record('warn'), error: record('error') };
}
