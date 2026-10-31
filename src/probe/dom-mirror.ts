/**
 * 2D DOM mirror of the probe board plus the "Run AR probe" fallback button: launching AR from
 * inside VR can fail once the select gesture's user activation is consumed, while a DOM click
 * outside XR always carries activation.
 */
import type { PremiseResult } from './verdict.js';

export function mountDomMirror(onRunAr: () => void): {
  render: (results: readonly PremiseResult[]) => void;
  dispose: () => void;
} {
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:10;max-width:min(96vw,720px);' +
    'background:rgba(14,17,22,0.85);color:#e6e6e6;font:12px/1.35 monospace;padding:8px;border-radius:6px;';
  const button = document.createElement('button');
  button.textContent = 'Run AR probe';
  button.style.cssText = 'margin-bottom:6px;padding:6px 10px;font:inherit;cursor:pointer;';
  button.addEventListener('click', onRunAr);
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;white-space:pre-wrap;';
  root.append(button, pre);
  document.body.append(root);

  return {
    render(results) {
      const label = results[0]?.label ?? '';
      pre.textContent =
        label + '\n' + results.map((r) => `${r.id} ${r.status.padEnd(11)} ${r.title}: ${r.evidence}`).join('\n');
    },
    dispose() {
      button.removeEventListener('click', onRunAr);
      root.remove();
    },
  };
}
