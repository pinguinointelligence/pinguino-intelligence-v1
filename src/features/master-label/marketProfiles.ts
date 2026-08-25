export type MarketProfileCode = 'EU' | 'US' | 'CA' | 'UK' | 'AU_NZ' | 'CUSTOM';
export type MarketProfileStatus = 'VERIFIED' | 'RESEARCH_REQUIRED';

export type MasterLabelFieldId =
  | 'product_name'
  | 'legal_product_name'
  | 'ingredients'
  | 'allergens'
  | 'nutrition'
  | 'net_quantity'
  | 'operator'
  | 'storage'
  | 'date_mark'
  | 'lot'
  | 'logo'
  | 'origin'
  | 'customer_note';

export interface MarketProfile {
  code: MarketProfileCode;
  label: string;
  jurisdiction: string;
  flag: string;
  /** Presentation identity only; legal requirements remain in requiredFields. */
  consumerLayout:
    | 'eu_declaration'
    | 'uk_declaration'
    | 'us_nutrition_facts'
    | 'ca_bilingual_nft'
    | 'au_nz_nip'
    | 'research_unavailable';
  status: MarketProfileStatus;
  version: string;
  checkedAt: string;
  requiredFields: readonly MasterLabelFieldId[];
  optionalFields: readonly MasterLabelFieldId[];
  sourceUrls: readonly string[];
  requiredLanguages: readonly string[];
  minimumLabel: { widthMm: number; heightMm: number; xHeightMm: number };
  nutritionFormat: 'EU_100G' | 'UK_100G' | 'US_NF' | 'CA_NFT' | 'AU_NZ_NIP' | 'NONE';
  selectable: boolean;
  /** Honest implementation limitation, separate from legal research status. */
  rendererLimitation: string;
}

export const marketAvailabilityLabel = (profile: MarketProfile): string =>
  profile.selectable ? 'Gotowe do druku' : 'W przygotowaniu';

const COMMON_REQUIRED: readonly MasterLabelFieldId[] = [
  'product_name',
  'legal_product_name',
  'ingredients',
  'allergens',
  'nutrition',
  'net_quantity',
  'operator',
  'storage',
  'date_mark',
  'lot',
];

const OPTIONAL: readonly MasterLabelFieldId[] = ['logo', 'origin', 'customer_note'];

