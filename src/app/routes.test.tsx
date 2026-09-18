/**
 * Routing contract — UIUX master Slice A (owner-approved).
 *
 * Pins the public route table after the landing/flow split:
 *   `/`            → HomeCreatorPage (HOME Creator V1 §9 — the root IS the creator;
 *                    supersedes the Slice A light landing page)
 *   `/home`        → HomeCreatorPage (the canonical customer HOME)
 *   `/start`       → redirect to /home (owner 2026-09-18 — no longer its own flow)
 *   `/classic`     → redirect to /home
 *   `/demo`        → redirect to /home
 *   `/customer-v1` → redirect to /home (legacy preview path kept alive)
 * …and that CustomerShellV1 is not reachable from ANY route.
 * …and that every pre-existing route is still registered (zero 404 regressions).
 *
 * The element tree of `AppRoutes()` is walked directly (node env, no DOM) so the
 * redirect TARGETS are asserted too — `<Navigate>` only fires in an effect, which
 * a static render cannot observe.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { RoleAwareEntryRoute } from '@/features/auth/RoleAwareEntryRoute';
import { HomeSubscriberProRedirect } from '@/features/home-creator/HomeSubscriberProRedirect';
import { homeCreatorCopy } from '@/features/home-creator/homeCreatorCopy';
import { ProWorkspacePage } from '@/pages/pro/ProWorkspacePage';
import { MachineProfilePage } from '@/pages/profile/MachineProfilePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { landingCopy } from '@/pages/landing/landingCopy';
import {
  AppRoutes,
  LegacyDestinationRedirect,
  LegacyStudioRedirect,
  PRO_RECIPE_PATH,
  studioRedirectTo,
} from './router';
import { CUSTOMER_HOME_PATH, legacyDestinationRedirectTo } from './redirectState';

/* ------------------------------------------------------------- helpers -- */

interface RouteEntry {
  path: string | undefined;
  element: ReactNode;
}

/** Flatten the <Routes> tree into { path, element } entries. */
function collectRoutes(node: ReactNode, acc: RouteEntry[] = []): RouteEntry[] {
  if (Array.isArray(node)) {
    for (const child of node) collectRoutes(child, acc);
    return acc;
  }
  if (!isValidElement(node)) return acc;
  const el = node as ReactElement<{ path?: string; element?: ReactNode; children?: ReactNode }>;
  if (el.props.path !== undefined || el.props.element !== undefined) {
    acc.push({ path: el.props.path, element: el.props.element });
  }
  collectRoutes(el.props.children, acc);
  return acc;
}

const routes = collectRoutes(
  (AppRoutes() as ReactElement<{ children?: ReactNode }>).props.children,
);
const byPath = new Map(routes.map((r) => [r.path, r.element]));

const elementType = (path: string): unknown =>
  isValidElement(byPath.get(path)) ? (byPath.get(path) as ReactElement).type : undefined;

/**
 * The real app wraps routes in `AppProviders`, which supplies a QueryClient. This
 * harness renders `AppRoutes` on its own, so it must supply one too — the HOME Creator
 * legitimately uses the canonical recipe-save hook, which is a react-query consumer.
 * Making the harness match the app is not the same as loosening the page's needs.
 */
const renderAt = (path: string) =>
  renderToStaticMarkup(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );

/* --------------------------------------------------------------- tests -- */

