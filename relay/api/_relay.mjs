// Vercel wiring for the relay core: real Upstash store + rate limiter. The leading
// underscore keeps Vercel from exposing this file as a route. Tests never import it;
// they drive relay/lib/relay.mjs with fakes instead.
//
// Credentials come from UPSTASH_REDIS_REST_URL/_TOKEN (or the Vercel Marketplace
// KV_REST_API_URL/_TOKEN fallbacks) via Redis.fromEnv(), server-side only (RELAY-008).
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { clientKey, POLL_RATE_LIMIT, readBody } from '../lib/http.mjs';
import { createRelay } from '../lib/relay.mjs';

// Swap the value only while it still equals the expected one; KEEPTTL preserves the
// code's original 900 s expiry so posting a deck never extends its life.
const SET_IF_EQUALS_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
  return 1
end
return 0`;

function createUpstashStore(redis) {
  return {
    async setIfAbsent(key, value, ttlSec) {
      return (await redis.set(key, value, { nx: true, ex: ttlSec })) === 'OK';
    },
    get: (key) => redis.get(key),
    async setIfEquals(key, expected, value) {
      return (await redis.eval(SET_IF_EQUALS_LUA, [key], [expected, value])) === 1;
    },
    getDel: (key) => redis.getdel(key),
  };
}

const relay = createRelay({
  // Stored values are raw strings ('pending' or deck JSON); skip auto JSON parsing.
  store: createUpstashStore(Redis.fromEnv({ automaticDeserialization: false })),
  rateLimiter: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.fixedWindow(10, '60 s'),
    prefix: 'relay:ratelimit',
  }),
  pollRateLimiter: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.fixedWindow(POLL_RATE_LIMIT.limit, `${POLL_RATE_LIMIT.windowSec} s`),
    prefix: 'relay:ratelimit:poll',
  }),
  env: process.env,
  logger: console,
});

export async function handleRequest(request, path) {
  let body = '';
  if (request.method === 'POST') {
    const read = await readBody(request);
    if (!read.ok) {
      return new Response(JSON.stringify({ error: read.error }), {
        status: read.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    body = read.body;
  }
  const result = await relay.handle({ method: request.method, path, ip: clientKey(request.headers), body });
  return new Response(result.body, { status: result.status, headers: result.headers });
}
