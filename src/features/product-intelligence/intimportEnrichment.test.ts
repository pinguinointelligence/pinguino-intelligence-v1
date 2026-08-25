import { describe, expect, it, vi } from 'vitest';
import { INTIMPORT_COLUMNS, parseINTIMPORT, type IntimportColumn } from '@/data/products/intimport';
import {
  assessProductConfidence,
  AUTO_IMPORT_FLOOR,
  isAutoImportEligible,
  NO_WEB_CONFIDENCE,
  routeAfterWeb,
  routeBeforeWeb,
  type ProductEvidenceInput,
} from './productEvidenceConfidence';
import { familySupportsInference, inferMapperFamily } from './mapperFamilyInference';
import {
  classifyIntimportFinalResult,
  assessIntimportProduct,
  planIntimportImport,
  runIntimportLocalIntelligence,
  type IntimportProductIntelligence,
} from './intimportIntelligence';
import { validateIntimportProductProfileProposal } from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import {
  DEFAULT_ENRICHMENT_CAPS,
  reassessIntimportAfterEnrichment,
  runIntimportEnrichment,
  type EnrichmentInputRow,
} from './intimportEnrichment';
import { buildMapperKnowledge } from './mapperValueInference';

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const row = (overrides: Partial<Record<IntimportColumn, string>> = {}): Record<string, string> => {
  const base = Object.fromEntries(INTIMPORT_COLUMNS.map((c) => [c, 'not_found'])) as Record<
    IntimportColumn,
    string
  >;
  return {
    ...base,
    'Product ID': 'PL-TEST-0001',
    'Country Code': 'PL',
    Brand: 'Testowa Marka',
    'Product Name Original': 'Produkt testowy',
    'Net Quantity Value': '500',
    'Net Quantity Unit': 'g',
    ...overrides,
  };
};

/** A fully specified normal retail food — the shape that should skip the web. */
const completeRow = (overrides: Partial<Record<IntimportColumn, string>> = {}) =>
  row({
    Manufacturer: 'Acmefoods Sp. z o.o.',
    'Variant Original': 'Wariant A',
    'Ingredients Original': 'Cukier, kakao.',
    Allergens: 'Może zawierać mleko.',
    'Nutrition Basis': '100 g',
    'Energy kcal': '480',
    'Fat g': '25',
    'Saturated Fat g': '15',
    'Carbohydrates g': '58',
    'Sugars g': '52',
    'Protein g': '6',
    'Salt g': '0.2',
    'EAN / GTIN': '5902425088609',
    'Country of Origin': 'PL',
    // Official manufacturer domain — this is what earns manufacturer tier (§9).
    'Primary Source URL': 'https://acmefoods.com/produkty/testowy',
    'Product Status': 'complete',
    'Checked At': '2026-08-20',
    ...overrides,
  });

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
const csv = (rows: readonly Record<string, string>[]) =>
  [
    INTIMPORT_COLUMNS.map(quote).join(','),
    ...rows.map((r) => INTIMPORT_COLUMNS.map((c) => quote(r[c] ?? '')).join(',')),
  ].join('\n');

const analyse = (rows: readonly Record<string, string>[], index = {}) =>
  runIntimportLocalIntelligence(parseINTIMPORT(csv(rows)).candidates, index);

/** A fully specified normal food, all fields from the curated source file. */
const evidence = (over: Partial<ProductEvidenceInput> = {}): ProductEvidenceInput => ({
  kind: 'normal_food',
  fields: {
    identity: 'source_file',
    brand: 'source_file',
    manufacturer: 'source_file',
    variant: 'source_file',
    netQuantity: 'source_file',
    ingredients: 'source_file',
    allergens: 'source_file',
    energyKcal: 'source_file',
    fat: 'source_file',
    carbohydrate: 'source_file',
    protein: 'source_file',
    salt: 'source_file',
    countryOfOrigin: 'source_file',
  },
  validatedBarcode: false,
  exactCanonicalMatch: false,
  mapperFamilyMatch: false,
  materialConflicts: [],
  ...over,
});

