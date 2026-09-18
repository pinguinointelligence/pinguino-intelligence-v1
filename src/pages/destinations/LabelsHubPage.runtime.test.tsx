// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
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

function ProductionReturnProbe() {
  const location = useLocation();
  const restore = (location.state as { labelSettingsRestore?: unknown } | null)
    ?.labelSettingsRestore;
  return (
    <div
      data-testid="production-return-probe"
      data-search={location.search}
      data-restore={JSON.stringify(restore ?? null)}
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
    // Etykiety is the Pro-only section of the Produkcja area (owner decision 2026-09-17):
    // a HOME or signed-out visitor is told where the tools live instead of seeing them.
    useProCoreAccessStore.setState({ devPersona: 'pro' });
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
    useProCoreAccessStore.setState({ devPersona: null });
  });

  /* Production v3 §5: the current recipe's label draft is context B
     (`/labels?labelView=recipe`) — the recipe label's „Zmień ustawienia” opens it
     there (DraftLabelPanel). `/labels` alone is context A (defaults + history). */
  const renderPage = async (
    search = '?labelView=recipe',
    state: unknown = {
      labelSettingsReturn: {
        to: '/pro/recipe?panel=summary&version=v1',
        scrollTop: 321,
      },
    },
  ) => {
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/labels',
              search,
              state,
            },
          ]}
        >
          <Routes>
            <Route path="/labels" element={<LabelsHubPage />} />
            <Route path="/pro/recipe" element={<ReturnProbe />} />
            <Route path="/production" element={<ProductionReturnProbe />} />
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

  it('initializes the current recipe label settings in context B', async () => {
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

  it('opens the defaults and label history from ☰ without creating a recipe draft (context A)', async () => {
    useRecipeStore.setState({ labelDraft: null });
    const setLabelDraft = vi.spyOn(useRecipeStore.getState(), 'setLabelDraft');
    await renderPage('', null);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setLabelDraft).not.toHaveBeenCalled();
    expect(useRecipeStore.getState().labelDraft).toBeNull();
    expect(
      host.querySelector('[data-testid="label-workspace"]')?.getAttribute('data-workspace-mode'),
    ).toBe('profile');
    expect(host.querySelector('[data-testid="label-history"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="label-production-date-setting"]')).toBeNull();
    // Reached from the menu there is nowhere to go back to, so no back action is invented.
    expect(host.querySelector('[data-testid="labels-return"]')).toBeNull();
    setLabelDraft.mockRestore();
  });

  it('names the return after its source and restores that source', async () => {
    await renderPage('?run=run-missing', {
      labelSettingsReturn: {
        to: '/production?tab=history',
        scrollTop: 923,
        origin: 'production-history',
        focusRunId: 'run-missing',
        historyShown: 60,
      },
    });
    const back = host.querySelector<HTMLButtonElement>('[data-testid="labels-return"]')!;
    expect(back.textContent?.trim()).toBe('← Wróć do historii produkcji');
    await act(async () => back.click());
    const probe = host.querySelector<HTMLElement>('[data-testid="production-return-probe"]')!;
    expect(probe.getAttribute('data-search')).toBe('?tab=history');
    expect(JSON.parse(probe.getAttribute('data-restore')!)).toEqual({
      to: '/production?tab=history',
      scrollTop: 923,
      origin: 'production-history',
      focusRunId: 'run-missing',
      historyShown: 60,
    });
  });

  it('labels the label-history and current-run returns', async () => {
    await renderPage('?run=run-x', {
      labelSettingsReturn: {
        to: '/labels',
        scrollTop: 260,
        origin: 'label-history',
        query: 'L-26',
      },
    });
    expect(host.querySelector('[data-testid="labels-return"]')?.textContent?.trim()).toBe(
      '← Wróć do historii etykiet',
    );
    await act(async () => root.unmount());
    root = createRoot(host);
    await renderPage('?run=run-x', {
      labelSettingsReturn: { to: '/production', scrollTop: 0, origin: 'current-run' },
    });
    expect(host.querySelector('[data-testid="labels-return"]')?.textContent?.trim()).toBe(
      '← Wróć do partii',
    );
  });
});

describe('/labels for HOME', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    useProCoreAccessStore.setState({ devPersona: 'home' });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useProCoreAccessStore.setState({ devPersona: null });
  });

  it('says labels are a Pro feature and shows no Pro label tools', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/labels']}>
          <Routes>
            <Route path="/labels" element={<LabelsHubPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(host.textContent).toContain('Etykiety są dostępne w planie Pro');
    expect(host.querySelector('[data-testid="label-workspace"]')).toBeNull();
    expect(host.querySelector('[data-testid="label-history"]')).toBeNull();
  });
});
