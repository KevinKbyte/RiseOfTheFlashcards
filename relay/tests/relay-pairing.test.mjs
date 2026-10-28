import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deckBody, makeDeck } from './decks.mjs';
import { allowAll, bodyOf, CODE_PATTERN, createCode, getDeck, postDeck, setup } from './harness.mjs';

const TTL_MS = 900 * 1000;

function sequence(...codes) {
  let i = 0;
  return () => codes[Math.min(i++, codes.length - 1)];
}

function isSuccess(status) {
  return status >= 200 && status < 300;
}

// Covers: RELAY-001
// Requirement: POST /pair hands the headset a fresh 6-char Crockford base32 code that
// lives for 900 s, and never reuses a code that is already live.
describe('POST /pair creates a pairing code', () => {
  test('returns 201 with a 6-char Crockford base32 code', async () => {
    const { relay } = setup();
    const res = await relay.handle({ method: 'POST', path: '/pair', ip: '10.0.0.1', body: '' });
    assert.equal(res.status, 201);
    assert.match(bodyOf(res).code, CODE_PATTERN);
  });

  test('default generator only emits the Crockford alphabet', async () => {
    const { relay } = setup({ rateLimiter: allowAll });
    for (let i = 0; i < 200; i += 1) {
      const code = await createCode(relay);
      assert.match(code, CODE_PATTERN);
    }
  });

  test('code is live just before 900 s and gone at 900 s', async () => {
    const { relay, clock } = setup();
    const code = await createCode(relay);
    clock.advance(TTL_MS - 1);
    assert.equal((await getDeck(relay, code)).status, 202);
    clock.advance(1);
    assert.equal((await getDeck(relay, code)).status, 404);
  });

  test('retries on collision with a live code', async () => {
    const { relay } = setup({ randomCode: sequence('AAAAAA', 'AAAAAA', 'AAAAAA', 'BBBBBB') });
    assert.equal(await createCode(relay), 'AAAAAA');
    assert.equal(await createCode(relay), 'BBBBBB');
    assert.equal((await getDeck(relay, 'AAAAAA')).status, 202);
    assert.equal((await getDeck(relay, 'BBBBBB')).status, 202);
  });

  test('a collision does not overwrite the posted deck of the live code', async () => {
    const { relay } = setup({ randomCode: sequence('CCCCCC', 'CCCCCC', 'DDDDDD') });
    const code = await createCode(relay);
    assert.ok(isSuccess((await postDeck(relay, code, deckBody())).status));
    assert.equal(await createCode(relay), 'DDDDDD');
    assert.equal((await getDeck(relay, code)).status, 200);
  });
});

