/**
 * Broader regression corpus for the scanner → Product Intelligence → Rescue path. Each entry is a
 * realistic consumer label (values typical for the product class, not manufacturer-exact) with the
 * evidence shape the scanner produces after research. Expectations are HONEST outcomes: a product
 * whose physics genuinely cannot be resolved must stay not ready.
 */
export interface CorpusFixture {
  label: string;
  gtin: string;
  customerFamily:
    | 'dairy'
    | 'fruit'
    | 'cocoa_chocolate'
    | 'nut_paste'
    | 'alcohol'
    | 'sweetener'
    | 'beverage'
    | 'technical'
    | 'other';
  confirmedFields: string[];
  scanResult: Record<string, unknown>;
  expect: {
    family: string;
    role?: string;
    ready: boolean;
    engineUsable?: boolean;
    donor?: boolean;
    forbiddenDonorCategories?: string[];
    blockers?: string[];
    /** fields the label did not state that a trusted reference supplied (ESTIMATED, never VERIFIED) */
    estimatedFields?: string[];
  };
}

const base = (
  gtin: string,
  identity: Record<string, unknown>,
  nutrition: Record<string, unknown> | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  claims: [],
  package: { unit: null, netQuantity: null, netQuantityText: null },
  barcodes: [{ value: gtin, format: 'EAN_13' }],
  identity: {
    variant: null,
    originalName: null,
    labelLanguages: [],
    countryOfOrigin: null,
    explicitlyUnbranded: false,
    ...identity,
  },
  warnings: [],
  conflicts: [],
  evidence: [],
  nutrition,
  manufacturer: null,
  allergensText: null,
  missingFields: [],
  schemaVersion: 'gellatti_product_scan_v1',
  ingredientsText: null,
  mayContainAllergens: [],
  storageInstructions: null,
  productionDeclarations: {
    brix: null,
    alcoholAbv: null,
    dosageText: null,
    formDeclaration: null,
    concentrationText: null,
    cocoaButterPercent: null,
    cocoaSolidsPercent: null,
    fruitContentPercent: null,
    technicalParametersText: null,
  },
  externalSources: [
    {
      url: 'https://example-manufacturer.test/product',
      title: 'product page',
      fieldsUsed: [
        'ingredientsText',
        'nutrition.basis',
        'nutrition.energyKcal',
        'nutrition.fat',
        'nutrition.carbohydrate',
        'nutrition.sugars',
        'nutrition.protein',
        'nutrition.salt',
        'nutrition.fibre',
      ],
      sourceType: 'manufacturer',
    },
  ],
  ...extra,
});

const MACROS = [
  'identity',
  'brand',
  'ingredients',
  'nutritionBasis',
  'energyKcal',
  'fat',
  'carbohydrate',
  'sugars',
  'fiber',
  'protein',
  'salt',
];

