import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { deckBody, makeCards } from './decks.mjs';
import { allowAll, createCode, denyAll, getDeck, postDeck, setup } from './harness.mjs';

const WINDOW_MS = 60 * 1000;

function postPair(relay, ip) {
  return relay.handle({ method: 'POST', path: '/pair', ip, body: '' });
}

// A limiter that throws while `failing` is set, standing in for an Upstash outage.
function outageLimiter() {
  const limiter = {
    failing: false,
    async limit() {
      if (limiter.failing) throw new Error('ratelimit backend unreachable');
      return { success: true };
    },
  };
  return limiter;
}

// Covers: RELAY-009
// Requirement: GET /pair/<code> is rate-limited in its own bucket of 120 requests per
// 60 s per client key (the 121st is 429), separate from the POST budget, so headset
// polling at up to 1 request per second is never throttled.
describe('GET polling rate limit', () => {
  test('121st GET within 60 s is 429', async () => {
    const { relay } = setup({ rateLimiter: allowAll });
    const code = await createCode(relay);
    for (let i = 0; i < 120; i += 1) {
      assert.equal((await getDeck(relay, code, '1.1.1.1')).status, 202, `GET ${i + 1}`);
    }
    assert.equal((await getDeck(relay, code, '1.1.1.1')).status, 429);
  });

  test('another client key keeps its own GET budget', async () => {
    const { relay } = setup({ rateLimiter: allowAll });
    const code = await createCode(relay);
    for (let i = 0; i < 121; i += 1) await getDeck(relay, code, '1.1.1.1');
    assert.equal((await getDeck(relay, code, '2.2.2.2')).status, 202);
  });

  test('GET window resets after 60 s', async () => {
    const { relay, clock } = setup({ rateLimiter: allowAll });
    const code = await createCode(relay);
    for (let i = 0; i < 121; i += 1) await getDeck(relay, code, '1.1.1.1');
    clock.advance(WINDOW_MS);
    assert.equal((await getDeck(relay, code, '1.1.1.1')).status, 202);
  });

  test('polling once per second for 5 minutes is never limited', async () => {
    const { relay, clock } = setup({ rateLimiter: allowAll });
    const code = await createCode(relay);
    for (let i = 0; i < 300; i += 1) {
      assert.equal((await getDeck(relay, code, '1.1.1.1')).status, 202, `poll ${i + 1}`);
      clock.advance(1000);
    }
  });

  test('a spent GET budget does not block POSTs', async () => {
    const { relay } = setup();
    const code = await createCode(relay, '9.9.9.9');
    for (let i = 0; i < 121; i += 1) await getDeck(relay, code, '1.1.1.1');
    assert.equal((await postPair(relay, '1.1.1.1')).status, 201);
  });

  test('a denying GET limiter yields 429 on GET while POSTs still succeed', async () => {
    const { relay } = setup({ rateLimiter: allowAll, pollRateLimiter: denyAll });
    const code = await createCode(relay);
    assert.equal((await getDeck(relay, code)).status, 429);
    assert.equal((await getDeck(relay, 'ZZZZZZ')).status, 429);
    assert.equal((await postDeck(relay, code, deckBody())).status, 201);
  });
});

// Covers: RELAY-011
// Requirement: if a rate limiter fails, the relay fails closed with 503 instead of
// serving the request or crashing, and no body content reaches the logs.
describe('rate limiter failure fails closed', () => {
  test('POST /pair is 503 when the POST limiter throws', async () => {
    const limiter = outageLimiter();
    limiter.failing = true;
    const { relay } = setup({ rateLimiter: limiter });
    assert.equal((await postPair(relay, '1.1.1.1')).status, 503);
  });

  test('POST /pair/<code> is 503 and stores nothing when the POST limiter throws', async () => {
    const limiter = outageLimiter();
    const { relay } = setup({ rateLimiter: limiter });
    const code = await createCode(relay);
    limiter.failing = true;
    assert.equal((await postDeck(relay, code, deckBody())).status, 503);
    assert.equal((await getDeck(relay, code)).status, 202, 'deck must not be stored');
  });

  test('GET /pair/<code> is 503 when the GET limiter throws', async () => {
    const pollLimiter = outageLimiter();
    pollLimiter.failing = true;
    const { relay } = setup({ pollRateLimiter: pollLimiter });
    const code = await createCode(relay);
    assert.equal((await getDeck(relay, code)).status, 503);
  });

  test('limiter failures log no body or deck text', async () => {
    const limiter = outageLimiter();
    const pollLimiter = outageLimiter();
    const { relay, logger } = setup({ rateLimiter: limiter, pollRateLimiter: pollLimiter });
    const code = await createCode(relay);
    const cards = makeCards(4);
    cards[0] = { front: 'SENTINELFRONTzk4', back: 'SENTINELBACKzk4' };
    limiter.failing = true;
    pollLimiter.failing = true;
    await postDeck(relay, code, deckBody(cards, { title: 'SENTINELTITLEzk4' }));
    await postDeck(relay, code, '{"title":"SENTINELRAWzk4"');
    await getDeck(relay, code);
    const dump = inspect(logger.calls, { depth: null, maxArrayLength: null, maxStringLength: null });
    for (const secret of ['SENTINELFRONTzk4', 'SENTINELBACKzk4', 'SENTINELTITLEzk4', 'SENTINELRAWzk4']) {
      assert.ok(!dump.includes(secret), `logger received ${secret}`);
    }
  });
});

// Covers: RELAY-012
// Requirement: a trailing slash on the code route (/pair/<code>/) behaves exactly like
// /pair/<code> for both posting and polling.
describe('trailing slash on /pair/<code>', () => {
  test('GET /pair/<code>/ polls the code', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    const res = await relay.handle({ method: 'GET', path: `/pair/${code}/`, ip: '10.0.0.1', body: '' });
    assert.equal(res.status, 202);
  });

  test('POST /pair/<code>/ stores the deck', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    const res = await relay.handle({ method: 'POST', path: `/pair/${code}/`, ip: '10.0.0.2', body: deckBody() });
    assert.equal(res.status, 201);
    assert.equal((await getDeck(relay, code)).status, 200);
  });
});