// Covers: RELAY-002
// Requirement: the companion page can post exactly one deck to a live pending code;
// later posts, unknown or expired codes, and malformed codes are refused, and code
// matching ignores case.
describe('POST /pair/<code> stores a deck', () => {
  test('first deck for a live code is accepted', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    assert.ok(isSuccess((await postDeck(relay, code, deckBody())).status));
  });

  test('second deck for the same code is 409 and the first deck wins', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    const first = makeDeck(undefined, { title: 'First deck' });
    const second = makeDeck(undefined, { title: 'Second deck' });
    assert.ok(isSuccess((await postDeck(relay, code, JSON.stringify(first))).status));
    assert.equal((await postDeck(relay, code, JSON.stringify(second))).status, 409);
    const res = await getDeck(relay, code);
    assert.equal(res.status, 200);
    assert.equal(bodyOf(res).title, 'First deck');
  });

  test('two concurrent posts: exactly one is accepted, the other 409', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    const results = await Promise.all([
      postDeck(relay, code, deckBody(), '10.0.0.3'),
      postDeck(relay, code, deckBody(), '10.0.0.4'),
    ]);
    const statuses = results.map((r) => r.status);
    assert.equal(statuses.filter(isSuccess).length, 1, `statuses ${statuses}`);
    assert.equal(statuses.filter((s) => s === 409).length, 1, `statuses ${statuses}`);
  });

  test('unknown code is 404', async () => {
    const { relay } = setup();
    assert.equal((await postDeck(relay, 'ZZZZZZ', deckBody())).status, 404);
  });

  test('expired code is 404', async () => {
    const { relay, clock } = setup();
    const code = await createCode(relay);
    clock.advance(TTL_MS);
    assert.equal((await postDeck(relay, code, deckBody())).status, 404);
  });

  test('code already taken by the headset is 404', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    assert.ok(isSuccess((await postDeck(relay, code, deckBody())).status));
    assert.equal((await getDeck(relay, code)).status, 200);
    assert.equal((await postDeck(relay, code, deckBody())).status, 404);
  });

  test('lowercase code matches the issued uppercase code', async () => {
    const { relay } = setup({ randomCode: sequence('AB12CD') });
    const code = await createCode(relay);
    assert.ok(isSuccess((await postDeck(relay, code.toLowerCase(), deckBody())).status));
    assert.equal((await getDeck(relay, code)).status, 200);
  });

  for (const bad of ['ABC12', 'ABC1234', 'ABCDEI', 'ABCDEU', 'ABC-12', 'ABC%2012']) {
    test(`bad code format ${JSON.stringify(bad)} is 400`, async () => {
      const { relay } = setup();
      assert.equal((await postDeck(relay, bad, deckBody())).status, 400);
    });
  }

  test('invalid deck is 400 and does not consume the code', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    assert.equal((await postDeck(relay, code, '{"version":1')).status, 400);
    assert.ok(isSuccess((await postDeck(relay, code, deckBody())).status));
  });

  test('oversized deck is 413', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    const body = deckBody() + ' '.repeat(200 * 1024);
    assert.equal((await postDeck(relay, code, body)).status, 413);
  });
});

// Covers: RELAY-003
// Requirement: the polling headset sees "waiting" until a deck arrives, then receives
// the deck exactly once (atomic get-and-delete), even under concurrent polls.
describe('GET /pair/<code> delivers the deck once', () => {
  test('pending code is 202 waiting', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    const res = await getDeck(relay, code);
    assert.equal(res.status, 202);
    assert.deepEqual(bodyOf(res), { status: 'waiting' });
  });

  test('repeated polls while pending stay 202', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await getDeck(relay, code)).status, 202);
    }
  });

  test('posted deck is returned with 200, then 404 on the next GET', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    const deck = makeDeck(undefined, { title: 'Capitals' });
    assert.ok(isSuccess((await postDeck(relay, code, JSON.stringify(deck))).status));
    const res = await getDeck(relay, code);
    assert.equal(res.status, 200);
    const got = bodyOf(res);
    assert.equal(got.title, 'Capitals');
    assert.deepEqual(got.cards, deck.cards);
    assert.equal((await getDeck(relay, code)).status, 404);
  });

  test('two concurrent GETs: exactly one gets the deck', async () => {
    const { relay } = setup();
    const code = await createCode(relay);
    assert.ok(isSuccess((await postDeck(relay, code, deckBody())).status));
    const results = await Promise.all([getDeck(relay, code), getDeck(relay, code)]);
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 404]);
  });

  test('lowercase code is accepted', async () => {
    const { relay } = setup({ randomCode: sequence('XY34ZW') });
    const code = await createCode(relay);
    assert.equal((await getDeck(relay, code.toLowerCase())).status, 202);
  });

  test('unknown code is 404', async () => {
    const { relay } = setup();
    assert.equal((await getDeck(relay, 'ZZZZZZ')).status, 404);
  });

  test('expired pending code is 404', async () => {
    const { relay, clock } = setup();
    const code = await createCode(relay);
    clock.advance(TTL_MS);
    assert.equal((await getDeck(relay, code)).status, 404);
  });

  test('expired code with a posted deck is 404', async () => {
    const { relay, clock } = setup();
    const code = await createCode(relay);
    assert.ok(isSuccess((await postDeck(relay, code, deckBody())).status));
    clock.advance(TTL_MS);
    assert.equal((await getDeck(relay, code)).status, 404);
  });
});
