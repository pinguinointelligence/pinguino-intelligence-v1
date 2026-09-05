/**
 * The general mechanisms repaired for the scanner → Product Intelligence → Rescue path
 * (owner directive 2026-09-05). Each test pins one mechanism, none names a product exception.
 */
import { describe, expect, it } from 'vitest';
import type { IntimportMapperAuthorityRow } from '../../../supabase/functions/_shared/intimportWholeProfileAuthority.ts';
import { validateIntimportProductProfileProposal } from '../../../supabase/functions/_shared/intimportWholeProfileAuthority.ts';
import { applyCustomerProductFamily } from '../product-scanner/customerProductFamily';
import {
  buildMapperKnowledge,
  findProfileMatch,
  fingerprintMapperRows,
} from './mapperValueInference';
import {
  classifyProductSemantics,
  evaluateMapperSemanticCompatibility,
  type ProductSemanticEvidence,
} from './productRecognition';
import { resolveProductWorkingValues } from './productWorkingValues';

const evidence = (o: Partial<ProductSemanticEvidence> = {}): ProductSemanticEvidence => ({
  name: 'Produkt',
  brand: 'Marka',
  manufacturer: null,
  manufacturerCode: null,
  gtin: null,
  productType: 'consumer_scanner',
  category: null,
  subcategory: null,
  variant: null,
  ingredients: null,
  nutrition: null,
  description: null,
  dosage: null,
  technicalParameters: null,
  sourceUrls: [],
  ...o,
});

const row = (o: Partial<IntimportMapperAuthorityRow>): IntimportMapperAuthorityRow => ({
  ingredient_id: 'PI-ING-X',
  ingredient_name_internal: 'x',
  ingredient_name_display: 'X',
  brand: null,
  ingredient_category: 'beverage',
  ingredient_subcategory: null,
  is_active: true,
  approved_for_base: true,
  approved_for_engines: true,
  verification_status: 'Verified',
  ean_code: null,
  water_percent: null,
  total_solids_percent: null,
  fat_percent: null,
  protein_percent: null,
  carbohydrate_percent: null,
  total_sugars_percent: null,
  sucrose_percent: null,
  dextrose_percent: null,
  glucose_percent: null,
  fructose_percent: null,
  lactose_percent: null,
  polyol_percent: null,
  fiber_percent: null,
  salt_percent: null,
  alcohol_percent: null,
  kcal_per_100g: null,
  pod_value: null,
  pac_value: null,
  sweetness_factor: null,
  freezing_factor: null,
  ...o,
});

/** verified inclusion bars whose labels partition dry matter the public-label way (solids = named) */
const bar = (
  id: string,
  name: string,
  fat: number,
  protein: number,
  carb: number,
  sugars: number,
) =>
  row({
    ingredient_id: id,
    ingredient_name_internal: name.toLowerCase(),
    ingredient_name_display: `${name} · Inclusion`,
    ingredient_category: 'confectionery_inclusion',
    ingredient_subcategory: 'chocolate_bar_inclusion',
    verification_status: 'Verified / Public Label',
    fat_percent: fat,
    protein_percent: protein,
    carbohydrate_percent: carb,
    fiber_percent: 2,
    salt_percent: 0.4,
    total_solids_percent: fat + protein + carb + 2 + 0.4,
    water_percent: 100 - (fat + protein + carb + 2 + 0.4),
    total_sugars_percent: sugars,
    sucrose_percent: sugars * 0.82,
    lactose_percent: sugars * 0.18,
    dextrose_percent: 0,
    glucose_percent: 0,
    fructose_percent: 0,
    polyol_percent: 0,
    alcohol_percent: 0,
    kcal_per_100g: 480,
    pod_value: sugars * 0.85,
    pac_value: sugars,
  });

const chocolatePaste = (id: string, name: string) =>
  row({
    ingredient_id: id,
    ingredient_name_internal: name.toLowerCase(),
    ingredient_name_display: `${name} · Variegato Paste`,
    ingredient_category: 'chocolate',
    ingredient_subcategory: 'chocolate_paste',
    fat_percent: 44,
    protein_percent: 5,
    carbohydrate_percent: 38,
    total_solids_percent: 87.4,
    water_percent: 12.6,
    total_sugars_percent: 33,
    sucrose_percent: 33,
    pod_value: 33,
    pac_value: 33,
  });

