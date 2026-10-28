// Pairing relay core (RELAY-001..007). Pure: storage, rate limiting, env and logging
// are injected so the Vercel adapters and the tests share one implementation.
//
// store:       { setIfAbsent(key, value, ttlSec), get(key), setIfEquals(key, expected, value), getDel(key) }
// rateLimiter: { limit(ip) -> { success } } -- POST bucket; pollRateLimiter has the same shape for GETs.
// logger:      { info, warn, error } -- receives method, route and status only, never bodies.
import { validateDeck } from './validate.mjs';

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 6;
export const CODE_TTL_SEC = 900;
const MAX_CODE_ATTEMPTS = 8;
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;
// Value of a live code that has no deck yet; decks are JSON objects, so never equal it.
const PENDING = 'pending';
const PAIR_ROUTE = /^\/pair\/?$/;
const CODE_ROUTE = /^\/pair\/([^/]*)$/;

// 32 divides 256, so masking a random byte to 5 bits is uniform over the alphabet.
export function randomCrockfordCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b & 31]).join('');
}

const keyFor = (code) => `pair:${code}`;

function json(status, payload) {
  return {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  };
}

const error = (status, message) => json(status, { error: message });

export function createRelay({ store, rateLimiter, pollRateLimiter, env, logger, randomCode = randomCrockfordCode }) {
  async function createCode() {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = randomCode();
      if (await store.setIfAbsent(keyFor(code), PENDING, CODE_TTL_SEC)) {
        return json(201, { code });
      }
    }
    return error(503, 'could not allocate a code, try again');
  }

  async function postDeck(code, body) {
    const result = validateDeck(body);
    if (!result.ok) return error(result.status, result.error);
    // Conditional set: only a still-pending code accepts a deck, so the first deck wins.
    if (await store.setIfEquals(keyFor(code), PENDING, JSON.stringify(result.deck))) {
      return json(201, { status: 'stored' });
    }
    return (await store.get(keyFor(code))) === null
      ? error(404, 'unknown or expired code')
      : error(409, 'a deck was already posted for this code');
  }

  async function getDeck(code) {
    const value = await store.get(keyFor(code));
    if (value === PENDING) return json(202, { status: 'waiting' });
    if (value === null) return error(404, 'unknown or expired code');
    // Atomic get-and-delete: of two concurrent pollers, only one receives the deck.
    const deck = await store.getDel(keyFor(code));
    return deck === null ? error(404, 'unknown or expired code') : json(200, deck);
  }

  async function route({ method, path, ip, body }) {
    if (env.RELAY_ENABLED !== 'true') return error(503, 'relay disabled');

    const isPair = PAIR_ROUTE.test(path);
    const codeMatch = isPair ? null : CODE_ROUTE.exec(path);
    if (!isPair && !codeMatch) return error(404, 'not found');

    if (method !== 'POST' && (method !== 'GET' || isPair)) return error(405, 'method not allowed');

    // POSTs and GET polls draw on separate buckets, so polling never spends the POST budget.
    const limiter = method === 'POST' ? rateLimiter : pollRateLimiter;
    const { success } = await limiter.limit(String(ip ?? 'unknown'));
    if (!success) return error(429, 'too many requests');
    if (isPair) return createCode();

    const code = codeMatch[1].toUpperCase();
    if (!CODE_PATTERN.test(code)) return error(400, 'bad code format');
    return method === 'POST' ? postDeck(code, body) : getDeck(code);
  }

  return {
    async handle(request) {
      const response = await route(request);
      const routeName = PAIR_ROUTE.test(request.path) ? '/pair' : CODE_ROUTE.test(request.path) ? '/pair/:code' : 'other';
      logger.info('relay request', { method: request.method, route: routeName, status: response.status });
      return response;
    },
  };
}
