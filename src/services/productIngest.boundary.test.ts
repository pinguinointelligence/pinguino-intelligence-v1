import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalIngestFromLegacyProduct, functionErrorDetail } from './productIngest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('canonical product ingest boundary', () => {
  it('routes every legacy product mutation through the canonical Edge adapter', () => {
    const products = read('src/services/products.ts');
    expect(products).toContain('ingestProduct({');
    expect(products).not.toMatch(/\.from\(TABLE\)\s*\.(insert|update|delete)\(/s);

    const importer = read('src/services/productCatalogImport.ts');
    expect(importer).not.toContain('snapshotNewProduct');
    expect(importer).not.toContain('snapshotSourceChange');
  });

  it('keeps the retired Mapper-binding backfill out of the canonical product-authority RPC', () => {
    const edge = read('supabase/functions/catalog-submit/index.ts');
    const calls = [...edge.matchAll(/service\.rpc\(\s*'([^']+)'/g)].map((match) => match[1]);
    expect(calls).toEqual([
      'preflight_product_ingest_v1',
      'record_product_import_row_outcome_v1',
      'ingest_product_import_row_v1',
      'ingest_product_v1',
    ]);
    expect(edge).toContain('hasImportRunMetadata');
    expect(edge).toContain('import_cancellation_requested');
    expect(edge).not.toContain("'resolve_intimport_existing_product_v1'");
    expect(edge).not.toContain("'bind_intimport_mapper'");
    expect(edge.indexOf("'preflight_product_ingest_v1'")).toBeLessThan(
      edge.indexOf('evidence = await captureOwnedEvidence('),
    );
    expect(edge).toContain('completedResult');
    expect(edge).toContain('stableJson({');
    expect(edge).toContain('forwardedChain.at(-1)');
    expect(edge).not.toContain("service.rpc('begin_global_catalog_submission'");
    expect(edge).not.toContain("service.rpc('global_catalog_product_snapshot_hash'");
    expect(edge).not.toContain("service.rpc('submit_owned_product_to_global_catalog_v2'");
  });

  it('keeps external OCR and Turnstile optional while risk HMAC remains fail-closed', () => {
    const edge = read('supabase/functions/catalog-submit/index.ts');
    expect(edge).toContain('if (!endpoint || !key) return null');
    expect(edge).toContain('if (!input.token || !input.secret) return false');
    expect(edge).toContain(
      "if (!riskSecret) return json({ error: 'catalog_risk_control_unavailable' }, 503)",
    );
  });

  it('declares every current and future intake source at the single client seam', () => {
    const service = read('src/services/productIngest.ts');
    for (const source of [
      'ocr',
      'barcode',
      'manual',
      'admin',
      'catalog_import',
      'retailer_feed',
      'spreadsheet',
      'supplier_specification',
      'shop',
      'franchise',
      'future_integration',
      'internal_subproduct',
    ])
      expect(service).toContain(`| '${source}'`);
  });

  it('preserves reviewed OCR text/languages and never invents a nutrition basis', () => {
    const request = canonicalIngestFromLegacyProduct({
      source_type: 'label_scan',
      package_size: '220 g',
      extracted_json: {
        schema: 'pinguino.ocr_intake_evidence.v2',
        basis: 'unknown',
        labelLanguages: ['de', 'fr'],
        ingredientsText: 'WEIZENMEHL, Zucker, SOJALECITHIN',
        allergensText: 'WEIZEN, SOJA',
        mayContainText: 'MILCH; LAIT',
      },
    });
    const facts = request.input.facts as Record<string, unknown>;
    expect(request.input.originalLanguage).toBe('de');
    expect(facts.ingredientsText).toContain('WEIZENMEHL');
    expect(facts.mayContainAllergens).toEqual(['MILCH', 'LAIT']);
    expect(facts.labelLanguages).toEqual(['de', 'fr']);
    expect(facts.nutrition).toBeNull();
  });

  it('sends INTIMPORT declarations/evidence only as a profile proposal with stable source identity', () => {
    const request = canonicalIngestFromLegacyProduct({
      source_type: 'catalog_import',
      catalog_source: 'INTIMPORT',
      product_name_display: 'Inulina',
      brand: 'Test',
      extracted_json: {
        productIntelligence: {
          intimportProductProfileProposal: {
            proposedMapperIngredientId: 'PI-ING-000456',
            sourceProductId: 'PL-COM-1',
            matchInput: {
              name: 'Inulina',
              brand: 'Test',
              category: 'fiber',
              knownMacros: {},
              technical: true,
            },
            declared: { fat_percent: 11 },
            evidence: {
              kind: 'technical',
              fields: { identity: 'source_file' },
              validatedBarcode: false,
              exactCanonicalMatch: false,
              mapperFamilyMatch: true,
              materialConflicts: [],
            },
          },
        },
      },
    });
    expect(request.input.intimportProductProfileProposal).toMatchObject({
      proposedMapperIngredientId: 'PI-ING-000456',
      sourceProductId: 'PL-COM-1',
      declared: { fat_percent: 11 },
      evidence: { kind: 'technical' },
    });
    expect(request.input).not.toHaveProperty('mapperDecision');
    expect((request.input.facts as Record<string, unknown>).catalogImportIdentity).toMatchObject({
      system: 'INTIMPORT',
      sourceProductId: 'PL-COM-1',
    });
  });
});

describe('a refused Edge Function reports what the server said', () => {
  const withBody = (status: number, body: unknown) =>
    Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify(body), { status }),
    });

  it('surfaces the structured reason instead of the generic sentence', async () => {
    const detail = await functionErrorDetail(
      withBody(400, { error: 'product_ingest_preflight_failed' }),
    );
    expect(detail).toContain('product_ingest_preflight_failed');
    expect(detail).toContain('400');
  });

  it('surfaces a rate/idempotency refusal by name', async () => {
    const detail = await functionErrorDetail(
      withBody(409, { error: 'idempotency_payload_mismatch' }),
    );
    expect(detail).toContain('idempotency_payload_mismatch');
  });

  it('falls back only when the response carries no reason', async () => {
    const detail = await functionErrorDetail(withBody(500, {}));
    expect(detail).toBe('Edge Function returned a non-2xx status code');
    expect(await functionErrorDetail(new Error('boom'))).toBe('boom');
  });
});