describe('Slice A routing contract', () => {
  /**
   * OWNER SUPERSESSION — HOME Creator V1 §9 (2026-08-30): "www.gellatti.com must open
   * directly into HOME Creator. No traditional marketing landing page before the
   * product." This test previously asserted the Slice A landing hero at `/`; it now
   * asserts the creator, which is the same contract updated to the current owner
   * decision rather than a weakened one — the root is still pinned to an exact page.
   */
  it('serves the HOME Creator at the public root (§9)', () => {
    expect(elementType('/')).toBe(RoleAwareEntryRoute);
    const html = renderAt('/');
    expect(html).toContain(homeCreatorCopy.intent.question);
    expect(html).toContain('data-testid="home-creator"');
    // No marketing landing page stands between a visitor and the product.
    expect(html).not.toContain(landingCopy.hero.headline);
  });

  it('serves the HOME Creator at the canonical /home', () => {
    expect(CUSTOMER_HOME_PATH).toBe('/home');
    expect(elementType(CUSTOMER_HOME_PATH)).toBe(RoleAwareEntryRoute);
    const html = renderAt(CUSTOMER_HOME_PATH);
    expect(html).toContain(homeCreatorCopy.intent.question);
    expect(html).toContain('data-testid="home-creator"');
  });

  it('sends /start and every legacy alias to /home, preserving deep-link state', () => {
    for (const path of ['/start', '/classic', '/demo', '/customer-v1']) {
      expect(elementType(path), path).toBe(LegacyDestinationRedirect);
      // The redirect ELEMENT carries the target; <Navigate> only fires in an
      // effect, so a static render cannot observe it — read the prop instead.
      const element = byPath.get(path) as ReactElement<{ pathname?: string }>;
      expect(element.props.pathname, path).toBe(CUSTOMER_HOME_PATH);
    }
    expect(
      legacyDestinationRedirectTo(CUSTOMER_HOME_PATH, '?recipe=r-legacy', {}, '#step-2'),
    ).toEqual({
      pathname: '/home',
      search: '?recipe=r-legacy',
      hash: '#step-2',
    });
  });

  it('retires CustomerShellV1: no route renders it, and none can (owner 2026-09-18)', () => {
    // 1. Nothing in the route table IS the shell…
    for (const [path, element] of byPath) {
      const type = isValidElement(element) ? (element as ReactElement).type : undefined;
      const name = typeof type === 'function' ? type.name : String(type);
      expect(name, `route ${path}`).not.toBe('CustomerShellV1');
    }
    // 2. …and the entry component that used to mount it no longer can: the
    //    `start` entry is gone from the union, so `/` and `/home` are the only
    //    entries and both render the creator. (The headline is NOT a usable
    //    discriminator — the creator asks the same „Jakie lody dziś robimy?” —
    //    so assert on the creator's own test id.)
    for (const path of ['/', CUSTOMER_HOME_PATH]) {
      expect(renderAt(path), path).toContain('data-testid="home-creator"');
    }
    // 3. The route layer no longer imports the shell, and the entry union no
    //    longer has a `start` member for a future edit to point back at it.
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
    // Match the IMPORT, not the prose: both files still explain the retirement
    // in a comment, and a doc mention must not fail this check.
    const IMPORTS_SHELL = /^\s*import\s[^;]*\bCustomerShellV1\b/m;
    expect(read('src/features/auth/RoleAwareEntryRoute.tsx')).not.toMatch(IMPORTS_SHELL);
    expect(read('src/app/router.tsx')).not.toMatch(IMPORTS_SHELL);
    expect(read('src/features/auth/roleAwareEntry.ts')).toContain(
      "export type RoleAwareEntry = 'root' | 'home';",
    );
  });

  it('sends /studio and /calculator into the canonical PINGÜINO Pro recipe editor (owner P0)', () => {
    // /studio is a query-preserving redirect component (NOT the legacy Studio editor)…
    expect(elementType('/studio')).toBe(LegacyStudioRedirect);
    expect(studioRedirectTo('?draft=abc', '#ingredient-2')).toEqual({
      pathname: PRO_RECIPE_PATH,
      search: '?draft=abc',
      hash: '#ingredient-2',
    });
    // …and /calculator preserves deep-link state on the canonical editor path.
    expect(elementType('/calculator')).toBe(LegacyDestinationRedirect);
    expect(legacyDestinationRedirectTo(PRO_RECIPE_PATH, '?draft=abc')).toEqual({
      pathname: PRO_RECIPE_PATH,
      search: '?draft=abc',
      hash: '',
    });
    expect(PRO_RECIPE_PATH).toBe('/pro/recipe');
    // The legacy Studio page is gone from the route table entirely.
    for (const [, element] of byPath) {
      const type = isValidElement(element) ? (element as ReactElement).type : undefined;
      const name = typeof type === 'function' ? type.name : String(type);
      expect(name).not.toBe('StudioPage');
    }
  });

  it('registers the PINGÜINO Pro workspace at /pro AND every stable /pro/<section> URL', () => {
    // §13 wraps the workspace so a HOME subscriber is redirected to the matching
    // HOME location instead of an upgrade wall. The workspace itself is unchanged and
    // still the element that renders for everyone else.
    expect(elementType('/pro')).toBe(HomeSubscriberProRedirect);
    expect(elementType('/pro/:section')).toBe(HomeSubscriberProRedirect);
    // The workspace is still the page that renders for everyone the guard passes.
    expect(HomeSubscriberProRedirect.name).toBe('HomeSubscriberProRedirect');
    expect(ProWorkspacePage.name).toBe('ProWorkspacePage');
  });

  it('registers the canonical plan hubs and keeps legacy addresses as redirects', () => {
    expect(elementType('/home')).toBe(RoleAwareEntryRoute);
    expect(elementType('/machine')).toBe(MachineProfilePage);
    for (const path of [
      '/products',
      '/products/scan',
      '/production',
      '/account',
      '/how-it-works',
      '/shop',
      '/franchise',
    ]) {
      expect(byPath.has(path), path).toBe(true);
    }
    for (const path of [
      '/my-recipes',
      '/profile/machine',
      '/pro/machine',
      '/pro/settings',
      '/pro/history',
      '/label',
    ]) {
      expect(elementType(path)).toBe(LegacyDestinationRedirect);
    }
  });

  it('preserves incoming recipe/session query state through every canonical legacy redirect', () => {
    expect(
      legacyDestinationRedirectTo('/recipes', '?recipe=r-1&tab=old', { tab: 'mine' }, '#line-2'),
    ).toEqual({
      pathname: '/recipes',
      search: '?recipe=r-1&tab=mine',
      hash: '#line-2',
    });
    expect(
      legacyDestinationRedirectTo('/production', '?session=run-7&tab=old', {
        tab: 'history',
      }),
    ).toEqual({
      pathname: '/production',
      search: '?session=run-7&tab=history',
      hash: '',
    });
    expect(
      legacyDestinationRedirectTo('/production', '?session=run-8&label=active', {
        tab: 'labels',
      }),
    ).toEqual({
      pathname: '/production',
      search: '?session=run-8&label=active&tab=labels',
      hash: '',
    });
    expect(legacyDestinationRedirectTo('/machine', '?recipe=r-2')).toMatchObject({
      pathname: '/machine',
      search: '?recipe=r-2',
    });
    expect(legacyDestinationRedirectTo('/account', '?returnTo=recipe')).toMatchObject({
      pathname: '/account',
      search: '?returnTo=recipe',
    });
  });

  it('keeps every pre-existing public route registered (zero 404 regressions)', () => {
    for (const path of [
      '/classic',
      '/studio',
      '/recipes',
      '/my-recipes',
      '/label',
      '/api',
      '/work-with-us',
      '/subscription',
      '/create-ingredient',
      '/products/import',
    ]) {
      expect(byPath.has(path), `route missing: ${path}`).toBe(true);
    }
    // Catch-all stays the NotFound page.
    expect(elementType('*')).toBe(NotFoundPage);
  });
});
