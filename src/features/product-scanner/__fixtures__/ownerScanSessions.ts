/**
 * GOLDEN FIXTURES — the owner's real scan sessions, 2026-09-07.
 *
 * Copied verbatim from product_scan_sessions.result_json on staging. Nothing here is invented,
 * no PROBE_FAMILY, no typed macros, and the two products never share a field: they are different
 * articles with different EANs and were photographed separately.
 *
 *   Sport 001  session 6b8f1040-82c9-4ec6-9871-70171c7d06cf  asset b9d15efc  analyze 200  77.9
 *   Sport 002  session 3375f79a-1070-4ea6-a1f3-49c4be1ee3ee  asset 3573a9b8  analyze 200  73.0
 *              (a second asset 65ec2146 was rejected 503 at 12:48:47 on THIS session)
 *
 * Both carry `evidence: []` — the photograph produced none, which is the defect these fixtures
 * exist to hold still. `sourceAuthorityClass` is absent on the rows because these sessions
 * predate the bridge; tests that need it add it explicitly, exactly as the server now writes it.
 */
export const SPORT_001_SESSION = '6b8f1040-82c9-4ec6-9871-70171c7d06cf';
export const SPORT_002_SESSION = '3375f79a-1070-4ea6-a1f3-49c4be1ee3ee';
export const SPORT_001_EAN = '7340222800457';
export const SPORT_002_EAN = '7340222800464';

export const sport001ScanResult = () => ({
  schemaVersion: 'gellatti_product_scan_v1',
  identity: {
    displayName: 'Vitamin Well Sport 001',
    originalName: null,
    brand: 'Vitamin Well',
    explicitlyUnbranded: false,
    category: null,
    variant: null,
    countryOfOrigin: null,
    labelLanguages: [],
  },
  barcodes: [{ value: SPORT_001_EAN, format: 'EAN_13' }],
  evidence: [],
  nutrition: {
    basis: 'per_100ml',
    energyKj: 98.6,
    energyKcal: 23,
    fat: 0,
    saturatedFat: 0,
    carbohydrate: 5.8,
    sugars: 5.5,
    protein: 0,
    salt: 0.1175,
    fibre: 0,
  },
  ingredientsText:
    'agua, azúcar, corrector de acidez (ácido cítrico), aromas, citrato de sodio, cloruro de sodio, cloruro de potasio, vitaminas (D3, niacina, B6, B12, ácido pantoténico), magnesio',
  allergensText: null,
  mayContainAllergens: [],
  manufacturer: null,
  missingFields: [],
  warnings: [],
  conflicts: [],
  claims: [],
  package: { unit: null, netQuantity: null, netQuantityText: null },
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
      url: `https://world.openfoodfacts.org/product/${SPORT_001_EAN}`,
      title: `Open Food Facts · ${SPORT_001_EAN}`,
      sourceType: 'barcode_registry',
      fieldsUsed: [
        'identity.displayName',
        'identity.brand',
        'identity.category',
        'nutrition.basis',
        'nutrition.energyKj',
        'nutrition.energyKcal',
        'nutrition.fat',
        'nutrition.saturatedFat',
        'nutrition.carbohydrate',
        'nutrition.sugars',
        'nutrition.fibre',
        'nutrition.protein',
        'nutrition.salt',
      ],
    },
    {
      url: 'https://www.vitaminwell.com/faq/',
      title: 'Vitamin Well FAQ',
      sourceType: 'manufacturer',
      fieldsUsed: ['claims'],
    },
    {
      url: 'https://www.latiendaencasa.es/supermercado/0110118623902220-vitamin-well-bebida-refrescante-con-vitaminas-y-minerales-sport-001-sabor-limon-lima-botella-500-ml/',
      title: 'Vitamin Well Sport 001, limón-lima, botella 500 ml',
      sourceType: 'web_search',
      fieldsUsed: [
        'ingredientsText',
        'identity.countryOfOrigin',
        'productionDeclarations.dosageText',
      ],
    },
  ],
});

