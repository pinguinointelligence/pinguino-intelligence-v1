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

const evidence = (overrides: Partial<ProductSemanticEvidence> = {}): ProductSemanticEvidence => ({
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
  it('classifies pure defatted cocoa before generic chocolate matching', () => {
    const result = classifyProductSemantics(
      evidence({
        name: 'Cacao Puro',
        brand: 'La Chocolatera',
        category: 'cacao powder',
        variant: 'Desgrasado en polvo',
        ingredients: 'Cacao desgrasado en polvo, carbonato de potasio.',
      }),
    );

    expect(result).toMatchObject({
      classificationSource: 'DETERMINISTIC',
      productArchetype: 'COCOA_POWDER',
      ingredientFamily: 'cocoa',
      physicalForm: 'POWDER',
      intendedUsageRole: 'BASE_ONLY',
      modelRequired: false,
    });
    expect(result.compatibleMapperCategories).toEqual(['cocoa', 'chocolate']);
  });

  it('keeps a chocolate-flavoured baking mix out of the chocolate family', () => {
    const result = classifyProductSemantics(
      evidence({
        name: 'Dr. Oetker Babeczki czekoladowe ze skórką pomarańczy',
        brand: 'Dr. Oetker',
        category: 'Chocolate & cocoa',
        subcategory: 'baking',
      }),
    );

    expect(result).toMatchObject({
      productArchetype: 'BAKERY_MIX',
      ingredientFamily: 'bakery_mix',
      physicalForm: 'POWDER',
      intendedUsageRole: 'NEITHER_REVIEW',
      modelRequired: false,
    });
    expect(result.compatibleMapperCategories).toEqual([]);
  });

  it('distinguishes whole nuts and dried mixes from nut paste', () => {
    expect(
      classifyProductSemantics(
        evidence({
          name: 'Migdały łuskane kalifornijskie',
          category: 'Nuts & pastes',
          subcategory: 'Orzechy i migdały',
        }),
      ),
    ).toMatchObject({
      productArchetype: 'WHOLE_NUT',
      ingredientFamily: 'nut',
      physicalForm: 'DRY',
      intendedUsageRole: 'BASE_AND_TOPPING',
    });
    expect(
      classifyProductSemantics(
        evidence({
          name: "Mieszanka egzotyczna BakaD'Or",
          category: 'Nuts & pastes',
          subcategory: 'Mieszanki bakaliowe',
        }),
      ),
    ).toMatchObject({
      productArchetype: 'DRIED_MIX',
      ingredientFamily: 'inclusion',
      physicalForm: 'DRY',
      intendedUsageRole: 'TOPPING_ONLY',
    });
  });

  it('does not let a protein retail category turn hummus into dairy protein', () => {
    expect(
      classifyProductSemantics(
        evidence({
          name: 'Hummus proteinowy GO Active',
          category: 'Protein',
          subcategory: 'Produkty wysokobiałkowe i proteinowe',
          variant: 'klasyczny',
        }),
      ),
    ).toMatchObject({
      productArchetype: 'SAVORY_SPREAD',
      ingredientFamily: 'savory_spread',
      physicalForm: 'PASTE',
      intendedUsageRole: 'NEITHER_REVIEW',
      modelRequired: false,
    });
  });

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

  it('normalizes manufacturer g/L against the final 1000 g Gellatti base rule', () => {
    for (const [raw, value, percent] of [
      ['3 g/L', 3, 0.3],
      ['50g/l', 50, 5],
      ['100 g/L gotowej mieszanki', 100, 10],
      ['150 g/L', 150, 15],
      ['450 g/L', 450, 45],
    ] as const) {
      expect(parseProductDosage(raw)).toMatchObject({
        semantics: 'FIXED',
        value,
        valueMax: null,
        unit: 'G_PER_L',
        normalizedMassPercent: percent,
        normalizedMassPercentMax: null,
        normalizationBasis: 'GELLATTI_BASE_1000G',
        densityResolved: false,
        evidence: raw,
      });
    }
    expect(parseProductDosage('100 g/L gotowej mieszanki').basis).toBe('FINISHED_MIX');
  });

  it('normalizes a g/L range while retaining the exact manufacturer wording', () => {
    expect(parseProductDosage('100–250 g/L')).toMatchObject({
      value: 100,
      valueMax: 250,
      unit: 'G_PER_L',
      normalizedMassPercent: 10,
      normalizedMassPercentMax: 25,
      normalizationBasis: 'GELLATTI_BASE_1000G',
      evidence: '100–250 g/L',
    });
  });

  it('normalizes other real mass units by their own denominator and never routes ml/L through g/L', () => {
    expect(parseProductDosage('25 g/kg gotowego produktu')).toMatchObject({
      value: 25,
      unit: 'G_PER_KG',
      normalizedMassPercent: 2.5,
      normalizationBasis: 'SOURCE_G_PER_KG_1000G',
    });
    expect(parseProductDosage('30 g/10 kg mieszanki')).toMatchObject({
      value: 30,
      unit: 'G_PER_10_KG',
      normalizedMassPercent: 0.3,
      normalizationBasis: 'SOURCE_G_PER_10_KG_10000G',
    });
    expect(parseProductDosage('4% gotowej mieszanki')).toMatchObject({
      value: 4,
      unit: 'PERCENT',
      normalizedMassPercent: 4,
      normalizationBasis: 'SOURCE_PERCENT',
    });
    expect(parseProductDosage('20 ml/L')).toMatchObject({
      value: 20,
      unit: 'ML_PER_L',
      normalizedMassPercent: null,
      normalizationBasis: null,
      reasonCodes: ['DOSAGE_ML_PER_L_REQUIRES_REVIEW'],
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
      normalizedMassPercent: null,
      normalizationBasis: null,
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
    expect(
      validateProductSemanticModelOutput(exact, {
        productArchetype: 'BASE_MIX',
        ingredientFamily: 'base_mix',
        physicalForm: 'POWDER',
        intendedUsageRole: 'BASE_ONLY',
        flavorDomain: 'NEUTRAL',
        professional: true,
        technical: true,
        dosageDependent: true,
        dosage: { semantics: 'FIXED', value: 50, unit: 'G_PER_L', basis: 'MILK' },
        compatibleMapperCategories: ['base_mix'],
        forbiddenMapperCategories: ['alcohol'],
        confidence: 0.9,
        reasonCodes: ['BASE_EVIDENCE'],
        evidenceRefs: ['name'],
      }),
    ).toBeNull();
  });

  it('fingerprints the same bounded exact evidence at browser and server boundaries', () => {
    const long = evidence({ description: `  ${'x'.repeat(2_500)}  ` });
    const canonical = canonicalizeProductSemanticEvidence(long);
    expect(canonical.description).toHaveLength(2_000);
    expect(classifyProductSemantics(long).evidenceFingerprint).toBe(
      classifyProductSemantics(canonical).evidenceFingerprint,
    );
  });

  it('lets validated model semantics narrow Mapper categories without selecting a row', () => {
    const exact = evidence({
      name: 'X-17',
      productType: 'professional',
      category: 'Professional gelato products',
      description: 'Fine dry blend supplied for recipe use.',
    });
    const classified = validateProductSemanticModelOutput(exact, {
      productArchetype: 'CHOCOLATE',
      ingredientFamily: 'chocolate',
      physicalForm: 'POWDER',
      intendedUsageRole: 'BASE_ONLY',
      flavorDomain: 'CHOCOLATE_GENERAL',
      professional: true,
      technical: false,
      dosageDependent: false,
      dosage: { semantics: 'NONE', value: null, unit: 'UNKNOWN', basis: 'UNKNOWN' },
      compatibleMapperCategories: ['chocolate', 'cocoa'],
      forbiddenMapperCategories: ['topping'],
      confidence: 0.82,
      reasonCodes: ['DRY_CHOCOLATE_COMPONENT'],
      evidenceRefs: ['name', 'category', 'description'],
    });

    expect(classified).toMatchObject({
      classificationSource: 'SERVER_MODEL',
      productArchetype: 'CHOCOLATE',
      ingredientFamily: 'chocolate',
      physicalForm: 'POWDER',
      compatibleMapperCategories: ['chocolate', 'cocoa'],
      modelRequired: false,
    });
    expect(
      evaluateMapperSemanticCompatibility(classified!, {
        ingredientId: 'PI-TEST-SAUCE',
        name: 'Pistachio rippling sauce',
        category: 'topping',
        subcategory: 'rippling_sauce',
        brand: 'Test',
      }),
    ).toMatchObject({
      compatible: false,
      reasonCodes: expect.arrayContaining([
        'SEMANTIC_FORM_CONTRADICTION',
        'SEMANTIC_FORBIDDEN_CATEGORY',
      ]),
    });
  });

  it('rejects a model evidence reference when that exact field is absent', () => {
    const exact = evidence({ name: 'Niejasny produkt' });
    expect(
      validateProductSemanticModelOutput(exact, {
        productArchetype: 'UNKNOWN',
        ingredientFamily: 'unknown',
        physicalForm: 'UNKNOWN',
        intendedUsageRole: 'NEITHER_REVIEW',
        flavorDomain: 'UNKNOWN',
        professional: false,
        technical: false,
        dosageDependent: false,
        dosage: { semantics: 'NONE', value: null, unit: 'UNKNOWN', basis: 'UNKNOWN' },
        compatibleMapperCategories: [],
        forbiddenMapperCategories: [],
        confidence: 0.2,
        reasonCodes: ['INSUFFICIENT_EVIDENCE'],
        evidenceRefs: ['dosage'],
      }),
    ).toBeNull();
  });

  it('keeps exact manufacturer variegato authority when the model proposes a base mix', () => {
    const exact = evidence({
      name: 'Amarena con pezzi',
      productType: 'professional',
      category: 'Professional gelato products',
      subcategory: 'Variegatury',
      description: 'Variegato wiśniowe z całymi owocami.',
      dosage: 'q.b.',
    });
    const classified = validateProductSemanticModelOutput(exact, {
      productArchetype: 'BASE_MIX',
      ingredientFamily: 'base_mix',
      physicalForm: 'POWDER',
      intendedUsageRole: 'BASE_ONLY',
      flavorDomain: 'FRUIT',
      professional: true,
      technical: true,
      dosageDependent: false,
      dosage: { semantics: 'AS_DESIRED', value: null, unit: 'AS_DESIRED', basis: 'UNKNOWN' },
      compatibleMapperCategories: ['base_mix'],
      forbiddenMapperCategories: [],
      confidence: 0.9,
      reasonCodes: ['MODEL_BASE_PROPOSAL'],
      evidenceRefs: ['name', 'subcategory', 'description', 'dosage'],
    });

    expect(classified).toMatchObject({
      productArchetype: 'VARIEGATO',
      ingredientFamily: 'variegato',
      physicalForm: 'SAUCE',
      intendedUsageRole: 'TOPPING_ONLY',
      compatibleMapperCategories: ['variegato', 'flavor_paste'],
      isTechnicalProduct: false,
    });
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
        ingredientId: 'paste',
        name: 'Earl Grey flavour paste',
        category: 'flavor_paste',
        subcategory: 'flavored_ice_cream_paste',
        brand: 'X',
      },
      {
        ingredientId: 'liquid',
        name: 'Earl Grey liquid concentrate',
        category: 'flavor_concentrate',
        subcategory: 'liquid',
        brand: 'X',
      },
    ]) {
      const decision = evaluateMapperSemanticCompatibility(product, candidate);
      expect(decision.compatible).toBe(false);
      expect(decision.reasonCodes).toContain('SEMANTIC_FORM_CONTRADICTION');
    }
  });

  it('separates coffee, tea, confectionery and spices inside a broad retailer taxonomy', () => {
    const coffee = classifyProductSemantics(
      evidence({
        name: 'Jacobs Krönung Kawa rozpuszczalna',
        category: 'Coffee, tea & spices',
        subcategory: 'coffee',
      }),
    );
    expect(coffee).toMatchObject({
      productArchetype: 'COFFEE',
      ingredientFamily: 'coffee',
      physicalForm: 'DRY',
      flavorDomain: 'COFFEE',
      compatibleMapperCategories: ['coffee_tea'],
      modelRequired: false,
    });

    const biscuits = classifyProductSemantics(
      evidence({
        name: 'Bonitki Herbatniki Petit Beurre',
        category: 'Słodycze',
        subcategory: 'herbatniki',
      }),
    );
    expect(biscuits).toMatchObject({
      productArchetype: 'CONFECTIONERY',
      ingredientFamily: 'confectionery',
      physicalForm: 'SOLID',
    });

    const spice = classifyProductSemantics(
      evidence({
        name: 'Kamis Bazylia',
        category: 'Coffee, tea & spices',
        subcategory: 'spices',
      }),
    );
    expect(spice.productArchetype).not.toBe('TEA');
    expect(spice.ingredientFamily).not.toBe('tea');
    expect(spice.modelRequired).toBe(true);

    const coffeePaste = classifyProductSemantics(
      evidence({
        name: 'CAFFE Kawa',
        category: 'Professional gelato products',
        subcategory: 'Toppingi',
        dosage: 'q.b.',
      }),
    );
    expect(coffeePaste).toMatchObject({
      productArchetype: 'FLAVOR_PASTE',
      ingredientFamily: 'flavor_paste',
      flavorDomain: 'COFFEE',
    });
  });

  it('does not let a broad Bakery & sweets container override the actual product identity', () => {
    const gum = classifyProductSemantics(
      evidence({
        name: 'Airwaves Cool Cassis bezcukrowa guma do żucia',
        brand: 'Airwaves',
        category: 'Bakery & sweets',
        subcategory: 'Słodycze — bieżący katalog online',
        description: 'Guma do żucia o smaku czarnej porzeczki.',
      }),
    );

    expect(gum).toMatchObject({
      productArchetype: 'UNKNOWN',
      ingredientFamily: 'unknown',
      physicalForm: 'UNKNOWN',
      intendedUsageRole: 'NEITHER_REVIEW',
      classificationSource: 'REVIEW_REQUIRED',
      modelRequired: true,
    });
    expect(gum.reasonCodes).not.toContain('ARCHETYPE_CONFECTIONERY');
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
    const baitzSemantic = classifyProductSemantics(
      evidence({
        name: 'Baitz Baton choco cocos',
        brand: 'Baitz',
        category: 'Bakery & sweets',
        subcategory: 'Słodycze',
      }),
    );
    const baitz = findProfileMatch(
      {
        name: 'Baitz Baton choco cocos',
        brand: 'Baitz',
        category: 'Bakery & sweets',
        subcategory: 'Słodycze',
        knownMacros: { fat_percent: 33, total_sugars_percent: 41 },
        semantic: baitzSemantic,
      },
      knowledge,
    );
    expect(baitz.confidence).toBeLessThan(0.85);
    expect(baitz.candidatesAfterFilter).not.toContain('PI-ING-000091');
    expect(baitz.rejectedCandidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ ingredientId: 'PI-ING-000091' })]),
    );

    const base50Semantic = classifyProductSemantics(
      evidence({
        productType: 'professional',
        name: 'BASE 50',
        variant: 'Mleczno śmietankowy',
        category: 'Professional gelato products',
        subcategory: 'Niskie dozowanie',
        dosage: '50 g/L',
        description: 'Baza mleczno śmietankowa.',
      }),
    );
    const base50 = findProfileMatch(
      {
        name: 'BASE 50',
        variant: 'Mleczno śmietankowy',
        category: 'Professional gelato products',
        subcategory: 'Niskie dozowanie',
        knownMacros: { fat_percent: 33, total_sugars_percent: 41 },
        semantic: base50Semantic,
      },
      knowledge,
    );
    expect(base50.candidatesAfterFilter).not.toContain('PI-ING-000048');
    expect(base50.rejectedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientId: 'PI-ING-000048',
          reasonCodes: expect.arrayContaining(['SEMANTIC_FLAVOR_DOMAIN_CONTRADICTION']),
        }),
      ]),
    );
  });
});
