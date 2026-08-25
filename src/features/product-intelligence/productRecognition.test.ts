import { describe, expect, it } from 'vitest';
import {
  canonicalizeProductSemanticEvidence,
  classifyProductSemantics,
  evaluateMapperSemanticCompatibility,
  parseProductDosage,
  validateProductSemanticModelOutput,
  type ProductSemanticEvidence,
} from './productRecognition';
import {
  buildMapperKnowledge,
  findProfileMatch,
  type MapperKnowledgeRow,
} from './mapperValueInference';

const evidence = (
  overrides: Partial<ProductSemanticEvidence> = {},
): ProductSemanticEvidence => ({
  name: 'Produkt testowy',
  brand: 'Marka',
  manufacturer: 'Producent',
  manufacturerCode: null,
  gtin: null,
  productType: null,
  category: null,
  subcategory: null,
  variant: null,
  ingredients: null,
  nutrition: null,
  description: null,
  dosage: null,
  technicalParameters: null,
  sourceUrls: [],
  ...overrides,
});

const mapperRow = (
  ingredientId: string,
  name: string,
  category: string,
  subcategory: string,
): MapperKnowledgeRow => ({
  ingredient_id: ingredientId,
  ingredient_name_internal: name,
  ingredient_name_display: name,
  brand: 'Comprital',
  ingredient_category: category,
  ingredient_subcategory: subcategory,
  is_active: true,
  approved_for_base: true,
  approved_for_engines: true,
  verification_status: 'Verified',
  ean_code: null,
  water_percent: 4,
  total_solids_percent: 96,
  fat_percent: 33,
  protein_percent: 0,
  carbohydrate_percent: 51,
  total_sugars_percent: 41,
  sucrose_percent: 41,
  dextrose_percent: 0,
  glucose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0.5,
  alcohol_percent: 0,
  kcal_per_100g: 550,
  pod_value: 40,
  pac_value: 44,
  sweetness_factor: null,
  freezing_factor: null,
});

describe('Product Recognition V2 — deterministic semantic authority', () => {
  it('does not turn the professional market context into a technical classification', () => {
    const result = classifyProductSemantics(
      evidence({
        productType: 'professional',
        category: 'Professional gelato products',
        subcategory: 'Pasty orzechowe',
        name: 'Pasta z orzechów laskowych 100%',
        ingredients: 'Orzechy laskowe 100%.',
      }),
    );

    expect(result.isProfessionalProduct).toBe(true);
    expect(result.isTechnicalProduct).toBe(false);
    expect(result.ingredientFamily).toBe('nut_paste');
    expect(result.intendedUsageRole).toBe('BASE_ONLY');
  });

  it('parses g/L without inventing a percent or a density conversion', () => {
    expect(parseProductDosage('100 g/L gotowej mieszanki')).toMatchObject({
      semantics: 'FIXED',
      value: 100,
      unit: 'G_PER_L',
      basis: 'FINISHED_MIX',
      normalizedMassPercent: null,
      densityResolved: false,
    });
    expect(parseProductDosage('50g/l')).toMatchObject({
      value: 50,
      unit: 'G_PER_L',
      basis: 'UNKNOWN',
      normalizedMassPercent: null,
    });
  });

  it('treats manufacturer-confirmed variegato q.b. as topping rather than a dose block', () => {
    const result = classifyProductSemantics(
      evidence({
        productType: 'professional',
        category: 'Professional gelato products',
        subcategory: 'Variegato',
        name: 'Variegato pistacchio',
        dosage: 'q.b.',
        description: 'Gotowy produkt do przekładania i dekoracji lodów.',
      }),
    );

    expect(result.dosage).toMatchObject({
      semantics: 'AS_DESIRED',
      value: null,
      unit: 'AS_DESIRED',
    });
    expect(result.intendedUsageRole).toBe('TOPPING_ONLY');
    expect(result.isDosageDependent).toBe(false);
    expect(result.isTechnicalProduct).toBe(false);
  });

  it('does not turn q.b. into topping without role evidence', () => {
    const result = classifyProductSemantics(evidence({ dosage: 'quanto basta' }));
    expect(result.dosage.semantics).toBe('AS_DESIRED');
    expect(result.intendedUsageRole).toBe('NEITHER_REVIEW');
    expect(result.modelRequired).toBe(true);
  });

  it('keeps a genuine stabilizer fail-closed', () => {
    const result = classifyProductSemantics(
      evidence({
        productType: 'professional',
        category: 'Stabilizers and emulsifiers',
        subcategory: 'Stabilizery',
        name: 'Neutro stabilizer 5',
        dosage: '3 g/L gotowej mieszanki',
        description: 'Stabilizator do lodów.',
      }),
    );

    expect(result.productArchetype).toBe('STABILIZER');
    expect(result.isTechnicalProduct).toBe(true);
    expect(result.isDosageDependent).toBe(true);
    expect(result.intendedUsageRole).toBe('BASE_ONLY');
  });

  it('rejects a model result that invents a dosage value', () => {
    const exact = evidence({ name: 'Niejasny produkt', dosage: null });
    expect(validateProductSemanticModelOutput(exact, {
      productArchetype: 'BASE_MIX', ingredientFamily: 'base_mix', physicalForm: 'POWDER',
      intendedUsageRole: 'BASE_ONLY', flavorDomain: 'NEUTRAL', professional: true,
      technical: true, dosageDependent: true,
      dosage: { semantics: 'FIXED', value: 50, unit: 'G_PER_L', basis: 'MILK' },
      compatibleMapperCategories: ['base_mix'], forbiddenMapperCategories: ['alcohol'],
      confidence: 0.9, reasonCodes: ['BASE_EVIDENCE'], evidenceRefs: ['name'],
    })).toBeNull();
  });

  it('fingerprints the same bounded exact evidence at browser and server boundaries', () => {
    const long = evidence({ description: `  ${'x'.repeat(2_500)}  ` });
    const canonical = canonicalizeProductSemanticEvidence(long);
    expect(canonical.description).toHaveLength(2_000);
    expect(classifyProductSemantics(long).evidenceFingerprint).toBe(
      classifyProductSemantics(canonical).evidenceFingerprint,
    );
  });

  it('rejects a model evidence reference when that exact field is absent', () => {
    const exact = evidence({ name: 'Niejasny produkt' });
    expect(validateProductSemanticModelOutput(exact, {
      productArchetype: 'UNKNOWN', ingredientFamily: 'unknown', physicalForm: 'UNKNOWN',
      intendedUsageRole: 'NEITHER_REVIEW', flavorDomain: 'UNKNOWN', professional: false,
      technical: false, dosageDependent: false,
      dosage: { semantics: 'NONE', value: null, unit: 'UNKNOWN', basis: 'UNKNOWN' },
      compatibleMapperCategories: [], forbiddenMapperCategories: [], confidence: 0.2,
      reasonCodes: ['INSUFFICIENT_EVIDENCE'], evidenceRefs: ['dosage'],
    })).toBeNull();
  });
});