describe('customer family gate — the answer resolves dimensions and opens Mapper categories', () => {
  it('a confirmed family carries its Mapper categories and no stale "model required" flag', () => {
    const base = classifyProductSemantics(evidence({ name: 'Napój XY 002', category: 'nieznana' }));
    expect(base.ingredientFamily).toBe('unknown');
    const confirmed = applyCustomerProductFamily(base, 'beverage');
    expect(confirmed).toMatchObject({
      ingredientFamily: 'beverage',
      productArchetype: 'NORMAL_INGREDIENT',
      physicalForm: 'LIQUID',
      intendedUsageRole: 'BASE_ONLY',
      modelRequired: false,
      modelReasonCodes: [],
    });
    expect(confirmed.compatibleMapperCategories).toEqual(['beverage']);
  });

  it('keeps the model flag only for a dimension the answer did not resolve', () => {
    const base = classifyProductSemantics(evidence({ name: 'Produkt bez formy', category: 'x' }));
    const confirmed = applyCustomerProductFamily(base, 'fruit'); // fruit defaults leave the form open
    expect(confirmed.ingredientFamily).toBe('fruit');
    expect(confirmed.physicalForm).toBe('UNKNOWN');
    expect(confirmed.modelRequired).toBe(true);
    expect(confirmed.modelReasonCodes).toEqual(['FORM_UNKNOWN']);
    expect(confirmed.compatibleMapperCategories).toEqual(['fruit']);
  });
});

describe('semantic gate — a packaged confectionery article and a Mapper inclusion row are one kind', () => {
  it('does not veto a brownie against an inclusion row on family alone', () => {
    const product = classifyProductSemantics(
      evidence({ name: 'Choco brownie', brand: 'Milka', category: 'Brownies' }),
    );
    const decision = evaluateMapperSemanticCompatibility(product, {
      ingredientId: 'PI-ING-INCL',
      name: 'BROWNIE PIECES GENERIC BRAND STYLE · Inclusion',
      category: 'confectionery_inclusion',
      subcategory: 'cake_inclusion',
      brand: null,
    });
    expect(decision.compatible).toBe(true);
    expect(decision.reasonCodes).toEqual([]);
  });

  it('still vetoes a paste (sauce form, topping paste kind) for a solid bar', () => {
    const product = classifyProductSemantics(
      evidence({ name: 'Choco brownie', brand: 'Milka', category: 'Brownies' }),
    );
    const decision = evaluateMapperSemanticCompatibility(product, {
      ingredientId: 'PI-ING-PASTE',
      name: 'BROWNIE · Aromitalia Variegato · 3090',
      category: 'chocolate',
      subcategory: 'chocolate_paste',
      brand: 'Aromitalia',
    });
    expect(decision.compatible).toBe(false);
  });
});

describe('matcher — candidate pools are tried in order until one scores', () => {
  const rows = [
    chocolatePaste('PI-ING-P1', 'Brownie Paste A'),
    chocolatePaste('PI-ING-P2', 'Brownie Paste B'),
    bar('PI-ING-B1', 'Snickers Bar', 29, 9.7, 54, 45),
    bar('PI-ING-B2', 'KitKat 4 Finger', 25.5, 6.5, 62, 50),
    bar('PI-ING-B3', 'Twix Caramel Biscuit', 24, 4.5, 65, 49),
  ];
  const knowledge = buildMapperKnowledge(rows, fingerprintMapperRows(rows));
  const semantic = classifyProductSemantics(
    evidence({ name: 'Choco brownie', brand: 'Milka', category: 'Brownies' }),
  );

  it('a name-similar pool whose every row is refused does not hide the authorized category pool', () => {
    const match = findProfileMatch(
      {
        name: 'Choco brownie',
        brand: 'Milka',
        category: 'Brownies',
        knownMacros: {
          fat_percent: 27,
          protein_percent: 5,
          carbohydrate_percent: 50,
          total_sugars_percent: 38,
          fiber_percent: 1.7,
          salt_percent: 0.37,
        },
        semantic,
      },
      knowledge,
    );
    expect(match.rejectedCandidates.map((c) => c.ingredientId)).toEqual(
      expect.arrayContaining(['PI-ING-P1', 'PI-ING-P2']),
    );
    expect(match.candidatesAfterFilter).toEqual(expect.arrayContaining(['PI-ING-B1']));
    expect(match.confidence).toBeGreaterThanOrEqual(0.85);
    expect(match.rejected).toBeNull();
  });

  it('recognition-level kind agreement counts for less than Engine-family agreement (0.8 vs 1)', () => {
    // a gummy against the same bars: kind agrees, macros do not → below the floor
    const gummy = classifyProductSemantics(
      evidence({ name: 'Fruit gummy bears', brand: 'Zelki', category: 'Sweets' }),
    );
    const match = findProfileMatch(
      {
        name: 'Fruit gummy bears',
        brand: 'Zelki',
        category: 'Sweets',
        knownMacros: {
          fat_percent: 0.5,
          protein_percent: 6.9,
          carbohydrate_percent: 77,
          total_sugars_percent: 46,
        },
        semantic: gummy,
      },
      knowledge,
    );
    expect(match.confidence).toBeLessThan(0.85);
  });
});