export const MARKET_PROFILES: Readonly<Record<MarketProfileCode, MarketProfile>> = Object.freeze({
  EU: {
    code: 'EU',
    label: 'UE',
    jurisdiction: 'European Union',
    flag: '🇪🇺',
    consumerLayout: 'eu_declaration',
    status: 'VERIFIED',
    version: 'EU-FIC-1169-2021-v2026-08-25',
    checkedAt: '2026-08-25',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [
      'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02011R1169-20250401',
      'https://food.ec.europa.eu/food-safety/labelling-and-nutrition/food-information-consumers-legislation/mandatory-food-information_en',
    ],
    requiredLanguages: [],
    // Complete retail declarations clipped at the former 90 × 60 / 100 × 70
    // software minima. Keep mandatory typography and fail closed onto the
    // first verified full-content geometry instead of shrinking to fit.
    minimumLabel: { widthMm: 102, heightMm: 152, xHeightMm: 1.2 },
    nutritionFormat: 'EU_100G',
    selectable: true,
    rendererLimitation: '',
  },
  US: {
    code: 'US',
    label: 'USA',
    jurisdiction: 'United States',
    flag: '🇺🇸',
    consumerLayout: 'us_nutrition_facts',
    status: 'RESEARCH_REQUIRED',
    version: 'US-21CFR101-NF-2026-08-25',
    checkedAt: '2026-08-25',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.3',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.4',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.5',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9',
      'https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies',
    ],
    requiredLanguages: ['en'],
    minimumLabel: { widthMm: 102, heightMm: 152, xHeightMm: 1.2 },
    nutritionFormat: 'US_NF',
    selectable: false,
    rendererLimitation:
      'Nutrition Facts QA renderer exists, but FDA rounding and prescribed format-family selection are not yet complete enough for retail print.',
  },
  CA: {
    code: 'CA',
    label: 'Kanada',
    jurisdiction: 'Canada',
    flag: '🇨🇦',
    consumerLayout: 'ca_bilingual_nft',
    status: 'RESEARCH_REQUIRED',
    version: 'CA-FDR-NFT-FOP-2026-08-25',
    checkedAt: '2026-08-25',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [
      'https://inspection.canada.ca/en/food-labels/labelling/industry/bilingual-food-labelling',
      'https://inspection.canada.ca/en/food-labels/labelling/industry/list-ingredients-and-allergens',
      'https://inspection.canada.ca/en/food-labels/labelling/industry/nutrition-labelling',
      'https://www.canada.ca/en/health-canada/services/food-nutrition/legislation-guidelines/guidance-documents/front-package-nutrition-symbol-labelling-industry.html',
    ],
    requiredLanguages: ['en', 'fr'],
    minimumLabel: { widthMm: 104, heightMm: 152, xHeightMm: 1.6 },
    nutritionFormat: 'CA_NFT',
    selectable: false,
    rendererLimitation:
      'Implementacja reguł i układu jest gotowa do QA, ale retail print pozostaje niedostępny do czasu dostarczenia zatwierdzonego oficjalnego assetu FOP Health Canada.',
  },
  UK: {
    code: 'UK',
    label: 'UK',
    jurisdiction: 'United Kingdom',
    flag: '🇬🇧',
    consumerLayout: 'uk_declaration',
    status: 'VERIFIED',
    version: 'UK-FIC-PPDS-2026-08-25',
    checkedAt: '2026-08-25',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [
      'https://www.gov.uk/guidance/food-labelling-giving-food-information-to-consumers',
      'https://www.gov.uk/government/publications/packaging-and-labelling/packaging-and-labelling',
    ],
    requiredLanguages: ['en'],
    minimumLabel: { widthMm: 102, heightMm: 152, xHeightMm: 1.2 },
    nutritionFormat: 'UK_100G',
    selectable: true,
    rendererLimitation: '',
  },
  AU_NZ: {
    code: 'AU_NZ',
    label: 'Australia/NZ',
    jurisdiction: 'Australia and New Zealand',
    flag: '🇦🇺 🇳🇿',
    consumerLayout: 'au_nz_nip',
    status: 'VERIFIED',
    version: 'FSANZ-1.2.8-2024-10-29-v2026-08-25',
    checkedAt: '2026-08-25',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [
      'https://www.foodstandards.gov.au/food-standards-code/legislation',
      'https://www.foodstandards.gov.au/business/labelling/allergen-labelling',
      'https://www.foodstandards.gov.au/consumer/labelling/panels',
    ],
    requiredLanguages: ['en'],
    minimumLabel: { widthMm: 102, heightMm: 152, xHeightMm: 1.2 },
    nutritionFormat: 'AU_NZ_NIP',
    selectable: true,
    rendererLimitation: '',
  },
  CUSTOM: {
    code: 'CUSTOM',
    label: 'Inny rynek',
    jurisdiction: 'Custom / not yet researched',
    flag: '🌐',
    consumerLayout: 'research_unavailable',
    status: 'RESEARCH_REQUIRED',
    version: 'custom-2026-08-09',
    checkedAt: '2026-08-09',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [],
    requiredLanguages: [],
    minimumLabel: { widthMm: 0, heightMm: 0, xHeightMm: 0 },
    nutritionFormat: 'NONE',
    selectable: false,
    rendererLimitation: 'Profil wymaga weryfikacji. PINGÜINO nie zgaduje wymagań prawnych.',
  },
});

export function marketProfile(code: MarketProfileCode): MarketProfile {
  return MARKET_PROFILES[code];
}
