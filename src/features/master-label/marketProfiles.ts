export type MarketProfileCode = 'EU' | 'US' | 'CA' | 'UK' | 'AU_NZ' | 'CUSTOM';
export type MarketProfileStatus = 'VERIFIED' | 'PARTIAL' | 'RESEARCH_REQUIRED';

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
  | 'origin'
  | 'customer_note';

export interface MarketProfile {
  code: MarketProfileCode;
  label: string;
  jurisdiction: string;
  status: MarketProfileStatus;
  version: string;
  checkedAt: string;
  requiredFields: readonly MasterLabelFieldId[];
  optionalFields: readonly MasterLabelFieldId[];
  sourceUrls: readonly string[];
  /** Honest implementation limitation, separate from legal research status. */
  rendererLimitation: string;
}

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

const OPTIONAL: readonly MasterLabelFieldId[] = ['origin', 'customer_note'];

export const MARKET_PROFILES: Readonly<Record<MarketProfileCode, MarketProfile>> = Object.freeze({
  EU: {
    code: 'EU',
    label: 'UE',
    jurisdiction: 'European Union',
    status: 'PARTIAL',
    version: 'EU-FIC-review-2026-08-09',
    checkedAt: '2026-08-09',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: ['https://eur-lex.europa.eu/eli/reg/2011/1169'],
    rendererLimitation:
      'Profil bazuje na FIC 1169/2011, ale wymaga jeszcze krajowych języków, nazwy prawnej produktu, QUID i kontroli zaokrągleń.',
  },
  US: {
    code: 'US',
    label: 'USA',
    jurisdiction: 'United States',
    status: 'PARTIAL',
    version: 'US-FDA-review-2026-08-09',
    checkedAt: '2026-08-09',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.3',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.4',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.5',
      'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9',
      'https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies',
    ],
    rendererLimitation:
      'Brakuje kompletnego Nutrition Facts, RACC/serving, %DV, added sugars i standard-of-identity dla konkretnego produktu.',
  },
  CA: {
    code: 'CA',
    label: 'Kanada',
    jurisdiction: 'Canada',
    status: 'PARTIAL',
    version: 'CA-CFIA-review-2026-08-09',
    checkedAt: '2026-08-09',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [
      'https://inspection.canada.ca/en/food-labels/labelling/industry/bilingual-food-labelling',
      'https://inspection.canada.ca/en/food-labels/labelling/industry/list-ingredients-and-allergens',
      'https://inspection.canada.ca/en/food-labels/labelling/industry/nutrition-labelling',
    ],
    rendererLimitation:
      'Brakuje kanadyjskiego Nutrition Facts, pełnego bilingual layout, FOP i provincial overlays.',
  },
  UK: {
    code: 'UK',
    label: 'UK',
    jurisdiction: 'United Kingdom',
    status: 'PARTIAL',
    version: 'UK-review-2026-08-09',
    checkedAt: '2026-08-09',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [
      'https://www.gov.uk/guidance/food-labelling-giving-food-information-to-consumers',
      'https://www.gov.uk/government/publications/packaging-and-labelling/packaging-and-labelling',
    ],
    rendererLimitation:
      'Wymaga rozdzielenia GB i Northern Ireland oraz kontroli aktualnych overlays.',
  },
  AU_NZ: {
    code: 'AU_NZ',
    label: 'Australia/NZ',
    jurisdiction: 'Australia and New Zealand',
    status: 'PARTIAL',
    version: 'FSANZ-review-2026-08-09',
    checkedAt: '2026-08-09',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [
      'https://www.foodstandards.gov.au/food-standards-code/legislation',
      'https://www.foodstandards.gov.au/business/labelling/allergen-labelling',
      'https://www.foodstandards.gov.au/consumer/labelling/panels',
    ],
    rendererLimitation:
      'Brakuje pełnego NIP, AU/NZ overlays, country-of-origin i zweryfikowanych zasad zaokrągleń.',
  },
  CUSTOM: {
    code: 'CUSTOM',
    label: 'Inny rynek',
    jurisdiction: 'Custom / not yet researched',
    status: 'RESEARCH_REQUIRED',
    version: 'custom-2026-08-09',
    checkedAt: '2026-08-09',
    requiredFields: COMMON_REQUIRED,
    optionalFields: OPTIONAL,
    sourceUrls: [],
    rendererLimitation: 'Profil wymaga weryfikacji. PINGÜINO nie zgaduje wymagań prawnych.',
  },
});

export function marketProfile(code: MarketProfileCode): MarketProfile {
  return MARKET_PROFILES[code];
}
