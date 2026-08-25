import { describe, expect, it, vi } from 'vitest';
import {
  INTIMPORT_COLUMNS,
  normalizeIntimportPackage,
  parseINTIMPORT,
  type IntimportColumn,
} from '@/data/products/intimport';
import {
  classifyProductSemantics,
  validateProductSemanticModelOutputDetailed,
  type ProductSemanticEvidence,
} from './productRecognition';
import { proveExactProductIdentity } from './exactProductEvidence';
import { buildMapperKnowledge, type MapperKnowledgeRow } from './mapperValueInference';
import { resolveProductWorkingValues } from './productWorkingValues';
import { classifyProspectiveProductBehavior } from './productBehaviorAuthority';
import {
  assessIntimportProduct,
  runIntimportLocalIntelligence,
} from './intimportIntelligence';
import { reassessIntimportAfterEnrichment, runIntimportEnrichment } from './intimportEnrichment';
import { buildResearchPlan } from './researchPlan';

const semanticEvidence = (
  overrides: Partial<ProductSemanticEvidence> = {},
): ProductSemanticEvidence => ({
  name: 'Produkt testowy',
  brand: 'Marka',
  manufacturer: null,
  manufacturerCode: null,
  gtin: null,
  productType: 'retail',
  category: 'Bakery & sweets',
  subcategory: 'Słodycze — bieżący katalog online',
  variant: null,
  ingredients: null,
  nutrition: null,
  description: null,
  dosage: null,
  technicalParameters: null,
  sourceUrls: [],
  ...overrides,
});

const row = (overrides: Partial<Record<IntimportColumn, string>> = {}): Record<string, string> => {
  const base = Object.fromEntries(INTIMPORT_COLUMNS.map((column) => [column, 'not_found'])) as Record<
    IntimportColumn,
    string
  >;
  return {
    ...base,
    'Product ID': 'PL-CLOSEOUT-1',
    'Country Code': 'PL',
    Category: 'Bakery & sweets',
    Subcategory: 'Słodycze — bieżący katalog online',
    'Product Type': 'retail',
    Brand: 'Baitz',
    'Product Name Original': 'Baitz Czeko Sandwich',
    'Net Quantity Value': '168',
    'Net Quantity Unit': 'g',
    'Package Count': '1',
    ...overrides,
  };
};

const quote = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const csv = (rows: readonly Record<string, string>[]): string => [
  INTIMPORT_COLUMNS.map(quote).join(','),
  ...rows.map((entry) => INTIMPORT_COLUMNS.map((column) => quote(entry[column] ?? '')).join(',')),
].join('\n');

const mapperRow = (overrides: Partial<MapperKnowledgeRow> = {}): MapperKnowledgeRow => ({
  ingredient_id: 'PI-ING-000749',
  ingredient_name_internal: 'GUMA BALONOWA',
  ingredient_name_display: 'GUMA BALONOWA',
  brand: 'PreGel',
  ingredient_category: 'flavor_paste',
  ingredient_subcategory: 'Paste',
  is_active: true,
  approved_for_base: true,
  approved_for_engines: true,
  verification_status: 'Verified',
  ean_code: null,
  water_percent: 24.02,
  total_solids_percent: 75.98,
  fat_percent: 0.2,
  protein_percent: 0.2,
  carbohydrate_percent: 75.4,
  total_sugars_percent: 48.8,
  sucrose_percent: 25.8,
  dextrose_percent: 0,
  glucose_percent: 23,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0.18,
  alcohol_percent: 0,
  kcal_per_100g: 311,
  pod_value: 43.51,
  pac_value: 70.553,
  sweetness_factor: 0.8916,
  freezing_factor: 1.4458,
  ...overrides,
});

