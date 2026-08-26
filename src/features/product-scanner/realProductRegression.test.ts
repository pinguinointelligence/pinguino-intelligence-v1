import { describe, expect, it } from 'vitest';
import {
  mergeProductScanResults,
  productSemanticEvidenceFromScanResult,
  validateServerResult,
} from '../../../supabase/functions/_shared/productScanner';
import { validateIntimportProductProfileProposal } from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import type { IntimportMapperAuthorityRow } from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import { loadMapperKnowledgeRows } from '../product-intelligence/__dryrun__/mapperFixture';
import type { ProductScanResult } from './contracts';

/**
 * Named regressions for the two owner-reported real-product E2E failures.
 * These reproduce the exact observed sequences rather than synthetic shapes:
 * HARIBO Quaxi lost earlier evidence on an accurate continuation and offered a
 * malformed barcode; La Chocolatera stayed draft because a separate allergen
 * statement was treated as strictly mandatory even when the label carried
 * direct "może zawierać" evidence.
 */

type Evidence = ProductScanResult['evidence'][number];

const regionFor = (field: string): Evidence['region'] =>
  field.startsWith('nutrition.')
    ? 'nutrition_table'
    : field === 'ingredientsText'
      ? 'ingredients'
      : field === 'allergensText' || field === 'mayContainAllergens'
        ? 'allergen_statement'
        : field.startsWith('package.')
          ? 'package'
          : 'front';

const labelEvidence = (assetId: string, fields: readonly string[]): Evidence[] =>
  fields.map(
    (field) =>
      ({
        assetId,
        field,
        source: 'label',
        confidence: 'high',
        region: regionFor(field),
        directVisibility: true,
      }) as Evidence,
  );

const empty = (): Record<string, unknown> => ({
  schemaVersion: 'gellatti_product_scan_v1',
  identity: {
    displayName: null,
    originalName: null,
    brand: null,
    explicitlyUnbranded: false,
    category: null,
    variant: null,
    countryOfOrigin: null,
    labelLanguages: [],
  },
  package: { netQuantity: null, unit: null, netQuantityText: null },
  barcodes: [],
  nutrition: {
    basis: null,
    energyKj: null,
    energyKcal: null,
    fat: null,
    saturatedFat: null,
    carbohydrate: null,
    sugars: null,
    protein: null,
    salt: null,
    fibre: null,
  },
  ingredientsText: null,
  allergensText: null,
  mayContainAllergens: [],
  claims: [],
  storageInstructions: null,
  manufacturer: null,
  externalSources: [],
  evidence: [],
  missingFields: [],
  conflicts: [],
  warnings: [],
});

const nutrition = (root: Record<string, unknown>) => root.nutrition as Record<string, unknown>;
const identity = (root: Record<string, unknown>) => root.identity as Record<string, unknown>;

