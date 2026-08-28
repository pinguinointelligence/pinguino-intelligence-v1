import { describe, expect, it, vi } from 'vitest';
import { validateBarcode } from '@/features/product-scanner/barcode';
import type { TextImportAdapterOutput } from './textImportAdapter';
import {
  TEXTIMPORT_EAN_RESOLVER_VERSION,
  classifyTextImportEanFacts,
  type TextImportEanProviderFact,
  type TextImportEanResearchTrace,
  type TextImportEanResearchStep,
  type TextImportEanResolverQuery,
  type TextImportEanResolverResult,
} from './eanResolverContract';
import {
  existingEanHandoff,
  resolvedEanHandoff,
  textImportEanQuery,
} from './textImportEanResolver';
import { prepareTextImportScannerInput } from '@/services/textImportEanResolver';

const query: TextImportEanResolverQuery = {
  resolverVersion: TEXTIMPORT_EAN_RESOLVER_VERSION,
  sourceRowId: 'PL-BIE-00162',
  identity: {
    exactProductName: 'Baton w czekoladzie mlecznej z wiórkami kokosowymi Baitz Choco Cocos',
    brand: 'Baitz',
    manufacturer: null,
    variant: 'kokos',
    packageText: '50 g',
  },
  source: { url: 'https://www.biedronka.pl/pl/baitz', title: 'Baitz' },
};

const step: TextImportEanResearchStep = {
  kind: 'RETAILER_SEARCH',
  url: 'https://www.biedronka.pl/pl/baitz',
  allowedDomains: ['biedronka.pl'],
};

const fact = (overrides: Partial<TextImportEanProviderFact> = {}): TextImportEanProviderFact => ({
  field: 'barcode',
  value: '5902425088609',
  sourceUrl: 'https://www.biedronka.pl/pl/product/baitz-choco-cocos',
  sourceTitle: 'Baitz Choco Cocos 50 g',
  sourceAuthorityClass: 'AUTHORITATIVE_RETAILER',
  retrievedAt: '2026-08-28T08:00:00.000Z',
  researchStep: step,
  ...overrides,
});
const adapter = (ean: string | null = null): TextImportAdapterOutput => ({
  adapterVersion: 'gellatti_textimport_adapter_v1',
  sourceRowId: 'PL-BIE-00162',
  ignoredColumns: ['Workbook Note'],
  scannerInput: {
    schemaVersion: 'gellatti_product_scan_v1',
    identity: {
      displayName: query.identity.exactProductName,
      originalName: query.identity.exactProductName,
      brand: 'Baitz',
      explicitlyUnbranded: false,
      category: 'Bakery & sweets',
      variant: 'kokos',
      countryOfOrigin: null,
      labelLanguages: ['pl'],
    },
    package: { netQuantity: 50, unit: 'g', netQuantityText: '50 g' },
    barcodes: ean ? [{ value: ean, format: validateBarcode(ean)!.format }] : [],
    nutrition: {
      basis: 'per_100g',
      energyKj: 2013,
      energyKcal: 481,
      fat: 25,
      saturatedFat: 20,
      carbohydrate: 58,
      sugars: 50,
      protein: 4.1,
      salt: 0.07,
      fibre: 4,
    },
    productionDeclarations: {
      alcoholAbv: null,
      cocoaButterPercent: null,
      cocoaSolidsPercent: null,
      fruitContentPercent: null,
      brix: null,
      concentrationText: null,
      dosageText: null,
      technicalParametersText: null,
      formDeclaration: null,
    },
    ingredientsText: 'original workbook ingredients',
    allergensText: 'original workbook allergens',
    mayContainAllergens: [],
    claims: [],
    storageInstructions: null,
    manufacturer: null,
    externalSources: [
      {
        sourceType: 'retailer',
        url: 'https://www.biedronka.pl/pl/baitz',
        title: 'Baitz',
        fieldsUsed: ['ingredientsText', 'nutrition.energyKcal'],
      },
    ],
    evidence: [],
    missingFields: [],
    conflicts: [],
    warnings: [],
  },
});

const scannerChecksum = (value: unknown): string | null =>
  typeof value === 'string' ? (validateBarcode(value)?.value ?? null) : null;

const researchTrace = (
  exactEvidence: TextImportEanProviderFact[] = [],
): TextImportEanResearchTrace => ({
  budget: {
    rowWebCallCap: 6,
    runWebCallCap: 18,
    worstCaseWebCallsPerRequest: 3,
    rowWebCallsReserved: 3,
    runWebCallsReserved: 3,
  },
  providerRequestsUsed: 1,
  webCallsUsed: 1,
  completedSteps: [step],
  sourcesChecked: exactEvidence.map((item) => ({
    url: item.sourceUrl,
    title: item.sourceTitle,
    researchStep: item.researchStep,
  })),
  exactEvidence,
  checksumChecks: exactEvidence.map((item) => ({
    input: item.value,
    normalized: scannerChecksum(item.value),
    valid: scannerChecksum(item.value) !== null,
  })),
});