describe('working values — mass balance from a complete label', () => {
  const declared = {
    fat_percent: 27,
    protein_percent: 5,
    carbohydrate_percent: 50,
    total_sugars_percent: 38,
    fiber_percent: 1.7,
    salt_percent: 0.3725,
    kcal_per_100g: 467,
  };
  const semantic = classifyProductSemantics(
    evidence({ name: 'Choco brownie', brand: 'Milka', category: 'Brownies' }),
  );
  const identity = {
    name: 'Choco brownie',
    brand: 'Milka',
    category: 'Brownies',
    barcode: '7622210669315',
    semantic,
  };

  it('own named solids plus the donor residual beat the donor absolute water; spectrum is scaled to the declared total', () => {
    const rows = [
      bar('PI-ING-B1', 'Snickers Bar', 29, 9.7, 54, 45),
      bar('PI-ING-B2', 'KitKat 4 Finger', 25.5, 6.5, 62, 50),
      bar('PI-ING-B3', 'Twix Caramel Biscuit', 24, 4.5, 65, 49),
    ];
    const knowledge = buildMapperKnowledge(rows, fingerprintMapperRows(rows));
    const resolved = resolveProductWorkingValues(
      { declared, declaredConfidence: 0.9, identity, technical: false },
      knowledge,
    );
    expect(resolved.profileMatch?.confidence).toBeGreaterThanOrEqual(0.85);
    // 27 + 5 + 50 + 1.7 + 0.3725 named, donors' residual 0 → 84.0725 solids, not the bars' ~4% water
    expect(resolved.fields.total_solids_percent.value).toBeCloseTo(84.0725, 3);
    expect(resolved.fields.total_solids_percent.provenance).toMatchObject({
      state: 'ESTIMATED',
      basis: 'mapper_similar_profile',
    });
    expect(resolved.fields.water_percent.value).toBeCloseTo(15.9275, 3);
    expect(resolved.fields.water_percent.provenance.basis).toBe('derived');
    const named =
      (resolved.fields.sucrose_percent.value ?? 0) + (resolved.fields.lactose_percent.value ?? 0);
    expect(named).toBeCloseTo(38, 3);
    expect(resolved.sweetnessPath.resolved).toBe(true);
    expect(resolved.missingEngineFields).toEqual([]);
    expect(resolved.engineReady).toBe(true);
  });

  it('a donor whose label partitions dry matter differently (transfer overflows 100) keeps its own consistent water', () => {
    // a cocoa-like reference: 100% solids with only 78 named → residual 22; the product names 89.5
    const cocoaRow = row({
      ingredient_id: 'PI-ING-COCOA',
      ingredient_name_internal: 'cacao amaro',
      ingredient_name_display: 'CACAO AMARO · Cocoa Powder',
      ingredient_category: 'cocoa',
      ingredient_subcategory: 'cocoa_powder',
      fat_percent: 11,
      protein_percent: 23.5,
      carbohydrate_percent: 10.3,
      fiber_percent: 33.7,
      salt_percent: 0.12,
      total_solids_percent: 100,
      water_percent: 0,
      total_sugars_percent: 0.4,
      sucrose_percent: 0,
      pod_value: 0.4,
      pac_value: 1.1,
    });
    const rows = [
      cocoaRow,
      { ...cocoaRow, ingredient_id: 'PI-ING-COCOA2', ingredient_name_internal: 'cacao amaro 2' },
    ];
    const knowledge = buildMapperKnowledge(rows, fingerprintMapperRows(rows));
    const cocoa = classifyProductSemantics(
      evidence({
        name: 'Cacao Puro',
        brand: 'La Chocolatera',
        category: 'Cocoa',
        ingredients: 'cocoa powder',
      }),
    );
    const resolved = resolveProductWorkingValues(
      {
        declared: {
          fat_percent: 16,
          protein_percent: 25.5,
          carbohydrate_percent: 16.3,
          total_sugars_percent: 0.7,
          fiber_percent: 31.7,
          salt_percent: 0.03,
        },
        declaredConfidence: 0.9,
        identity: {
          name: 'Cacao Puro',
          brand: 'La Chocolatera',
          category: 'Cocoa',
          barcode: null,
          semantic: cocoa,
        },
        technical: false,
      },
      knowledge,
    );
    expect(resolved.profileMatch?.confidence).toBeGreaterThanOrEqual(0.85);
    // the transfer would give 89.5 + 22 > 100 → refused; the donor's own water (0) is consistent (100 ≥ 89.5) and applies
    expect(resolved.fields.water_percent.value).toBe(0);
    expect(resolved.fields.water_percent.provenance.basis).toBe('mapper_similar_profile');
    expect(resolved.fields.total_solids_percent.value).toBe(100);
  });

  it('a topping-only article never receives reference-free physics', () => {
    const knowledge = buildMapperKnowledge([], fingerprintMapperRows([]));
    const resolved = resolveProductWorkingValues(
      { declared, declaredConfidence: 0.9, identity, technical: false },
      knowledge,
    );
    expect(resolved.fields.total_solids_percent.value).toBeNull();
    expect(resolved.fields.water_percent.value).toBeNull();
    expect(resolved.mapperReferences).toEqual([]);
  });

  it('a base product with a complete label closes its mass balance deterministically only when the residual band is immaterial', () => {
    const knowledge = buildMapperKnowledge([], fingerprintMapperRows([]));
    const drink = classifyProductSemantics(
      evidence({
        name: 'Sport 002',
        brand: 'Vitamin Well',
        category: 'Bebida refrescante con vitaminas y minerales',
      }),
    );
    const liquid = resolveProductWorkingValues(
      {
        declared: {
          fat_percent: 0,
          protein_percent: 0,
          carbohydrate_percent: 0,
          total_sugars_percent: 0,
          fiber_percent: 0,
          salt_percent: 0.1175,
        },
        declaredConfidence: 0.9,
        identity: {
          name: 'Sport 002',
          brand: 'Vitamin Well',
          category: 'Bebida',
          barcode: null,
          semantic: drink,
        },
        technical: false,
      },
      knowledge,
    );
    // LIQUID band 0–0.8: half-width 0.4 at 100% share ≤ 0.5 tolerance → DERIVED
    expect(liquid.fields.total_solids_percent.value).toBeCloseTo(0.1175 + 0.4, 3);
    expect(liquid.fields.total_solids_percent.provenance).toMatchObject({
      state: 'ESTIMATED',
      basis: 'derived',
    });
    expect(liquid.missingEngineFields).toEqual([]);

    // the same rule for a base-role solid whose band (0.3–3) matters at ~50% share → stays UNKNOWN
    const solidBase = classifyProductSemantics(
      evidence({
        name: 'Cocoa cake base mix',
        brand: 'X',
        category: 'Cocoa',
        ingredients: 'cocoa powder',
      }),
    );
    const solid = resolveProductWorkingValues(
      {
        declared: {
          fat_percent: 27,
          protein_percent: 5,
          carbohydrate_percent: 50,
          total_sugars_percent: 38,
          fiber_percent: 1.7,
          salt_percent: 0.37,
        },
        declaredConfidence: 0.9,
        identity: {
          name: 'Cocoa cake base mix',
          brand: 'X',
          category: 'Cocoa',
          barcode: null,
          semantic: { ...solidBase, intendedUsageRole: 'BASE_ONLY', physicalForm: 'SOLID' },
        },
        technical: false,
      },
      knowledge,
    );
    expect(solid.fields.total_solids_percent.value).toBeNull();
    expect(solid.criticalPhysicsBlockers).toContain('MISSING_WATER_PERCENT');
    expect(
      solid.trace.some(
        (line) => line.includes('bounded_residual_solids') && line.includes('UNKNOWN'),
      ),
    ).toBe(true);
  });
});

