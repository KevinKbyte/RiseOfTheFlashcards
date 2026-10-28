// Wires createRelay to the test fakes; tests drive it only through handle().
import { createRelay } from '../lib/relay.mjs';
import { createFakeClock, createFakeRateLimiter, createFakeStore, createSpyLogger } from './fakes.mjs';

export const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;
export const ENABLED_ENV = Object.freeze({ RELAY_ENABLED: 'true' });

export function setup({ env = ENABLED_ENV, randomCode, rateLimiter } = {}) {
  const clock = createFakeClock();
  const store = createFakeStore(clock);
  const logger = createSpyLogger();
  const options = {
    store,
    rateLimiter: rateLimiter ?? createFakeRateLimiter(clock),
    env,
    logger,
  };
  if (randomCode) options.randomCode = randomCode;
  return { clock, store, logger, relay: createRelay(options) };
}

export const allowAll = { limit: async () => ({ success: true }) };
export const denyAll = { limit: async () => ({ success: false }) };

// The relay may return either a JSON string or a plain object as body.
export function bodyOf(res) {
  return typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
}

export async function createCode(relay, ip = '10.0.0.1') {
  const res = await relay.handle({ method: 'POST', path: '/pair', ip, body: '' });
  if (res.status !== 201) throw new Error(`POST /pair returned ${res.status}`);
  return bodyOf(res).code;
}

export function postDeck(relay, code, body, ip = '10.0.0.2') {
  return relay.handle({ method: 'POST', path: `/pair/${code}`, ip, body });
}

export function getDeck(relay, code, ip = '10.0.0.1') {
  return relay.handle({ method: 'GET', path: `/pair/${code}`, ip, body: '' });
}
