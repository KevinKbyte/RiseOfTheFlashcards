// Requirement: the service worker's install step precaches every asset with a cache-bypassing
// request (cache: 'reload'), so a stale copy in the browser HTTP cache can never become the
// offline precache. Each request URL is still resolved against the registration scope.
import { describe, expect, it, vi } from 'vitest';
import { cacheNameFor, renderServiceWorker } from '../vite-plugins/sw-precache.js';

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

async function installWith(list: string[], scope: string) {
  const added: unknown[] = [];
  const opened: string[] = [];
  const caches = {
    open: async (name: string) => {
      opened.push(name);
      return {
        addAll: async (items: unknown[]) => {
          added.push(...items);
        },
      };
    },
    keys: async () => [],
    delete: async () => true,
    match: async () => undefined,
  };
  const listeners = new Map<string, Listener[]>();
  const self = {
    registration: { scope },
    location: { origin: new URL(scope).origin },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  };
  new Function('self', 'caches', 'fetch', renderServiceWorker(list))(self, caches, vi.fn());
  const pending: Promise<unknown>[] = [];
  for (const fn of listeners.get('install') ?? []) fn({ waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return { added, opened, self };
}

// Covers: SPIKE-g
describe('renderServiceWorker install bypasses the HTTP cache (S3.4)', () => {
  const list = ['./', './assets/x.js', './index.html'];

  it('adds every precache entry as a Request with cache: "reload"', async () => {
    const { added, opened } = await installWith(list, 'https://h/sub/');
    expect(opened).toEqual([cacheNameFor(list)]);
    expect(added).toHaveLength(list.length);
    for (const item of added) {
      expect(item, String(item)).toBeInstanceOf(Request);
      expect((item as Request).cache).toBe('reload');
    }
  });

  it('each reload Request URL is resolved against the registration scope', async () => {
    const { added } = await installWith(list, 'https://h/sub/');
    const urls = added.map((r) => (r instanceof Request ? r.url : String(r))).sort();
    expect(urls).toEqual(['https://h/sub/', 'https://h/sub/assets/x.js', 'https://h/sub/index.html']);
  });
});
