/**
 * Premise d: localStorage boot counter, storage.persist()/estimate(), IndexedDB round-trip.
 */
import { incrementBootCount } from './boot-counter.js';
import { makeResult, persistenceVerdict, type PremiseResult } from './verdict.js';

const DB_NAME = 'probe';
const STORE = 'kv';
const msg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
const mb = (bytes: number | undefined) => (bytes === undefined ? '?' : (bytes / 1048576).toFixed(1));

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Writes this boot's count and reads it back; returns the value the previous boot left. */
async function idbRoundTrip(bootCount: number): Promise<unknown> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await request(open);
  try {
    const store = () => db.transaction(STORE, 'readwrite').objectStore(STORE);
    const previous = await request(store().get('boot'));
    await request(store().put(bootCount, 'boot'));
    const readBack = await request(store().get('boot'));
    if (readBack !== bootCount) throw new Error(`IDB read-back ${String(readBack)} != ${bootCount}`);
    return previous;
  } finally {
    db.close();
  }
}

export async function runPersistenceProbe(): Promise<PremiseResult> {
  let bootCount = 0;
  let persisted: boolean | null = null;
  let error = '';
  let extra = '';
  try {
    bootCount = incrementBootCount(localStorage);
    if (navigator.storage?.persist) persisted = await navigator.storage.persist();
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      extra += `; usage ${mb(est.usage)}/${mb(est.quota)} MB`;
    }
    extra += `; idb prev=${String(await idbRoundTrip(bootCount))}`;
  } catch (e) {
    error = msg(e);
  }
  const v = persistenceVerdict({ bootCount, persisted, error });
  return makeResult('d', v.status, v.evidence + extra);
}