/* ── thresholds ───────────────────────────────────────────────────────────── */

describe('owner thresholds', () => {
  it('separates the no-web threshold from the auto-import floor', () => {
    expect(NO_WEB_CONFIDENCE).toBe(90);
    expect(AUTO_IMPORT_FLOOR).toBe(85);
    expect(AUTO_IMPORT_FLOOR).toBeLessThan(NO_WEB_CONFIDENCE);
  });

  it('skips the web at or above 90 when critical fields are satisfied', () => {
    const assessment = { confidence: 94, criticalReadiness: true, missingCritical: [], technicalBlocked: false, reasons: [] };
    expect(routeBeforeWeb(assessment)).toBe('READY_LOCAL');
  });

  it.each([89.99, 87, 85])('attempts targeted enrichment at %s', (confidence) => {
    const assessment = { confidence, criticalReadiness: false, missingCritical: ['ingredients' as const], technicalBlocked: false, reasons: [] };
    expect(routeBeforeWeb(assessment)).toBe('WEB_RECOMMENDED');
  });

  it('requires enrichment below 85', () => {
    const assessment = { confidence: 84.99, criticalReadiness: false, missingCritical: ['ingredients' as const], technicalBlocked: false, reasons: [] };
    expect(routeBeforeWeb(assessment)).toBe('WEB_REQUIRED');
  });

  it('makes a product import-eligible once it clears 85 with critical readiness', () => {
    const strong = assessProductConfidence(
      evidence({ validatedBarcode: true, fields: { ...evidence().fields, barcode: 'barcode_registry' } }),
    );
    expect(strong.confidence).toBeGreaterThanOrEqual(AUTO_IMPORT_FLOOR);
    expect(isAutoImportEligible(strong)).toBe(true);
  });

  it('sends a product that stays under 85 to review', () => {
    const weak = assessProductConfidence(evidence({ fields: { identity: 'source_file' } }));
    expect(weak.confidence).toBeLessThan(AUTO_IMPORT_FLOOR);
    expect(routeAfterWeb(weak)).toBe('REVIEW_REQUIRED');
    expect(isAutoImportEligible(weak)).toBe(false);
  });
});

/* ── confidence is deterministic, not model self-report ───────────────────── */

describe('confidence is deterministic evidence, never LLM self-confidence', () => {
  it('returns the same number for the same input every time', () => {
    const a = assessProductConfidence(evidence());
    const b = assessProductConfidence(evidence());
    expect(a.confidence).toBe(b.confidence);
    expect(assessIntimportProduct(parseINTIMPORT(csv([completeRow()])).candidates[0]!).assessment)
      .toEqual(assessIntimportProduct(parseINTIMPORT(csv([completeRow()])).candidates[0]!).assessment);
  });

  it('accepts no model-supplied confidence value anywhere in its input', () => {
    const source = String(assessProductConfidence);
    expect(source).not.toMatch(/llm|gpt|model|selfConfidence/i);
  });

  it('moves only when the evidence moves', () => {
    const base = assessProductConfidence(evidence()).confidence;
    const richer = assessProductConfidence(evidence({ validatedBarcode: true })).confidence;
    const conflicted = assessProductConfidence(evidence({ materialConflicts: ['brand'] })).confidence;
    expect(richer).toBeGreaterThan(base);
    expect(conflicted).toBeLessThan(base);
  });
});

/* ── local intelligence ───────────────────────────────────────────────────── */