export const CORPUS: CorpusFixture[] = [
  {
    label: 'isotonic-zero-drink',
    gtin: '5449000000439',
    customerFamily: 'beverage',
    confirmedFields: MACROS,
    scanResult: base(
      '5449000000439',
      {
        brand: 'Powerade',
        displayName: 'Zero Mountain Blast',
        category: 'Bebida isotónica sin azúcar',
      },
      {
        basis: 'per_100ml',
        energyKcal: 1,
        fat: 0,
        carbohydrate: 0.5,
        sugars: 0,
        protein: 0,
        salt: 0.15,
        fibre: 0,
      },
      {
        ingredientsText:
          'Agua, acidulantes (ácido cítrico), cloruro de sodio, edulcorantes (sucralosa), aromas, vitaminas.',
      },
    ),
    expect: {
      family: 'beverage',
      role: 'BASE_ONLY',
      ready: true,
      engineUsable: true,
      donor: true,
      forbiddenDonorCategories: ['dairy', 'chocolate', 'fruit'],
    },
  },
  {
    label: 'sugar-cola',
    gtin: '5449000000996',
    customerFamily: 'beverage',
    confirmedFields: MACROS,
    scanResult: base(
      '5449000000996',
      { brand: 'Coca-Cola', displayName: 'Original Taste', category: 'Refresco de cola' },
      {
        basis: 'per_100ml',
        energyKcal: 42,
        fat: 0,
        carbohydrate: 10.6,
        sugars: 10.6,
        protein: 0,
        salt: 0,
        fibre: 0,
      },
      {
        ingredientsText:
          'Agua carbonatada, azúcar, colorante caramelo, acidulante ácido fosfórico, aromas, cafeína.',
      },
    ),
    expect: {
      family: 'beverage',
      role: 'BASE_ONLY',
      ready: true,
      engineUsable: true,
      donor: true,
      forbiddenDonorCategories: ['dairy', 'chocolate'],
    },
  },
  {
    label: 'zero-cola',
    gtin: '5449000131805',
    customerFamily: 'beverage',
    confirmedFields: MACROS,
    scanResult: base(
      '5449000131805',
      { brand: 'Coca-Cola', displayName: 'Zero Sugar', category: 'Refresco de cola sin azúcar' },
      {
        basis: 'per_100ml',
        energyKcal: 0.2,
        fat: 0,
        carbohydrate: 0,
        sugars: 0,
        protein: 0,
        salt: 0.02,
        fibre: 0,
      },
      {
        ingredientsText:
          'Agua carbonatada, colorante caramelo, acidulantes, edulcorantes (ciclamato, acesulfamo K, aspartamo), aromas, cafeína.',
      },
    ),
    expect: { family: 'beverage', role: 'BASE_ONLY', ready: true, engineUsable: true, donor: true },
  },
  {
    label: 'milk-chocolate-bar',
    gtin: '7622300742058',
    customerFamily: 'cocoa_chocolate',
    confirmedFields: MACROS,
    scanResult: base(
      '7622300742058',
      { brand: 'Milka', displayName: 'Alpine Milk Chocolate', category: 'Chocolate con leche' },
      {
        basis: 'per_100g',
        energyKcal: 530,
        fat: 29.5,
        carbohydrate: 58,
        sugars: 57,
        protein: 6.7,
        salt: 0.36,
        fibre: 2.3,
      },
      {
        claims: ['Tableta de chocolate con leche de los Alpes, 100 g.'],
        ingredientsText:
          'Azúcar, manteca de cacao, leche desnatada en polvo, pasta de cacao, suero de leche en polvo, grasa de mantequilla, emulgente (lecitina de soja), avellanas, aroma.',
      },
    ),
    expect: {
      family: 'chocolate',
      role: 'BASE_ONLY',
      ready: true,
      engineUsable: true,
      donor: true,
      forbiddenDonorCategories: ['beverage', 'dairy'],
    },
  },
  {
    label: 'oreo-cookie',
    gtin: '7622300489434',
    customerFamily: 'other',
    confirmedFields: MACROS,
    scanResult: base(
      '7622300489434',
      { brand: 'Oreo', displayName: 'Original Cookies', category: 'Galletas' },
      {
        basis: 'per_100g',
        energyKcal: 475,
        fat: 19,
        carbohydrate: 69,
        sugars: 38,
        protein: 5.2,
        salt: 0.7,
        fibre: 2.5,
      },
      {
        ingredientsText:
          'Harina de trigo, azúcar, aceite de palma, cacao desgrasado en polvo, jarabe de glucosa y fructosa, almidón de trigo, gasificantes, sal, emulgentes, aromas.',
      },
    ),
    expect: {
      family: 'confectionery',
      role: 'TOPPING_ONLY',
      ready: true,
      engineUsable: true,
      donor: true,
      forbiddenDonorCategories: ['beverage', 'dairy', 'fruit'],
    },
  },
  {
    label: 'natural-yoghurt',
    gtin: '4025500001322',
    customerFamily: 'dairy',
    confirmedFields: MACROS,
    scanResult: base(
      '4025500001322',
      { brand: 'Danone', displayName: 'Natural Joghurt 3,5%', category: 'Joghurt' },
      {
        basis: 'per_100g',
        energyKcal: 65,
        fat: 3.5,
        carbohydrate: 4.6,
        sugars: 4.6,
        protein: 4,
        salt: 0.13,
        fibre: 0,
      },
      { ingredientsText: 'Milch, Joghurtkulturen.' },
    ),
    expect: {
      family: 'dairy_liquid',
      role: 'BASE_ONLY',
      ready: true,
      engineUsable: true,
      donor: true,
      forbiddenDonorCategories: ['beverage', 'chocolate'],
    },
  },
  {
    label: 'oat-drink',
    gtin: '7394376616112',
    customerFamily: 'beverage',
    confirmedFields: MACROS,
    scanResult: base(
      '7394376616112',
      { brand: 'Oatly', displayName: 'Oat Drink Barista Edition', category: 'Havredryck' },
      {
        basis: 'per_100ml',
        energyKcal: 59,
        fat: 3,
        carbohydrate: 6.6,
        sugars: 3.4,
        protein: 1,
        salt: 0.1,
        fibre: 0.8,
      },
      {
        ingredientsText:
          'Oat base (water, oats 10%), rapeseed oil, dipotassium phosphate, calcium carbonate, calcium phosphates, iodised salt, vitamins.',
      },
    ),
    expect: {
      family: 'plant_beverage',
      role: 'BASE_ONLY',
      ready: true,
      engineUsable: true,
      donor: true,
      forbiddenDonorCategories: ['chocolate', 'fruit', 'dairy'],
    },
  },
  {
    label: 'technical-stabilizer',
    gtin: '8001234567897',
    customerFamily: 'technical',
    confirmedFields: MACROS,
    scanResult: base(
      '8001234567897',
      {
        brand: 'PreGel',
        displayName: 'Neutro 5 Stabilizer',
        category: 'Professional gelato products',
      },
      {
        basis: 'per_100g',
        energyKcal: 250,
        fat: 0.5,
        carbohydrate: 70,
        sugars: 5,
        protein: 1,
        salt: 0.5,
        fibre: 15,
      },
      {
        ingredientsText: 'Locust bean gum, guar gum, carrageenan, dextrose.',
        productionDeclarations: {
          brix: null,
          alcoholAbv: null,
          dosageText: '5 g/kg',
          formDeclaration: 'powder',
          concentrationText: null,
          cocoaButterPercent: null,
          cocoaSolidsPercent: null,
          fruitContentPercent: null,
          technicalParametersText: 'dosage 5 g per kg of mix',
        },
      },
    ),
    expect: {
      family: 'stabilizer_hydrocolloid',
      ready: false,
      blockers: ['TECHNICAL_DOSAGE_AUTHORITY_REQUIRED'],
    },
  },
  {
    label: 'identity-only-unknown',
    gtin: '5909876543213',
    customerFamily: 'other',
    confirmedFields: ['identity', 'brand'],
    scanResult: base(
      '5909876543213',
      { brand: 'Gellatti QA', displayName: 'Test product (unknown GTIN golden)', category: null },
      null,
      { externalSources: [] },
    ),
    expect: {
      family: 'unknown',
      ready: false,
      blockers: ['INGREDIENTS_EVIDENCE_REQUIRED', 'PRODUCT_SEMANTICS_UNRESOLVED'],
    },
  },
  {
    label: 'incomplete-label-no-sugars',
    gtin: '5449000054227',
    customerFamily: 'beverage',
    confirmedFields: [
      'identity',
      'brand',
      'nutritionBasis',
      'energyKcal',
      'fat',
      'carbohydrate',
      'protein',
      'salt',
    ],
    scanResult: base(
      '5449000054227',
      { brand: 'Fanta', displayName: 'Orange', category: 'Refresco de naranja' },
      { basis: 'per_100ml', energyKcal: 39, fat: 0, carbohydrate: 9.4, protein: 0, salt: 0.01 },
      {
        ingredientsText:
          'Agua carbonatada, azúcar, zumo de naranja a base de concentrado 8%, acidulante ácido cítrico, aromas.',
      },
    ),
    expect: {
      family: 'beverage',
      role: 'BASE_ONLY',
      ready: true,
      engineUsable: true,
      donor: true,
      estimatedFields: ['total_sugars_percent'],
    },
  },
];