describe('Product Recognition V2 — Mapper semantic hard contradictions', () => {
  it('enforces server-validated forbidden Mapper categories', () => {
    const product = {
      ...classifyProductSemantics(evidence({ name: 'Niejasny produkt' })),
      compatibleMapperCategories: [],
      forbiddenMapperCategories: ['alcohol'],
    };
    const decision = evaluateMapperSemanticCompatibility(product, {
      ingredientId: 'alcohol',
      name: 'Neutral alcohol product',
      category: 'alcohol',
      subcategory: 'alcoholic_base_mix',
      brand: 'X',
    });
    expect(decision.compatible).toBe(false);
    expect(decision.reasonCodes).toContain('SEMANTIC_FORBIDDEN_CATEGORY');
  });

  it('BAITZ rejects the pistachio rippling-sauce donor before similarity acceptance', () => {
    const product = classifyProductSemantics(
      evidence({
        name: 'Baitz Baton choco cocos',
        brand: 'Baitz',
        category: 'Bakery & sweets',
        subcategory: 'Słodycze — bieżący katalog online',
      }),
    );
    const decision = evaluateMapperSemanticCompatibility(product, {
      ingredientId: 'PI-ING-000091',
      name: 'CHOCO FLAKES PISTACHIO · Leagel Rippling Sauce · Dry · 233601',
      category: 'chocolate',
      subcategory: 'chocolate_component',
      brand: 'Leagel',
    });

    expect(decision.compatible).toBe(false);
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining(['SEMANTIC_FORM_CONTRADICTION', 'SEMANTIC_FAMILY_CONTRADICTION']),
    );
  });

  it('BASE 50 rejects an alcoholic base donor without an ID special case', () => {
    const product = classifyProductSemantics(
      evidence({
        productType: 'professional',
        name: 'BASE 50',
        category: 'Professional gelato products',
        subcategory: 'Niskie dozowanie',
        variant: 'Mleczno śmietankowy',
        dosage: '50 g/L',
        description: 'Baza o smaku mleczno-śmietankowym, bez tłuszczów roślinnych.',
      }),
    );
    const decision = evaluateMapperSemanticCompatibility(product, {
      ingredientId: 'PI-ING-000048',
      name: 'ALCOLICA · Comprital Base Mix · B091',
      category: 'base_mix',
      subcategory: 'alcoholic_base_mix',
      brand: 'Comprital',
    });

    expect(decision.compatible).toBe(false);
    expect(decision.reasonCodes).toContain('SEMANTIC_FLAVOR_DOMAIN_CONTRADICTION');
  });

  it('dry tea rejects paste and liquid donors', () => {
    const product = classifyProductSemantics(
      evidence({
        name: 'Herbata liściasta Earl Grey',
        category: 'Tea',
        subcategory: 'Herbata sucha',
        description: 'Suszone liście herbaty.',
      }),
    );
    for (const candidate of [
      {
        ingredientId: 'paste', name: 'Earl Grey flavour paste',
        category: 'flavor_paste', subcategory: 'flavored_ice_cream_paste', brand: 'X',
      },
      {
        ingredientId: 'liquid', name: 'Earl Grey liquid concentrate',
        category: 'flavor_concentrate', subcategory: 'liquid', brand: 'X',
      },
    ]) {
      const decision = evaluateMapperSemanticCompatibility(product, candidate);
      expect(decision.compatible).toBe(false);
      expect(decision.reasonCodes).toContain('SEMANTIC_FORM_CONTRADICTION');
    }
  });

  it('white chocolate rejects a dark-chocolate donor absent explicit equivalence', () => {
    const product = classifyProductSemantics(
      evidence({
        name: 'Biała czekolada',
        category: 'Chocolate',
        subcategory: 'White chocolate',
      }),
    );
    const decision = evaluateMapperSemanticCompatibility(product, {
      ingredientId: 'dark',
      name: 'Dark chocolate 70%',
      category: 'chocolate',
      subcategory: 'dark_chocolate',
      brand: 'X',
    });

    expect(decision.compatible).toBe(false);
    expect(decision.reasonCodes).toContain('SEMANTIC_FLAVOR_DOMAIN_CONTRADICTION');
  });

  it('applies the hard semantic gate inside the whole-profile matcher before 0.85', () => {
    const badBaitz = mapperRow(
      'PI-ING-000091',
      'CHOCO FLAKES PISTACHIO Leagel Rippling Sauce',
      'chocolate',
      'chocolate_component',
    );
    const badBase50 = mapperRow(
      'PI-ING-000048',
      'ALCOLICA Comprital Base Mix',
      'base_mix',
      'alcoholic_base_mix',
    );
    const knowledge = buildMapperKnowledge([badBaitz, badBase50], 'recognition-test');
    const baitzSemantic = classifyProductSemantics(evidence({
      name: 'Baitz Baton choco cocos',
      brand: 'Baitz',
      category: 'Bakery & sweets',
      subcategory: 'Słodycze',
    }));
    const baitz = findProfileMatch({
      name: 'Baitz Baton choco cocos', brand: 'Baitz', category: 'Bakery & sweets',
      subcategory: 'Słodycze', knownMacros: { fat_percent: 33, total_sugars_percent: 41 },
      semantic: baitzSemantic,
    }, knowledge);
    expect(baitz.confidence).toBeLessThan(0.85);
    expect(baitz.candidatesAfterFilter).not.toContain('PI-ING-000091');
    expect(baitz.rejectedCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredientId: 'PI-ING-000091' }),
    ]));

    const base50Semantic = classifyProductSemantics(evidence({
      productType: 'professional', name: 'BASE 50', variant: 'Mleczno śmietankowy',
      category: 'Professional gelato products', subcategory: 'Niskie dozowanie',
      dosage: '50 g/L', description: 'Baza mleczno śmietankowa.',
    }));
    const base50 = findProfileMatch({
      name: 'BASE 50', variant: 'Mleczno śmietankowy', category: 'Professional gelato products',
      subcategory: 'Niskie dozowanie', knownMacros: { fat_percent: 33, total_sugars_percent: 41 },
      semantic: base50Semantic,
    }, knowledge);
    expect(base50.candidatesAfterFilter).not.toContain('PI-ING-000048');
    expect(base50.rejectedCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ingredientId: 'PI-ING-000048',
        reasonCodes: expect.arrayContaining(['SEMANTIC_FLAVOR_DOMAIN_CONTRADICTION']),
      }),
    ]));
  });
});
