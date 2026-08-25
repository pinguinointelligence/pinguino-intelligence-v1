import { describe, expect, it } from 'vitest';
import { buildNutritionDeclaration, type LabelNutritionPer100g } from '@/data/label/nutritionLabel';
import { buildLabelPreflight, type MasterLabelData } from './masterLabel';
import { marketProfile, type MarketProfileCode } from './marketProfiles';
import { buildMasterLabelPrintHtml } from './masterLabelPrint';
import { normalizePrinterSettings } from './printerProfiles';
import type { RegulatoryNutritionInputs } from './regulatoryNutrition';

const nutrition: LabelNutritionPer100g = {
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

const regulatoryFacts = (
  languages: readonly string[],
  overrides: Partial<RegulatoryNutritionInputs> = {},
): RegulatoryNutritionInputs => ({
  energyKjPer100g: 920,
  energyAuthority: 'market_factors',
  servingDescription: Object.fromEntries(
    languages.map((language) => [language, language === 'fr' ? '1 tasse' : '1 cup']),
  ),
  servingQuantityG: 100,
  servingsPerContainer: 4,
  transFatGPer100g: 0,
  cholesterolMgPer100g: 30,
  sodiumMgPer100g: 200,
  addedSugarsGPer100g: 10,
  vitaminDMcgPer100g: 1,
  calciumMgPer100g: 100,
  ironMgPer100g: 1,
  potassiumMgPer100g: 200,
  productDensityGPerMl: 0.6,
  servingVolumeMl: 166.7,
  usRaccVolumeMl: 160,
  usFormatFamily: 'standard',
  canadaProductForm: 'tub',
  canadaReferenceAmountMl: 188,
  canadaReferenceAmountG: 100,
  canadaFormatFamily: 'bilingual_standard',
  canadaFopProductClass: 'general_food',
  canadaFopExemption: 'none',
  canadaFopExemptionReason: '',
  canadaFopAssetId: null,
  ...overrides,
});

function label(
  market: MarketProfileCode,
  overrides: Partial<MasterLabelData> = {},
): MasterLabelData {
  const profile = marketProfile(market);
  const languages = profile.requiredLanguages.length > 0 ? [...profile.requiredLanguages] : ['en'];
  const size = { widthMm: 104, heightMm: market === 'CA' ? 200 : 152 };
  const text = (en: string, fr = en) =>
    Object.fromEntries(languages.map((language) => [language, language === 'fr' ? fr : en]));
  const usServing =
    market === 'US'
      ? { servingQuantityG: 96, servingsPerContainer: 500 / 96, servingVolumeMl: 160 }
      : market === 'CA'
        ? {
            servingDescription: { en: '3/4 cup', fr: '3/4 tasse' },
            servingQuantityG: 112.8,
            servingsPerContainer: 500 / 188,
            servingVolumeMl: 188,
            canadaReferenceAmountMl: 188,
            canadaReferenceAmountG: null,
          }
        : {};
  return {
    schemaVersion: 1,
    masterLabelId: `label:${market}`,
    sourceCompletionSessionId: 'run-actual-1002.5g',
    sourceCompletedAt: '2026-08-25T10:00:00.000Z',
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
      },
    ],
    allergens: {
      status: 'complete',
      declared: ['milk'],
      mayContain: [],
      labelStatements: ['milk'],
      reviewedByUser: true,
    },
    nutritionSource: nutrition,
    nutritionDeclaration: buildNutritionDeclaration(nutrition),
    regulatoryNutrition: regulatoryFacts(languages, usServing),
    netQuantityG: market === 'CA' ? 300 : 500,
    packageQuantity: {
      value: 500,
      unit: market === 'CA' ? 'ml' : 'g',
      netWeightG: market === 'CA' ? 300 : 500,
      netVolumeMl: market === 'CA' ? 500 : null,
      source: 'selected_fill',
      confirmedAt: '2026-08-25T10:05:00.000Z',
    },
    servingQuantityG: market === 'US' ? 96 : market === 'CA' ? 112.8 : 100,
    productionDate: '2026-08-25',
    productionDateReviewed: true,
    dateMark: {
      kind: 'best_before',
      date: '2027-02-25',
      basis: 'manual',
      reviewedByUser: true,
    },
    storageInstructions: text('Keep frozen.', 'Garder congelé.'),
    useInstructions: text('', ''),
    operator: {
      operatorName: 'Gellatti Laboratory',
      facilityName: 'Gellatti Laboratory',
      address: '1 Test Street, Madrid',
      countryCode: 'ES',
      contact: '',
      registrationIds: [],
      importerName: market === 'UK' ? 'Gellatti UK Import Ltd' : '',
      importerAddress: market === 'UK' ? '1 Test Street, London, UK' : '',
      importerCountryCode: market === 'UK' ? 'GB' : '',
      distributorName: market === 'AU_NZ' ? 'Gellatti AU Distribution Pty Ltd' : '',
      distributorAddress: market === 'AU_NZ' ? '1 Test Street, Sydney, Australia' : '',
      distributorCountryCode: market === 'AU_NZ' ? 'AU' : '',
    },
    lotCode: 'LOT-20260825-001',
    origin: text('Made in Spain', 'Fabriqué en Espagne'),
    customerNote: text('', ''),
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
    ...overrides,
  };
}