describe('local intelligence runs before any web call', () => {
  it('routes a complete owner-curated row to READY_LOCAL with no enrichment targets', () => {
    const { rows, summary } = analyse([completeRow()]);
    expect(rows[0]!.assessment.confidence).toBeGreaterThanOrEqual(NO_WEB_CONFIDENCE);
    expect(rows[0]!.route).toBe('READY_LOCAL');
    expect(rows[0]!.enrichmentTargets).toEqual([]);
    expect(summary.readyLocalNoWeb).toBe(1);
    expect(summary.estimatedMaxExternalCalls).toBe(0);
  });

  it('treats an exact canonical GTIN match as EXISTING with zero research', () => {
    const { rows, summary } = analyse([completeRow()], {
      byBarcode: () => 'product-existing-1',
    });
    expect(rows[0]!.route).toBe('EXISTING');
    expect(rows[0]!.existingProductId).toBe('product-existing-1');
    expect(rows[0]!.enrichmentTargets).toEqual([]);
    expect(summary.existingExact).toBe(1);
  });

  it('only asks the web about fields that are actually missing', () => {
    const { rows } = analyse([completeRow({ 'Ingredients Original': 'not_found' })]);
    expect(rows[0]!.enrichmentTargets).toContain('ingredients');
    expect(rows[0]!.enrichmentTargets).not.toContain('energyKcal');
    expect(rows[0]!.enrichmentTargets).not.toContain('barcode');
  });
});

/* ── Mapper family inference ──────────────────────────────────────────────── */

describe('Mapper family inference', () => {
  it.each([
    ['Pea protein isolate 82%', 'plant_protein_isolate'],
    ['Refined coconut oil', 'coconut_fat'],
    ['Cocoa butter', 'cocoa_butter'],
    ['Dextrose monohydrate', 'glucose_dextrose'],
    ['Sunflower oil', 'liquid_vegetable_oil'],
    ['Inulina', 'fibre_inulin'],
    ['Guma tara', 'stabilizer_hydrocolloid'],
    ['Napój owsiany', 'plant_beverage'],
  ])('learns from the Mapper without an exact row: %s', (name, family) => {
    expect(inferMapperFamily({ name })?.family).toBe(family);
  });

  it.each([
    ['Professional gelato products', 'Pasty klasyczne', 'flavor_paste'],
    ['Professional gelato products', 'Variegatury', 'flavor_paste'],
    ['Professional gelato products', 'Speedy Classic', 'base_mix'],
    ['Chocolate & cocoa', 'Czekolady', 'chocolate'],
    ['Stabilizers & emulsifiers', 'Hydrocolloids', 'stabilizer_hydrocolloid'],
  ])(
    'falls back to the source category when the name carries no signal: %s / %s',
    (sourceCategory, sourceSubcategory, family) => {
      // "ALBICOCCA" says nothing on its own; the source category does.
      const match = inferMapperFamily({ name: 'ALBICOCCA', sourceCategory, sourceSubcategory });
      expect(match?.family).toBe(family);
      // Category evidence is deliberately weaker than an explicit name match.
      expect(match!.strength).toBeLessThanOrEqual(0.8);
    },
  );

  it('does not apply a category-only match without subcategory agreement', () => {
    const match = inferMapperFamily({ name: 'ALBICOCCA', sourceCategory: 'Fruit' });
    expect(match?.family).toBe('fruit');
    expect(match!.strength).toBeLessThan(0.8);
    expect(familySupportsInference(match)).toBe(false);
  });

  it('keeps a stabilizer family technical', () => {
    const match = inferMapperFamily({
      name: 'ALBICOCCA',
      sourceCategory: 'Stabilizers & emulsifiers',
      sourceSubcategory: 'Stabilizers',
    });
    expect(match?.technical).toBe(true);
  });

  it('returns null rather than guessing', () => {
    expect(inferMapperFamily({ name: 'Airwaves Cool Cassis guma do żucia' })).toBeNull();
    expect(inferMapperFamily({ name: '' })).toBeNull();
  });

  it('does not let an ingredient list masquerade as the product family', () => {
    // A biscuit whose ingredients mention sunflower lecithin is not an oil.
    expect(
      inferMapperFamily({ name: 'Ciastka kakaowe', ingredients: 'sunflower lecithin, oil' }),
    ).toBeNull();
  });

  it('never presents family inference as verification', () => {
    const candidate = parseINTIMPORT(csv([row({ 'Product Name Original': 'Pea protein isolate 82%' })]))
      .candidates[0]!;
    const intelligence = assessIntimportProduct(candidate);
    expect(intelligence.familyApplied).toBe(true);
    // The family supplies `mapper_family` evidence only — the weakest tier.
    expect(intelligence.assessment.confidence).toBeLessThan(NO_WEB_CONFIDENCE);
    expect(intelligence.assessment.criticalReadiness).toBe(false);
  });

  it('can raise local confidence for an otherwise thin row', () => {
    const thin = row({ 'Product Name Original': 'Bezimienny', Brand: 'not_found' });
    const known = row({ 'Product Name Original': 'Pea protein isolate 82%', Brand: 'not_found' });
    const a = assessIntimportProduct(parseINTIMPORT(csv([thin])).candidates[0]!);
    const b = assessIntimportProduct(parseINTIMPORT(csv([known])).candidates[0]!);
    expect(b.familyApplied).toBe(true);
    expect(a.familyApplied).toBe(false);
    expect(b.assessment.confidence).toBeGreaterThan(a.assessment.confidence);
  });
});

