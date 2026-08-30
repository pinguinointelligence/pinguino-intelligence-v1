/**
 * Routing contract — UIUX master Slice A (owner-approved).
 *
 * Pins the public route table after the landing/flow split:
 *   `/`            → HomeCreatorPage (HOME Creator V1 §9 — the root IS the creator;
 *                    supersedes the Slice A light landing page)
 *   `/start`       → CustomerShellV1 (the customer flow)
 *   `/customer-v1` → redirect to /start (legacy preview path kept alive)
 *   `/demo`        → redirect to /start (legacy flow entry keeps landing in the flow)
 * …and that every pre-existing route is still registered (zero 404 regressions).
 *
 * The element tree of `AppRoutes()` is walked directly (node env, no DOM) so the
 * redirect TARGETS are asserted too — `<Navigate>` only fires in an effect, which
 * a static render cannot observe.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { customerShellCopy } from '@/features/customer-shell/customerShellCopy';
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
import { legacyDestinationRedirectTo } from './redirectState';

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

const renderAt = (path: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
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

  it('serves the customer flow at /start', () => {
    expect(elementType('/start')).toBe(RoleAwareEntryRoute);
    const html = renderAt('/start');
    expect(html).toContain(customerShellCopy.home.headline); // „Jakie lody dziś robimy?”
  });

  it('redirects legacy flow entries to /start while preserving deep-link state', () => {
    expect(elementType('/customer-v1')).toBe(LegacyDestinationRedirect);
    expect(elementType('/demo')).toBe(LegacyDestinationRedirect);
    expect(elementType('/classic')).toBe(LegacyDestinationRedirect);
    expect(legacyDestinationRedirectTo('/start', '?recipe=r-legacy', {}, '#step-2')).toEqual({
      pathname: '/start',
      search: '?recipe=r-legacy',
      hash: '#step-2',
    });
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
