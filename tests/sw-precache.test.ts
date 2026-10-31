// Requirement: premise g (offline reload) needs a service worker at dist/sw.js that precaches the
// whole built app -- index.html, JS/CSS assets and the .wasm runtimes (Whisper/onnx) -- but never
// source maps or itself. URLs resolve against the SW registration scope so the build works from a
// GitHub Pages subpath or a LAN host (base './'). Install caches everything and activates at once;
// activate drops stale caches and claims clients; fetch serves same-origin GETs cache-first and
// falls back to the cached index.html for navigations when the network is down.
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPrecacheList,
  cacheNameFor,
  renderServiceWorker,
  swPrecache,
} from '../vite-plugins/sw-precache.js';

// Covers: SPIKE-g
describe('buildPrecacheList', () => {
  it('returns only the scope root for empty input', () => {
    expect(buildPrecacheList([])).toEqual(['./']);
  });

  it('puts ./ first, then ./-prefixed paths sorted', () => {
    expect(buildPrecacheList(['b.js', 'index.html', 'a.js', 'assets/c.js'])).toEqual([
      './',
      './a.js',
      './assets/c.js',
      './b.js',
      './index.html',
    ]);
  });

  it('excludes source maps and sw.js itself', () => {
    expect(
      buildPrecacheList(['index.html', 'sw.js', 'assets/a.js', 'assets/a.js.map', 'x.css.map']),
    ).toEqual(['./', './assets/a.js', './index.html']);
  });

  it('includes .wasm files so the speech runtime works offline', () => {
    expect(buildPrecacheList(['ort.wasm', 'assets/ort-wasm-simd.wasm'])).toEqual([
      './',
      './assets/ort-wasm-simd.wasm',
      './ort.wasm',
    ]);
  });

  it('dedupes repeated paths', () => {
    expect(buildPrecacheList(['a.js', 'a.js', 'index.html', 'index.html'])).toEqual([
      './',
      './a.js',
      './index.html',
    ]);
  });

  it('keeps nested directory paths intact', () => {
    expect(buildPrecacheList(['assets/deep/er/x.js'])).toEqual(['./', './assets/deep/er/x.js']);
  });

  it('normalizes Windows backslash paths to forward slashes (required)', () => {
    expect(buildPrecacheList(['assets\\a.js', 'assets\\deep\\b.wasm', 'assets\\a.js.map'])).toEqual(
      ['./', './assets/a.js', './assets/deep/b.wasm'],
    );
  });

  it('dedupes a backslash path against its forward-slash twin', () => {
    expect(buildPrecacheList(['assets\\a.js', 'assets/a.js'])).toEqual(['./', './assets/a.js']);
  });
});

// Covers: SPIKE-g
describe('cacheNameFor', () => {
  const list = ['./', './a.js', './index.html'];

  it('starts with probe-precache-', () => {
    expect(cacheNameFor(list)).toMatch(/^probe-precache-.+/);
  });

  it('is deterministic for the same list', () => {
    expect(cacheNameFor([...list])).toBe(cacheNameFor(list));
  });

  it('changes when the list changes', () => {
    expect(cacheNameFor([...list, './b.js'])).not.toBe(cacheNameFor(list));
    expect(cacheNameFor(['./', './a2.js', './index.html'])).not.toBe(cacheNameFor(list));
  });
});

type Listener = (event: any) => void;

interface FakeReq {
  url: string;
  method: string;
  mode: string;
  destination: string;
  headers: Headers;
}

function req(url: string, opts: { method?: string; navigate?: boolean } = {}): FakeReq {
  const navigate = opts.navigate ?? false;
  return {
    url,
    method: opts.method ?? 'GET',
    mode: navigate ? 'navigate' : 'cors',
    destination: navigate ? 'document' : 'script',
    headers: new Headers(navigate ? { accept: 'text/html' } : {}),
  };
}

const keyOf = (r: string | { url: string }): string => (typeof r === 'string' ? r : r.url);

class FakeCache {
  readonly entries = new Map<string, Response>();
  async addAll(urls: Array<string | { url: string }>): Promise<void> {
    for (const u of urls) this.entries.set(keyOf(u), new Response(`cached:${keyOf(u)}`));
  }
  async add(u: string | { url: string }): Promise<void> {
    await this.addAll([u]);
  }
  async put(r: string | { url: string }, res: Response): Promise<void> {
    this.entries.set(keyOf(r), res);
  }
  async match(r: string | { url: string }): Promise<Response | undefined> {
    return this.entries.get(keyOf(r))?.clone();
  }
}

