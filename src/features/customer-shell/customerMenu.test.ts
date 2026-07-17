import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_MENU_DIAGNOSTIC_ROUTE,
  CUSTOMER_MENU_ITEMS,
} from './customerMenu';

/**
 * Routes that exist in `src/app/router.tsx` and may be linked from the customer
 * navigation. Kept in sync with the router by hand — the test fails loudly if the
 * menu ever points somewhere outside this set. Slice A (owner-approved): `/` is
 * the public landing and the customer flow moved to `/start`.
 */
const REAL_ROUTES = new Set([
  '/',
  '/start',
  '/studio',
  '/recipes',
  '/my-recipes',
  '/label',
  '/subscription',
  '/classic',
]);

/** Destinations the prompt flagged as NOT existing — never link these. */
const NONEXISTENT_ROUTES = [
  '/production',
  '/production-history',
  '/costs',
  '/konto',
  '/pomoc',
];

describe('customer menu — links only real routes', () => {
  it('points every primary item at a route that exists', () => {
    for (const item of CUSTOMER_MENU_ITEMS) {
      expect(REAL_ROUTES.has(item.to)).toBe(true);
    }
  });

  it('never links a known-nonexistent route', () => {
    const targets = CUSTOMER_MENU_ITEMS.map((i) => i.to);
    for (const bad of NONEXISTENT_ROUTES) {
      expect(targets).not.toContain(bad);
    }
  });

  it('keeps /classic as the diagnostic link, not a primary item', () => {
    expect(CUSTOMER_MENU_DIAGNOSTIC_ROUTE).toBe('/classic');
    expect(CUSTOMER_MENU_ITEMS.map((i) => i.to)).not.toContain('/classic');
  });

  // Slice A: the landing took over `/` and the flow moved to `/start`, so the
  // menu now carries seven destinations — landing first, then the flow entry.
  it('covers exactly the seven expected destinations in order', () => {
    expect(CUSTOMER_MENU_ITEMS.map((i) => i.to)).toEqual([
      '/',
      '/start',
      '/studio',
      '/recipes',
      '/my-recipes',
      '/label',
      '/subscription',
    ]);
  });
});