/* ── safety ───────────────────────────────────────────────────────────────── */

describe('technical products are imported on identity, not on dosage authority', () => {
  it('does not let a 99% identified technical product bypass ProductBehavior', () => {
    const technical = assessProductConfidence({
      kind: 'technical',
      fields: {
        identity: 'label',
        brand: 'label',
        manufacturer: 'label',
        variant: 'label',
        netQuantity: 'label',
        barcode: 'label',
        ingredients: 'label',
        dosage: 'label',
        technicalParameters: 'label',
        technicalSource: 'label',
        countryOfOrigin: 'label',
        energyKcal: 'label',
      },
      validatedBarcode: true,
      exactCanonicalMatch: false,
      mapperFamilyMatch: false,
      materialConflicts: [],
    });
    expect(technical.confidence).toBeGreaterThan(95);
    // A well-identified technical product is importable. Dosage authority is
    // not ours to grant or withhold (owner decision, 2026-08-23).
    expect(isAutoImportEligible(technical)).toBe(true);
  });

  it('classifies a professional stabilizer row as technical without withholding it', () => {
    const { rows } = analyse([
      completeRow({ 'Product Type': 'professional', 'Product Name Original': 'Guma tara' }),
    ]);
    expect(rows[0]!.kind).toBe('technical');
    expect(rows[0]!.assessment.missingCritical).not.toContain('dosage');
  });

  it('never auto-imports a high-confidence product with an unresolved conflict', () => {
    const conflicted = assessProductConfidence(
      evidence({ validatedBarcode: true, materialConflicts: ['ambiguous identity'] }),
    );
    expect(conflicted.criticalReadiness).toBe(false);
    expect(isAutoImportEligible(conflicted)).toBe(false);
    expect(routeAfterWeb(conflicted)).toBe('REVIEW_REQUIRED');
  });
});

/* ── enrichment pipeline ──────────────────────────────────────────────────── */

const toEnrichmentRows = (
  rows: readonly Record<string, string>[],
  index = {},
): EnrichmentInputRow[] =>
  analyse(rows, index).rows.map((intelligence) => ({ intelligence, barcode: null }));

