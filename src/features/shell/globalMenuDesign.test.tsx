// @vitest-environment jsdom
/**
 * DESIGN V3.0 — GLOBAL MENU (the accepted „Menu globalne” plates).
 *
 * The drawer is a DESIGN contract, not a bag of links, so this file pins the
 * three accepted states by their VISIBLE Polish labels and their exact order —
 * the thing a reader compares against the plate — and states in negatives what
 * the design deliberately took out. The id-level pins live in appNav.test.ts;
 * these are the customer-visible ones.
 *
 *   NIEZALOGOWANY  Wypróbuj Gellatti · Dlaczego to działa? · Receptury
 *                  | Sklep · Plany · Affiliate · Franchise        → „Zaloguj się”
 *   ZALOGOWANY     Home|Pro · Receptury · Dlaczego to działa? · Produkcja
 *                  | Sklep · Affiliate · Franchise | Pomoc        → konto + „Wyloguj się”
 *
 * Removed on purpose: the „Gellatti Home/Pro” panel title, the „TRYB KONTA”
 * card, top-level Community (it is inside Receptury), the „Uruchom samouczek
 * ponownie” row (it is inside „Dlaczego to działa?”), and a guest „Pomoc”.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '@/features/shell/AppShell';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useAuthStore } from '@/stores/authStore';
import { APP_NAV_ITEMS, NAV_GROUP_ORDER, visibleNavItems } from './appNav';

const labels = (audience: 'guest' | 'home' | 'pro') =>
  visibleNavItems(audience).map((item) => item.label);

describe('DESIGN V3.0 global menu — the three accepted states', () => {
  it('NIEZALOGOWANY reads exactly as the plate', () => {
    expect(labels('guest')).toEqual([
      'Wypróbuj Gellatti',
      'Dlaczego to działa?',
      'Receptury',
      'Sklep',
      'Plany',
      'Affiliate',
      'Franchise',
    ]);
  });

  it('ZALOGOWANY · HOME reads exactly as the plate, starting with Home', () => {
    expect(labels('home')).toEqual([
      'Home',
      'Receptury',
      'Dlaczego to działa?',
      'Produkcja',
      'Sklep',
      'Affiliate',
      'Franchise',
      'Pomoc',
    ]);
  });

  it('ZALOGOWANY · PRO is the same list, starting with Pro', () => {
    expect(labels('pro')).toEqual([
      'Pro',
      'Receptury',
      'Dlaczego to działa?',
      'Produkcja',
      'Sklep',
      'Affiliate',
      'Franchise',
      'Pomoc',
    ]);
    // The ONLY difference between the two signed-in menus is the first row.
    expect(labels('pro').slice(1)).toEqual(labels('home').slice(1));
  });

  it('separates the list in the two accepted places: after Produkcja and after Franchise', () => {
    // A separator is a group boundary, and the design shows exactly two of them.
    expect(NAV_GROUP_ORDER).toEqual(['product', 'ecosystem', 'support']);
    for (const audience of ['home', 'pro'] as const) {
      const groups = visibleNavItems(audience).map((item) => item.group);
      expect(groups.filter((group, index) => index > 0 && group !== groups[index - 1])).toHaveLength(
        2,
      );
    }
  });
});

describe('DESIGN V3.0 global menu — what the design took out', () => {
  it('a guest sees no Produkcja, no Pomoc, no Community and no tutorial row', () => {
    for (const gone of ['Produkcja', 'Pomoc', 'Community', 'Uruchom samouczek ponownie']) {
      expect(labels('guest')).not.toContain(gone);
    }
  });

  it('a signed-in customer sees no Community, no Plany and no tutorial row', () => {
    for (const audience of ['home', 'pro'] as const) {
      for (const gone of ['Community', 'Plany', 'Uruchom samouczek ponownie']) {
        expect(labels(audience)).not.toContain(gone);
      }
    }
  });

  it('keeps Produkty, Maszyna and Etykiety out of the menu — Produkcja is one entry', () => {
    for (const audience of ['guest', 'home', 'pro'] as const) {
      const list = labels(audience);
      expect(list.filter((label) => label === 'Produkcja')).toHaveLength(
        audience === 'guest' ? 0 : 1,
      );
      for (const section of ['Produkty', 'Maszyna', 'Etykiety', 'Ustawienia etykiety', 'Historia']) {
        expect(list).not.toContain(section);
      }
    }
  });

  it('points every entry at a canonical in-app route', () => {
    for (const item of APP_NAV_ITEMS) {
      expect(item.to.startsWith('/'), item.id).toBe(true);
      // no legacy addresses in the menu — those exist only as redirects
      for (const legacy of ['/start', '/studio', '/calculator', '/my-recipes', '/label', '/work-with-us']) {
        expect(item.to, item.id).not.toBe(legacy);
      }
    }
    const to = (id: string) => APP_NAV_ITEMS.find((item) => item.id === id)?.to;
    expect(to('help')).toBe('/help');
    expect(to('production')).toBe('/production');
    expect(to('howItWorks')).toBe('/how-it-works');
    expect(to('proWorkspace')).toBe('/pro/recipe');
    expect(to('homeWorkspace')).toBe('/home');
  });
});

describe('DESIGN V3.0 global menu — the rendered panel', () => {
  let host: HTMLDivElement;
  let root: Root;

  const open = async () => {
    await act(async () => {
      (host.querySelector('[data-testid="app-nav-trigger"]') as HTMLElement | null)?.click();
    });
  };

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'menu-owner', email: 'pro@pro.com', displayName: null },
      available: true,
    });
    useProCoreAccessStore.setState({ devPersona: 'pro' });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/pro/recipe']}>
          <AppShell>PRO</AppShell>
        </MemoryRouter>,
      );
    });
    await open();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useProCoreAccessStore.setState({ devPersona: null });
    useAuthStore.setState({ status: 'anon', user: null, available: true });
  });

  it('opens without the panel title and without the TRYB KONTA card', () => {
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('TRYB KONTA');
    expect(text).not.toContain('Tryb konta');
    expect(text).not.toContain('Gellatti Pro');
    expect(text).not.toContain('Gellatti Home');
  });

  it('carries no tutorial row — that action lives inside „Dlaczego to działa?”', () => {
    expect(document.querySelector('[data-testid="app-nav-restart-tutorial"]')).toBeNull();
    expect(document.body.textContent ?? '').not.toContain('Uruchom samouczek ponownie');
  });

  it('opens with Pro as the FIRST row of the list', () => {
    const rows = [...document.querySelectorAll('[data-testid^="app-nav-item-"]')];
    expect(rows[0]?.getAttribute('data-testid')).toBe('app-nav-item-proWorkspace');
    expect(rows[0]?.textContent).toBe('Pro');
  });

  it('keeps the account at the bottom and „Wyloguj się” as its own action', () => {
    const block = document.querySelector('[data-testid="app-nav-account-block"]');
    expect(block).not.toBeNull();
    const account = block!.querySelector('[data-testid="app-nav-account-link"]');
    const signOut = block!.querySelector('[data-testid="app-nav-signout"]');
    expect(account).not.toBeNull();
    expect(signOut).not.toBeNull();
    // two separate controls — clicking the account must never sign anybody out
    expect(account).not.toBe(signOut);
    expect(account!.getAttribute('href')).toBe('/account');
    expect(signOut!.textContent).toBe('Wyloguj się');
    expect(account!.textContent).toContain('pro@pro.com');
  });

  it('marks the current place and leaves the sticky header alone', () => {
    const current = document.querySelector('[data-testid^="app-nav-item-"][aria-current="page"]');
    expect(current?.getAttribute('data-testid')).toBe('app-nav-item-proWorkspace');
    const header = document.querySelector('.app-shell-header-row');
    expect(header?.classList.contains('sticky')).toBe(true);
  });
});
