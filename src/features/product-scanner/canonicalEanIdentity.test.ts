import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  conflictingSharedProducts,
  resolveCanonicalEanIdentity,
  type EanProductRow,
} from './canonicalEanIdentity';

/*
  THE OWNER'S 2026-09-07 SPLIT, AS DATA.

  EAN 8402001042911, both rows Cola Zero / Hacendado, identical in all four code columns:

    PM-ING-007193  customer_provisional  account_private  home@home.com   73.4  REVIEW
    PR-ING-007197  commercial_product    shared           (null)          94.12 BASE_READY

  and one variant row — the EAN index is UNIQUE regardless of `is_current`, so there is exactly
  one, ever — still addressing the PM. Measured consequence, replayed through the deployed
  lookup's own query:

    home@home.com            -> PM-ING-007193 @ 73.4 / REVIEW   (never sees the better shared row)
    pro@pro.com              -> null -> full path
    a third account          -> null -> full path

  The shared BASE_READY product was unaddressable by anybody.
*/
const HOME = 'cad05017-9efc-4cc5-ac77-842839db2061';
const PRO = '4ebc6ec7-b17d-4cd8-8a2d-457280738d6f';
const THIRD = 'e10ea1b3-6c5a-43b7-9173-a9a8baa43f15';

const PM: EanProductRow = {
  id: 'pm-7193',
  product_code: 'PM-ING-007193',
  product_kind: 'customer_provisional',
  visibility: 'account_private',
  owner_user_id: HOME,
  is_active: true,
  merged_into_product_id: null,
};
const PR: EanProductRow = {
  id: 'pr-7197',
  product_code: 'PR-ING-007197',
  product_kind: 'commercial_product',
  visibility: 'shared',
  owner_user_id: null,
  is_active: true,
  merged_into_product_id: null,
};

describe('one exact EAN resolves to one canonical product, for every account', () => {
  it('gives all three accounts the same shared product', () => {
    for (const actor of [HOME, PRO, THIRD]) {
      const seen = resolveCanonicalEanIdentity([PM, PR], actor, PM.id);
      expect(seen.canonical?.product_code, actor).toBe('PR-ING-007197');
      expect(seen.reason).toBe('canonical_shared_product');
    }
  });

  it('never hands the owner the worse private row as the product again', () => {
    const home = resolveCanonicalEanIdentity([PM, PR], HOME, PM.id);
    expect(home.canonical?.product_code).toBe('PR-ING-007197');
    // …while keeping their own row reachable, beside it.
    expect(home.privateOverlay?.product_code).toBe('PM-ING-007193');
  });

  it('never exposes one customer’s private overlay to anybody else', () => {
    for (const actor of [PRO, THIRD, null]) {
      expect(resolveCanonicalEanIdentity([PM, PR], actor, PM.id).privateOverlay).toBeNull();
    }
  });

  it('reports that the single variant row is addressing the wrong product', () => {
    // The EAN index is unique regardless of is_current, so this is a RE-POINT, never a second row.
    expect(resolveCanonicalEanIdentity([PM, PR], HOME, PM.id).variantNeedsRepoint).toBe(true);
    expect(resolveCanonicalEanIdentity([PM, PR], HOME, PR.id).variantNeedsRepoint).toBe(false);
  });

  it('leaves a private product alone while no shared product exists', () => {
    // Contract point 3: until a PR exists, the variant may legitimately address a private PM.
    const home = resolveCanonicalEanIdentity([PM], HOME, PM.id);
    expect(home.canonical?.product_code).toBe('PM-ING-007193');
    expect(home.reason).toBe('own_private_product_only');
    expect(home.variantNeedsRepoint).toBe(false);
  });

  it('gives another account nothing when only a foreign private row exists', () => {
    const pro = resolveCanonicalEanIdentity([PM], PRO, PM.id);
    expect(pro.canonical).toBeNull();
    expect(pro.privateOverlay).toBeNull();
    expect(pro.reason).toBe('foreign_private_product_only');
  });

  it('ignores merged and inactive rows entirely', () => {
    const merged: EanProductRow = { ...PR, id: 'pr-old', merged_into_product_id: 'pr-7197' };
    const dead: EanProductRow = { ...PR, id: 'pr-dead', is_active: false };
    const seen = resolveCanonicalEanIdentity([merged, dead, PM, PR], PRO, PM.id);
    expect(seen.canonical?.id).toBe('pr-7197');
  });

  it('SOL-052: never treats a blocked/quarantined shared row as the exact product', () => {
    const quarantined = {
      ...PR,
      canonical_verification_status: 'blocked',
    } as EanProductRow & { canonical_verification_status: string };
    const seen = resolveCanonicalEanIdentity([quarantined], PRO, quarantined.id);
    expect(seen.canonical).toBeNull();
    expect(seen.reason).toBe('no_product');
  });

  it("falls back to the caller's own PM when the shared identity is non-publishable", () => {
    const generic = {
      ...PR,
      canonical_verification_status: 'verified',
      publication_identity_eligible: false,
    };
    const seen = resolveCanonicalEanIdentity([PM, generic], HOME, generic.id);
    expect(seen.canonical?.id).toBe(PM.id);
    expect(seen.reason).toBe('own_private_product_only');
    expect(seen.variantNeedsRepoint).toBe(false);
  });

  it('does not silently pick between two shared rows for one EAN', () => {
    const second: EanProductRow = { ...PR, id: 'pr-dupe', product_code: 'PR-ING-009999' };
    expect(conflictingSharedProducts([PM, PR, second])).toHaveLength(2);
    // Reported, not resolved by ordering luck — that is the failure this change exists to end.
    expect(conflictingSharedProducts([PM, PR])).toEqual([]);
  });
});

describe('the EAN index really is unique regardless of is_current', () => {
  it('is stated in the migration that repoints, so nobody adds a second row later', () => {
    /*
      This is not decoration. The first plan for this fix was "mark the old variant stale and
      insert a new one", which `product_variants_ean_uniq` would have rejected at runtime — the
      constraint ignores `is_current`. The migration must therefore RE-POINT.
    */
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260907225224_canonical_ean_identity_repoint.sql',
      ),
      'utf8',
    );
    expect(migration).toContain('product_variants_ean_uniq');
    expect(migration).toMatch(/update\s+public\.product_variants/i);
    // Never a delete, and never a second insert for an EAN that already has a row.
    expect(migration).not.toMatch(/delete\s+from\s+public\.product_variants/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.products/i);
  });
});