describe('market-specific golden label structures', () => {
  it.each(['EU', 'UK', 'US', 'AU_NZ', 'WORLD'] as const)(
    '%s fails closed before retail print at a clipped geometry',
    (market) => {
      const data = label(market);
      const clipped = {
        ...data,
        size: { widthMm: 100, heightMm: 70 },
        printer: { ...data.printer, widthMm: 100, heightMm: 70 },
      };

      expect(buildLabelPreflight(clipped).items).toContainEqual(
        expect.objectContaining({ field: 'geometry', status: 'missing' }),
      );
      expect(() => buildMasterLabelPrintHtml(clipped)).toThrow(
        'Master Label preflight is incomplete.',
      );
    },
  );

  it.each([
    ['EU', 'eu_declaration', 'eu-nutrition'],
    ['UK', 'uk_declaration', 'uk-renderer'],
    ['US', 'us_nutrition_facts', 'nutrition-facts us'],
    ['AU_NZ', 'au_nz_nip', 'fsanz-nip'],
    ['WORLD', 'world_neutral', 'world-nutrition'],
  ] as const)(
    'prints the verified %s structure instead of relabelling the EU table',
    (market, layout, marker) => {
      const data = label(market);
      expect(buildLabelPreflight(data).readyForSystemPrint).toBe(true);
      const html = buildMasterLabelPrintHtml(data);
      expect(html).toContain(`data-market-layout="${layout}"`);
      expect(html).toContain(marker);
      expect(html).toContain('<strong class="allergen-term">Milk</strong>');
      expect(html).not.toContain('(60%)');
      if (market === 'UK') expect(html).toContain('data-packaging-context="ppds"');
    },
  );

  it('prints a genuine FDA structure with added sugars and its own preflight', () => {
    const data = label('US');
    expect(buildLabelPreflight(data).regulatoryProfileVerified).toBe(true);
    expect(buildLabelPreflight(data).readyForSystemPrint).toBe(true);
    const html = buildMasterLabelPrintHtml(data);
    expect(html).toContain('data-market-layout="us_nutrition_facts"');
    expect(html).toContain('nutrition-facts us');
    expect(html).toContain('Added Sugars');
  });

  it.each([
    ['tabular', 200, 'tabular-columns'],
    ['linear', 70, 'linear-facts'],
  ] as const)('renders the qualifying FDA %s small-package family', (format, ads, marker) => {
    const data = label('US', {
      availableDisplaySurfaceCm2: ads,
      regulatoryNutrition: regulatoryFacts(['en'], {
        servingQuantityG: 96,
        servingVolumeMl: 160,
        servingsPerContainer: 500 / 96,
        usFormatFamily: format,
      }),
    });
    expect(buildLabelPreflight(data).readyForSystemPrint).toBe(true);
    const html = buildMasterLabelPrintHtml(data);
    expect(html).toContain(`data-format-family="${format}"`);
    expect(html).toContain(marker);
    expect(html).toContain('Added Sugars');
  });

  it('renders distinct FDA per-serving and per-container columns at 250% RACC', () => {
    const data = label('US', {
      packageQuantity: {
        value: 240,
        unit: 'g',
        netWeightG: 240,
        netVolumeMl: null,
        source: 'selected_fill',
        confirmedAt: '2026-08-25T10:05:00.000Z',
      },
      netQuantityG: 240,
      servingQuantityG: 96,
      size: { widthMm: 104, heightMm: 220 },
      printer: normalizePrinterSettings({
        profileId: 'system_a4_letter',
        widthMm: 104,
        heightMm: 220,
        copies: 1,
      }),
      regulatoryNutrition: regulatoryFacts(['en'], {
        servingQuantityG: 96,
        servingVolumeMl: 160,
        servingsPerContainer: 2.5,
        usFormatFamily: 'auto',
      }),
    });
    expect(buildLabelPreflight(data).readyForSystemPrint).toBe(true);
    const html = buildMasterLabelPrintHtml(data);
    expect(html).toContain('data-format-family="dual_column"');
    expect(html).toContain('<strong>Per serving</strong><strong>Per container</strong>');
    expect(html).toMatch(/<td>[^<]+<\/td><td>[^<]+<\/td>/);
  });

  it('keeps Canada externally blocked while preserving the bilingual NFT/FOP renderer', () => {
    const withOfficialAsset = label('CA', {
      regulatoryNutrition: regulatoryFacts(['en', 'fr'], {
        canadaFopAssetId: 'approved-health-canada-high-sat-sugar',
      }),
    });
    const preflight = buildLabelPreflight(withOfficialAsset);
    expect(preflight.regulatoryProfileVerified).toBe(false);
    expect(() => buildMasterLabelPrintHtml(withOfficialAsset)).toThrow(
      'Master Label preflight is incomplete.',
    );
    const html = buildMasterLabelPrintHtml(withOfficialAsset, null, { draft: true });
    expect(html).toContain('Nutrition Facts<br><span>Valeur nutritive</span>');
    expect(html).toContain('Ingredients:');
    expect(html).toContain('Ingrédients:');
    expect(html).not.toContain('class="canada-fop');
  });

  it('never draws a Canadian look-alike when the approved artwork asset is absent', () => {
    const html = buildMasterLabelPrintHtml(label('CA'), null, { draft: true });
    expect(html).not.toContain('class="canada-fop"');
    expect(buildLabelPreflight(label('CA')).items).toContainEqual(
      expect.objectContaining({ field: 'canada_fop', status: 'missing' }),
    );
  });

  it('watermarks drafts and renders a data-free calibration label with physical dimensions', () => {
    const data = label('EU');
    expect(buildMasterLabelPrintHtml(data, null, { draft: true })).toContain(
      'DRAFT<br>NIE DO SPRZEDAŻY',
    );
    const calibration = buildMasterLabelPrintHtml(data, null, { calibration: true });
    expect(calibration).toContain('DRUK TESTOWY');
    expect(calibration).toContain(`${data.size.widthMm} × ${data.size.heightMm} mm`);
    expect(calibration).not.toContain('Milk gelato');
  });
});
