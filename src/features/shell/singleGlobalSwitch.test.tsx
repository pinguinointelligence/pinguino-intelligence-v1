/** @vitest-environment jsdom */
/**
 * EXACTLY ONE ACCESSIBLE HOME | PRO SWITCH — owner contract, 2026-09-02.
 *
 * The header used to render a responsive PAIR whose copies were hidden with
 * `hidden` / `xl:hidden`. Served measurement on staging 8dd11c9b found the hidden copy
 * still present as a zero-width `[role=tablist]`, so a screen reader met two HOME and
 * two PRO tabs. Visual exclusivity is not exclusivity.
 *
 * The contract is per ROUTE, not merely "no duplicates": a route with ZERO switches
 * fails just as hard as one with two.
 */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomeProSwitch } from '@/features/home-creator/ui/HomeProSwitch';
import type { ViewEntitlement } from '@/features/home-creator/homeViewMode';

const shell = readFileSync('src/features/shell/AppShell.tsx', 'utf8');

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (entitlement: ViewEntitlement, activeView: 'home' | 'pro' | null) => {
  act(() => {
    root.render(
      <MemoryRouter>
        <HomeProSwitch entitlement={entitlement} activeView={activeView} />
      </MemoryRouter>,
    );
  });
  return host;
};

describe('the shell renders the switch once', () => {
  it('has exactly one globalSwitch render site', () => {
    expect((shell.match(/\{globalSwitch\}/g) ?? []).length).toBe(1);
  });

  it('no longer hides a duplicate with CSS', () => {
    // Strip JSX comments first: the explanatory note names the classes it removed, and
    // an assertion that trips on its own documentation teaches people to delete the note.
    const markup = shell
      .slice(shell.indexOf('<header'), shell.indexOf('</header>'))
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(markup).not.toContain('hidden xl:flex');
    expect(markup).not.toContain('xl:hidden');
  });

  it('leaves no empty trailing group behind', () => {
    const markup = shell.slice(shell.indexOf('<header'), shell.indexOf('</header>'));
    expect(markup).not.toContain('flex-wrap items-center justify-end');
  });
});

describe('every route state renders one tablist with two tabs', () => {
  const ROUTES: ReadonlyArray<{
    route: string;
    activeView: 'home' | 'pro' | null;
    expectActive: string | null;
  }> = [
    { route: 'HOME', activeView: 'home', expectActive: 'HOME' },
    { route: 'PRO', activeView: 'pro', expectActive: 'PRO' },
    { route: 'Shop', activeView: null, expectActive: null },
    { route: 'Work With Us', activeView: null, expectActive: null },
  ];

  const ENTITLEMENTS: ReadonlyArray<{ name: string; value: ViewEntitlement }> = [
    { name: 'anonymous', value: { authed: false, canHome: false, canPro: false } },
    { name: 'HOME-only', value: { authed: true, canHome: true, canPro: false } },
    { name: 'PRO', value: { authed: true, canHome: false, canPro: true } },
    { name: 'dual', value: { authed: true, canHome: true, canPro: true } },
  ];

  for (const ent of ENTITLEMENTS) {
    for (const r of ROUTES) {
      it(`${r.route} / ${ent.name}: one tablist, two tabs, correct active segment`, () => {
        const el = mount(ent.value, r.activeView);
        const lists = el.querySelectorAll('[role="tablist"]');
        const tabs = [...el.querySelectorAll('[role="tab"]')];
        // Never zero: a route without a switch fails the contract too.
        expect(lists).toHaveLength(1);
        expect(tabs).toHaveLength(2);
        expect(tabs.map((t) => t.textContent?.trim())).toEqual(['HOME', 'PRO']);

        const active = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
        if (r.expectActive === null) {
          expect(active).toHaveLength(0);
        } else {
          expect(active).toHaveLength(1);
          expect(active[0]!.textContent?.trim()).toBe(r.expectActive);
        }
      });
    }
  }
});