describe('whole-profile authority — broad probe informs, verified rows decide', () => {
  it('reports the verified match separately and lends numbers only from verified rows', () => {
    const estimatedBrownie = bar('PI-ING-EST', 'Brownie Pieces Generic', 20, 6, 55, 35);
    estimatedBrownie.verification_status = 'Estimated / Needs Label Review';
    const rows = [
      estimatedBrownie,
      bar('PI-ING-B1', 'Snickers Bar', 29, 9.7, 54, 45),
      bar('PI-ING-B2', 'KitKat 4 Finger', 25.5, 6.5, 62, 50),
      bar('PI-ING-B3', 'Twix Caramel Biscuit', 24, 4.5, 65, 49),
    ];
    const recognitionEvidence = evidence({
      name: 'Choco brownie',
      brand: 'Milka',
      category: 'Brownies',
      gtin: '7622210669315',
      ingredients: 'sugar, egg, palm fat, wheat flour, cocoa mass, glucose syrup, milk powder',
    });
    const authority = validateIntimportProductProfileProposal({
      origin: 'CUSTOMER_ADDED',
      proposedMapperIngredientId: null,
      matchInput: {
        name: 'Choco brownie',
        brand: 'Milka',
        category: 'Brownies',
        barcode: '7622210669315',
        knownMacros: {
          fat_percent: 27,
          protein_percent: 5,
          carbohydrate_percent: 50,
          total_sugars_percent: 38,
          fiber_percent: 1.7,
          salt_percent: 0.37,
        },
        technical: false,
      },
      declared: {
        fat_percent: 27,
        protein_percent: 5,
        carbohydrate_percent: 50,
        total_sugars_percent: 38,
        fiber_percent: 1.7,
        salt_percent: 0.37,
        kcal_per_100g: 467,
      },
      declaredBasis: {
        fat_percent: 'user_confirmed',
        protein_percent: 'user_confirmed',
        carbohydrate_percent: 'user_confirmed',
        total_sugars_percent: 'user_confirmed',
        fiber_percent: 'user_confirmed',
        salt_percent: 'user_confirmed',
        kcal_per_100g: 'user_confirmed',
      },
      evidence: {
        kind: 'normal_food',
        fields: {
          identity: 'user_confirmed',
          brand: 'user_confirmed',
          ingredients: 'user_confirmed',
          barcode: 'label',
          energyKcal: 'user_confirmed',
          fat: 'user_confirmed',
          carbohydrate: 'user_confirmed',
          sugars: 'user_confirmed',
          protein: 'user_confirmed',
          salt: 'user_confirmed',
          fiber: 'user_confirmed',
          nutritionBasis: 'user_confirmed',
        },
        validatedBarcode: true,
        exactCanonicalMatch: false,
        mapperFamilyMatch: true,
        materialConflicts: [],
      },
      recognitionEvidence,
      rows,
    });
    expect(authority).not.toBeNull();
    expect(authority?.mapperCandidatesBeforeFilter).toContain('PI-ING-EST');
    expect(authority?.mapperVerifiedMatch?.candidatesAfterFilter).not.toContain('PI-ING-EST');
    expect(authority?.estimatedFromMapperIds).not.toContain('PI-ING-EST');
    expect(authority?.estimatedFromMapperIds.length).toBeGreaterThan(0);
    expect(authority?.engineUsable).toBe(true);
    expect(authority?.technicalComposition.totalSolids).toBeCloseTo(84.07, 1);
  });
});

describe('adjacent gaps closed on the same path', () => {
  it('a stray web dosage string on a consumer food does not keep semantics unresolved', () => {
    const drink = classifyProductSemantics(
      evidence({
        name: 'Sport 002',
        brand: 'Vitamin Well',
        category: 'sports drink',
        dosage: 'Vitamin Well Sport 002 product information',
      }),
    );
    expect(drink.dosage.semantics).toBe('UNKNOWN');
    expect(drink.modelReasonCodes).not.toContain('DOSAGE_SEMANTICS_UNKNOWN');
    expect(drink.modelRequired).toBe(false);
    const stabilizer = classifyProductSemantics(
      evidence({
        name: 'Neutro 5 Stabilizer',
        brand: 'PreGel',
        category: 'Professional gelato products',
        dosage: 'see technical sheet',
      }),
    );
    expect(stabilizer.productArchetype).toBe('STABILIZER');
    expect(stabilizer.modelReasonCodes).toContain('DOSAGE_SEMANTICS_UNKNOWN');
  });
});