export const sport002ScanResult = () => ({
  schemaVersion: 'gellatti_product_scan_v1',
  identity: {
    displayName: 'Sport 002',
    originalName: null,
    brand: 'Vitamin Well',
    explicitlyUnbranded: false,
    category: 'sports drink',
    variant: null,
    countryOfOrigin: 'Unión Europea y fuera de la UE',
    labelLanguages: [],
  },
  barcodes: [{ value: SPORT_002_EAN, format: 'EAN_13' }],
  evidence: [],
  // Sugar free: these zeros are the product's published values, not absent data.
  nutrition: {
    basis: 'per_100g',
    energyKj: 0,
    energyKcal: 1.2,
    fat: 0,
    saturatedFat: 0,
    carbohydrate: 0,
    sugars: 0,
    protein: 0,
    salt: 0.1175,
    fibre: 0,
  },
  ingredientsText:
    'Agua, corrector de acidez (ácido cítrico), aromas, citrato de sodio, cloruro de sodio, cloruro de potasio, edulcorante (sucralosa), vitaminas (D3, niacina, B6, B12, ácido pantoténico), magnesio.',
  allergensText: null,
  mayContainAllergens: [],
  manufacturer: null,
  missingFields: [],
  warnings: [],
  conflicts: [],
  claims: [
    'Vitamin Well Electrolytes Sugar Free is a sports drink that contains a combination of electrolytes and is enriched with vitamins and minerals.',
  ],
  package: { unit: null, netQuantity: null, netQuantityText: null },
  storageInstructions: null,
  productionDeclarations: {
    brix: null,
    alcoholAbv: null,
    dosageText: 'Número de raciones por envase: 1; Modo de empleo: Servir bien fría.',
    formDeclaration: null,
    concentrationText: null,
    cocoaButterPercent: null,
    cocoaSolidsPercent: null,
    fruitContentPercent: null,
    technicalParametersText:
      'Sugar-free; lemon/lime; vitamin D, niacin, vitamin B6, vitamin B12, pantothenic acid and magnesium; non-carbonated sports drink.',
  },
  externalSources: [
    {
      url: `https://world.openfoodfacts.org/product/${SPORT_002_EAN}`,
      title: `Open Food Facts · ${SPORT_002_EAN}`,
      sourceType: 'barcode_registry',
      fieldsUsed: [
        'identity.displayName',
        'identity.brand',
        'nutrition.basis',
        'nutrition.energyKj',
        'nutrition.energyKcal',
        'nutrition.fat',
        'nutrition.saturatedFat',
        'nutrition.carbohydrate',
        'nutrition.sugars',
        'nutrition.fibre',
        'nutrition.protein',
        'nutrition.salt',
      ],
    },
    {
      url: 'https://www.vitaminwell.com/product/electrolytes-sugar-free/',
      title: 'Isotonic Sugar Free – Vitamin Well',
      sourceType: 'manufacturer',
      fieldsUsed: [
        'identity.category',
        'claims',
        'productionDeclarations.technicalParametersText',
      ],
    },
    {
      url: 'https://www.elcorteingles.es/supermercado/B001018623902212-vitamin-well-bebida-refrescante-con-vitaminas-y-minerales-sport-002-sabor-limon-lima-sin-azucar-botella-500-ml/',
      title: 'Vitamin Well Sport 002 lemon/lime 500 ml – El Corte Inglés',
      sourceType: 'web_search',
      fieldsUsed: [
        'ingredientsText',
        'identity.countryOfOrigin',
        'productionDeclarations.dosageText',
      ],
    },
  ],
});

/** The class the server writes onto a row once classifySourceAuthority has spoken. */
export const withAuthority = <T extends { externalSources: Array<Record<string, unknown>> }>(
  result: T,
  byUrlFragment: Readonly<Record<string, string>>,
): T => ({
  ...result,
  externalSources: result.externalSources.map((row) => {
    const url = String(row.url ?? '');
    const hit = Object.entries(byUrlFragment).find(([fragment]) => url.includes(fragment));
    return hit ? { ...row, sourceAuthorityClass: hit[1] } : row;
  }),
});
