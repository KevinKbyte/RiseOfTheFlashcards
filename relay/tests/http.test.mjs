import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clientKey, codeFromPath, POLL_RATE_LIMIT, readBody } from '../lib/http.mjs';

// A request stand-in that records whether its body was read.
function fakeRequest(headers, body = 'payload') {
  const request = {
    method: 'POST',
    headers: new Headers(headers),
    bodyRead: false,
    async text() {
      request.bodyRead = true;
      return body;
    },
  };
  return request;
}

// Covers: RELAY-009
// Requirement: the Vercel adapter wires the GET polling bucket at 120 requests per 60 s.
describe('POLL_RATE_LIMIT', () => {
  test('is 120 requests per 60 s', () => {
    assert.deepEqual(POLL_RATE_LIMIT, { limit: 120, windowSec: 60 });
  });
});

// Covers: RELAY-011
// Requirement: the rate-limit client key is the first entry of x-vercel-forwarded-for,
// else x-real-ip, else the first x-forwarded-for entry, else "unknown", so a client
// cannot pick its own key by sending a forged x-forwarded-for.
describe('clientKey', () => {
  test('prefers the first x-vercel-forwarded-for entry over a forged x-forwarded-for', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1',
      'x-real-ip': '198.51.100.2',
      'x-forwarded-for': '1.2.3.4, 203.0.113.7',
    });
    assert.equal(clientKey(headers), '203.0.113.7');
  });

  test('falls back to x-real-ip before x-forwarded-for', () => {
    const headers = new Headers({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    assert.equal(clientKey(headers), '198.51.100.2');
  });

  test('falls back to the first x-forwarded-for entry, trimmed', () => {
    assert.equal(clientKey(new Headers({ 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' })), '1.2.3.4');
  });

  test('treats an empty x-vercel-forwarded-for as absent', () => {
    const headers = new Headers({ 'x-vercel-forwarded-for': ' ', 'x-real-ip': '198.51.100.2' });
    assert.equal(clientKey(headers), '198.51.100.2');
  });

  test('is "unknown" with no client headers', () => {
    assert.equal(clientKey(new Headers()), 'unknown');
  });
});

// Covers: RELAY-011
// Requirement: a declared Content-Length over 204800 bytes is refused with 413 before
// the body is read; at or under the limit (or undeclared) the body is read normally.
describe('readBody', () => {
  test('declared length 204801 -> 413 without reading the body', async () => {
    const request = fakeRequest({ 'content-length': '204801' });
    const result = await readBody(request);
    assert.equal(result.ok, false);
    assert.equal(result.status, 413);
    assert.equal(request.bodyRead, false, 'body must not be read');
  });

  test('declared length 204800 -> body is read', async () => {
    const request = fakeRequest({ 'content-length': '204800' });
    assert.deepEqual(await readBody(request), { ok: true, body: 'payload' });
    assert.equal(request.bodyRead, true);
  });

  test('no declared length -> body is read', async () => {
    const request = fakeRequest({});
    assert.deepEqual(await readBody(request), { ok: true, body: 'payload' });
  });
});

// Covers: RELAY-012
// Requirement: the adapter extracts the code from either the public (/pair/<code>) or
// the function (/api/pair/<code>) path, ignoring one trailing slash.
describe('codeFromPath', () => {
  const cases = [
    ['/api/pair/ABC123', 'ABC123'],
    ['/api/pair/ABC123/', 'ABC123'],
    ['/pair/ABC123', 'ABC123'],
    ['/pair/ABC123/', 'ABC123'],
  ];
  for (const [path, code] of cases) {
    test(`${path} -> ${code}`, () => {
      assert.equal(codeFromPath(path), code);
    });
  }
});
