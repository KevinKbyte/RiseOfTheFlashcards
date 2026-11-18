/**
 * @vitest-environment jsdom
 */
// Requirement: the import controls sit in one row below the textarea -- the Import button, the
// "Load example" button and the file input all live inside one div[data-testid="import-actions"]
// that follows the textarea in DOM order; the textarea itself is not inside that row.
// Covers: M11, A10
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountImportPanel } from '../src/import-panel.js';
import { createMenu, openDeckSelect, openImport } from '../src/flashcards/menu-flow.js';

const roots: HTMLElement[] = [];

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  roots.push(root);
  mountImportPanel(root, { state: openImport(openDeckSelect(createMenu())), onChange: vi.fn() });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) root.remove();
});

function hasButton(root: Element, label: RegExp): boolean {
  return [...root.querySelectorAll('button')].some((b) => label.test((b.textContent ?? '').trim()));
}

function actions(root: HTMLElement): HTMLElement {
  const el = root.querySelector<HTMLElement>('[data-testid="import-actions"]');
  if (!el) throw new Error('no [data-testid="import-actions"]');
  return el;
}

// Covers: M11, A10
describe('import panel: import actions row', () => {
  it('renders exactly one import-actions div', () => {
    const root = mount();
    expect(root.querySelectorAll('div[data-testid="import-actions"]')).toHaveLength(1);
  });

  it('the import-actions div contains the Import button, the Load example button and the file input', () => {
    const row = actions(mount());
    expect(row.tagName).toBe('DIV');
    expect(hasButton(row, /^import$/i)).toBe(true);
    expect(hasButton(row, /^Load example$/)).toBe(true);
    expect(row.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('the import-actions div follows the textarea and does not contain it', () => {
    const root = mount();
    const row = actions(root);
    const area = root.querySelector('textarea');
    if (!area) throw new Error('no textarea');
    expect(row.contains(area)).toBe(false);
    expect(area.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