describe('final INTIMPORT closeout — whole-product recognition', () => {
  it.each([
    ['Airwaves bezcukrowa guma do żucia', 'CHEWING_GUM', 'SOLID', 'NEITHER_REVIEW'],
    ['Grześki Wafel przekładany kremem kakaowym w czekoladzie', 'BISCUIT_WAFER', 'SOLID', 'TOPPING_ONLY'],
    ['Delicje Biszkopty z galaretką oblewane czekoladą', 'BISCUIT_WAFER', 'SOLID', 'TOPPING_ONLY'],
    ['Bakello Drożdże suszone instant', 'YEAST', 'POWDER', 'NEITHER_REVIEW'],
    ['Bakello Soda oczyszczona', 'LEAVENING_AGENT', 'POWDER', 'NEITHER_REVIEW'],
    ['Bakello Kwasek cytrynowy', 'CULINARY_ACID', 'POWDER', 'BASE_ONLY'],
    ['Biedronka Premium Oliwa z oliwek Extra Virgin', 'EDIBLE_OIL', 'LIQUID', 'BASE_ONLY'],
    ['Bakallino Masa krówkowa kajmak', 'CARAMEL_SPREAD', 'PASTE', 'BASE_AND_TOPPING'],
  ])('recognizes the whole subject %s', (name, archetype, form, role) => {
    const classification = classifyProductSemantics(semanticEvidence({ name }));
    expect(classification).toMatchObject({
      productArchetype: archetype,
      physicalForm: form,
      intendedUsageRole: role,
      modelRequired: false,
    });
  });

  it('does not let coating/filling/component mentions redefine a biscuit or wafer', () => {
    for (const name of [
      'Wafel przekładany kremem kakaowym w czekoladzie',
      'Biszkopty z galaretką oblewane czekoladą',
      'Herbatniki z nadzieniem kakaowym i polewą',
    ]) {
      const result = classifyProductSemantics(semanticEvidence({ name }));
      expect(result.productArchetype).toBe('BISCUIT_WAFER');
      expect(result.physicalForm).toBe('SOLID');
      expect(result.productArchetype).not.toBe('COATING');
    }
  });
});

describe('final INTIMPORT closeout — exact model contract diagnostics', () => {
  it('returns field-level validator errors instead of semantic_output_rejected alone', () => {
    const evidence = semanticEvidence({ name: 'Airwaves guma do żucia' });
    const result = validateProductSemanticModelOutputDetailed(evidence, {
      productArchetype: 'CHEWING_GUM',
      ingredientFamily: 'chewing_gum',
      physicalForm: 'CHEWY',
      intendedUsageRole: 'NEITHER_REVIEW',
      flavorDomain: 'UNKNOWN',
      professional: false,
      technical: false,
      dosageDependent: false,
      dosage: { semantics: 'NONE', value: null, unit: 'UNKNOWN', basis: 'UNKNOWN' },
      compatibleMapperCategories: [],
      forbiddenMapperCategories: [],
      confidence: 0.9,
      reasonCodes: ['WHOLE_PRODUCT_GUM'],
      evidenceRefs: ['name'],
    });

    expect(result.classification).toBeNull();
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: '$.physicalForm',
        returnedValue: 'CHEWY',
        rule: 'enum',
        issue: 'ENUM_MISMATCH',
      }),
    ]));
  });
});

