import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { deckBody, makeCards } from './decks.mjs';
import { bodyOf, createCode, denyAll, getDeck, postDeck, setup } from './harness.mjs';

const WINDOW_MS = 60 * 1000;

function postPair(relay, ip) {
  return relay.handle({ method: 'POST', path: '/pair', ip, body: '' });
}

// Covers: RELAY-005
// Requirement: each IP may make at most 10 POSTs per 60 s across /pair and
// /pair/<code> (the 11th is 429); GET polling is never rate-limited.
describe('POST rate limit', () => {
  test('11th POST /pair within 60 s is 429', async () => {
    const { relay } = setup();
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await postPair(relay, '1.1.1.1')).status, 201, `request ${i + 1}`);
    }
    assert.equal((await postPair(relay, '1.1.1.1')).status, 429);
  });

  test('limit is shared across both POST routes (11th on /pair/<code>)', async () => {
    const { relay } = setup();
    const code = await createCode(relay, '9.9.9.9');
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await postPair(relay, '1.1.1.1')).status, 201);
    }
    for (let i = 0; i < 5; i += 1) {
      assert.notEqual((await postDeck(relay, code, deckBody(), '1.1.1.1')).status, 429);
    }
    assert.equal((await postDeck(relay, code, deckBody(), '1.1.1.1')).status, 429);
  });

  test('limit is shared across both POST routes (11th on /pair)', async () => {
    const { relay } = setup();
    const code = await createCode(relay, '9.9.9.9');
    for (let i = 0; i < 10; i += 1) {
      assert.notEqual((await postDeck(relay, code, deckBody(), '1.1.1.1')).status, 429);
    }
    assert.equal((await postPair(relay, '1.1.1.1')).status, 429);
  });

  test('another IP is unaffected', async () => {
    const { relay } = setup();
    for (let i = 0; i < 11; i += 1) await postPair(relay, '1.1.1.1');
    assert.equal((await postPair(relay, '2.2.2.2')).status, 201);
  });

  test('window resets after 60 s', async () => {
    const { relay, clock } = setup();
    for (let i = 0; i < 11; i += 1) await postPair(relay, '1.1.1.1');
    clock.advance(WINDOW_MS);
    assert.equal((await postPair(relay, '1.1.1.1')).status, 201);
  });

  test('GETs are never limited, even after the POST budget is spent', async () => {
    const { relay } = setup();
    const code = await createCode(relay, '1.1.1.1');
    for (let i = 0; i < 10; i += 1) await postPair(relay, '1.1.1.1');
    for (let i = 0; i < 50; i += 1) {
      assert.equal((await getDeck(relay, code, '1.1.1.1')).status, 202, `GET ${i + 1}`);
    }
  });

  test('GETs never consult the rate limiter', async () => {
    const { relay } = setup({ rateLimiter: denyAll });
    assert.equal((await postPair(relay, '1.1.1.1')).status, 429);
    assert.equal((await getDeck(relay, 'ZZZZZZ', '1.1.1.1')).status, 404);
  });
});

// Covers: RELAY-006
// Requirement: the RELAY_ENABLED kill switch turns every route into 503 unless it is
// exactly "true", so the relay can be shut off during the freeze without code changes.
describe('RELAY_ENABLED kill switch', () => {
  const disabledEnvs = [
    ['unset', {}],
    ['"false"', { RELAY_ENABLED: 'false' }],
    ['""', { RELAY_ENABLED: '' }],
    ['"TRUE"', { RELAY_ENABLED: 'TRUE' }],
    ['"1"', { RELAY_ENABLED: '1' }],
  ];
  for (const [label, env] of disabledEnvs) {
    test(`RELAY_ENABLED ${label} -> 503 on every route`, async () => {
      const { relay } = setup({ env });
      assert.equal((await postPair(relay, '1.1.1.1')).status, 503);
      assert.equal((await postDeck(relay, 'ABCDEF', deckBody())).status, 503);
      assert.equal((await getDeck(relay, 'ABCDEF')).status, 503);
      assert.equal((await postDeck(relay, 'bad', deckBody())).status, 503);
    });
  }

  test('RELAY_ENABLED "true" serves requests', async () => {
    const { relay } = setup({ env: { RELAY_ENABLED: 'true' } });
    assert.equal((await postPair(relay, '1.1.1.1')).status, 201);
  });
});

// Covers: RELAY-007
// Requirement: request bodies and deck text never reach the logs, on success or
// on any rejection path.
describe('logging never includes bodies or deck text', () => {
  test('logger calls hold no body or card text across all paths', async () => {
    const { relay, logger } = setup();
    const secrets = ['SENTINELFRONTqx7', 'SENTINELBACKqx7', 'SENTINELTITLEqx7', 'SENTINELALIASqx7', 'SENTINELRAWqx7'];
    const cards = makeCards(4);
    cards[0] = { front: 'SENTINELFRONTqx7', back: 'SENTINELBACKqx7', aliases: ['SENTINELALIASqx7'] };
    const goodBody = deckBody(cards, { title: 'SENTINELTITLEqx7' });

    const code = await createCode(relay);
    await postDeck(relay, code, '{"title":"SENTINELRAWqx7"'); // malformed JSON
    await postDeck(relay, code, deckBody([{ front: '<b>SENTINELFRONTqx7</b>', back: 'x' }])); // invalid
    await postDeck(relay, code, `${goodBody}${' '.repeat(200 * 1024)}`); // oversized
    await postDeck(relay, 'ZZZZZZ', goodBody); // unknown code
    await postDeck(relay, 'bad!', goodBody); // bad format
    await postDeck(relay, code, goodBody); // accepted
    await postDeck(relay, code, goodBody); // 409
    const res = await getDeck(relay, code); // 200 with the deck
    assert.equal(bodyOf(res).title, 'SENTINELTITLEqx7');

    const dump = inspect(logger.calls, { depth: null, maxArrayLength: null, maxStringLength: null });
    for (const secret of secrets) {
      assert.ok(!dump.includes(secret), `logger received ${secret}`);
    }
  });
});