describe('TEXTIMPORT pre-Scanner EAN resolver', () => {
  it('resolves one checksum-valid EAN only from authoritative exact-source evidence', () => {
    const evidence = [fact()];
    const result = classifyTextImportEanFacts(
      query,
      evidence,
      scannerChecksum,
      researchTrace(evidence),
    );
    expect(result).toMatchObject({
      status: 'EAN_RESOLVED',
      ean: '5902425088609',
      evidence: [
        {
          exactValue: '5902425088609',
          sourceAuthorityClass: 'AUTHORITATIVE_RETAILER',
          sourceUrl: 'https://www.biedronka.pl/pl/product/baitz-choco-cocos',
        },
      ],
    });
    expect(result.status === 'EAN_RESOLVED' && result.identityMatchExplanation).toContain(
      'exact product name',
    );
  });

  it('returns conflict and never selects when authoritative evidence gives two valid EANs', () => {
    const result = classifyTextImportEanFacts(
      query,
      [
        fact(),
        fact({
          value: '5902425088616',
          sourceUrl: 'https://world.openfoodfacts.org/product/5902425088616',
        }),
      ],
      scannerChecksum,
      researchTrace([fact(), fact({ value: '5902425088616' })]),
    );
    expect(result).toMatchObject({
      status: 'EAN_CONFLICT',
      candidates: [{ ean: '5902425088609' }, { ean: '5902425088616' }],
    });
  });

  it('returns not found for bad checksums, uncited facts, or non-authoritative loose web results', () => {
    const rejected = [
      fact({ value: '5902425088608' }),
      fact({ sourceUrl: '', sourceAuthorityClass: 'OFFICIAL_BRAND' }),
      fact({ sourceAuthorityClass: 'OTHER_WEB' }),
    ];
    const trace = researchTrace(rejected);
    const result = classifyTextImportEanFacts(query, rejected, scannerChecksum, trace);
    expect(result).toEqual({
      status: 'EAN_NOT_FOUND',
      query,
      reason: 'No checksum-valid EAN was found in authoritative exact-product evidence.',
      searchedSteps: [step],
      research: trace,
    });
  });

  it('adds only EAN and EAN provenance while preserving original row evidence', () => {
    const input = adapter();
    const original = structuredClone(input.scannerInput);
    expect(textImportEanQuery(input)).toEqual(query);
    const evidence = [fact()];
    const resolution = classifyTextImportEanFacts(
      query,
      evidence,
      scannerChecksum,
      researchTrace(evidence),
    );
    const handoff = resolvedEanHandoff(input, resolution);
    expect(handoff).not.toBeNull();
    expect(handoff?.scannerInput).toMatchObject({
      barcodes: [{ value: '5902425088609', format: 'EAN_13' }],
      ingredientsText: 'original workbook ingredients',
      allergensText: 'original workbook allergens',
      nutrition: { energyKcal: 481 },
      externalSources: [
        {
          url: 'https://www.biedronka.pl/pl/baitz',
          fieldsUsed: ['ingredientsText', 'nutrition.energyKcal'],
        },
        {
          url: 'https://www.biedronka.pl/pl/product/baitz-choco-cocos',
          fieldsUsed: ['barcodes'],
        },
      ],
    });
    expect(input.scannerInput).toEqual(original);
  });

  it('skips the resolver completely when the row already contains a valid EAN', async () => {
    const input = adapter('5902425088609');
    const invoke = vi.fn();
    expect(textImportEanQuery(input)).toBeNull();
    expect(existingEanHandoff(input)?.resolverSkipped).toBe(true);
    const prepared = await prepareTextImportScannerInput({
      runId: 'control',
      adapter: input,
      invoke,
    });
    expect(prepared).toMatchObject({
      kind: 'SCANNER_INPUT_READY',
      handoff: { resolverSkipped: true, scannerInput: { barcodes: [{ value: '5902425088609' }] } },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('stops before Scanner for EAN_NOT_FOUND', async () => {
    const notFound = classifyTextImportEanFacts(query, [], scannerChecksum, researchTrace());
    const prepared = await prepareTextImportScannerInput({
      runId: 'missing',
      adapter: adapter(),
      invoke: async () => notFound,
    });
    expect(prepared).toMatchObject({
      kind: 'STOP_BEFORE_SCANNER',
      sourceRowId: 'PL-BIE-00162',
      resolverResult: { status: 'EAN_NOT_FOUND' },
    });
  });

  it('stops before Scanner and preserves a budget-cap failure as EAN_RESOLUTION_BLOCKED', async () => {
    const blocked: TextImportEanResolverResult = {
      status: 'EAN_RESOLUTION_BLOCKED',
      query,
      reason: 'TEXTIMPORT EAN run web-call budget exhausted.',
      blockedStep: step,
      research: researchTrace(),
    };
    const prepared = await prepareTextImportScannerInput({
      runId: 'budget-blocked',
      adapter: adapter(),
      invoke: async () => blocked,
    });
    expect(prepared).toMatchObject({
      kind: 'STOP_BEFORE_SCANNER',
      resolverResult: { status: 'EAN_RESOLUTION_BLOCKED' },
    });
  });
});
