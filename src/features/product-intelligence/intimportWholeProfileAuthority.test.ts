import { describe, expect, it } from 'vitest';
import type { ProfileMatchInput } from './mapperValueInference';
import {
  validateIntimportProductProfileProposal,
  validateIntimportWholeProfileProposal,
  type IntimportMapperAuthorityRow,
} from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';

const baseRow = (
  overrides: Partial<IntimportMapperAuthorityRow> = {},
): IntimportMapperAuthorityRow => ({
  ingredient_id: 'PI-ING-TEST-001',
  ingredient_name_internal: 'inulin',
  ingredient_name_display: 'INULIN',
  brand: null,
  ingredient_category: 'fiber',
  ingredient_subcategory: 'inulin',
  is_active: true,
  approved_for_base: true,
  approved_for_engines: true,
  verification_status: 'Verified',
  ean_code: null,
  water_percent: 5,
  total_solids_percent: 95,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 8,
  total_sugars_percent: 0,
  sucrose_percent: 0,
  dextrose_percent: 0,
  glucose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 87,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 180,
  pod_value: 0,
  pac_value: 0,
  sweetness_factor: 0,
  freezing_factor: 0,
  ...overrides,
});

const input = (overrides: Partial<ProfileMatchInput> = {}): ProfileMatchInput => ({
  name: 'inulin',
  variant: null,
  brand: null,
  category: 'fiber',
  subcategory: 'inulin',
  barcode: null,
  knownMacros: {},
  technical: true,
  ...overrides,
});

const validate = (
  row: IntimportMapperAuthorityRow,
  matchInput: ProfileMatchInput = input(),
  proposedMapperIngredientId = row.ingredient_id,
) =>
  validateIntimportWholeProfileProposal({
    proposedMapperIngredientId,
    matchInput,
    rows: [row],
  });

describe('INTIMPORT whole-profile target authority', () => {
  it('accepts the canonical Verified label', () => {
    expect(validate(baseRow())).toMatchObject({
      authority: 'INTIMPORT_WHOLE_PROFILE_MATCH',
      mapperIngredientId: 'PI-ING-TEST-001',
    });
  });

  it('accepts a governed Verified / Public Label target', () => {
    expect(validate(baseRow({ verification_status: 'Verified / Public Label' }))).not.toBeNull();
  });

  it('normalizes surrounding whitespace before applying the Verified prefix', () => {
    expect(
      validate(baseRow({ verification_status: '  Verified / Public Label  ' })),
    ).not.toBeNull();
  });

  it('rejects a non-Verified target', () => {
    expect(validate(baseRow({ verification_status: 'Estimated' }))).toBeNull();
  });

  it('rejects an inactive target', () => {
    expect(validate(baseRow({ is_active: false }))).toBeNull();
  });

  it('rejects approved_for_base=false', () => {
    expect(validate(baseRow({ approved_for_base: false }))).toBeNull();
  });

  it('rejects approved_for_engines=false', () => {
    expect(validate(baseRow({ approved_for_engines: false }))).toBeNull();
  });
});

describe('INTIMPORT whole-profile match validation', () => {
  it('accepts a server-recomputed profile at or above the 85% floor', () => {
    const authority = validate(baseRow());
    expect(authority?.confidence).toBeGreaterThanOrEqual(0.85);
    expect(authority?.hardContradiction).toBe(false);
  });

  it('rejects a profile below the 85% floor', () => {
    const weak = baseRow({
      ingredient_name_internal: 'neutral product',
      ingredient_name_display: 'NEUTRAL PRODUCT',
      ingredient_category: null,
      ingredient_subcategory: null,
    });
    expect(validate(weak, input({ name: 'unknown product', category: null, subcategory: null }))).toBeNull();
  });

  it('rejects a hard family/category contradiction', () => {
    const beverage = baseRow({
      ingredient_name_internal: 'cola drink',
      ingredient_name_display: 'COLA DRINK',
      ingredient_category: 'beverage',
      ingredient_subcategory: 'soft_drink',
    });
    expect(
      validate(
        beverage,
        input({ name: 'mleko', category: 'dairy', subcategory: 'milk', technical: false }),
      ),
    ).toBeNull();
  });

  it('rejects a different ID than the exact server-selected donor', () => {
    expect(validate(baseRow(), input(), 'PI-ING-SPOOFED')).toBeNull();
  });
});