describe('targeted enrichment pipeline', () => {
  const provider = () =>
    vi.fn(async () => ({
      facts: [
        { field: 'ingredients' as const, value: 'Cukier, kakao.', source: 'manufacturer' as const },
        { field: 'energyKcal' as const, value: 480, source: 'manufacturer' as const },
        { field: 'fat' as const, value: 25, source: 'manufacturer' as const },
        { field: 'carbohydrate' as const, value: 58, source: 'manufacturer' as const },
        { field: 'protein' as const, value: 6, source: 'manufacturer' as const },
        { field: 'salt' as const, value: 0.2, source: 'manufacturer' as const },
        { field: 'allergens' as const, value: 'mleko', source: 'manufacturer' as const },
        { field: 'barcode' as const, value: '5902425088609', source: 'barcode_registry' as const },
        { field: 'manufacturer' as const, value: 'ACME', source: 'manufacturer' as const },
      ],
      calls: 1,
      estimatedCostUsd: 0.01,
    }));

  it('never calls the provider for a ≥90 % product', async () => {
    const call = provider();
    const { summary } = await runIntimportEnrichment(toEnrichmentRows([completeRow()]), call);
    expect(call).not.toHaveBeenCalled();
    expect(summary.webAttempted).toBe(0);
    expect(summary.webSkippedHighConfidence).toBe(1);
    expect(summary.callsUsed).toBe(0);
  });

  it('never calls the provider for an existing canonical product', async () => {
    const call = provider();
    const rows = toEnrichmentRows([completeRow()], { byBarcode: () => 'existing-1' });
    const { summary } = await runIntimportEnrichment(rows, call);
    expect(call).not.toHaveBeenCalled();
    expect(summary.webSkippedExisting).toBe(1);
  });

  it('materially raises confidence on a thin product', async () => {
    const call = provider();
    const rows = toEnrichmentRows([row()]);
    const { products, summary } = await runIntimportEnrichment(rows, call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(summary.webAttempted).toBe(1);
    expect(products[0]!.postWebConfidence).toBeGreaterThan(products[0]!.preWebConfidence + 40);
    // Critical fields are now satisfied by manufacturer-grade research …
    expect(products[0]!.assessment.criticalReadiness).toBe(true);
    // … but a row whose OWN identity rests on no verifiable source still falls
    // short of the floor. Research fills gaps; it does not launder provenance.
    expect(products[0]!.postWebConfidence).toBeLessThan(AUTO_IMPORT_FLOOR);
    expect(products[0]!.autoImportEligible).toBe(false);
  });

  it('propagates accepted enrichment facts into the semantic evidence fingerprint', async () => {
    const call = vi.fn(async () => ({
      facts: [
        {
          field: 'ingredients' as const,
          value: 'Orzechy laskowe 100%.',
          source: 'manufacturer' as const,
          sourceUrl: 'https://manufacturer.example/hazelnut',
        },
        { field: 'manufacturer' as const, value: 'Exact Maker', source: 'manufacturer' as const },
        { field: 'barcode' as const, value: '5902425088609', source: 'barcode_registry' as const },
      ],
      calls: 1,
    }));
    const input = toEnrichmentRows([row({ 'Product Name Original': 'Produkt X' })]);
    const before = input[0]!.intelligence.recognition.evidenceFingerprint;
    const { products } = await runIntimportEnrichment(input, call);
    expect(products[0]!.recognitionEvidence).toMatchObject({
      ingredients: 'Orzechy laskowe 100%.',
      manufacturer: 'Exact Maker',
      gtin: '5902425088609',
    });
    expect(products[0]!.recognitionEvidence.sourceUrls).toContain(
      'https://manufacturer.example/hazelnut',
    );
    expect(products[0]!.recognition.evidenceFingerprint).not.toBe(before);
  });

  it('recalculates completion and Product Accuracy from the accepted web evidence', async () => {
    const call = vi.fn(async () => ({
      facts: [
        { field: 'nutritionBasis' as const, value: '100 g', source: 'manufacturer' as const },
        { field: 'ingredients' as const, value: 'Cukier, kakao.', source: 'manufacturer' as const },
        { field: 'energyKcal' as const, value: 480, source: 'manufacturer' as const },
        { field: 'fat' as const, value: 25, source: 'manufacturer' as const },
        { field: 'carbohydrate' as const, value: 58, source: 'manufacturer' as const },
        { field: 'protein' as const, value: 6, source: 'manufacturer' as const },
        { field: 'salt' as const, value: 0.2, source: 'manufacturer' as const },
      ],
      calls: 1,
      evidenceReceipt: 'c'.repeat(64),
    }));
    const parsed = parseINTIMPORT(csv([row({ 'Product Name Original': 'Produkt X' })]));
    const initial = runIntimportLocalIntelligence(parsed.candidates).rows[0]!;
    const outcome = await runIntimportEnrichment(
      [{ intelligence: initial, barcode: null }],
      call,
    );
    const mapper = buildMapperKnowledge([], 'empty-mapper');

    const recalculated = reassessIntimportAfterEnrichment({
      candidates: parsed.candidates,
      enrichedProducts: outcome.products,
      mapper,
    }).rows[0]!;

    expect(recalculated.evidence.fields.ingredients).toBe('manufacturer');
    expect(recalculated.recognitionEvidence.ingredients).toBe('Cukier, kakao.');
    expect(recalculated.workingValues?.fields.fat_percent).toMatchObject({
      value: 25,
      provenance: { state: 'VERIFIED', basis: 'official_manufacturer' },
    });
    expect(recalculated.productionAccuracy.components.nutrition.earnedPoints).toBeGreaterThan(
      initial.productionAccuracy.components.nutrition.earnedPoints,
    );
    expect(recalculated.productionAccuracy.components.ingredientsEvidence.earnedPoints).toBeGreaterThan(
      initial.productionAccuracy.components.ingredientsEvidence.earnedPoints,
    );
    expect(recalculated.enrichmentEvidenceReceipts).toEqual(['c'.repeat(64)]);
  });

  it('lifts a properly sourced product over the import floor', async () => {
    const call = provider();
    // Same missing data, but the row cites its manufacturer's own domain.
    const rows = toEnrichmentRows([
      row({
        Manufacturer: 'Acmefoods Sp. z o.o.',
        'Primary Source URL': 'https://acmefoods.com/produkty/testowy',
        'Country of Origin': 'PL',
        'Variant Original': 'Wariant A',
      }),
    ]);
    const { products } = await runIntimportEnrichment(rows, call);
    expect(products[0]!.postWebConfidence).toBeGreaterThanOrEqual(AUTO_IMPORT_FLOOR);
    expect(products[0]!.assessment.criticalReadiness).toBe(true);
    expect(products[0]!.autoImportEligible).toBe(true);
  });

  it('keeps stronger evidence through the planner and trusted server recomputation', async () => {
    const call = vi.fn(async () => ({
      ...(await provider()()),
      evidenceReceipt: 'a'.repeat(64),
    }));
    const rows = toEnrichmentRows([
      row({
        Manufacturer: 'Acmefoods Sp. z o.o.',
        'Primary Source URL': 'https://acmefoods.com/produkty/testowy',
        'Country of Origin': 'PL',
        'Variant Original': 'Wariant A',
      }),
    ]);
    const initialEvidence = structuredClone(rows[0]!.intelligence.evidence);
    const initialAccuracy = rows[0]!.intelligence.assessment.confidence;
    const { products } = await runIntimportEnrichment(rows, call);
    const enriched = products[0]!;

    expect(initialEvidence.fields.ingredients).toBeUndefined();
    expect(enriched.evidence.fields.ingredients).toBe('manufacturer');
    expect(enriched.assessment.confidence).toBeGreaterThan(initialAccuracy);
    expect(enriched.enrichmentEvidenceReceipts).toEqual(['a'.repeat(64)]);

    const planned = planIntimportImport([enriched]).rows[0]!;
    const productIntelligence = (planned.insert.extracted_json as Record<string, unknown>)
      .productIntelligence as Record<string, unknown>;
    const proposal = productIntelligence.intimportProductProfileProposal as {
      proposedMapperIngredientId: string | null;
      matchInput: typeof enriched.profileMatchInput;
      declared: Record<string, number>;
      evidence: ProductEvidenceInput;
      enrichmentEvidenceReceipts: string[];
    };
    expect(proposal.evidence).toEqual(enriched.evidence);
    expect(proposal.enrichmentEvidenceReceipts).toEqual(['a'.repeat(64)]);

    const trusted = validateIntimportProductProfileProposal({
      proposedMapperIngredientId: proposal.proposedMapperIngredientId,
      matchInput: proposal.matchInput,
      declared: proposal.declared,
      evidence: proposal.evidence,
      rows: [],
    });
    expect(trusted?.evidence.fields.ingredients).toBe('manufacturer');
    expect(trusted?.legacyEvidenceAccuracy).toBe(enriched.assessment.confidence);
    expect(trusted?.legacyEvidenceAccuracy).toBeGreaterThan(initialAccuracy);
    expect(trusted?.productAccuracyAssessment.authority).toBe('PRODUCT_PRODUCTION_ACCURACY_V1');
    expect(trusted?.productAccuracy).toBeLessThanOrEqual(84);
    expect(trusted?.productAccuracyAssessment.criticalBlockers.length).toBeGreaterThan(0);
  });

  it('leaves a product that stays under 85 in review', async () => {
    const barren = vi.fn(async () => ({ facts: [], calls: 1, estimatedCostUsd: 0.01 }));
    const { products } = await runIntimportEnrichment(toEnrichmentRows([row()]), barren);
    expect(products[0]!.postWebConfidence).toBeLessThan(AUTO_IMPORT_FLOOR);
    expect(products[0]!.finalRoute).toBe('REVIEW_REQUIRED');
    expect(products[0]!.autoImportEligible).toBe(false);
  });

  it('a web result that finds nothing never erases prior evidence', async () => {
    const empty = vi.fn(async () => ({
      facts: [{ field: 'ingredients' as const, value: null, source: 'web_search' as const }],
      calls: 1,
    }));
    const rows = toEnrichmentRows([row()]);
    const first = rows[0]!;
    const identityBefore = first.intelligence.evidence.fields.identity;
    const { products } = await runIntimportEnrichment(rows, empty);
    expect(products[0]!.appliedFacts).toEqual([]);
    expect(first.intelligence.evidence.fields.identity).toBe(identityBefore);
  });

  it('weak web evidence cannot overwrite stronger known evidence', async () => {
    const weak = vi.fn(async () => ({
      facts: [{ field: 'identity' as const, value: 'Coś innego', source: 'web_search' as const }],
      calls: 1,
    }));
    const rows = toEnrichmentRows([row()]);
    const { products } = await runIntimportEnrichment(rows, weak);
    // identity was already `source_file`, which outranks `web_search`.
    expect(products[0]!.appliedFacts.map((f) => f.field)).not.toContain('identity');
  });

  it('researches a repeated product only once', async () => {
    const call = provider();
    const rows = [...toEnrichmentRows([row()]), ...toEnrichmentRows([row()])];
    const { summary } = await runIntimportEnrichment(rows, call, {
      ...DEFAULT_ENRICHMENT_CAPS,
      concurrency: 1,
    });
    expect(call).toHaveBeenCalledTimes(1);
    expect(summary.cacheHits).toBe(1);
    expect(summary.callsUsed).toBe(1);
  });

  it('stops gracefully when the import call cap is reached', async () => {
    const call = vi.fn(async (request: { cacheKey: string }) => ({
      facts: [],
      calls: 1,
      estimatedCostUsd: 0,
      _k: request.cacheKey,
    }));
    const rows = Array.from({ length: 8 }, (_, i) =>
      toEnrichmentRows([row({ 'Product ID': `P-${i}`, 'Product Name Original': `Produkt ${i}` })])[0]!,
    );
    const { products, summary } = await runIntimportEnrichment(rows, call, {
      maxCallsPerImport: 3,
      maxSpendUsd: 5,
      concurrency: 1,
    });
    expect(summary.callsUsed).toBeLessThanOrEqual(3);
    expect(summary.capReached).toBe(true);
    const stopped = products.filter((p) => p.webSkippedReason?.includes('limit'));
    expect(stopped.length).toBeGreaterThan(0);
    // Nothing silently overspent, and the untouched rows are held for review.
    for (const product of stopped) expect(product.finalRoute).toBe('REVIEW_REQUIRED');
  });

  it('keeps completed enrichment when the server reports its authoritative cap', async () => {
    let calls = 0;
    const serverCapped = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? {
            facts: [
              { field: 'ingredients' as const, value: 'Cukier.', source: 'manufacturer' as const },
            ],
            calls: 1,
            evidenceReceipt: 'b'.repeat(64),
          }
        : { facts: [], calls: 0, capReached: true };
    });
    const rows = Array.from({ length: 8 }, (_, i) =>
      toEnrichmentRows([
        row({ 'Product ID': `SERVER-${i}`, 'Product Name Original': `Produkt ${i}` }),
      ])[0]!,
    );
    const { products, summary } = await runIntimportEnrichment(rows, serverCapped, {
      maxCallsPerImport: 400,
      maxSpendUsd: 5,
      concurrency: 1,
    });

    expect(summary.capReached).toBe(true);
    expect(serverCapped).toHaveBeenCalledTimes(2);
    expect(products).toHaveLength(8);
    expect(products[0]!.evidence.fields.ingredients).toBe('manufacturer');
    expect(products[0]!.enrichmentEvidenceReceipts).toEqual(['b'.repeat(64)]);
    expect(products.slice(1).every((product) => product.finalRoute === 'REVIEW_REQUIRED')).toBe(true);
  });

  it('uses a bounded worker pool rather than one call per row at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const call = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { facts: [], calls: 1 };
    });
    const rows = Array.from({ length: 20 }, (_, i) =>
      toEnrichmentRows([row({ 'Product ID': `P-${i}`, 'Product Name Original': `Produkt ${i}` })])[0]!,
    );
    await runIntimportEnrichment(rows, call, { maxCallsPerImport: 100, maxSpendUsd: 5, concurrency: 4 });
    expect(peak).toBeLessThanOrEqual(4);
  });
});