describe('La Chocolatera two-photo rounding and semantic handoff regression', () => {
  const photo = (
    assetId: string,
    values: { saturatedFat: number; carbohydrate: number; protein: number },
  ): Record<string, unknown> => {
    const root = empty();
    Object.assign(identity(root), {
      displayName: 'Cacao Puro',
      originalName: 'CACAO PURO',
      brand: 'La Chocolatera',
      category: 'cacao powder',
      variant: 'Desgrasado en polvo',
      labelLanguages: ['es', 'pt'],
    });
    Object.assign(root.package as Record<string, unknown>, {
      netQuantity: 250,
      unit: 'g',
      netQuantityText: '250 g',
    });
    Object.assign(nutrition(root), {
      basis: 'per_100g',
      energyKj: 1556,
      energyKcal: 375,
      fat: 16,
      saturatedFat: values.saturatedFat,
      carbohydrate: values.carbohydrate,
      sugars: 0.7,
      fibre: 31.7,
      protein: values.protein,
      salt: 0.03,
    });
    root.ingredientsText =
      'Ingredientes: Cacao desgrasado en polvo, correctores de acidez: carbonato de potasio, hidróxido de potasio.';
    root.evidence = labelEvidence(assetId, [
      'identity.displayName',
      'identity.brand',
      'identity.category',
      'identity.variant',
      'package.netQuantity',
      'nutrition.energyKcal',
      'nutrition.fat',
      'nutrition.saturatedFat',
      'nutrition.carbohydrate',
      'nutrition.sugars',
      'nutrition.fibre',
      'nutrition.protein',
      'nutrition.salt',
      'ingredientsText',
    ]);
    return root;
  };

  const merged = mergeProductScanResults(
    photo('photo-rounded', { saturatedFat: 10, carbohydrate: 16, protein: 26 }),
    photo('photo-precise', { saturatedFat: 10.2, carbohydrate: 16.3, protein: 25.5 }),
  );

  it('retains every compatible higher-precision label value', () => {
    expect(nutrition(merged)).toMatchObject({
      saturatedFat: 10.2,
      carbohydrate: 16.3,
      protein: 25.5,
    });
    for (const field of ['nutrition.saturatedFat', 'nutrition.carbohydrate', 'nutrition.protein']) {
      expect(merged.conflicts).toContainEqual(
        expect.objectContaining({ field, retainedSource: 'label' }),
      );
    }
  });

  it('hands the exact verified package facts to Product Recognition', () => {
    const semantic = productSemanticEvidenceFromScanResult(merged);
    expect(semantic).toMatchObject({
      name: 'Cacao Puro',
      brand: 'La Chocolatera',
      category: 'cacao powder',
      variant: 'Desgrasado en polvo',
      ingredients: expect.stringContaining('Cacao desgrasado en polvo'),
      productType: 'consumer_scanner',
    });
    expect(semantic.nutrition).toContain('"saturatedFat":10.2');
    expect(semantic.nutrition).toContain('"carbohydrate":16.3');
    expect(semantic.nutrition).toContain('"protein":25.5');
  });

  it('creates a product-owned customer profile and proves the tiny residual sugar uncertainty non-material', () => {
    const semantic = productSemanticEvidenceFromScanResult(merged);
    const { rows } = loadMapperKnowledgeRows();
    const declared = {
      fat_percent: 16,
      protein_percent: 25.5,
      carbohydrate_percent: 16.3,
      total_sugars_percent: 0.7,
      fiber_percent: 31.7,
      salt_percent: 0.03,
      kcal_per_100g: 375,
    } as const;
    const authority = validateIntimportProductProfileProposal({
      origin: 'CUSTOMER_ADDED',
      proposedMapperIngredientId: null,
      recognitionEvidence: semantic,
      matchInput: {
        name: semantic.name,
        variant: semantic.variant,
        brand: semantic.brand,
        category: semantic.category,
        subcategory: semantic.subcategory,
        barcode: semantic.gtin,
        knownMacros: {
          fat_percent: 16,
          protein_percent: 25.5,
          carbohydrate_percent: 16.3,
          total_sugars_percent: 0.7,
          fiber_percent: 31.7,
          salt_percent: 0.03,
        },
        technical: false,
      },
      declared,
      declaredBasis: Object.fromEntries(
        Object.keys(declared).map((field) => [field, 'product_declared']),
      ),
      evidence: {
        kind: 'normal_food',
        fields: {
          identity: 'label',
          brand: 'label',
          variant: 'label',
          netQuantity: 'label',
          ingredients: 'label',
          allergens: 'user_confirmed',
          energyKcal: 'label',
          fat: 'label',
          carbohydrate: 'label',
          protein: 'label',
          salt: 'label',
        },
        validatedBarcode: false,
        exactCanonicalMatch: false,
        mapperFamilyMatch: false,
        materialConflicts: [],
      },
      carbonationEvidence: [
        {
          source: 'EXACT_LABEL',
          assertion: String(merged.ingredientsText),
          assertionPath: 'ingredientsText',
          sourceUrl: null,
          sourceDomain: null,
          sourceAuthorityClass: 'OWNER_PROVIDED_SOURCE',
          evidenceReceipt: null,
          retrievedAt: null,
        },
      ],
      rows: rows as unknown as IntimportMapperAuthorityRow[],
    });

    expect(authority).not.toBeNull();
    expect(authority?.recognition).toMatchObject({
      productArchetype: 'COCOA_POWDER',
      ingredientFamily: 'cocoa',
      physicalForm: 'POWDER',
      intendedUsageRole: 'BASE_ONLY',
    });
    expect(authority?.engineUsable).toBe(true);
    expect(authority?.readiness).toBe('ESTIMATED_READY');
    expect(authority?.missingEngineFields).toEqual([]);
    expect(authority?.criticalPhysicsBlockers).toEqual([]);
    expect(authority?.sweetnessPath).toMatchObject({
      kind: 'stored',
      resolved: true,
      materiality: {
        verdict: 'NON_MATERIAL',
        unresolvedSugarPercent: 0.7,
      },
    });
    for (const [field, value] of Object.entries(declared)) {
      expect(authority?.fieldTruth[field as keyof typeof declared]).toMatchObject({
        value,
        state: 'VERIFIED',
        basis: 'product_declared',
      });
    }
    expect(authority?.profileReferenceMapperIngredientId).toBe('PI-ING-001313');
    expect(authority?.mapperSimilarity).toBeGreaterThanOrEqual(0.85);
    expect(authority?.mapperCandidatesBeforeFilter.length).toBeGreaterThan(
      authority?.mapperCandidatesAfterFilter.length ?? 0,
    );
    expect(authority?.mapperCandidatesAfterFilter).toContain('PI-ING-001313');
    expect(authority?.productAccuracyAssessment.components.nutrition.earnedPoints).toBeGreaterThan(
      35,
    );
    expect(authority?.productAccuracyAssessment.components.ean.earnedPoints).toBe(0);
    expect(authority?.productAccuracyAssessment.components.manufacturer.earnedPoints).toBe(0);
    expect(authority?.productAccuracyAssessment.components.country.earnedPoints).toBe(0);
    expect(authority?.productAccuracyAssessment.components.package.earnedPoints).toBe(1);
    expect(authority?.productAccuracyAssessment.fields.water_percent?.creditFactor).toBe(0.8);
    if (process.env.PRODUCT_ACCURACY_REPORT === '1') {
      console.log(
        `COCOA_MATERIALITY ${JSON.stringify({
          productAccuracy: authority?.productAccuracy,
          rawProductAccuracy: authority?.productAccuracyAssessment.rawProductAccuracy,
          criticalCapApplied: authority?.productAccuracyAssessment.criticalCapApplied,
          criticalBlockers: authority?.productAccuracyAssessment.criticalBlockers,
          mapperSimilarity: authority?.mapperSimilarity,
          profileReferenceMapperIngredientId: authority?.profileReferenceMapperIngredientId,
          sweetnessPath: authority?.sweetnessPath,
          pod: authority?.fieldTruth.pod_value,
          pac: authority?.fieldTruth.pac_value,
          scoreFields: authority?.productAccuracyAssessment.fields,
        })}`,
      );
    }
    expect(authority?.productAccuracyAssessment.fields.pod_value?.creditFactor).toBe(0.8);
    expect(authority?.productAccuracyAssessment.fields.pac_value?.creditFactor).toBe(0.8);
    expect(authority?.productAccuracy).toBeGreaterThanOrEqual(85);
    expect(authority?.productAccuracyAssessment.criticalBlockers).not.toContain(
      'UNRESOLVED_SWEETENING_FREEZING_PATH',
    );
    expect(authority?.productAccuracyAssessment.criticalCapApplied).toBe(false);

    const withoutAllergenScore = validateIntimportProductProfileProposal({
      origin: 'CUSTOMER_ADDED',
      proposedMapperIngredientId: null,
      recognitionEvidence: semantic,
      matchInput: {
        name: semantic.name,
        variant: semantic.variant,
        brand: semantic.brand,
        category: semantic.category,
        subcategory: semantic.subcategory,
        barcode: semantic.gtin,
        knownMacros: {
          fat_percent: 16,
          protein_percent: 25.5,
          carbohydrate_percent: 16.3,
          total_sugars_percent: 0.7,
          fiber_percent: 31.7,
          salt_percent: 0.03,
        },
        technical: false,
      },
      declared,
      declaredBasis: Object.fromEntries(
        Object.keys(declared).map((field) => [field, 'product_declared']),
      ),
      evidence: {
        kind: 'normal_food',
        fields: {
          identity: 'label',
          brand: 'label',
          variant: 'label',
          netQuantity: 'label',
          ingredients: 'label',
          energyKcal: 'label',
          fat: 'label',
          carbohydrate: 'label',
          protein: 'label',
          salt: 'label',
        },
        validatedBarcode: false,
        exactCanonicalMatch: false,
        mapperFamilyMatch: false,
        materialConflicts: [],
      },
      rows: rows as unknown as IntimportMapperAuthorityRow[],
    });
    expect(withoutAllergenScore?.productAccuracy).toBe(authority?.productAccuracy);
    if (process.env.PRODUCT_ACCURACY_REPORT === '1') {
      console.log(
        `PRODUCT_ACCURACY_COCOA ${JSON.stringify({
          legacy: authority?.legacyEvidenceAccuracy,
          raw: authority?.productAccuracyAssessment.rawProductAccuracy,
          final: authority?.productAccuracy,
          capped: authority?.productAccuracyAssessment.criticalCapApplied,
          blockers: authority?.productAccuracyAssessment.criticalBlockers,
          components: authority?.productAccuracyAssessment.components,
        })}`,
      );
    }
  });
});

