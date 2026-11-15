/**
 * Premise g: service-worker registration (production builds only) and offline status.
 */
import { offlineVerdict, makeResult, type PremiseResult } from './verdict.js';

// Captured once at module load: the premise is a boot without network, not a live page going offline.
const bootedOffline = !navigator.onLine;

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Relative URL: resolves under the page's directory, so a GitHub Pages subpath gets its own scope.
  navigator.serviceWorker.register('./sw.js').catch((err: unknown) => {
    console.error('[probe] service worker registration failed', err);
  });
}

export function offlineResult(): PremiseResult {
  const swSupported = 'serviceWorker' in navigator;
  const v = offlineVerdict({
    swSupported,
    controlled: swSupported && navigator.serviceWorker.controller != null,
    online: navigator.onLine,
    bootedOffline,
  });
  return import.meta.env.PROD ? v : makeResult('g', v.status, `${v.evidence}; dev build: SW not registered`);
}

/** Re-evaluate on connectivity and controller changes; returns an unsubscribe. */
export function watchOffline(report: (r: PremiseResult) => void): () => void {
  const update = () => report(offlineResult());
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  sw?.addEventListener('controllerchange', update);
  update();
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
    sw?.removeEventListener('controllerchange', update);
  };
}
