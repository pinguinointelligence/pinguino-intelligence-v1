// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { LegacyRecipeReferenceNotice } from './LegacyRecipeReferenceNotice';

describe('LegacyRecipeReferenceNotice', () => {
  let host: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    host?.remove();
    host = null;
    root = null;
  });

  it('shows safe copy and a normal inspection action without leaking resolver internals', async () => {
    const items = calculateRecipe(starterMilkBase()).items;
    const onInspect = vi.fn();
    const rawReason =
      'LEGACY_BEHAVIOR:legacy_product_reference_unresolved:550e8400-e29b-41d4-a716-446655440000:PI-ING-000405:rpc_repair_legacy_reference';
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () =>
      root?.render(
        <LegacyRecipeReferenceNotice
          issues={[{ lineId: items[0]!.id, reason: rawReason }]}
          items={items}
          onInspect={onInspect}
        />,
      ),
    );

    expect(host.textContent).toContain('1 Historyczny produkt wymaga sprawdzenia');
    expect(host.textContent).toContain(items[0]!.ingredient.name);
    expect(host.textContent).not.toContain('550e8400');
    expect(host.textContent).not.toContain('PI-ING-000405');
    expect(host.textContent).not.toContain('rpc_');
    const button = Array.from(host.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === 'Sprawdź produkt',
    )!;
    await act(async () => button.click());
    expect(onInspect).toHaveBeenCalledWith(items[0]!.id);
  });
});
