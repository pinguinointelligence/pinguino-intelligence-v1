import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_NAV_ITEMS, visibleNavItems } from '@/features/shell/appNav';

const routerSource = readFileSync(new URL('../../app/router.tsx', import.meta.url), 'utf8');

/**
 * The public information architecture of the Affiliate programme.
 *
 * B05 removes Work With Us from the PRIMARY drawer; B06 keeps its route alive.
 * Those two pull in opposite directions, so both are pinned here — deleting the
 * route to "finish" the menu change would pass a menu-only test.
 */
describe('affiliate navigation', () => {
  it('B01 — the drawer carries a canonical Affiliate item for every audience', () => {
    const item = APP_NAV_ITEMS.find((entry) => entry.id === 'affiliate');
    expect(item).toBeDefined();
    expect(item?.label).toBe('Affiliate');
    expect(item?.to).toBe('/affiliate');
    expect(item?.group).toBe('ecosystem');
    for (const audience of ['guest', 'home', 'pro'] as const) {
      expect(visibleNavItems(audience).map((entry) => entry.id)).toContain('affiliate');
    }
  });

  it('B02 — /affiliate is a real route', () => {
    expect(routerSource).toContain('path="/affiliate"');
    expect(routerSource).toContain('<AffiliatePage />');
  });

  it('B05 — Work With Us is no longer in the primary drawer', () => {
    for (const audience of ['guest', 'home', 'pro'] as const) {
      expect(visibleNavItems(audience).map((entry) => entry.id)).not.toContain('workWithUs');
    }
    expect(APP_NAV_ITEMS.some((entry) => entry.to === '/work-with-us')).toBe(false);
  });

  it('B06 — the Work With Us route still exists and still resolves', () => {
    expect(routerSource).toContain('path="/work-with-us"');
    expect(routerSource).toContain('<WorkWithUsPage />');
  });

  it('B07 — Affiliate does not absorb the equipment lanes', () => {
    const page = readFileSync(
      new URL('../../pages/destinations/AffiliatePage.tsx', import.meta.url),
      'utf8',
    );
    for (const lane of ['/machines', '/mobile', '/trailer', '/franchise', '/work-with-us']) {
      expect(page).not.toContain(lane);
    }
    // …and the equipment lanes keep their own routes elsewhere.
    for (const lane of ['/machines', '/mobile', '/trailer', '/franchise']) {
      expect(routerSource).toContain(`path="${lane}"`);
    }
  });

  it('the Affiliate item is active on its own route only', () => {
    const item = APP_NAV_ITEMS.find((entry) => entry.id === 'affiliate');
    expect(item?.isActive({ pathname: '/affiliate', search: '' })).toBe(true);
    expect(item?.isActive({ pathname: '/work-with-us', search: '' })).toBe(false);
    expect(item?.isActive({ pathname: '/partner', search: '' })).toBe(false);
  });
});
