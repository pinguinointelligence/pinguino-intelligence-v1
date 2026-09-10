// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · A6 — a long recipe name wraps on a phone, and nothing else moves.
 *
 * The switch between the approved single-line input (desktop) and the wrapping
 * field (below the 60rem workbench breakpoint) is CSS only: the responsive guard
 * forbids a viewport read feeding anything. Both presentations are the SAME field
 * — same value, same handler — and exactly one is displayed at any width.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockRecipeState {
  savedRecipeId: string | null;
  savedRecipeName: string | null;
  currentVersionNumber: number | null;
  currentVersionDate: string | null;
  dirty: boolean;
  category: string;
  visibleProductType: string;
  mode: string;
  formulation_strategy: 'optimal' | 'eco';
  target_temperature_c: number;
  target_batch_grams: number;
  machineKind: 'professional' | 'home' | null;
  servingModeId: string | null;
  machineLabel: string | null;
}

const LONG_NAME =
  'Lody pistacjowe z solonym karmelem i prażonymi orzechami laskowymi — partia degustacyjna na wrzesień';

let mockState: MockRecipeState = {
  savedRecipeId: 'recipe-a6',
  savedRecipeName: LONG_NAME,
  currentVersionNumber: 3,
  currentVersionDate: '2026-09-10',
  dirty: false,
  category: 'milk_gelato',
  visibleProductType: 'gelato',
  mode: 'premium',
  formulation_strategy: 'optimal',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machineKind: null,
  servingModeId: null,
  machineLabel: null,
};
const mockSave = {
  blocked: null,
  busy: false,
  error: null,
  clearError: () => {},
  createNew: vi.fn(async () => true),
  saveVersion: vi.fn(async () => true),
  rename: vi.fn(async () => true),
  archive: vi.fn(async () => true),
  practicalBlocked: false,
  practicalBlockMessage: null,
  practicalBlock: null,
};

vi.mock('@/stores/recipeStore', () => ({
  useRecipeStore: Object.assign((sel: (s: MockRecipeState) => unknown) => sel(mockState), {
    subscribe: () => () => undefined,
  }),
}));
vi.mock('@/features/recipes/useCanonicalRecipeSave', () => ({
  useCanonicalRecipeSave: () => mockSave,
}));
vi.mock('@/features/constraint-studio/constraintStudioStore', () => ({
  useConstraintStudioStore: (selector: (state: { history: unknown[] }) => unknown) =>
    selector({ history: [] }),
}));

const { ProWorkbar } = await import('./ProWorkbar');

const workbar = () => (
  <MemoryRouter initialEntries={['/pro/recipe']}>
    <Routes>
      <Route path="/pro/:section" element={<ProWorkbar variant="panel" />} />
    </Routes>
  </MemoryRouter>
);

function elementFor(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<', at);
  return html.slice(start, html.indexOf('>', at) + 1);
}

describe('A6 — the recipe name wraps on the phone layout', () => {
  it('keeps the approved single-line input for desktop and adds a wrapping field below 60rem', () => {
    const html = renderToStaticMarkup(workbar());

    const input = elementFor(html, 'pro-workbar-name');
    expect(input.startsWith('<input')).toBe(true);
    expect(input).toContain('truncate'); // desktop: exactly as approved
    expect(input).toContain('max-[60rem]:hidden');

    const area = elementFor(html, 'pro-workbar-name-wrap');
    expect(area.startsWith('<textarea')).toBe(true);
    expect(area).toContain('min-[60rem]:hidden');
    expect(area).toContain('resize-none');
    expect(area).toContain('break-words');
    expect(area).not.toContain('truncate');
    expect(area).toContain('rows="1"');
    // The WHOLE name is there to wrap — nothing is cut to make the layout fit.
    expect(html).toContain(`>${LONG_NAME}</textarea>`);
  });

  describe('one field, two presentations', () => {
    let host: HTMLDivElement;
    let root: Root;

    beforeEach(async () => {
      (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = true;
      host = document.createElement('div');
      document.body.append(host);
      root = createRoot(host);
      await act(async () => root.render(workbar()));
    });

    afterEach(async () => {
      await act(async () => root.unmount());
      host.remove();
      mockState = { ...mockState, savedRecipeName: LONG_NAME };
    });

    const input = () => host.querySelector<HTMLInputElement>('[data-testid="pro-workbar-name"]')!;
    const area = () =>
      host.querySelector<HTMLTextAreaElement>('[data-testid="pro-workbar-name-wrap"]')!;

    it('writes the same draft from either presentation, and a pasted line break becomes a space', async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      await act(async () => {
        setter.call(area(), 'Sorbet mango\ni limonka');
        area().dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(area().value).toBe('Sorbet mango i limonka');
      expect(input().value).toBe('Sorbet mango i limonka');
    });

    it('never inserts a line break on Enter', async () => {
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      await act(async () => {
        area().dispatchEvent(enter);
      });
      expect(enter.defaultPrevented).toBe(true);
    });

    it('names the wrapping field for assistive technology', () => {
      expect(area().getAttribute('aria-label')).toBeTruthy();
    });
  });
});