describe('final INTIMPORT closeout — exact SKU evidence gate', () => {
  const expected = {
    name: 'Chrupiące herbatniki Baitz Czeko Sandwich z nadzieniem z czekolady mlecznej',
    brand: 'Baitz',
    variant: null,
    barcode: null,
    netQuantity: '168 g',
    sourceProductId: 'PL-BIE-00163',
    knownSourceUrl: 'https://baitz.pl/produkty',
  };

  it('rejects the rogalik block from the same generic Baitz page', () => {
    const proof = proveExactProductIdentity(expected, {
      productName: 'Baitz Cocoa Rogal rogalik z nadzieniem kakaowym',
      brand: 'Baitz',
      variant: null,
      barcode: null,
      netQuantity: '60 g',
      sourceProductId: null,
      sourceUrl: 'https://baitz.pl/produkty',
      sourceTitle: 'Produkty Baitz',
    });
    expect(proof.accepted).toBe(false);
    expect(proof.reasonCodes).toContain('EXACT_PRODUCT_NAME_MISMATCH');
  });

  it('accepts the exact Czeko Sandwich item block and records matched dimensions', () => {
    const proof = proveExactProductIdentity(expected, {
      productName: 'Baitz Czeko Sandwich chrupiące herbatniki z mleczną czekoladą',
      brand: 'Baitz',
      variant: null,
      barcode: null,
      netQuantity: '168 g',
      sourceProductId: null,
      sourceUrl: 'https://baitz.pl/produkty',
      sourceTitle: 'Produkty Baitz',
    });
    expect(proof.accepted).toBe(true);
    expect(proof.matchedDimensions).toEqual(expect.arrayContaining(['name', 'brand', 'netQuantity']));
  });

  it('accepts an exact barcode even when the database omits descriptive metadata', () => {
    const proof = proveExactProductIdentity(
      { ...expected, barcode: '8410109121551' },
      {
        productName: null,
        brand: null,
        variant: null,
        barcode: '8410109121551',
        netQuantity: null,
        sourceProductId: null,
        sourceUrl: 'https://world.openfoodfacts.org/product/8410109121551',
        sourceTitle: 'Open Food Facts',
      },
    );
    expect(proof).toMatchObject({ accepted: true, matchedDimensions: ['barcode'] });
  });

  it('fail-closes when an exact barcode source explicitly describes another product', () => {
    const proof = proveExactProductIdentity(
      { ...expected, barcode: '8410109121551' },
      {
        productName: 'Baitz Cocoa Rogal',
        brand: 'Baitz',
        variant: null,
        barcode: '8410109121551',
        netQuantity: '60 g',
        sourceProductId: null,
        sourceUrl: 'https://example.test/wrong',
        sourceTitle: 'Wrong item',
      },
    );
    expect(proof.accepted).toBe(false);
    expect(proof.reasonCodes).toEqual(expect.arrayContaining([
      'EXACT_PRODUCT_NAME_MISMATCH',
      'EXACT_PRODUCT_NET_QUANTITY_MISMATCH',
    ]));
  });
});

describe('final INTIMPORT closeout — Mapper and ProductBehavior gates', () => {
  it('does not create Mapper values while family/form/role remain unresolved', () => {
    const recognition = classifyProductSemantics(semanticEvidence({ name: 'Niejasny artykuł' }));
    expect(recognition.modelRequired).toBe(true);
    const resolved = resolveProductWorkingValues({
      declared: {},
      declaredConfidence: 0.8,
      identity: {
        name: 'Niejasny artykuł gum classic',
        brand: 'X',
        category: 'Bakery & sweets',
        subcategory: 'Słodycze',
        semantic: recognition,
      },
      technical: false,
    }, buildMapperKnowledge([mapperRow()], 'closeout'));
    expect(resolved.mapperReferences).toEqual([]);
    expect(resolved.profileMatch).toBeNull();
    expect(resolved.engineReady).toBe(false);
  });

  it('classifies an ordinary solid topping without inventing base physics', () => {
    const recognition = classifyProductSemantics(semanticEvidence({
      name: 'Bonitki Herbatniki Petit Beurre',
      ingredients: 'mąka pszenna, cukier, tłuszcz',
    }));
    const behavior = classifyProspectiveProductBehavior({
      kind: 'normal_food',
      engineUsable: false,
      profileMatch: null,
      recognition,
      criticalPhysicsBlockers: ['MISSING_WATER_PERCENT'],
    });
    expect(behavior).toMatchObject({
      classificationOutcome: 'classified',
      baseRecipeEligible: false,
      toppingEligible: true,
      intendedUsageRole: 'TOPPING_ONLY',
      referenceMapperIngredientId: null,
    });
  });
});

