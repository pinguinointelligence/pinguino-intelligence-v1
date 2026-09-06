// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { createRecipeLabelDraft } from '@/features/master-label/labelDraftPersistence';
import { createCompleteLabel } from '@/features/master-label/masterLabelTestFixture';
import { useRecipeStore } from '@/stores/recipeStore';
import { useAuthStore } from '@/stores/authStore';
import { LabelsHubPage } from './GlobalDestinationPages';

function ReturnProbe() {
  const location = useLocation();
  const restore = (location.state as { labelSettingsRestore?: { scrollTop?: number } } | null)
    ?.labelSettingsRestore;
  return (
    <div
      data-testid="label-return-probe"
      data-search={location.search}
      data-scroll={restore?.scrollTop ?? ''}
    />
  );
}

describe('/labels current draft settings round trip', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    useRecipeStore.getState().resetToDemo();
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'label-settings-owner', email: null, displayName: null },
      available: true,
    });
    useProductionSessionStore.setState({ session: null });
    const draft = createRecipeLabelDraft({
      draftId: 'settings-return-owner',
      now: new Date('2026-09-06T09:00:00.000Z'),
      timeZone: 'Europe/Madrid',
    });
    useRecipeStore.getState().setLabelDraft({
      ...draft,
      label: createCompleteLabel('EU', {
        sourceKind: 'recipe_draft',
        sourceCompletionSessionId: draft.draftId,
        productionDate: draft.productionDate,
        lotCode: draft.lotCode,
      }),
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const renderPage = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/labels',
              state: {
                labelSettingsReturn: {
                  to: '/pro/recipe?panel=summary&version=v1',
                  scrollTop: 321,
                },
              },
            },
          ]}
        >
          <Routes>
            <Route path="/labels" element={<LabelsHubPage />} />
            <Route path="/pro/recipe" element={<ReturnProbe />} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('changes production date, preserves LOT and returns to the exact version route', async () => {
    await renderPage();
    const before = useRecipeStore.getState().labelDraft!;
    const date = host.querySelector<HTMLInputElement>(
      '[data-testid="label-production-date-setting"]',
    )!;
    expect(date.value).toBe('2026-09-06');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(date, '2026-09-04');
      date.dispatchEvent(new Event('input', { bubbles: true }));
      date.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="apply-label-settings"]')!.click();
      await Promise.resolve();
    });

    const saved = useRecipeStore.getState().labelDraft!;
    expect(saved.productionDate).toBe('2026-09-04');
    expect(saved.label?.productionDate).toBe('2026-09-04');
    expect(saved.lotCode).toBe(before.lotCode);
    expect(saved.label?.lotCode).toBe(before.lotCode);
    const probe = host.querySelector<HTMLElement>('[data-testid="label-return-probe"]')!;
    expect(probe.getAttribute('data-search')).toBe('?panel=summary&version=v1');
    expect(probe.getAttribute('data-scroll')).toBe('321');
  });

  it('offers an explicit back action without mutating the working copy', async () => {
    await renderPage();
    const before = structuredClone(useRecipeStore.getState().labelDraft);
    const back = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === '← Wróć',
    )!;
    await act(async () => back.click());
    expect(useRecipeStore.getState().labelDraft).toEqual(before);
    expect(host.querySelector('[data-testid="label-return-probe"]')).not.toBeNull();
  });

  it('initializes current label settings when opened directly from the hamburger', async () => {
    useRecipeStore.setState({ labelDraft: null });
    await renderPage();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(useRecipeStore.getState().labelDraft?.lotCode).toMatch(/^LOT-/);
    expect(useRecipeStore.getState().labelDraft?.label).not.toBeNull();
    expect(host.querySelector('[data-testid="label-production-date-setting"]')).not.toBeNull();
  });
});
