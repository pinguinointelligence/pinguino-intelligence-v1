import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20260827100000_scanner_customer_added_products.sql');
const finalize = read('supabase/functions/product-scan-finalize/index.ts');
const ui = read('src/features/product-scanner/LiveProductScanner.tsx');

describe('Scanner customer-added product authority', () => {
  it('requires one valid exact EAN and never allocates PM', () => {
    expect(finalize).toContain('normalizeValidatedBarcode');
    expect(finalize).toContain('customer_product_valid_ean_required');
    expect(migration).toContain('unique(normalized_ean)');
    expect(migration).toContain("then 'CA'");
    expect(migration).toContain("v_origin||'-ING-'");
    expect(migration).not.toContain("'PM-ING-'");
  });

  it('aggregates distinct customer accounts without inflating repeat scans', () => {
    expect(migration).toContain('customer_added_product_accounts');
    expect(migration).toContain('primary key(customer_added_product_id,user_id)');
    expect(migration).toContain('on conflict(customer_added_product_id,user_id) do nothing');
    expect(migration).toContain(
      'select count(*) into v_count from public.customer_added_product_accounts',
    );
  });

  it('keeps provisional products visible only to linked accounts and promotes the same UUID', () => {
    expect(migration).toContain("product_kind='customer_provisional'");
    expect(migration).toContain('customer_added_product_accounts linked');
    expect(migration).toContain('v_code:=public.next_product_code()');
    expect(migration).toContain('product_code=v_code');
    expect(migration).toContain("product_kind='commercial_product'");
    expect(migration).toContain("visibility='shared'");
    expect(migration).not.toMatch(/update\s+public\.saved_recipes/i);
  });

  it('uses native system capture and keeps desktop multi-upload/drop', () => {
    expect(ui).toContain('capture="environment"');
    expect(ui).toContain('accept={PRODUCT_SCAN_ACCEPT}');
    expect(ui).toContain('multiple');
    expect(ui).toContain("addFiles([...event.dataTransfer.files], 'drop')");
    expect(ui).not.toContain('navigator.mediaDevices.getUserMedia');
    expect(ui).not.toContain('<video');
  });

  it('lets the customer review package production declarations before completion', () => {
    expect(ui).toContain("['alcoholAbv', 'Alkohol ABV', 'decimal']");
    expect(ui).toContain("['cocoaSolidsPercent', 'Masa kakaowa', 'decimal']");
    expect(ui).toContain("patchReview('productionDeclarations'");
  });

  it('runs family resolution before shared profile/Mapper completion', () => {
    expect(finalize.indexOf('let familyResolution = resolveCustomerProductFamily')).toBeLessThan(
      finalize.indexOf('profile = validateIntimportProductProfileProposal'),
    );
    expect(finalize).toContain('family_confirmation_required');
    expect(finalize).toContain('validateProductBehaviorAuthority');
    expect(finalize).toContain('finalizeProductProductionAccuracy');
  });
});
