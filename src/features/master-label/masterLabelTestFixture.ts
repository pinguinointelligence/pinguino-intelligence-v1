import { buildNutritionDeclaration, type LabelNutritionPer100g } from '@/data/label/nutritionLabel';
import type { MasterLabelData } from './masterLabel';
import { marketProfile, type MarketProfileCode } from './marketProfiles';
import { normalizePrinterSettings } from './printerProfiles';
import type { RegulatoryNutritionInputs } from './regulatoryNutrition';

export const COMPLETE_LABEL_NUTRITION: LabelNutritionPer100g = {
  kcal: 220,
  fat_g: 12,
  saturated_fat_g: 10,
  carbohydrate_g: 25,
  sugars_g: 20,
  protein_g: 4,
  salt_g: 0.5,
  fiber_g: 1,
  alcohol_g: 0,
};

export function completeRegulatoryFacts(
  languages: readonly string[],
  overrides: Partial<RegulatoryNutritionInputs> = {},
): RegulatoryNutritionInputs {
  return {
    energyKjPer100g: 920,
    energyAuthority: 'market_factors',
    servingDescription: Object.fromEntries(
      languages.map((language) => [language, language === 'fr' ? '3/4 tasse' : '2/3 cup']),
    ),
    servingQuantityG: 100,
    servingVolumeMl: 160,
    servingsPerContainer: 5,
    productDensityGPerMl: 0.625,
    transFatGPer100g: 0,
    cholesterolMgPer100g: 30,
    sodiumMgPer100g: 200,
    addedSugarsGPer100g: 10,
    vitaminDMcgPer100g: 1,
    calciumMgPer100g: 100,
    ironMgPer100g: 1,
    potassiumMgPer100g: 200,
    usRaccVolumeMl: 160,
    usFormatFamily: 'standard',
    canadaProductForm: 'tub',
    canadaReferenceAmountMl: 188,
    canadaReferenceAmountG: null,
    canadaFormatFamily: 'bilingual_standard',
    canadaFopProductClass: 'general_food',
    canadaFopExemption: 'none',
    canadaFopExemptionReason: '',
    canadaFopAssetId: null,
    canadaFopAssetPackageVersion: null,
    ...overrides,
  };
}

