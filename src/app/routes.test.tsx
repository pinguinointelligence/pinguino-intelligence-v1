/**
 * Routing contract — UIUX master Slice A (owner-approved).
 *
 * Pins the public route table after the landing/flow split:
 *   `/`            → LandingPage (light public landing, spec §6)
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
import { MemoryRouter, Navigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { CustomerShellV1 } from '@/features/customer-shell/CustomerShellV1';
import { customerShellCopy } from '@/features/customer-shell/customerShellCopy';
import { LandingPage } from '@/pages/landing/LandingPage';
import { ProWorkspacePage } from '@/pages/pro/ProWorkspacePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { landingCopy } from '@/pages/landing/landingCopy';
import { AppRoutes, LegacyStudioRedirect, PRO_RECIPE_PATH } from './router';

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

const routes = collectRoutes((AppRoutes() as ReactElement<{ children?: ReactNode }>).props.children);
const byPath = new Map(routes.map((r) => [r.path, r.element]));

const elementType = (path: string): unknown =>
  isValidElement(byPath.get(path)) ? (byPath.get(path) as ReactElement).type : undefined;

const redirectTarget = (path: string): string | undefined => {
  const el = byPath.get(path);
  if (!isValidElement(el) || el.type !== Navigate) return undefined;
  return (el as ReactElement<{ to?: string }>).props.to;
};

const renderAt = (path: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

/* --------------------------------------------------------------- tests -- */

describe('Slice A routing contract', () => {
  it('serves the light landing page at the public root', () => {
    expect(elementType('/')).toBe(LandingPage);
    const html = renderAt('/');
    expect(html).toContain(landingCopy.hero.headline);
    expect(html).toContain('href="/start"');
  });

  it('serves the customer flow at /start', () => {
    expect(elementType('/start')).toBe(CustomerShellV1);
    const html = renderAt('/start');
    expect(html).toContain(customerShellCopy.home.headline); // „Jakie lody dziś robimy?”
  });

  it('redirects the legacy /customer-v1 and /demo entries to /start (replace)', () => {
    expect(redirectTarget('/customer-v1')).toBe('/start');
    expect(redirectTarget('/demo')).toBe('/start');
  });

  it('sends /studio and /calculator into the canonical PINGÜINO Pro recipe editor (owner P0)', () => {
    // /studio is a query-preserving redirect component (NOT the legacy Studio editor)…
    expect(elementType('/studio')).toBe(LegacyStudioRedirect);
    // …and /calculator goes straight to the canonical editor path.
    expect(redirectTarget('/calculator')).toBe(PRO_RECIPE_PATH);
    expect(PRO_RECIPE_PATH).toBe('/pro/recipe');
    // The legacy Studio page is gone from the route table entirely.
    for (const [, element] of byPath) {
      const type = isValidElement(element) ? (element as ReactElement).type : undefined;
      const name = typeof type === 'function' ? type.name : String(type);
      expect(name).not.toBe('StudioPage');
    }
  });

  it('registers the PINGÜINO Pro workspace at /pro AND every stable /pro/<section> URL', () => {
    expect(elementType('/pro')).toBe(ProWorkspacePage);
    expect(elementType('/pro/:section')).toBe(ProWorkspacePage);
  });

  it('registers the Slice B machine profile page at /profile/machine', () => {
    expect(byPath.has('/profile/machine')).toBe(true);
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
