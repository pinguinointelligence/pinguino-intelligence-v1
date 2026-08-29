export type MarketProfileCode = 'EU' | 'UK' | 'US' | 'CA' | 'AU_NZ' | 'WORLD';

export type MarketProfileStatus =
  | 'REGULATORY_VERIFIED'
  | 'EXTERNAL_ASSET_BLOCKED'
  | 'INFORMATIONAL';

export type PrintReadiness = 'NOT_READY' | 'PRINT_READY_UNIVERSAL' | 'PRINT_READY_REGULATORY';

export type MasterLabelFieldId =
  | 'product_name'
  | 'legal_product_name'
  | 'ingredients'
  | 'allergens'
  | 'nutrition'
  | 'net_quantity'
  | 'operator'
  | 'storage'
  | 'production_date'
  | 'date_mark'
  | 'lot'
  | 'logo'
  | 'origin'
  | 'customer_note'
  | 'short_description'
  | 'qr_code'
  | 'lot_barcode'
  | 'gtin'
  | 'website'
  | 'internal_article_id'
  | 'batch_id';

export type ConsumerLayout =
  | 'eu_declaration'
  | 'uk_declaration'
  | 'us_nutrition_facts'
  | 'ca_bilingual_nft'
  | 'au_nz_nip'
  | 'world_neutral';

export type NutritionFormat =
  | 'EU_100G'
  | 'UK_100G'
  | 'US_NF'
  | 'CA_NFT'
  | 'AU_NZ_NIP'
  | 'WORLD_100G';

export interface MarketProfile {
  code: MarketProfileCode;
  label: string;
  jurisdiction: string;
  flag: string;
  consumerLayout: ConsumerLayout;
  status: MarketProfileStatus;
  version: string;
  checkedAt: string;
  requiredFields: readonly MasterLabelFieldId[];
  optionalFields: readonly MasterLabelFieldId[];
  sourceUrls: readonly string[];
  requiredLanguages: readonly string[];
  minimumTypography: {
    xHeightMm: number;
    smallPackageXHeightMm?: number;
    minimumPointSize?: number;
  };
  nutritionFormat: NutritionFormat;
  selectable: true;
  rendererVersion: string;
  externalAssetRequirement?: string;
}

export const MARKET_PROFILE_ORDER: readonly MarketProfileCode[] = [
  'EU',
  'UK',
  'US',
  'CA',
  'AU_NZ',
  'WORLD',
];

export const marketAvailabilityLabel = (profile: MarketProfile): string =>
  profile.code === 'WORLD' ? 'Tylko wewnętrzna / informacyjna' : 'Profil regulacyjny';

const REGULATORY_REQUIRED: readonly MasterLabelFieldId[] = [
  'product_name',
  'legal_product_name',
  'ingredients',
  'allergens',
  'nutrition',
  'net_quantity',
  'operator',
  'storage',
  'production_date',
  'date_mark',
  'lot',
];

const REGULATORY_OPTIONAL: readonly MasterLabelFieldId[] = [
  'logo',
  'origin',
  'customer_note',
  'qr_code',
  'lot_barcode',
  'gtin',
  'website',
  'internal_article_id',
  'batch_id',
];

const AU_NZ_REQUIRED: readonly MasterLabelFieldId[] = [...REGULATORY_REQUIRED, 'origin'];

const WORLD_REQUIRED: readonly MasterLabelFieldId[] = [
  'product_name',
  'ingredients',
  'allergens',
  'nutrition',
  'net_quantity',
  'storage',
  'production_date',
  'lot',
];

const WORLD_OPTIONAL: readonly MasterLabelFieldId[] = [
  'legal_product_name',
  'operator',
  'date_mark',
  'logo',
  'origin',
  'customer_note',
  'short_description',
  'qr_code',
  'lot_barcode',
  'gtin',
  'website',
  'internal_article_id',
  'batch_id',
];

