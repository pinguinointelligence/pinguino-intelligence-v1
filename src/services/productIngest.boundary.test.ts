import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('canonical product ingest boundary', () => {
  it('routes every legacy product mutation through the canonical Edge adapter', () => {
    const products = read('src/services/products.ts');
    expect(products).toContain("ingestProduct({");
    expect(products).not.toMatch(/\.from\(TABLE\)\s*\.(insert|update|delete)\(/s);

    const importer = read('src/services/productCatalogImport.ts');
    expect(importer).not.toContain('snapshotNewProduct');
    expect(importer).not.toContain('snapshotSourceChange');
  });

  it('makes catalog-submit an evidence adapter with exactly one product-authority RPC', () => {
    const edge = read('supabase/functions/catalog-submit/index.ts');
    const calls = [...edge.matchAll(/service\.rpc\('([^']+)'/g)].map((match) => match[1]);
    expect(calls).toEqual(['ingest_product_v1']);
    expect(edge).not.toContain("service.rpc('begin_global_catalog_submission'");
    expect(edge).not.toContain("service.rpc('global_catalog_product_snapshot_hash'");
    expect(edge).not.toContain("service.rpc('submit_owned_product_to_global_catalog_v2'");
  });

  it('keeps external OCR and Turnstile optional while risk HMAC remains fail-closed', () => {
    const edge = read('supabase/functions/catalog-submit/index.ts');
    expect(edge).toContain("if (!endpoint || !key) return null");
    expect(edge).toContain("if (!input.token || !input.secret) return false");
    expect(edge).toContain("if (!riskSecret) return json({ error: 'catalog_risk_control_unavailable' }, 503)");
  });

  it('declares every current and future intake source at the single client seam', () => {
    const service = read('src/services/productIngest.ts');
    for (const source of [
      'ocr', 'barcode', 'manual', 'admin', 'catalog_import', 'retailer_feed',
      'spreadsheet', 'supplier_specification', 'shop', 'franchise',
      'future_integration', 'internal_subproduct',
    ]) expect(service).toContain(`| '${source}'`);
  });
});