export function createCompleteLabel(
  market: MarketProfileCode,
  overrides: Partial<MasterLabelData> = {},
): MasterLabelData {
  const profile = marketProfile(market);
  const languages = profile.requiredLanguages.length > 0 ? [...profile.requiredLanguages] : ['en'];
  const heightMm = market === 'CA' ? 220 : market === 'US' ? 180 : 152;
  const size = { widthMm: 104, heightMm };
  const canada = market === 'CA';
  const text = (en: string, fr = en) =>
    Object.fromEntries(languages.map((language) => [language, language === 'fr' ? fr : en]));
  return {
    schemaVersion: 1,
    masterLabelId: `label:${market}`,
    sourceCompletionSessionId: 'run-actual-1000g',
    sourceCompletedAt: '2026-08-25T10:00:00.000Z',
    sourceRecipeVersionId: 'recipe-version-7',
    sourceRecipeVersionNumber: 7,
    actualBatchQuantityG: 1000,
    purpose: 'retail_consumer',
    packagingContext: market === 'UK' ? 'ppds' : 'prepacked',
    market,
    marketProfileVersion: profile.version,
    uiLanguage: 'en',
    labelLanguages: languages,
    productName: text('Milk gelato', 'Gelato au lait'),
    legalProductName: text('Frozen dairy dessert', 'Dessert laitier congelé'),
    businessName: 'Gellatti Laboratory',
    logoPath: null,
    ingredients: [
      {
        lineId: 'milk',
        canonicalIngredientId: 'PI-ING-MILK',
        names: text('Milk', 'Lait'),
        actualGrams: 600,
        percent: 60,
        allergenEvidenceStatus: 'verified',
        allergenSourceRevision: 'authority-v1',
        sourceIngredientsText: 'Milk',
        sourceAllergensText: 'milk',
        quid: { required: false, percentage: null, reason: '', reviewedByUser: true },
      },
      {
        lineId: 'sugar',
        canonicalIngredientId: 'PI-ING-SUGAR',
        names: text('Sugar', 'Sucre'),
        actualGrams: 400,
        percent: 40,
        allergenEvidenceStatus: 'verified',
        allergenSourceRevision: 'authority-v1',
        sourceIngredientsText: 'Sugar',
        sourceAllergensText: 'none_declared',
        quid: { required: false, percentage: null, reason: '', reviewedByUser: true },
      },
    ],
    allergens: {
      status: 'complete',
      declared: ['milk'],
      mayContain: [],
      labelStatements: ['milk'],
      reviewedByUser: true,
    },
    nutritionSource: COMPLETE_LABEL_NUTRITION,
    nutritionDeclaration: buildNutritionDeclaration(COMPLETE_LABEL_NUTRITION),
    regulatoryNutrition: completeRegulatoryFacts(
      languages,
      canada
        ? {
            servingDescription: { en: '3/4 cup', fr: '3/4 tasse' },
            servingQuantityG: 117.5,
            servingVolumeMl: 188,
            servingsPerContainer: 500 / 188,
            canadaProductForm: 'tub',
            canadaReferenceAmountMl: 188,
            canadaReferenceAmountG: null,
          }
        : {},
    ),
    packageQuantity: {
      value: 500,
      unit: canada ? 'ml' : 'g',
      netWeightG: canada ? 312.5 : 500,
      netVolumeMl: canada ? 500 : null,
      source: 'selected_fill',
      confirmedAt: '2026-08-25T10:05:00.000Z',
    },
    netQuantityG: canada ? 312.5 : 500,
    servingQuantityG: canada ? 117.5 : 100,
    productionDate: '2026-08-25',
    productionDateReviewed: true,
    shelfLifeAuthority: {
      policyId: null,
      authority: 'Business-confirmed manual date',
      method: 'manual_date',
      shelfLifeDays: null,
      reviewedByUser: true,
    },
    dateMark: {
      kind: 'best_before',
      date: '2027-02-25',
      basis: 'manual',
      reviewedByUser: true,
    },
    storageInstructions: text('Keep frozen at -18°C or below.', 'Garder congelé à -18 °C.'),
    useInstructions: text('', ''),
    operator: {
      operatorName: 'Gellatti Laboratory',
      facilityName: 'Gellatti Laboratory',
      address: '1 Test Street, Madrid',
      countryCode: 'ES',
      contact: 'hello@gellatti.example',
      registrationIds: [],
      website: 'https://gellatti.example',
      operatorRole: 'producer',
      importerName: market === 'UK' || market === 'CA' ? 'Gellatti Import Partner' : '',
      importerAddress: market === 'UK' || market === 'CA' ? '10 Importer Street, local market' : '',
      importerCountryCode: market === 'UK' ? 'GB' : market === 'CA' ? 'CA' : '',
      distributorName: market === 'AU_NZ' ? 'Gellatti AU/NZ Supplier' : '',
      distributorAddress: market === 'AU_NZ' ? '20 Supplier Road, Sydney' : '',
      distributorCountryCode: market === 'AU_NZ' ? 'AU' : '',
    },
    lotCode: 'LOT-20260825-001',
    origin: text('Made in Spain', 'Fabriqué en Espagne'),
    customerNote: text('', ''),
    shortDescription: text('', ''),
    qrCodeValue: null,
    gtin: null,
    internalArticleId: null,
    enabledOptionalFields: [],
    format: 'rectangle',
    size,
    copies: 1,
    systemPrinter: 'system',
    printer: normalizePrinterSettings({
      profileId: 'system_a4_letter',
      widthMm: size.widthMm,
      heightMm: size.heightMm,
      copies: 1,
      formatMode: 'auto',
    }),
    layoutMode: 'auto',
    availableDisplaySurfaceCm2: 200,
    jurisdictionContext: {
      euDestinationCountryCode: 'ES',
      ukRegion: 'GB',
      auNzCountry: 'AU',
      usSaleContext: 'interstate_retail',
    },
    regulatoryReview: {
      translations: true,
      ingredientOrderAndQuid: true,
      marketSpecific: true,
    },
    preflightAcknowledged: true,
    snapshotEvidence: null,
    ...overrides,
  };
}
