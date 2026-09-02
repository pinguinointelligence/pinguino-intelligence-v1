/**
 * Admin is Gellatti too — design contracts for the operational workspace.
 *
 * Admin may be denser than a customer page, but it may not look like a
 * different product. These pin the things that had actually drifted: English
 * navigation in a Polish product, raw storage shapes printed into cells, and
 * per-section table/heading systems invented from scratch.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatMarketPreferences } from './adminUi';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('admin market preferences never leak the storage shape', () => {
  it('renders an em dash instead of an empty object', () => {
    // This is the defect the served capture caught: every row printed „{}".
    expect(formatMarketPreferences({})).toBe('—');
    expect(formatMarketPreferences(null)).toBe('—');
    expect(formatMarketPreferences(undefined)).toBe('—');
    expect(formatMarketPreferences('')).toBe('—');
    expect(formatMarketPreferences([])).toBe('—');
  });

  it('reads market data as text, never as JSON', () => {
    expect(formatMarketPreferences({ pl: 'active' })).toBe('PL active');
    expect(formatMarketPreferences({ pl: 'active', es: 'paused' })).toBe('PL active · ES paused');
    expect(formatMarketPreferences(['PL', 'ES'])).toBe('PL, ES');
    for (const value of [{}, { pl: 'active' }, ['PL']]) {
      expect(formatMarketPreferences(value)).not.toContain('{');
      expect(formatMarketPreferences(value)).not.toContain('"');
    }
  });
});

describe('admin speaks the product language', () => {
  it('labels its navigation in Polish', () => {
    const page = read('pages', 'admin', 'AdminWorkspacePage.tsx');
    for (const label of [
      'Przegląd',
      'Użytkownicy',
      'Sklep i zamówienia',
      'Partnerzy',
      'Zapytania Franchise',
      'Dziennik zdarzeń',
      'Ustawienia Admina',
    ]) {
      expect(page).toContain(label);
    }
    // The English labels that used to sit against Polish section content.
    for (const stale of [
      "'Overview'",
      "'Users'",
      "'Shop & orders'",
      "'Franchise leads'",
      "'Audit log'",
      "'Admin settings'",
    ]) {
      expect(page).not.toContain(stale);
    }
  });

  it('keeps every /admin route id unchanged, so deep links still resolve', () => {
    const page = read('pages', 'admin', 'AdminWorkspacePage.tsx');
    for (const id of [
      'overview',
      'customer-added-products',
      'product-requests',
      'catalog',
      'users',
      'revenue',
      'shop',
      'partners',
      'community',
      'franchise',
      'operations',
      'audit',
      'settings',
    ]) {
      expect(page).toContain(`'${id}'`);
    }
  });
});

describe('admin uses one table and one heading system', () => {
  it('builds its tables from the shared recipes, not per-section styles', () => {
    const users = read('features', 'admin', 'AdminUsersSection.tsx');
    expect(users).toContain('ADMIN_TABLE');
    expect(users).toContain('AdminTableCard');
    expect(users).not.toContain('bg-stone-50');
    expect(users).not.toContain('border-ink/15');
  });

  it('carries the approved title scale rather than a section-local one', () => {
    const users = read('features', 'admin', 'AdminUsersSection.tsx');
    expect(users).toContain('font-[750]');
    expect(users).toContain('tracking-[-0.04em]');
    expect(users).not.toContain('text-3xl');
  });

  it('draws hairlines and panels from the design tokens', () => {
    const ui = read('features', 'admin', 'adminUi.tsx');
    expect(ui).toContain('var(--g-line)');
    expect(ui).toContain('var(--g-ivory)');
    expect(ui).toContain('var(--g-control-radius)');
    expect(ui).not.toContain('#f3ede3');
  });
});

describe('every admin section speaks the same visual language', () => {
  const sections = [
    'AdminCatalogSection',
    'AdminCommunitySection',
    'AdminCustomerAddedProductsSection',
    'AdminFranchiseLeadsSection',
    'AdminInvitesSection',
    'AdminPartnerApplicationsPanel',
    'AdminPartnersSection',
    'AdminProductCapabilityReanalysisDetail',
    'AdminShopSection',
    'AdminUsersSection',
  ];

  it('carries no section-local heading scale', () => {
    for (const name of sections) {
      expect(read('features', 'admin', `${name}.tsx`)).not.toContain('text-3xl');
    }
  });

  it('draws hairlines and muted text from tokens, not ad-hoc alphas', () => {
    for (const name of sections) {
      const source = read('features', 'admin', `${name}.tsx`);
      expect(source).not.toContain('border-ink/');
      expect(source).not.toContain('text-stone-');
      expect(source).not.toContain('bg-stone-50');
    }
  });

  it('holds no hand-picked hex — the palette is the token set', () => {
    for (const name of sections) {
      const source = read('features', 'admin', `${name}.tsx`);
      // #f3ede3 (a second ivory), #b3261e (a Material red) and #ef8708
      // (a near-miss orange next to the real --g-orange) all lived here.
      expect(source).not.toMatch(/#[0-9a-f]{6}/i);
    }
  });
});

describe('the admin workspace shell itself is on the palette', () => {
  it('carries no legacy palette classes or raw hex', () => {
    const page = read('pages', 'admin', 'AdminWorkspacePage.tsx');
    expect(page).not.toMatch(/text-stone-\d/);
    expect(page).not.toMatch(/border-ink\/\d/);
    expect(page).not.toContain('bg-stone-50');
    // #f3ede3 was a second ivory living beside --g-ivory on a detail panel.
    expect(page).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it('uses the approved title scale in its detail screens', () => {
    const page = read('pages', 'admin', 'AdminWorkspacePage.tsx');
    // The retired HEADING pattern, not any large size: the overview's headline
    // figures legitimately stay big and mono (`font-mono text-3xl tabular-nums`),
    // which is a number, not a title.
    expect(page).not.toContain('text-3xl font-semibold');
    // The shell renders no page title of its own — each section owns its
    // heading, and those are pinned above.
  });
});