describe('INTIMPORT trusted product-owned profile', () => {
  const inulinRecognitionEvidence = {
    name: 'Inulin powder',
    brand: 'Test',
    manufacturer: 'Test',
    manufacturerCode: null,
    gtin: '12345670',
    productType: 'food ingredient',
    category: 'fibre inulin powder',
    subcategory: 'inulin',
    variant: null,
    ingredients: 'inulin',
    nutrition: null,
    description: 'powder ingredient for gelato',
    dosage: null,
    technicalParameters: null,
    sourceUrls: [],
  };
  const completeEvidence = {
    kind: 'normal_food' as const,
    fields: {
      identity: 'source_file' as const,
      brand: 'source_file' as const,
      manufacturer: 'source_file' as const,
      variant: 'source_file' as const,
      netQuantity: 'source_file' as const,
      barcode: 'barcode_registry' as const,
      ingredients: 'source_file' as const,
      allergens: 'source_file' as const,
      energyKcal: 'source_file' as const,
      fat: 'source_file' as const,
      carbohydrate: 'source_file' as const,
      protein: 'source_file' as const,
      salt: 'source_file' as const,
      countryOfOrigin: 'source_file' as const,
    },
    validatedBarcode: true,
    exactCanonicalMatch: false,
    mapperFamilyMatch: true,
    materialConflicts: [],
  };

  it('recomputes a PR-owned profile and never overwrites a declared product value', () => {
    const authority = validateIntimportProductProfileProposal({
      proposedMapperIngredientId: null,
      matchInput: input({
        name: 'inulin',
        knownMacros: { fat_percent: 11, protein_percent: 24, carbohydrate_percent: 13 },
      }),
      declared: {
        fat_percent: 11,
        protein_percent: 24,
        carbohydrate_percent: 13,
        total_sugars_percent: 0.5,
      },
      evidence: completeEvidence,
      rows: [
        baseRow({
          fat_percent: 70,
          protein_percent: 2,
          carbohydrate_percent: 20,
          total_sugars_percent: 18,
        }),
      ],
    });

    expect(authority).not.toBeNull();
    expect(authority?.technicalComposition.fat).toBe(11);
    expect(authority?.technicalComposition.protein).toBe(24);
    expect(authority?.technicalComposition.carbohydrate).toBe(13);
    expect(authority?.technicalComposition.sugars).toBe(0.5);
    expect(authority?.fieldTruth.fat_percent).toMatchObject({
      state: 'VERIFIED',
      basis: 'product_declared',
    });
    expect(authority?.articleIdentity).toBe('PRODUCT_OWNED');
  });

  it('derives Product Accuracy but admits Engine profiles on critical physics', () => {
    const accepted = validateIntimportProductProfileProposal({
      proposedMapperIngredientId: 'PI-ING-TEST-001',
      matchInput: input(),
      declared: {},
      evidence: completeEvidence,
      recognitionEvidence: inulinRecognitionEvidence,
      rows: [baseRow()],
    });
    expect(accepted?.productAccuracy).toBeGreaterThanOrEqual(85);
    expect(accepted?.engineUsable).toBe(true);

    const weak = validateIntimportProductProfileProposal({
      proposedMapperIngredientId: 'PI-ING-TEST-001',
      matchInput: input(),
      declared: {},
      evidence: {
        ...completeEvidence,
        fields: { identity: 'web_search' as const },
      },
      recognitionEvidence: inulinRecognitionEvidence,
      rows: [baseRow()],
    });
    expect(weak?.productAccuracy).toBeLessThan(85);
    expect(weak?.engineUsable).toBe(true);
  });

  it('uses one exact-evidence carbonation classifier for PR and PM', () => {
    const carbonationEvidence = [{
      source: 'EXACT_LABEL' as const,
      assertion: 'Składniki: woda, dwutlenek węgla, aromaty',
      assertionPath: 'ingredientsText',
      sourceUrl: null,
      sourceDomain: null,
      sourceAuthorityClass: 'label',
      evidenceReceipt: null,
      retrievedAt: null,
    }];
    const profile = (origin: 'PR' | 'PM') => validateIntimportProductProfileProposal({
      origin,
      proposedMapperIngredientId: 'PI-ING-TEST-001',
      matchInput: input(),
      declared: {},
      evidence: completeEvidence,
      carbonationEvidence,
      rows: [baseRow()],
    });
    expect(profile('PR')?.carbonation).toEqual(profile('PM')?.carbonation);
    expect(profile('PR')?.carbonation.status).toBe('CARBONATED');
  });

  it('produces identical field truth, Product Accuracy, cap and reasons for identical PR/PM evidence', () => {
    const profile = (origin: 'PR' | 'PM') => validateIntimportProductProfileProposal({
      origin,
      proposedMapperIngredientId: null,
      matchInput: input(),
      declared: {},
      evidence: completeEvidence,
      recognitionEvidence: inulinRecognitionEvidence,
      rows: [baseRow()],
    });
    const pr = profile('PR');
    const pm = profile('PM');

    expect(pr?.fieldTruth).toEqual(pm?.fieldTruth);
    expect(pr?.productAccuracy).toBe(pm?.productAccuracy);
    expect(pr?.productAccuracyAssessment).toEqual(pm?.productAccuracyAssessment);
    expect(pr?.criticalPhysicsBlockers).toEqual(pm?.criticalPhysicsBlockers);
    expect(pr?.sweetnessPath).toEqual(pm?.sweetnessPath);
    expect(pr?.productAccuracyAssessment.criticalCapApplied).toBe(false);
  });

  it('gives PR and PM identical Product Accuracy credit for authoritative retailer evidence', () => {
    const retailerEvidence = {
      ...completeEvidence,
      fields: {
        ...completeEvidence.fields,
        identity: 'retailer' as const,
        manufacturer: 'retailer' as const,
        netQuantity: 'retailer' as const,
        ingredients: 'retailer' as const,
        countryOfOrigin: 'retailer' as const,
      },
    };
    const retailerFact = () => ({
      source: 'retailer' as const,
      sourceUrl: 'https://zakupy.biedronka.pl/pl-PL/product-id',
      sourceDomain: 'zakupy.biedronka.pl',
      sourceTitle: 'Exact retailer product',
      sourceAuthorityClass: 'AUTHORITATIVE_RETAILER',
      retrievedAt: '2026-08-25',
      evidenceReceipt: null,
    });
    const evidenceProvenance = {
      identity: retailerFact(),
      manufacturer: retailerFact(),
      netQuantity: retailerFact(),
      ingredients: retailerFact(),
      countryOfOrigin: retailerFact(),
    };
    const profile = (origin: 'PR' | 'PM') => validateIntimportProductProfileProposal({
      origin,
      proposedMapperIngredientId: null,
      matchInput: input(),
      declared: {},
      evidence: retailerEvidence,
      evidenceProvenance,
      recognitionEvidence: inulinRecognitionEvidence,
      rows: [baseRow()],
    });

    const pr = profile('PR');
    const pm = profile('PM');

    expect(pr?.productAccuracyAssessment).toEqual(pm?.productAccuracyAssessment);
    expect(pr?.productAccuracy).toBe(pm?.productAccuracy);
    expect(pr?.productAccuracyAssessment.fields.identity?.earnedPoints).toBe(1);
    expect(pr?.productAccuracyAssessment.fields.ingredients?.earnedPoints).toBe(6);
    expect(pr?.productAccuracyAssessment.fields.manufacturer?.earnedPoints).toBe(1);
    expect(pr?.productAccuracyAssessment.fields.countryOfOrigin?.earnedPoints).toBe(1);
    expect(pr?.productAccuracyAssessment.fields.netQuantity?.earnedPoints).toBe(1);
  });

  it('ignores a forged browser final composition and publishes only the recomputed profile', () => {
    const authority = validateIntimportProductProfileProposal({
      proposedMapperIngredientId: 'PI-ING-TEST-001',
      matchInput: input(),
      declared: {},
      evidence: completeEvidence,
      proposedTechnicalComposition: {
        fat: 999,
        water: -400,
        pacValue: 123456,
      },
      rows: [baseRow()],
    });
    expect(authority?.technicalComposition.fat).toBe(0);
    expect(authority?.technicalComposition.water).toBe(5);
    expect(authority?.technicalComposition.pacValue).toBe(0);
  });

  it('treats a stale browser donor as advisory and keeps the server-recomputed PR profile', () => {
    const authority = validateIntimportProductProfileProposal({
      proposedMapperIngredientId: 'PI-ING-FORGED-999',
      matchInput: input(),
      declared: {},
      evidence: completeEvidence,
      rows: [baseRow()],
    });

    expect(authority).not.toBeNull();
    expect(authority?.estimatedFromMapperIds).toEqual(['PI-ING-TEST-001']);
    expect(authority?.articleIdentity).toBe('PRODUCT_OWNED');
  });

  it('never estimates from a Mapper row that is not eligible for Engine use', () => {
    const authority = validateIntimportProductProfileProposal({
      proposedMapperIngredientId: 'PI-ING-TEST-001',
      matchInput: input(),
      declared: { fat_percent: 11 },
      evidence: completeEvidence,
      rows: [baseRow({ approved_for_engines: false, fat_percent: 70 })],
    });

    expect(authority).not.toBeNull();
    expect(authority?.technicalComposition.fat).toBe(11);
    expect(authority?.estimatedFromMapperIds).toEqual([]);
  });

  it('persists PM user values with USER_CONFIRMED provenance and recalculates accuracy', () => {
    const authority = validateIntimportProductProfileProposal({
      origin: 'PM',
      proposedMapperIngredientId: null,
      matchInput: input({ technical: false }),
      declared: { fat_percent: 12.5, protein_percent: 7 },
      declaredBasis: {
        fat_percent: 'user_confirmed',
        protein_percent: 'user_confirmed',
      },
      evidence: {
        ...completeEvidence,
        fields: {
          ...completeEvidence.fields,
          fat: 'user_confirmed',
          protein: 'user_confirmed',
          allergens: 'user_confirmed',
        },
      },
      rows: [baseRow()],
    });
    expect(authority).toMatchObject({
      authority: 'PRODUCT_PROFILE_V1',
      origin: 'PM',
      allergenEvidenceStatus: 'USER_CONFIRMED',
    });
    expect(authority?.fieldTruth.fat_percent).toMatchObject({
      value: 12.5,
      state: 'VERIFIED',
      basis: 'user_confirmed',
    });
  });
});
