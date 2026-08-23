/**
 * Migration 20260823104000 — the Product Scanner Edge 400, at its source (owner v1.4).
 *
 * `public.product_behavior_entity_fingerprint_v1` was STABLE, so when `ingest_product_v1` called it
 * for the `product_versions` row the SAME transaction had just inserted, it evaluated against the
 * calling query's snapshot, could not see the row, and raised
 * `classification entity not found (… version=f, product=f, current=f)`. Ingest treats a classifier
 * failure as fatal, so the product creation rolled back and `product-scan-finalize` answered
 * HTTP 400 `product_ingest_failed`. Reproduced on staging; with the function VOLATILE the identical
 * ingest returns `kind=created`.
 *
 * This test is the guard against the volatility silently reverting.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..', '..');
const CODE = readFileSync(
  join(
    REPO,
    'supabase',
    'migrations',
    '20260823104000_product_behavior_fingerprint_volatility.sql',
  ),
  'utf8',
);
const SQL = CODE.replace(/--.*$/gm, '');

describe('product_behavior_entity_fingerprint_v1 volatility', () => {
  it('is VOLATILE — it must see the writes of the transaction that calls it', () => {
    expect(SQL).toMatch(/language plpgsql volatile security definer/);
    expect(SQL).not.toMatch(/language plpgsql stable/);
  });

  it('keeps the authority body byte-for-byte (this migration changes ONLY the volatility)', () => {
    // The exact lookups and the diagnostic that proved the defect must survive unchanged.
    expect(SQL).toContain('from public.product_versions v');
    expect(SQL).toContain('join public.products p on p.id=v.product_id');
    expect(SQL).toContain('owner_product_dosage_policy_versions');
    expect(SQL).toContain('public.product_behavior_authority_fingerprint_v1()');
    expect(SQL).toContain(
      "raise exception 'classification entity not found (kind=%, id=%, version=%, product=%, current=%)'",
    );
  });

  it('keeps the grant surface unchanged — service_role only', () => {
    expect(SQL).toMatch(
      /revoke all on function public\.product_behavior_entity_fingerprint_v1\(text,text\)\s*\n?\s*from public,anon,authenticated;/,
    );
    expect(SQL).toMatch(
      /grant execute on function public\.product_behavior_entity_fingerprint_v1\(text,text\)\s*\n?\s*to service_role;/,
    );
  });
});
