import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import { canonicalRegistryIdentityFromScanResult } from '@/features/scan-flow/scanFlowLogic';
import { classifyProductSemantics } from '@/features/product-intelligence/productRecognition';
import {
  customerFamilyChoiceForFinalize,
  type CustomerProductFamilyChoice,
} from '@/features/product-scanner/customerProductFamily';
import { runScanImportV2 } from '@/scan-import-v2';
import { createSupabaseDiscoveryPort } from '@/scan-import-v2/adapters/supabaseDiscoveryAdapter';
import { FakeDiscovery } from '@/scan-import-v2/__tests__/fakeDiscovery';
import { ctx, ports } from '@/scan-import-v2/__tests__/fakes';
import {
  mergeProductScanExternalSources,
  productSemanticEvidenceFromScanResult,
} from '../../../supabase/functions/_shared/productScanner';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (path: string) => readFileSync(resolve(REPO, path), 'utf8');
const EAN = '8480000205841';

const confirmed = (value: string): ConfirmedScan => ({
  symbology: 'EAN-13',
  value,
  rawValue: value,
  confirmation: { lane: 'consensus', agreeingFrames: 2, sources: ['manual'] },
  evidence: { moduleNative: null, fill: null, mixedFormats: false },
  timing: { firstSeenAt: 1, completedAt: 2 },
  provenance: { trackId: 'step-1.7', harnessBuild: null },
});

const canonicalOffResult = () => ({
  identity: {
    displayName: 'Yogur sabor fresa',
    originalName: 'Yogur sabor fresa',
    brand: 'Hacendado',
    category: 'Dairy products, yogurts',
  },
  package: { netQuantity: 500, unit: 'g', netQuantityText: '500 g' },
  nutrition: { basis: 'per_100g', energyKcal: 72, fat: 2.1 },
  ingredientsText: 'milk, strawberries, sugar',
  barcodes: [{ value: EAN, format: 'EAN_13' }],
  externalSources: [
    {
      sourceType: 'barcode_registry',
      url: `https://world.openfoodfacts.org/api/v2/product/${EAN}.json`,
      title: 'Yogur sabor fresa · Hacendado',
      fieldsUsed: [
        'identity.displayName',
        'identity.brand',
        'identity.category',
        'package.netQuantity',
        'nutrition.basis',
        'nutrition.energyKcal',
        'nutrition.fat',
        'ingredientsText',
      ],
      sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
      sourceStatedEan: EAN,
      sourceEanConfirmationMethod: 'url',
      sourceEanConfirmedAt: '2026-09-13T08:00:00.000Z',
      receiptId: `off:${EAN}:2026-09-13T08:00:00.000Z`,
      evidenceAuthority: 'AUTOMATIC_REGISTRY',
      confidence: 0.9,
    },
  ],
});