describe('HARIBO Quaxi cumulative-evidence regression', () => {
  // Fast pass: strong identity, valid EAN, allergen statement — no ingredients.
  const fastPass = (): Record<string, unknown> => {
    const root = empty();
    Object.assign(identity(root), {
      displayName: 'Quaxi',
      brand: 'HARIBO',
      labelLanguages: ['de'],
    });
    Object.assign(root.package as Record<string, unknown>, {
      netQuantity: 175,
      unit: 'g',
      netQuantityText: '175 g',
    });
    root.barcodes = [{ value: '4001686322536', format: 'EAN_13' }];
    Object.assign(nutrition(root), {
      basis: 'per_100g',
      energyKj: 1435,
      energyKcal: 338,
      fat: 0.5,
      saturatedFat: 0.2,
      carbohydrate: 77,
      sugars: 46,
      protein: 6.9,
      salt: 0.07,
    });
    root.allergensText = 'Może zawierać: pszenica.';
    root.mayContainAllergens = ['pszenica'];
    root.evidence = labelEvidence('asset-front', [
      'identity.displayName',
      'identity.brand',
      'package.netQuantity',
      'nutrition.energyKcal',
      'nutrition.fat',
      'nutrition.carbohydrate',
      'nutrition.protein',
      'nutrition.salt',
      'allergensText',
      'mayContainAllergens',
    ]);
    return root;
  };

  // Accurate continuation: finds ingredients, but drops the allergen statement,
  // emits a malformed EAN and disagrees on protein and salt.
  const accurateContinuation = (): Record<string, unknown> => {
    const root = empty();
    Object.assign(identity(root), { displayName: 'Quaxi', brand: 'HARIBO' });
    root.barcodes = [{ value: "4001686322536'}]},", format: 'EAN_13' }];
    root.ingredientsText =
      'Syrop glukozowy, cukier, żelatyna wieprzowa, kwas cytrynowy, aromaty, barwniki.';
    Object.assign(nutrition(root), { protein: 5.2, salt: 0.25 });
    root.evidence = labelEvidence('asset-back', [
      'ingredientsText',
      'nutrition.protein',
      'nutrition.salt',
    ]);
    return root;
  };

  const merged = mergeProductScanResults(fastPass(), accurateContinuation(), '4001686322536');

  it('preserves the validated EAN and rejects the malformed continuation candidate', () => {
    expect(merged.barcodes).toEqual([{ value: '4001686322536', format: 'EAN_13' }]);
    expect(merged.warnings).toContain('barcode_candidate_rejected');
  });

  it('never erases the earlier allergen evidence when a later call omits it', () => {
    expect(merged.allergensText).toBe('Może zawierać: pszenica.');
    expect(merged.mayContainAllergens).toContain('pszenica');
    expect(merged.evidence).toContainEqual(
      expect.objectContaining({ field: 'allergensText', assetId: 'asset-front' }),
    );
  });

  it('supplements the newly found ingredients without disturbing prior facts', () => {
    expect(merged.ingredientsText).toContain('żelatyna wieprzowa');
    expect(identity(merged).brand).toBe('HARIBO');
    expect(nutrition(merged).energyKcal).toBe(338);
  });

  it('records protein and salt disagreement as conflicts instead of last-call-wins', () => {
    for (const field of ['nutrition.protein', 'nutrition.salt']) {
      expect(merged.conflicts).toContainEqual(expect.objectContaining({ field }));
    }
    // Equally specific direct label evidence from different assets cannot be
    // silently resolved, so the disputed value is withheld rather than guessed.
    expect(nutrition(merged).protein).toBeNull();
    expect(nutrition(merged).salt).toBeNull();
  });

  it('holds finalization on the unresolved critical nutrition conflicts', () => {
    const validation = validateServerResult(merged, ['asset-front', 'asset-back']);
    expect(validation.ok).toBe(true);
    expect(validation.overlayState).toBe('SCAN_DRAFT');
    expect(validation.missingCriticalFields).toEqual(
      expect.arrayContaining(['conflict_nutrition.protein', 'conflict_nutrition.salt']),
    );
  });

  it('finalizes once the requested confirmation image corroborates one reading', () => {
    const resolution = empty();
    Object.assign(nutrition(resolution), { protein: 6.9, salt: 0.07 });
    resolution.evidence = labelEvidence('asset-nutrition-closeup', [
      'nutrition.protein',
      'nutrition.salt',
    ]);
    const settled = mergeProductScanResults(merged, resolution, '4001686322536');
    expect(nutrition(settled).protein).toBe(6.9);
    expect(nutrition(settled).salt).toBe(0.07);
    // The disagreement stays on record; only the retained source is filled in.
    for (const field of ['nutrition.protein', 'nutrition.salt']) {
      expect(settled.conflicts).toContainEqual(
        expect.objectContaining({ field, retainedSource: 'label' }),
      );
    }
    const validation = validateServerResult(settled, [
      'asset-front',
      'asset-back',
      'asset-nutrition-closeup',
    ]);
    expect(validation.missingCriticalFields).toEqual([]);
    expect(validation.overlayState).toBe('PENDING_PUBLICATION');
  });

  it('never mutates the prior session state it was handed', () => {
    const prior = fastPass();
    const snapshot = JSON.stringify(prior);
    mergeProductScanResults(prior, accurateContinuation(), '4001686322536');
    expect(JSON.stringify(prior)).toBe(snapshot);
  });

  it('does not let a weak indirect reading break a genuine label tie', () => {
    const weak = empty();
    Object.assign(nutrition(weak), { protein: 6.9, salt: 0.07 });
    weak.evidence = ['nutrition.protein', 'nutrition.salt'].map(
      (field) =>
        ({
          assetId: 'asset-retailer',
          field,
          source: 'retailer',
          confidence: 'high',
          region: 'nutrition_table',
          directVisibility: false,
        }) as Evidence,
    );
    const settled = mergeProductScanResults(merged, weak, '4001686322536');
    for (const field of ['nutrition.protein', 'nutrition.salt']) {
      expect(settled.conflicts).toContainEqual(
        expect.objectContaining({ field, retainedSource: null }),
      );
    }
    expect(validateServerResult(settled, ['asset-front', 'asset-back']).overlayState).toBe(
      'SCAN_DRAFT',
    );
  });
});

