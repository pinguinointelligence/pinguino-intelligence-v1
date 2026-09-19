/** @vitest-environment jsdom */
/**
 * §19 — an unnamed recipe in Produkcja is answered where the user is standing.
 *
 * The old behaviour ejected them: an amber „Wymaga receptury wykonawczej" card,
 * the sentence „Zapisz wersję wykonawczą", and a button back to Receptura to do
 * one thing and walk back. Nothing there was a refusal — the recipe is ready, it
 * simply has no name.
 *
 * The owner's requirement is exact: the SAME component as the Receptura tab,
 * „nie podobny — IDENTYCZNY". So the interesting assertion is not "a save box
 * exists" but "it is the same one", which is why this test renders the workbar
 * on its own and inside the cockpit and compares the two subtrees.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProWorkbar } from '@/features/pro-core/ProWorkbar';
import { ProductionCockpit } from './ProductionCockpit';
import type { ProductionWorkspaceView } from './useProductionWorkspace';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const source = readFileSync('src/features/production-workspace/ProductionCockpit.tsx', 'utf8');

const viewWith = (code: string, actionLabel: string): ProductionWorkspaceView =>
  ({
    session: null,
    progress: null,
    persistenceError: null,
    prerequisite: {
      code,
      eyebrow: 'Wymaga receptury wykonawczej',
      title: 'Zapisz wersję wykonawczą',
      message: 'Produkcja wymaga dokładnej, niezmiennej wersji receptury.',
      action: 'return_to_recipe',
      actionLabel,
    },
  }) as unknown as ProductionWorkspaceView;

let host: HTMLDivElement;
let root: Root;

const mount = (node: React.ReactNode) => {
  act(() => {
    root.render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/pro/production']}>{node}</MemoryRouter>
      </QueryClientProvider>,
    );
  });
};

const cockpit = (view: ProductionWorkspaceView) => (
  <ProductionCockpit
    production={view}
    onOpenPreview={vi.fn()}
    onRecalculate={vi.fn()}
    onReturnToRecipe={vi.fn()}
    onOpenLabel={vi.fn()}
  />
);

/** React's `useId` values differ per tree; nothing else about the markup may. */
const normalise = (html: string) => html.replace(/«[^»]*»|:r[0-9a-z]+:/gi, 'ID');

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('§19 — Produkcja shows the Receptura save box itself, not a lookalike', () => {
  it('mounts the workbar, and reuses it rather than re-describing it', () => {
    expect(source).toContain("import { ProWorkbar } from '@/features/pro-core/ProWorkbar';");
    expect(source).toContain('<ProWorkbar variant="panel" />');
    // A second copy of the save control would show up as its own markup: a name
    // field and a save label of its own. Neither exists in this file.
    expect(source).not.toMatch(/<input\b/);
    expect(source).not.toMatch(/>\s*ZAPISZ\s*</);
    expect(source).not.toMatch(/>\s*Niezapisane\s*</);
  });

  it('renders the panel workbar and none of the technical refusal', () => {
    mount(cockpit(viewWith('saved_version_required', 'Wróć i zapisz recepturę')));
    const box = host.querySelector('[data-testid="production-save-recipe-inline"]');
    expect(box).not.toBeNull();
    expect(
      host.querySelector('[data-testid="pro-workbar"]')?.getAttribute('data-workbar-variant'),
    ).toBe('panel');
    expect(host.querySelector('[data-testid="pro-workbar-name"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="pro-workbar-save"]')).not.toBeNull();

    const text = host.textContent ?? '';
    expect(text).toContain('Zapisz nazwę receptury');
    expect(text).not.toContain('Wymaga receptury wykonawczej');
    expect(text).not.toContain('Zapisz wersję wykonawczą');
    expect(text).not.toContain('Wróć i zapisz recepturę');
    expect(host.querySelector('[data-testid="production-prerequisite-action"]')).toBeNull();
    expect(host.querySelector('[data-testid="production-practical-block"]')).toBeNull();
  });

  it('the mounted box is byte-identical to the one the Receptura tab shows', () => {
    mount(cockpit(viewWith('saved_version_required', 'Wróć i zapisz recepturę')));
    const inProduction = host.querySelector('[data-testid="pro-workbar"]')!.outerHTML;

    act(() => root.unmount());
    act(() => {
      root = createRoot(host);
    });
    mount(<ProWorkbar variant="panel" />);
    const inRecipe = host.querySelector('[data-testid="pro-workbar"]')!.outerHTML;

    expect(normalise(inProduction)).toBe(normalise(inRecipe));
  });

  it('leaves every OTHER blocker on the technical card it belongs to', () => {
    mount(cockpit(viewWith('product_authority_required', 'Wróć do receptury')));
    expect(host.querySelector('[data-testid="production-practical-block"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="production-prerequisite-action"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="production-save-recipe-inline"]')).toBeNull();
    expect(host.textContent).toContain('Wymaga receptury wykonawczej');
  });
});
