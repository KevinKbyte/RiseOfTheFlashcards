import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERCEL_JSON = fileURLToPath(new URL('../vercel.json', import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const ALL_ROUTES = ['/(.*)', '/:path*'];

function loadConfig() {
  assert.ok(existsSync(VERCEL_JSON), `missing ${VERCEL_JSON}`);
  return JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));
}

// Headers applied to every route, keyed by lower-case header name.
function allRouteHeaders(config) {
  const entry = (config.headers ?? []).find((h) => ALL_ROUTES.includes(h.source));
  assert.ok(entry, `vercel.json needs a headers entry with source ${ALL_ROUTES.join(' or ')}`);
  return Object.fromEntries(entry.headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

function cspDirectives(policy) {
  const directives = {};
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives[name.toLowerCase()] = sources;
  }
  return directives;
}

// Covers: RELAY-012
// Requirement: relay/vercel.json maps the public /pair and /pair/:code routes onto the
// /api functions, and sends a strict CSP (default-src 'self', no inline script),
// X-Content-Type-Options: nosniff and Referrer-Policy: no-referrer on every route.
describe('vercel.json', () => {
  test('rewrites /pair -> /api/pair and /pair/:code -> /api/pair/:code', () => {
    const rewrites = loadConfig().rewrites ?? [];
    const has = (source, destination) => rewrites.some((r) => r.source === source && r.destination === destination);
    assert.ok(has('/pair', '/api/pair'), 'missing /pair rewrite');
    assert.ok(has('/pair/:code', '/api/pair/:code'), 'missing /pair/:code rewrite');
  });

  test('CSP has default-src \'self\' and no \'unsafe-inline\' for scripts', () => {
    const policy = allRouteHeaders(loadConfig())['content-security-policy'];
    assert.equal(typeof policy, 'string', 'missing Content-Security-Policy');
    const directives = cspDirectives(policy);
    assert.ok(directives['default-src']?.includes("'self'"), `default-src lacks 'self': ${policy}`);
    const scriptSources = directives['script-src'] ?? directives['default-src'];
    assert.ok(!scriptSources.includes("'unsafe-inline'"), `script-src allows inline: ${policy}`);
  });

  test('sets X-Content-Type-Options: nosniff', () => {
    assert.equal(allRouteHeaders(loadConfig())['x-content-type-options'], 'nosniff');
  });

  test('sets Referrer-Policy: no-referrer', () => {
    assert.equal(allRouteHeaders(loadConfig())['referrer-policy'], 'no-referrer');
  });
});

// Covers: RELAY-012
// Requirement: the companion page runs under the no-inline-script CSP, so every script
// is an external same-origin file and no inline event handler attributes exist.
describe('companion page has no inline script', () => {
  const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];

  test('has at least one script', () => {
    assert.ok(scripts.length > 0, 'page needs its script to send decks');
  });

  test('every script uses src= with an empty body', () => {
    for (const [tag, attrs, body] of scripts) {
      assert.match(attrs, /\bsrc\s*=/i, `inline script: ${tag.slice(0, 60)}`);
      assert.equal(body.trim(), '', 'script with src= must have an empty body');
    }
  });

  test('every script src is a same-origin file that exists under public/', () => {
    for (const [, attrs] of scripts) {
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
      assert.ok(src, `script without a quoted src: ${attrs}`);
      assert.ok(!/^([a-z]+:)?\/\//i.test(src), `script src is not same-origin: ${src}`);
      const file = join(PUBLIC_DIR, src.replace(/^\.?\//, ''));
      assert.ok(existsSync(file), `script src ${src} has no file at ${file}`);
    }
  });

  test('no inline event handler attributes', () => {
    assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=/i);
  });
});