class FakeCaches {
  readonly store = new Map<string, FakeCache>();
  async open(name: string): Promise<FakeCache> {
    let c = this.store.get(name);
    if (!c) {
      c = new FakeCache();
      this.store.set(name, c);
    }
    return c;
  }
  async keys(): Promise<string[]> {
    return [...this.store.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.store.delete(name);
  }
  async has(name: string): Promise<boolean> {
    return this.store.has(name);
  }
  async match(r: string | { url: string }): Promise<Response | undefined> {
    for (const c of this.store.values()) {
      const hit = await c.match(r);
      if (hit) return hit;
    }
    return undefined;
  }
}

function loadSw(list: string[], scope = 'https://h/sub/') {
  const listeners = new Map<string, Listener[]>();
  const origin = new URL(scope).origin;
  const self = {
    registration: { scope },
    location: { origin, href: new URL('sw.js', scope).href },
    addEventListener: (type: string, fn: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  };
  const caches = new FakeCaches();
  const net = { online: true };
  const fetchFake = vi.fn(async (r: string | { url: string }) => {
    if (!net.online) throw new TypeError('Failed to fetch');
    return new Response(`net:${keyOf(r)}`);
  });
  new Function('self', 'caches', 'fetch', renderServiceWorker(list))(self, caches, fetchFake);

  async function lifecycle(type: 'install' | 'activate'): Promise<void> {
    const pending: Promise<unknown>[] = [];
    const event = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
    for (const fn of listeners.get(type) ?? []) fn(event);
    await Promise.all(pending);
  }

  function dispatchFetch(request: FakeReq) {
    let responded: Promise<Response> | Response | undefined;
    const respondWith = vi.fn((r: Promise<Response> | Response) => {
      responded = r;
    });
    const event = { request, respondWith, waitUntil: () => undefined, clientId: '' };
    for (const fn of listeners.get('fetch') ?? []) fn(event);
    return { respondWith, response: async () => (responded === undefined ? undefined : await responded) };
  }

  return { self, caches, net, fetchFake, listeners, lifecycle, dispatchFetch };
}

// Covers: SPIKE-g
describe('renderServiceWorker (evaluated in a sandbox)', () => {
  const list = ['./', './assets/x.js', './index.html', './ort.wasm'];

  it('embeds the precache list and its cache name', () => {
    const src = renderServiceWorker(list);
    expect(src).toContain('./assets/x.js');
    expect(src).toContain('./ort.wasm');
    expect(src).toContain(cacheNameFor(list));
  });

  it('registers install, activate and fetch listeners', () => {
    const sw = loadSw(list);
    expect(sw.listeners.get('install')?.length ?? 0).toBeGreaterThan(0);
    expect(sw.listeners.get('activate')?.length ?? 0).toBeGreaterThan(0);
    expect(sw.listeners.get('fetch')?.length ?? 0).toBeGreaterThan(0);
  });

  it('install caches every URL resolved against the registration scope, then skipWaiting', async () => {
    const sw = loadSw(list, 'https://h/sub/');
    await sw.lifecycle('install');
    const cache = sw.caches.store.get(cacheNameFor(list));
    expect(cache).toBeDefined();
    expect([...cache!.entries.keys()].sort()).toEqual(
      [
        'https://h/sub/',
        'https://h/sub/assets/x.js',
        'https://h/sub/index.html',
        'https://h/sub/ort.wasm',
      ].sort(),
    );
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it('install resolves against a root scope too', async () => {
    const sw = loadSw(list, 'http://192.168.1.5:8081/');
    await sw.lifecycle('install');
    const cache = sw.caches.store.get(cacheNameFor(list));
    expect(cache?.entries.has('http://192.168.1.5:8081/assets/x.js')).toBe(true);
  });

  it('activate deletes a stale cache, keeps the current one, and claims clients', async () => {
    const sw = loadSw(list);
    await sw.caches.open('probe-precache-stale0000');
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect(await sw.caches.keys()).toEqual([cacheNameFor(list)]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it('does not intercept cross-origin requests', () => {
    const sw = loadSw(list);
    const { respondWith } = sw.dispatchFetch(req('https://cdn.example.com/model.onnx'));
    expect(respondWith).not.toHaveBeenCalled();
  });

  it('does not intercept POST requests', () => {
    const sw = loadSw(list);
    const { respondWith } = sw.dispatchFetch(req('https://h/sub/api', { method: 'POST' }));
    expect(respondWith).not.toHaveBeenCalled();
  });

  it('serves a precached same-origin GET from cache without touching the network', async () => {
    const sw = loadSw(list);
    await sw.lifecycle('install');
    sw.fetchFake.mockClear();
    const { respondWith, response } = sw.dispatchFetch(req('https://h/sub/assets/x.js'));
    expect(respondWith).toHaveBeenCalled();
    expect(await (await response())!.text()).toBe('cached:https://h/sub/assets/x.js');
    expect(sw.fetchFake).not.toHaveBeenCalled();
  });

  it('falls through to the network for an uncached same-origin GET', async () => {
    const sw = loadSw(list);
    await sw.lifecycle('install');
    const { response } = sw.dispatchFetch(req('https://h/sub/assets/late.js'));
    expect(await (await response())!.text()).toBe('net:https://h/sub/assets/late.js');
  });

  it('offline navigation to an uncached route returns the cached index.html', async () => {
    const sw = loadSw(list);
    await sw.lifecycle('install');
    sw.net.online = false;
    const { respondWith, response } = sw.dispatchFetch(
      req('https://h/sub/some/route', { navigate: true }),
    );
    expect(respondWith).toHaveBeenCalled();
    expect(await (await response())!.text()).toBe('cached:https://h/sub/index.html');
  });

  it('emits valid JS when a path contains a quote (list is safely embedded)', async () => {
    const odd = ['./', "./it's.js", './index.html'];
    const sw = loadSw(odd);
    await sw.lifecycle('install');
    expect(sw.caches.store.get(cacheNameFor(odd))?.entries.has("https://h/sub/it's.js")).toBe(true);
  });
});

type Hook = ((...args: any[]) => unknown) | { handler: (...args: any[]) => unknown } | undefined;
const call = async (hook: Hook, ...args: unknown[]) => {
  const fn = typeof hook === 'function' ? hook : hook?.handler;
  if (!fn) throw new Error('hook missing');
  return fn.apply({}, args);
};

// Covers: SPIKE-g
describe('swPrecache plugin', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sw-precache-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function seed(outDir: string): Promise<void> {
    await mkdir(join(outDir, 'assets', 'nested'), { recursive: true });
    await writeFile(join(outDir, 'index.html'), '<!doctype html>');
    await writeFile(join(outDir, 'assets', 'a.js'), 'console.log(1)');
    await writeFile(join(outDir, 'assets', 'a.js.map'), '{}');
    await writeFile(join(outDir, 'assets', 'nested', 'b.css'), 'body{}');
    await writeFile(join(outDir, 'ort.wasm'), 'wasm');
  }

  it('is a build-only plugin named sw-precache', () => {
    const p = swPrecache();
    expect(p.name).toBe('sw-precache');
    expect(p.apply).toBe('build');
  });

  it('closeBundle writes sw.js precaching assets and wasm but not source maps', async () => {
    const outDir = join(root, 'dist');
    await seed(outDir);
    const p = swPrecache();
    await call(p.configResolved as Hook, { build: { outDir }, root });
    await call(p.closeBundle as Hook);
    const swPath = join(outDir, 'sw.js');
    expect((await stat(swPath)).isFile()).toBe(true);
    const src = await readFile(swPath, 'utf8');
    expect(src).toContain('./assets/a.js');
    expect(src).toContain('./ort.wasm');
    expect(src).toContain('./index.html');
    expect(src).toContain('./assets/nested/b.css');
    expect(src).not.toContain('a.js.map');
    expect(src).not.toContain('\\');
  });

  it('resolves a relative outDir against config.root', async () => {
    await seed(join(root, 'dist'));
    const p = swPrecache();
    await call(p.configResolved as Hook, { build: { outDir: 'dist' }, root });
    await call(p.closeBundle as Hook);
    const src = await readFile(join(root, 'dist', 'sw.js'), 'utf8');
    expect(src).toContain('./assets/a.js');
  });

  it('emits sw.js equal to renderServiceWorker of the walked list', async () => {
    const outDir = join(root, 'dist');
    await seed(outDir);
    const p = swPrecache();
    await call(p.configResolved as Hook, { build: { outDir }, root });
    await call(p.closeBundle as Hook);
    const expected = renderServiceWorker(
      buildPrecacheList(['index.html', 'assets/a.js', 'assets/a.js.map', 'assets/nested/b.css', 'ort.wasm']),
    );
    expect(await readFile(join(outDir, 'sw.js'), 'utf8')).toBe(expected);
  });

  it('does not precache a stale sw.js left in outDir by a previous build', async () => {
    const outDir = join(root, 'dist');
    await seed(outDir);
    await writeFile(join(outDir, 'sw.js'), '// old');
    const p = swPrecache();
    await call(p.configResolved as Hook, { build: { outDir }, root });
    await call(p.closeBundle as Hook);
    const src = await readFile(join(outDir, 'sw.js'), 'utf8');
    expect(src).not.toContain('./sw.js');
  });
});