describe('final INTIMPORT closeout — package normalization and per-product research', () => {
  it.each([
    ['2', 'g', '1', 'https://shop.test/galaretka-2-x-75-g', 2, 75, 150],
    ['20', 'g', '1', null, 20, 20, 400],
    ['360', 'g', '1', null, 10, 36, 360],
    ['70', 'g', '1', null, 6, 11.7, 70.2],
  ])('normalizes a general multipack', (value, unit, count, url, packageCount, unitQuantity, total) => {
    const normalized = normalizeIntimportPackage({
      netQuantity: value,
      netUnit: unit,
      packageCount: count,
      identityText: [
        url ?? '',
        packageCount === 20 ? 'Grześki Mini Wafel 20x20 g' : '',
        packageCount === 10 ? 'Wafel 10 × 36 g 360 g' : '',
        packageCount === 6 ? 'Guma 6 x 11,7 g' : '',
      ].join(' '),
    });
    expect(normalized).toMatchObject({ packageCount, unitQuantity, totalNetQuantity: total, unit: 'g' });
  });

  it('puts exact Open Food Facts GTIN before provided URL and excludes GS1', () => {
    const plan = buildResearchPlan({
      brand: 'Marka',
      manufacturer: null,
      name: 'Produkt',
      variant: null,
      barcode: '5902425088609',
      netQuantity: '100 g',
      knownSourceUrl: 'https://zakupy.biedronka.pl/produkt',
      technicalPdfUrl: null,
      missingFields: ['ingredients', 'fat', 'protein'],
    });
    expect(plan.steps[0]?.kind).toBe('OPEN_FOOD_FACTS_EXACT_GTIN');
    expect(JSON.stringify(plan)).not.toMatch(/gs1/i);
  });

  it('requests the complete missing-field set in one product step, not three fields', async () => {
    const candidate = parseINTIMPORT(csv([row({
      Brand: 'not_found',
      'Package Count': 'not_found',
    })])).candidates[0]!;
    const intelligence = assessIntimportProduct(candidate);
    const provider = vi.fn(async () => ({ facts: [], calls: 1, researchOutcome: 'SEARCH_EXHAUSTED' as const }));
    await runIntimportEnrichment([{ intelligence, barcode: null }], provider, {
      maxCallsPerImport: 100,
      maxSpendUsd: 10,
      concurrency: 1,
    });
    expect(provider).toHaveBeenCalled();
    const requested = provider.mock.calls[0]![0].fields;
    expect(requested).toEqual(expect.arrayContaining([
      'brand', 'variant', 'description', 'claims', 'ingredients', 'nutritionBasis', 'energyKcal',
      'fat', 'saturatedFat', 'carbohydrate', 'sugars', 'protein', 'salt', 'packageCount',
    ]));
    expect(requested.length).toBeGreaterThan(3);
  });

  it('does not finalize untouched products as REVIEW when the emergency ceiling pauses a run', async () => {
    const candidates = parseINTIMPORT(csv(Array.from({ length: 4 }, (_, index) => row({
      'Product ID': `P-${index}`,
      'Product Name Original': `Produkt ${index}`,
    })))).candidates;
    const local = runIntimportLocalIntelligence(candidates);
    const provider = vi.fn(async () => ({ facts: [], calls: 3, researchOutcome: 'SEARCH_EXHAUSTED' as const }));
    const result = await runIntimportEnrichment(
      local.rows.map((intelligence) => ({ intelligence, barcode: null })),
      provider,
      { maxCallsPerImport: 6, maxSpendUsd: 10, concurrency: 1 },
    );
    expect(result.summary.runStatus).toBe('PAUSED_BUDGET');
    expect(result.summary.processed).toBe(2);
    expect(result.summary.pending).toBe(2);
    expect(result.products).toHaveLength(2);
    expect(result.summary.products).toBe(4);
  });

  it('recomputes exact-evidence carbonation after enrichment', async () => {
    const candidate = parseINTIMPORT(csv([row({
      Brand: 'not_found',
      'Product Name Original': 'Napój testowy',
      Category: 'Beverages',
    })])).candidates[0]!;
    const local = runIntimportLocalIntelligence([candidate]);
    const enriched = await runIntimportEnrichment(
      local.rows.map((intelligence) => ({ intelligence, barcode: null })),
      async () => ({
        facts: [{
          field: 'ingredients',
          value: 'woda, dwutlenek węgla',
          source: 'retailer',
          sourceUrl: 'https://zakupy.biedronka.pl/produkt/test',
          sourceDomain: 'zakupy.biedronka.pl',
          sourceTitle: 'Napój testowy',
          sourceAuthorityClass: 'AUTHORITATIVE_RETAILER',
          retrievedAt: '2026-08-26T00:00:00.000Z',
        }],
        calls: 1,
        researchOutcome: 'ENRICHED',
      }),
      { maxCallsPerImport: 100, maxSpendUsd: 10, concurrency: 1 },
    );
    const final = reassessIntimportAfterEnrichment({
      candidates: [candidate],
      enrichedProducts: enriched.products,
      mapper: null,
    });

    expect(final.rows[0]?.carbonation).toMatchObject({
      status: 'CARBONATED',
      decision: 'EXPLICIT_CARBONATED_ASSERTION',
    });
  });
});