describe('Scanner Runtime Step 1.7 authority closure', () => {
  it('ST17-SINGLE-OFF: an authenticated MISS uses discovery and never the parallel client OFF port', async () => {
    const discovery = new FakeDiscovery();
    const clientOff = { research: vi.fn(async () => null) };
    const appPorts = ports({ discovery, external: clientOff });
    appPorts.catalog.rows = [];

    await runScanImportV2(confirmed(EAN), ctx({ now: 17 }), appPorts);

    expect(discovery.calls.filter((call) => call === `research:${EAN}`)).toHaveLength(1);
    expect(clientOff.research).not.toHaveBeenCalled();
    const analyze = read('supabase/functions/product-scan-analyze/index.ts');
    expect(analyze).toContain('.filter((fact) => !isOpenFoodFactsSource(fact))');
  });

  it('ST17-SINGLE-OFF: Recognition prefetch and pipeline share one server request for one run', async () => {
    const calls: string[] = [];
    const client = {
      functions: {
        async invoke(name: string) {
          calls.push(name);
          return {
            data: {
              kind: 'ean_lookup',
              result: canonicalOffResult(),
              missingCriticalFields: [],
              usage: { visionCalls: 0, webCalls: 1 },
            },
            error: null,
          };
        },
      },
      async rpc() {
        return { data: [], error: null };
      },
    };
    const discovery = createSupabaseDiscoveryPort(client, { newSessionId: () => 'session-17' });
    const run = ctx({ now: 17 });

    await Promise.all([
      discovery.research(runScanIdentity(), run),
      discovery.research(runScanIdentity(), run),
    ]);
    expect(calls).toEqual(['product-scan-analyze']);

    await discovery.research(runScanIdentity(), ctx({ now: 18 }));
    expect(calls).toEqual(['product-scan-analyze', 'product-scan-analyze']);
  });

  it('ST17-PROV-FAMILY: automatic OFF family cannot create CUSTOMER_CONFIRMED authority', () => {
    const requested = 'dairy' satisfies CustomerProductFamilyChoice;
    expect(
      customerFamilyChoiceForFinalize({ requested, persisted: null, customerAction: false }),
    ).toBeNull();
    expect(
      customerFamilyChoiceForFinalize({ requested, persisted: null, customerAction: true }),
    ).toBe('dairy');
    expect(
      customerFamilyChoiceForFinalize({
        requested: null,
        persisted: 'dairy',
        customerAction: false,
      }),
    ).toBe('dairy');

    const recognition = classifyProductSemantics(
      productSemanticEvidenceFromScanResult(canonicalOffResult()),
    );
    expect(recognition).toMatchObject({
      classificationSource: 'DETERMINISTIC',
      ingredientFamily: 'dairy_liquid',
    });
    expect(recognition.reasonCodes).not.toContain('CUSTOMER_FAMILY_DAIRY');
    expect(recognition.evidenceRefs).not.toContain('customerFamily');
  });

  it('ST17-PERSIST-PARITY: every finalize result write uses the normalized-source transaction', () => {
    const finalize = read('supabase/functions/product-scan-finalize/index.ts');
    expect(finalize).toContain("rpc('complete_product_scan_ean_lookup_v1'");
    expect(finalize).toContain('persistCanonicalScanEvidence({');
    expect(finalize).toContain('mergeProductScanExternalSources([], result.externalSources)');
    expect(finalize).not.toMatch(/\.from\('product_scan_sessions'\)\s*\.update\(\{\s*result_json:/);
    const persistence = read('supabase/migrations/20260824140000_product_scan_live_evidence.sql');
    const complete = persistence.slice(
      persistence.indexOf('create or replace function public.complete_product_scan_ean_lookup_v1'),
    );
    expect(complete).toContain('delete from public.product_scan_external_sources');
    expect(complete).toContain("jsonb_array_elements(coalesce(p_result->'externalSources'");
  });

  it('ST17-IDEMPOTENT-EVIDENCE: client/server OFF copies collapse to one canonical receipt', () => {
    const clientCopy = {
      sourceType: 'barcode_registry',
      url: `https://world.openfoodfacts.org/product/${EAN}`,
      title: null,
      fieldsUsed: ['identity.displayName'],
      sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
      sourceStatedEan: EAN,
      sourceEanConfirmationMethod: 'url',
      sourceEanConfirmedAt: '2026-09-13T07:59:00.000Z',
    };
    const serverReceipt = canonicalOffResult().externalSources[0]!;
    const twice = mergeProductScanExternalSources(
      mergeProductScanExternalSources([clientCopy], [serverReceipt]),
      [serverReceipt],
    ) as Record<string, unknown>[];

    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({
      url: `https://world.openfoodfacts.org/api/v2/product/${EAN}.json`,
      receiptId: `off:${EAN}:2026-09-13T08:00:00.000Z`,
      evidenceAuthority: 'AUTOMATIC_REGISTRY',
    });
    expect(twice[0]?.fieldsUsed).toEqual(serverReceipt.fieldsUsed);
  });

  it('ST17-GELLATTI-HIT: exact GELLATTI authority exits before the server OFF acquisition', () => {
    const analyze = read('supabase/functions/product-scan-analyze/index.ts');
    const lookupBranch = analyze.indexOf("if (mode === 'ean_lookup')");
    const exactExit = analyze.indexOf('if (exact)', lookupBranch);
    const offAcquisition = analyze.indexOf('DIRECT GTIN LOOKUP', lookupBranch);
    expect(lookupBranch).toBeGreaterThan(-1);
    expect(exactExit).toBeGreaterThan(lookupBranch);
    expect(exactExit).toBeLessThan(offAcquisition);
  });

  it('reads Recognition and prefill from the exact server receipt fields only', () => {
    expect(canonicalRegistryIdentityFromScanResult(canonicalOffResult(), EAN)).toMatchObject({
      displayName: 'Yogur sabor fresa',
      brand: 'Hacendado',
      quantity: '500 g',
      productFields: {
        nutrition: { basis: 'per_100g', energyKcal: 72, fat: 2.1 },
        ingredientsText: 'milk, strawberries, sugar',
      },
    });
    expect(
      canonicalRegistryIdentityFromScanResult(canonicalOffResult(), '5901234123457'),
    ).toBeNull();
  });
});

function runScanIdentity() {
  return {
    symbology: 'EAN-13' as const,
    value: EAN,
    canonicalGtin13: EAN,
    lookupKeys: [EAN],
    rawValue: EAN,
  };
}
