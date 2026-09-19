// @vitest-environment jsdom
/**
 * DESIGN V3.0 — the drawer's FIRST ROW names the workspace you are in.
 *
 * Served staging showed a Pro subscriber „Pro" while they were working in HOME,
 * with no row marked current, because the row was derived from the plan
 * (`canUseProductionMode`) rather than from where they are. Entitlement still
 * decides what may be SEEN; only this one row follows the location.
 *
 *   /home, /        → „Home", current
 *   /pro/...        → „Pro",  current
 *
 * A HOME subscriber never gets the Pro row — they are not entitled to it — so
 * the gating story is unchanged.
 */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '@/features/shell/AppShell';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useAuthStore } from '@/stores/authStore';
import { activeNavId, visibleNavItems } from './appNav';

const loc = (pathname: string, search = '') => ({ pathname, search });
const labels = (audience: 'home' | 'pro', at?: { pathname: string; search: string }) =>
  visibleNavItems(audience, at).map((item) => item.label);

describe('the first row follows the workspace, not the plan — the data', () => {
  it('A · a Pro subscriber on /home reads Home, and Home is current', () => {
    expect(labels('pro', loc('/home'))[0]).toBe('Home');
    expect(labels('pro', loc('/home'))).not.toContain('Pro');
    expect(activeNavId(loc('/home'), 'pro')).toBe('homeWorkspace');
  });

  it('B · the same subscriber inside the Pro workspace reads Pro, and Pro is current', () => {
    expect(labels('pro', loc('/pro/recipe'))[0]).toBe('Pro');
    expect(labels('pro', loc('/pro/recipe'))).not.toContain('Home');
    expect(activeNavId(loc('/pro/recipe'), 'pro')).toBe('proWorkspace');
    // every Pro workspace tab keeps naming Pro
    for (const tab of ['/pro', '/pro/monitor', '/pro/versions', '/pro/production', '/pro/tools']) {
      expect(labels('pro', loc(tab))[0], tab).toBe('Pro');
    }
  });

  it('C · a Home subscriber reads Home and is never offered the Pro row', () => {
    expect(labels('home', loc('/home'))[0]).toBe('Home');
    expect(activeNavId(loc('/home'), 'home')).toBe('homeWorkspace');
    for (const at of ['/home', '/', '/shop', '/pro/recipe']) {
      expect(labels('home', loc(at)), at).not.toContain('Pro');
    }
  });

  it('F · nothing else about the menu moves', () => {
    const tail = ['Receptury', 'Dlaczego to działa?', 'Produkcja', 'Sklep', 'Affiliate', 'Franchise', 'Pomoc'];
    expect(labels('pro', loc('/home')).slice(1)).toEqual(tail);
    expect(labels('pro', loc('/pro/recipe')).slice(1)).toEqual(tail);
    expect(labels('home', loc('/home')).slice(1)).toEqual(tail);
  });

  it('G · Community, the tutorial row and Plany stay out of the signed-in menu', () => {
    for (const audience of ['home', 'pro'] as const) {
      for (const at of ['/home', '/pro/recipe']) {
        const list = labels(audience, loc(at));
        for (const gone of ['Community', 'Plany', 'Uruchom samouczek ponownie']) {
          expect(list, `${audience} ${at}`).not.toContain(gone);
        }
      }
    }
  });

  it('keeps the entitlement contract intact when no location is given', () => {
    // the owner-locked and products contracts call it this way
    expect(visibleNavItems('pro').filter((item) => item.workspaceHome)).toHaveLength(1);
    expect(visibleNavItems('pro').map((item) => item.id)[0]).toBe('proWorkspace');
    expect(visibleNavItems('home').filter((item) => item.workspaceHome)).toHaveLength(1);
    expect(visibleNavItems('guest').filter((item) => item.workspaceHome)).toHaveLength(0);
  });
});

let go: ((to: string) => void) | null = null;
function NavProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    go = (to: string) => navigate(to);
    return () => { go = null; };
  }, [navigate]);
  return null;
}

describe('the first row follows the workspace — in the rendered drawer', () => {
  let host: HTMLDivElement;
  let root: Root;

  const openDrawer = async () => {
    await act(async () => {
      (host.querySelector('[data-testid="app-nav-trigger"]') as HTMLElement | null)?.click();
    });
  };
  const closeDrawer = async () => {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
  };
  const firstRow = () => {
    const row = document.querySelector('[data-testid^="app-nav-item-"]');
    return { testid: row?.getAttribute('data-testid'), text: row?.textContent, current: row?.getAttribute('aria-current') };
  };

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'row-owner', email: 'pro@pro.com', displayName: null },
      available: true,
    });
    useProCoreAccessStore.setState({ devPersona: 'pro' });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/pro/recipe']}>
          <NavProbe />
          <AppShell>workspace</AppShell>
        </MemoryRouter>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useProCoreAccessStore.setState({ devPersona: null });
    useAuthStore.setState({ status: 'anon', user: null, available: true });
  });

  it('B · renders Pro, current, inside the Pro workspace', async () => {
    await openDrawer();
    expect(firstRow()).toEqual({ testid: 'app-nav-item-proWorkspace', text: 'Pro', current: 'page' });
  });

  it('D · PRO → HOME changes the row to Home with no reload and no stale state', async () => {
    await openDrawer();
    expect(firstRow().text).toBe('Pro');
    await closeDrawer();
    await act(async () => { go?.('/home'); });
    await openDrawer();
    expect(firstRow()).toEqual({ testid: 'app-nav-item-homeWorkspace', text: 'Home', current: 'page' });
    // and the old row is genuinely gone, not merely unhighlighted
    expect(document.querySelector('[data-testid="app-nav-item-proWorkspace"]')).toBeNull();
  });

  it('E · HOME → PRO changes it back', async () => {
    await act(async () => { go?.('/home'); });
    await openDrawer();
    expect(firstRow().text).toBe('Home');
    await closeDrawer();
    await act(async () => { go?.('/pro/recipe'); });
    await openDrawer();
    expect(firstRow()).toEqual({ testid: 'app-nav-item-proWorkspace', text: 'Pro', current: 'page' });
    expect(document.querySelector('[data-testid="app-nav-item-homeWorkspace"]')).toBeNull();
  });

  it('leaves the sticky header and the drawer z-order alone', async () => {
    await openDrawer();
    const header = document.querySelector('.app-shell-header-row');
    expect(header?.classList.contains('sticky')).toBe(true);
  });
});