export const MARKET_PROFILES: Readonly<Record<MarketProfileCode, MarketProfile>> = Object.freeze({
  EU: {
    code: 'EU',
    label: 'Unia Europejska',
    jurisdiction: 'European Union',
    flag: 'EU',
    consumerLayout: 'eu_declaration',
    status: 'REGULATORY_VERIFIED',
    version: 'EU-FIC-1169-2011-consolidated-2025-04-01',
    checkedAt: '2026-08-25',
    requiredFields: REGULATORY_REQUIRED,
    optionalFields: REGULATORY_OPTIONAL,
    sourceUrls: [
      'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02011R1169-20250401',
      'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32011L0091',
      'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32018R0775',
    ],
    requiredLanguages: [],
    minimumTypography: { xHeightMm: 1.2, smallPackageXHeightMm: 0.9 },
    nutritionFormat: 'EU_100G',
    selectable: true,
    rendererVersion: 'eu-label-v2',
  },
  UK: {
    code: 'UK',
    label: 'Wielka Brytania',
    jurisdiction: 'United Kingdom (GB or Northern Ireland context required)',
    flag: 'UK',
    consumerLayout: 'uk_declaration',
    status: 'REGULATORY_VERIFIED',
    version: 'UK-FIC-PPDS-current-2026-08-25',
    checkedAt: '2026-08-25',
    requiredFields: REGULATORY_REQUIRED,
    optionalFields: REGULATORY_OPTIONAL,
    sourceUrls: [
      'https://www.gov.uk/guidance/food-labelling-giving-food-information-to-consumers',
      'https://www.food.gov.uk/allergen-labelling-changes-for-prepacked-for-direct-sale-ppds-food',
      'https://www.gov.uk/government/publications/packaging-and-labelling/packaging-and-labelling',
    ],
    requiredLanguages: ['en'],
    minimumTypography: { xHeightMm: 1.2, smallPackageXHeightMm: 0.9 },
    nutritionFormat: 'UK_100G',
    selectable: true,
    rendererVersion: 'uk-label-v2',
  },
  US: {
    code: 'US',
    label: 'Stany Zjednoczone',
    jurisdiction: 'United States',
    flag: 'US',
    consumerLayout: 'us_nutrition_facts',
    status: 'REGULATORY_VERIFIED',
    version: 'US-21CFR101-current-2026-08-21',
    checkedAt: '2026-08-25',
    requiredFields: REGULATORY_REQUIRED,
    optionalFields: REGULATORY_OPTIONAL,
    sourceUrls: [
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.3',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.4',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.5',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.12',
    ],
    requiredLanguages: ['en'],
    minimumTypography: { xHeightMm: 0, minimumPointSize: 6 },
    nutritionFormat: 'US_NF',
    selectable: true,
    rendererVersion: 'fda-nutrition-facts-v2',
  },
  CA: {
    code: 'CA',
    label: 'Kanada',
    jurisdiction: 'Canada',
    flag: 'CA',
    consumerLayout: 'ca_bilingual_nft',
    status: 'EXTERNAL_ASSET_BLOCKED',
    version: 'CA-FDR-NFT-FOP-current-2026-08-25',
    checkedAt: '2026-08-25',
    requiredFields: REGULATORY_REQUIRED,
    optionalFields: REGULATORY_OPTIONAL,
    sourceUrls: [
      'https://inspection.canada.ca/en/food-labels/labelling/industry/bilingual-food-labelling',
      'https://inspection.canada.ca/en/food-labels/labelling/industry/list-ingredients-and-allergens',
      'https://inspection.canada.ca/en/food-labels/labelling/industry/nutrition-labelling/nutrition-facts-table-formats',
      'https://www.canada.ca/en/health-canada/services/technical-documents-labelling-requirements/nutrition-symbol-specifications/nutrition-labelling.html',
      'https://www.canada.ca/en/health-canada/services/food-nutrition/legislation-guidelines/guidance-documents/front-package-nutrition-symbol-labelling-industry.html',
    ],
    requiredLanguages: ['en', 'fr'],
    minimumTypography: { xHeightMm: 0, minimumPointSize: 6 },
    nutritionFormat: 'CA_NFT',
    selectable: true,
    rendererVersion: 'canada-nft-v2',
    externalAssetRequirement:
      'Official Health Canada high-resolution FOP .EPS package must be requested from smiu-ugdi@hc-sc.gc.ca with subject "HPFB BNS Compendium of Nutrition Symbol Formats" and installed in src/assets/regulatory/canada-fop/.',
  },
  AU_NZ: {
    code: 'AU_NZ',
    label: 'Australia / Nowa Zelandia',
    jurisdiction: 'Australia / New Zealand combined superset',
    flag: 'AU/NZ',
    consumerLayout: 'au_nz_nip',
    status: 'REGULATORY_VERIFIED',
    version: 'FSANZ-AU-NZ-union-current-2026-08-28',
    checkedAt: '2026-08-28',
    requiredFields: AU_NZ_REQUIRED,
    optionalFields: REGULATORY_OPTIONAL,
    sourceUrls: [
      'https://www.foodstandards.gov.au/consumer/labelling/panels',
      'https://www.foodstandards.gov.au/business/labelling/allergen-labelling',
      'https://www.foodstandards.gov.au/consumer/labelling/ingredients',
      'https://www.foodstandards.gov.au/consumer/labelling/dates',
      'https://www.legislation.gov.au/F2016L00528/latest',
      'https://www.mpi.govt.nz/food-business/labelling-composition-food-drinks/food-and-drink-labelling-and-composition-rules',
      'https://www.mpi.govt.nz/food-safety-home/how-read-food-labels',
    ],
    requiredLanguages: ['en'],
    minimumTypography: { xHeightMm: 0, minimumPointSize: 6 },
    nutritionFormat: 'AU_NZ_NIP',
    selectable: true,
    rendererVersion: 'fsanz-nip-v2',
  },
  WORLD: {
    code: 'WORLD',
    label: 'Świat / Uniwersalna',
    jurisdiction: 'Universal informational output — no country legal profile',
    flag: 'WORLD',
    consumerLayout: 'world_neutral',
    status: 'INFORMATIONAL',
    version: 'WORLD-information-v1-2026-08-25',
    checkedAt: '2026-08-25',
    requiredFields: WORLD_REQUIRED,
    optionalFields: WORLD_OPTIONAL,
    sourceUrls: [],
    requiredLanguages: ['en'],
    minimumTypography: { xHeightMm: 0, minimumPointSize: 6 },
    nutritionFormat: 'WORLD_100G',
    selectable: true,
    rendererVersion: 'world-neutral-v1',
  },
});

export function marketProfile(code: MarketProfileCode): MarketProfile {
  return MARKET_PROFILES[code];
}