describe('final INTIMPORT status', () => {
  it('does not publish TOPPING_ONLY when ProductBehavior did not approve topping use', () => {
    const row = {
      recognitionTrace: { finalStatus: 'REVIEW' },
      recognition: { intendedUsageRole: 'TOPPING_ONLY' },
      productionAccuracy: { roleReadiness: 'REVIEW', productAccuracy: 91 },
      productBehaviorAuthority: { toppingEligible: false },
    } as unknown as IntimportProductIntelligence;

    expect(classifyIntimportFinalResult(row)).toBe('REVIEW');
  });

  it('publishes TOPPING_ONLY only for an explicitly topping-ready product', () => {
    const row = {
      recognitionTrace: { finalStatus: 'ENGINE_READY' },
      recognition: { intendedUsageRole: 'TOPPING_ONLY' },
      productionAccuracy: { roleReadiness: 'TOPPING_READY', productAccuracy: 91 },
      productBehaviorAuthority: { toppingEligible: true },
    } as unknown as IntimportProductIntelligence;

    expect(classifyIntimportFinalResult(row)).toBe('TOPPING_ONLY');
  });
});

/* ── parse stays free ─────────────────────────────────────────────────────── */

describe('Parse CSV remains deterministic and free', () => {
  it('performs no network call while parsing and scoring locally', () => {
    const fetchSpy = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      analyse([completeRow(), row(), completeRow({ 'Product Type': 'professional' })]);
    } finally {
      globalThis.fetch = original;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires an explicit enrichment action — nothing auto-enriches from parse', () => {
    const { rows } = analyse([row()]);
    // Local analysis only classifies; it never returns enriched facts.
    expect(rows[0]).not.toHaveProperty('appliedFacts');
    expect(rows[0]!.route).toBe('WEB_REQUIRED');
  });
});