describe('La Chocolatera allergen readiness regression', () => {
  // Strong identity, nutrition and ingredients, but no separate allergen line —
  // only a directly visible "może zawierać" statement on the label.
  const scan = (): Record<string, unknown> => {
    const root = empty();
    Object.assign(identity(root), {
      displayName: 'La Chocolatera',
      brand: 'La Chocolatera',
      labelLanguages: ['es'],
    });
    Object.assign(root.package as Record<string, unknown>, {
      netQuantity: 1000,
      unit: 'g',
      netQuantityText: '1 kg',
    });
    Object.assign(nutrition(root), {
      basis: 'per_100g',
      energyKj: 2100,
      energyKcal: 502,
      fat: 30,
      saturatedFat: 18,
      carbohydrate: 52,
      sugars: 48,
      protein: 6,
      salt: 0.1,
    });
    root.ingredientsText = 'Cukier, kakao w proszku, tłuszcz kakaowy.';
    root.mayContainAllergens = ['mleko', 'orzechy'];
    root.evidence = labelEvidence('asset-1', [
      'identity.displayName',
      'identity.brand',
      'package.netQuantity',
      'nutrition.energyKcal',
      'nutrition.fat',
      'nutrition.carbohydrate',
      'nutrition.protein',
      'nutrition.salt',
      'ingredientsText',
      'mayContainAllergens',
    ]);
    return root;
  };

  it('derives the allergen summary from directly visible may-contain evidence', () => {
    const merged = mergeProductScanResults(null, scan());
    expect(merged.allergensText).toContain('mleko');
    expect(merged.warnings).toContain('allergen_summary_derived_from_direct_may_contain_evidence');
  });

  it('reaches a finalizable state instead of staying permanently draft', () => {
    const merged = mergeProductScanResults(null, scan());
    const validation = validateServerResult(merged, ['asset-1']);
    expect(validation.ok).toBe(true);
    expect(validation.missingCriticalFields).toEqual([]);
    expect(validation.overlayState).toBe('PENDING_PUBLICATION');
    expect(validation.highRiskAuthorityRequired).toBe(false);
  });

  it('still fails closed when the may-contain evidence is not directly visible', () => {
    const root = scan();
    root.evidence = (root.evidence as Evidence[]).map((item) =>
      item.field === 'mayContainAllergens'
        ? { ...item, source: 'retailer', directVisibility: false }
        : item,
    );
    const merged = mergeProductScanResults(null, root);
    expect(merged.allergensText).toBeNull();
    expect(validateServerResult(merged, ['asset-1']).missingCriticalFields).toContain(
      'allergen_confirmation',
    );
  });
});
