/**
 * SHOP K4 + K6, applied to the shared project as ledger version 20260917111101.
 *
 * K6: signed-out visitors got HTTP 401 on the country list, because the public read
 * policies called `gellatti_admin_has_permission_v1`, which `anon` may not execute.
 * K4: the US Local Starter Pack was "live" only on QA fixture rows with reserved
 * `.invalid` purchase links.
 *
 * CI has no database, so this pins the migration text. The live readback (anon,
 * regular user, finance admin, service role) is recorded in the SHOP reconciliation report.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION =
  'supabase/migrations/20260917111101_shop_public_offer_read_and_qa_fixture_guard.sql';
const ROLLBACK =
  'supabase/rollbacks/20260917111101_shop_public_offer_read_and_qa_fixture_guard.rollback.sql';

const stripComments = (sql: string) => sql.replace(/--.*$/gm, '');
const sql = stripComments(readFileSync(MIGRATION, 'utf8'));

/** The full `create policy <name> ... ;` statement. */
const policy = (name: string): string => {
  const match = sql.match(new RegExp(`create policy ${name}\\b[\\s\\S]*?;`, 'i'));
  expect(match, `${name} is created`).not.toBeNull();
  return match![0];
};

/** The column list of `grant select (...) on public.<table> to ...`. */
const grantedColumns = (table: string): string[] => {
  const match = sql.match(
    new RegExp(`grant select \\(([^)]*)\\)\\s*on public\\.${table} to anon, authenticated`, 'i'),
  );
  expect(match, `${table} grants columns to browser roles`).not.toBeNull();
  return (match?.[1] ?? '').split(',').map((column) => column.trim());
};

describe('K6 — public shop reads no longer depend on an admin function', () => {
  it.each([
    ['shop_countries_public_read', 'using (active = true)'],
    [
      'shop_country_components_public_read',
      'using (active = true and not public.shop_is_reserved_test_url(purchase_url))',
    ],
    ['shop_shipping_rates_public_read', 'using (active = true and enabled = true)'],
    ['shop_products_public_read', 'using (active = true)'],
  ])('%s is a plain row predicate for anon and authenticated', (name, predicate) => {
    const statement = policy(name);
    expect(statement).toMatch(/for select to anon, authenticated/i);
    expect(statement.replace(/\s+/g, ' ')).toContain(predicate);
    expect(statement).not.toMatch(/gellatti_admin_has_permission_v1/);
    expect(statement).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it('finance admins keep reading inactive products through their own SELECT-only policy', () => {
    const statement = policy('shop_products_finance_read');
    expect(statement).toMatch(/for select to authenticated/i);
    expect(statement).toContain("public.gellatti_admin_has_permission_v1('FINANCE', auth.uid())");
    expect(statement).not.toMatch(/\banon\b/);
  });

  it('never hands anon the admin function and never widens the admin write policies', () => {
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.gellatti_admin_has_permission_v1/i,
    );
    expect(sql).not.toMatch(/_admin_write/);
  });

  it('browser roles read commercial columns only', () => {
    expect(sql).toMatch(/revoke select on public\.shop_shipping_rates from anon, authenticated;/i);
    expect(sql).toMatch(/revoke select on public\.shop_products from anon, authenticated;/i);
    const rates = grantedColumns('shop_shipping_rates');
    const products = grantedColumns('shop_products');
    expect(rates).toEqual(
      expect.arrayContaining(['country_iso2', 'customer_price_cents', 'enabled', 'active']),
    );
    expect(rates).not.toContain('carrier_cost_cents');
    expect(products).toEqual(
      expect.arrayContaining(['id', 'sku', 'title', 'price_cents', 'active']),
    );
    for (const privateColumn of [
      'stripe_product_id',
      'stripe_price_id',
      'canonical_ingredient_id',
    ]) {
      expect(products).not.toContain(privateColumn);
    }
  });
});

describe('K4 — QA fixture rows with reserved test addresses never make a Local Starter Pack live', () => {
  it('the helper is a pure, schema-pinned check that browser policies may call', () => {
    const fn = sql.match(
      /create or replace function public\.shop_is_reserved_test_url[\s\S]*?\$\$;/i,
    );
    expect(fn).not.toBeNull();
    expect(fn![0]).toMatch(/immutable/i);
    expect(fn![0]).toMatch(/set search_path = ''/i);
    expect(fn![0]).toMatch(/\(test\|example\|invalid\|localhost\)/);
    expect(fn![0]).toMatch(/example\\\.\(com\|net\|org\)/);
    expect(sql).toMatch(
      /grant execute on function public\.shop_is_reserved_test_url\(text\) to anon, authenticated, service_role;/i,
    );
  });

  it('readiness ignores reserved addresses, which also closes the direct shop-local-pack path', () => {
    const view = sql.match(
      /create or replace view public\.shop_country_local_readiness[\s\S]*?from public\.shop_countries c;/i,
    );
    expect(view).not.toBeNull();
    expect(view![0]).toContain('and not public.shop_is_reserved_test_url(cc.purchase_url)');
    expect(readFileSync('supabase/functions/shop-local-pack/index.ts', 'utf8')).toContain(
      "from('shop_country_local_readiness')",
    );
  });

  it('keeps the view read-only for browser roles', () => {
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(sql).toContain(`revoke all on public.shop_country_local_readiness from ${role};`);
    }
  });

  it('changes no data: no row is inserted, updated or deleted', () => {
    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
  });
});

describe('the rollback restores the previous state exactly', () => {
  it('exists and puts back the combined predicates, table-level SELECT and the old view', () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const rollback = stripComments(readFileSync(ROLLBACK, 'utf8'));
    expect(rollback).toMatch(
      /grant select on public\.shop_shipping_rates to anon, authenticated;/i,
    );
    expect(rollback).toMatch(/grant select on public\.shop_products to anon, authenticated;/i);
    expect(rollback).toMatch(/drop policy if exists shop_products_finance_read/i);
    expect(
      (
        rollback.match(
          /or public\.gellatti_admin_has_permission_v1\('FINANCE', auth\.uid\(\)\)/g,
        ) ?? []
      ).length,
    ).toBe(4);
    expect(rollback).not.toContain('shop_is_reserved_test_url(cc.purchase_url)');
    expect(rollback).toMatch(/drop function if exists public\.shop_is_reserved_test_url\(text\);/i);
  });
});
