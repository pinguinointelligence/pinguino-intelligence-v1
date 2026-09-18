// @vitest-environment jsdom
/**
 * PAKIET PRODUKCJA V3 §8.1 — the clicked transition behind GEL-P0-033's navigation clause.
 *
 * The contract proves the CONSTANTS (the ☰ entry, the section list, the active id). This file
 * proves the ENTRY IS RENDERED and CLICKABLE: the real ☰ drawer, the real section bar and the
 * real routes, clicked by role and accessible name. Removing the „Produkcja” row from the drawer
 * or the „Etykiety” link from the bar — while every constant stays — fails here.
 *
 *   ☰ → „Produkcja” → /production → section bar „Etykiety” → /labels
 *   PRO: the account label profile and „Historia etykiet”.
 *   HOME: „Etykiety są dostępne w planie Pro”, and none of the PRO tools.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '@/features/shell/AppShell';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { LabelsHubPage, ProductionHubPage } from '@/pages/destinations/GlobalDestinationPages';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { clearProductionAreaMemory } from './productionAreaMemory';
import { resetUnsavedGuardForTests } from './unsavedGuard';

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location-probe" data-path={`${location.pathname}${location.search}`} />
  );
}

/** Accessible name of a link or button: its trimmed text (these entries carry no aria-label). */
const nameOf = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** The element with an explicit or implicit role and an exact accessible name, within a scope. */
function byRole(scope: ParentNode, role: 'link' | 'navigation' | 'dialog', name: string) {
  const selector =
    role === 'link'
      ? 'a[href], [role="link"]'
      : role === 'navigation'
        ? 'nav, [role="navigation"]'
        : '[role="dialog"]';
  const matches = [...scope.querySelectorAll(selector)].filter((element) =>
    role === 'link' ? nameOf(element) === name : element.getAttribute('aria-label') === name,
  );
  return matches;
}

describe('☰ Produkcja → Etykiety is a rendered, clickable path (GEL-P0-033 navigation clause)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'area-owner', email: 'area@example.test', displayName: null },
      available: true,
    });
    useRecipeStore.getState().resetToDemo();
    useProductionSessionStore.setState({ session: null });
    clearProductionAreaMemory();
    resetUnsavedGuardForTests();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useProCoreAccessStore.setState({ devPersona: null });
  });

  const render = async (persona: ProCorePersona) => {
    useProCoreAccessStore.setState({ devPersona: persona });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/recipes']}>
          <Routes>
            <Route path="/recipes" element={<AppShell>Receptury</AppShell>} />
            <Route path="/production" element={<ProductionHubPage />} />
            <Route path="/labels" element={<LabelsHubPage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>,
      );
    });
  };

  const path = () =>
    host.querySelector('[data-testid="location-probe"]')?.getAttribute('data-path') ?? '';

  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const openProductionFromMenu = async () => {
    const trigger = host.querySelector<HTMLButtonElement>('[data-testid="app-nav-trigger"]');
    expect(trigger, 'the ☰ trigger is rendered').not.toBeNull();
    await act(async () => trigger!.click());
    const [drawer] = byRole(document, 'dialog', 'Menu');
    expect(drawer, 'the ☰ drawer opens').toBeDefined();
    const entries = byRole(drawer!, 'link', 'Produkcja');
    expect(entries, 'exactly one „Produkcja” entry in ☰').toHaveLength(1);
    // The four retired rows are gone — the area is ONE entry.
    for (const retired of ['Produkty', 'Maszyna', 'Ustawienia etykiety']) {
      expect(byRole(drawer!, 'link', retired), `no separate „${retired}” row`).toHaveLength(0);
    }
    await act(async () => (entries[0] as HTMLAnchorElement).click());
    await settle();
    expect(path()).toBe('/production');
  };

  const clickLabelsSection = async () => {
    const [bar] = byRole(host, 'navigation', 'Sekcje Produkcji');
    expect(bar, 'the Produkcja section bar is rendered').toBeDefined();
    expect(
      byRole(bar!, 'link', 'Partie')[0]?.getAttribute('aria-current'),
      'Partie is the current section on /production',
    ).toBe('page');
    const labels = byRole(bar!, 'link', 'Etykiety');
    expect(labels, 'exactly one „Etykiety” section link').toHaveLength(1);
    await act(async () => (labels[0] as HTMLAnchorElement).click());
    await settle();
    expect(path()).toBe('/labels');
    const [barOnLabels] = byRole(host, 'navigation', 'Sekcje Produkcji');
    expect(byRole(barOnLabels!, 'link', 'Etykiety')[0]?.getAttribute('aria-current')).toBe('page');
  };

  it('PRO: ☰ Produkcja → Etykiety opens the account label profile and „Historia etykiet”', async () => {
    await render('pro');
    await openProductionFromMenu();
    await clickLabelsSection();

    expect(host.textContent).toContain('Profil etykiety konta');
    expect(host.textContent).toContain('Historia etykiet');
    expect(host.querySelector('[data-testid="production-area-pro-gate"]')).toBeNull();

    // ☰ now marks „Produkcja” as where the customer is.
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="app-nav-trigger"]')!.click(),
    );
    const [drawer] = byRole(document, 'dialog', 'Menu');
    expect(byRole(drawer!, 'link', 'Produkcja')[0]?.getAttribute('aria-current')).toBe('page');
  });

  it('HOME: ☰ Produkcja → Etykiety says the labels live in Pro, with no PRO tools', async () => {
    await render('home');
    await openProductionFromMenu();
    await clickLabelsSection();

    expect(host.textContent).toContain('Etykiety są dostępne w planie Pro');
    expect(host.querySelector('[data-testid="production-area-pro-gate"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Profil etykiety konta');
    expect(host.textContent).not.toContain('Historia etykiet');
    expect(host.querySelector('[data-testid="label-history-search"]')).toBeNull();
    expect(host.querySelector('[data-testid="label-production-date-setting"]')).toBeNull();
    expect(byRole(host, 'link', 'Zobacz plany')[0]?.getAttribute('href')).toBe('/subscription');
  });
});
