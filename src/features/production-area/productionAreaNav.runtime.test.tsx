// @vitest-environment jsdom
/**
 * PAKIET PRODUKCJA V3 §1 — the section bar and the per-section memory.
 *
 *   - fixed order Partie · Produkty · Maszyna · Etykiety, real links, one `aria-current`;
 *   - ArrowRight / ArrowLeft / Home / End move between sections like the old Production tabs;
 *   - a section returns to its last address (a search, a panel); the current section's own
 *     entry goes to its start;
 *   - the memory is per account and is wiped on an account boundary
 *     (`clearAccountScopedClientState`).
 */
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAccountScopedClientState } from '@/app/accountSessionReset';
import { useAuthStore } from '@/stores/authStore';
import { ProductionAreaSurface } from './ProductionAreaSurface';
import {
  clearProductionAreaMemory,
  productionAreaSectionAddress,
  rememberProductionAreaAddress,
} from './productionAreaMemory';
import { PRODUCTION_AREA_SECTIONS, productionAreaSectionFor } from './productionAreaSections';
import { resetUnsavedGuardForTests } from './unsavedGuard';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="probe" data-path={`${location.pathname}${location.search}`} />;
}

const signIn = (id: string) =>
  useAuthStore.setState({
    status: 'authed',
    user: { id, email: `${id}@example.test`, displayName: null },
    available: true,
  });

describe('the Produkcja section bar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    signIn('bar-owner');
    clearProductionAreaMemory();
    resetUnsavedGuardForTests();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const render = async (initial: string) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route
              path="/production"
              element={<ProductionAreaSurface section="batches">partie</ProductionAreaSurface>}
            />
            <Route
              path="/products"
              element={<ProductionAreaSurface section="products">produkty</ProductionAreaSurface>}
            />
            <Route
              path="/machine"
              element={<ProductionAreaSurface section="machine">maszyna</ProductionAreaSurface>}
            />
            <Route
              path="/labels"
              element={<ProductionAreaSurface section="labels">etykiety</ProductionAreaSurface>}
            />
          </Routes>
          <LocationProbe />
        </MemoryRouter>,
      );
    });
  };

  const path = () => host.querySelector('[data-testid="probe"]')?.getAttribute('data-path');
  const bar = () => host.querySelector('nav[aria-label="Sekcje Produkcji"]')!;
  const links = () => [...bar().querySelectorAll<HTMLAnchorElement>('a')];
  const link = (id: string) =>
    host.querySelector<HTMLAnchorElement>(`[data-testid="production-area-section-${id}"]`)!;
  const press = async (element: HTMLElement, key: string) =>
    act(async () => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

  it('renders the four sections in the fixed order with one current section', async () => {
    await render('/machine');
    expect(links().map((a) => a.textContent?.trim())).toEqual([
      'Partie',
      'Produkty',
      'Maszyna',
      'Etykiety',
    ]);
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([null, null, 'page', null]);
    expect(links().map((a) => a.getAttribute('href'))).toEqual(
      PRODUCTION_AREA_SECTIONS.map((section) => section.to),
    );
    // One title for the whole area.
    expect(host.querySelector('h1')?.textContent).toBe('Produkcja');
  });

  it('moves between sections with ArrowRight, ArrowLeft, Home and End', async () => {
    await render('/production');
    await press(link('batches'), 'ArrowRight');
    expect(path()).toBe('/products');
    expect(document.activeElement).toBe(link('products'));
    await press(link('products'), 'End');
    expect(path()).toBe('/labels');
    await press(link('labels'), 'ArrowRight');
    expect(path()).toBe('/production');
    await press(link('batches'), 'ArrowLeft');
    expect(path()).toBe('/labels');
    await press(link('labels'), 'Home');
    expect(path()).toBe('/production');
  });

  it('returns each section to its last address; the current entry goes to the start', async () => {
    await render('/products?q=mleko&panel=markets');
    await act(async () => link('machine').click());
    expect(path()).toBe('/machine');
    expect(link('products').getAttribute('href')).toBe('/products?q=mleko&panel=markets');
    await act(async () => link('products').click());
    expect(path()).toBe('/products?q=mleko&panel=markets');
    // Tapping the current section starts it over.
    expect(link('products').getAttribute('href')).toBe('/products');
  });

  it('keeps the memory per account and wipes it on an account boundary', () => {
    rememberProductionAreaAddress('account-a', 'labels', '/labels?run=r1');
    expect(productionAreaSectionAddress('account-a', 'labels')).toBe('/labels?run=r1');
    // Another account never receives A's address.
    expect(productionAreaSectionAddress('account-b', 'labels')).toBe('/labels');
    clearAccountScopedClientState(new QueryClient());
    expect(productionAreaSectionAddress('account-a', 'labels')).toBe('/labels');
  });

  it('matches every area address to exactly one section', () => {
    const cases: [string, string][] = [
      ['/production', 'batches'],
      ['/pro/history', 'batches'],
      ['/products/scan', 'products'],
      ['/create-ingredient', 'products'],
      ['/profile/machine', 'machine'],
      ['/pro/machine', 'machine'],
      ['/label', 'labels'],
    ];
    for (const [pathname, id] of cases) {
      expect(productionAreaSectionFor({ pathname, search: '' })?.id, pathname).toBe(id);
    }
    expect(productionAreaSectionFor({ pathname: '/pro/production', search: '' })).toBeNull();
  });
});
