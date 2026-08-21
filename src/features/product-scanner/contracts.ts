export const PRODUCT_SCAN_SCHEMA_VERSION = 'gellatti_product_scan_v1' as const;

export type ProductScanSource = 'label' | 'barcode_registry' | 'manufacturer' | 'retailer';
export type ProductScanConfidence = 'high' | 'medium' | 'low';
export type ProductScanOverlayState =
  | 'SCAN_DRAFT'
  | 'USABLE_FOR_OWNER'
  | 'PENDING_PUBLICATION'
  | 'PUBLISHED'
  | 'BLOCKED';

export interface ProductScanEvidenceRef {
  assetId: string;
  field: string;
  source: ProductScanSource;
  confidence: ProductScanConfidence;
}

export interface ProductScanConflict {
  field: string;
  labelValue: string | number | null;
  externalValue: string | number | null;
  retainedSource: ProductScanSource;
}

export interface ProductScanExternalSource {
  sourceType: 'barcode_registry' | 'manufacturer' | 'retailer' | 'web_search';
  url: string | null;
  title: string | null;
  fieldsUsed: string[];
}

export interface ProductScanNutrition {
  basis: 'per_100g' | 'per_100ml' | null;
  energyKj: number | null;
  energyKcal: number | null;
  fat: number | null;
  saturatedFat: number | null;
  carbohydrate: number | null;
  sugars: number | null;
  protein: number | null;
  salt: number | null;
  fibre: number | null;
}

export interface ProductScanResult {
  schemaVersion: typeof PRODUCT_SCAN_SCHEMA_VERSION;
  identity: {
    displayName: string | null;
    originalName: string | null;
    brand: string | null;
    explicitlyUnbranded: boolean;
    category: string | null;
    variant: string | null;
    countryOfOrigin: string | null;
    labelLanguages: string[];
  };
  package: {
    netQuantity: number | null;
    unit: 'g' | 'kg' | 'ml' | 'l' | null;
    netQuantityText: string | null;
  };
  barcodes: Array<{ value: string; format: 'EAN_8' | 'EAN_13' | 'UPC_A' | 'UPC_E' }>;
  nutrition: ProductScanNutrition;
  ingredientsText: string | null;
  allergensText: string | null;
  mayContainAllergens: string[];
  claims: string[];
  storageInstructions: string | null;
  manufacturer: string | null;
  externalSources: ProductScanExternalSource[];
  evidence: ProductScanEvidenceRef[];
  missingFields: string[];
  conflicts: ProductScanConflict[];
  warnings: string[];
}

export interface PreparedProductScanAsset {
  id: string;
  file: File;
  previewUrl: string;
  source: 'camera_auto' | 'camera_manual' | 'gallery' | 'drop' | 'paste';
  originalMime: string;
  transformations: string[];
  qualityScore: number | null;
}

export interface ProductScanBudget {
  maxImages: number;
  maxVisionCalls: 2;
  maxWebCalls: 1;
}

/**
 * Kept as plain JSON so the exact same schema is sent to Responses API and
 * source-tested in the Edge function. All facts are nullable: absent label
 * evidence is UNKNOWN, never a synthetic zero.
 */
export const PRODUCT_SCAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'identity',
    'package',
    'barcodes',
    'nutrition',
    'ingredientsText',
    'allergensText',
    'mayContainAllergens',
    'claims',
    'storageInstructions',
    'manufacturer',
    'externalSources',
    'evidence',
    'missingFields',
    'conflicts',
    'warnings',
  ],
  properties: {
    schemaVersion: { type: 'string', const: PRODUCT_SCAN_SCHEMA_VERSION },
    identity: {
      type: 'object',
      additionalProperties: false,
      required: [
        'displayName',
        'originalName',
        'brand',
        'explicitlyUnbranded',
        'category',
        'variant',
        'countryOfOrigin',
        'labelLanguages',
      ],
      properties: {
        displayName: { type: ['string', 'null'] },
        originalName: { type: ['string', 'null'] },
        brand: { type: ['string', 'null'] },
        explicitlyUnbranded: { type: 'boolean' },
        category: { type: ['string', 'null'] },
        variant: { type: ['string', 'null'] },
        countryOfOrigin: { type: ['string', 'null'] },
        labelLanguages: { type: 'array', items: { type: 'string' } },
      },
    },
    package: {
      type: 'object',
      additionalProperties: false,
      required: ['netQuantity', 'unit', 'netQuantityText'],
      properties: {
        netQuantity: { type: ['number', 'null'] },
        unit: { enum: ['g', 'kg', 'ml', 'l', null] },
        netQuantityText: { type: ['string', 'null'] },
      },
    },
    barcodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['value', 'format'],
        properties: {
          value: { type: 'string' },
          format: { enum: ['EAN_8', 'EAN_13', 'UPC_A', 'UPC_E'] },
        },
      },
    },
    nutrition: {
      type: 'object',
      additionalProperties: false,
      required: [
        'basis',
        'energyKj',
        'energyKcal',
        'fat',
        'saturatedFat',
        'carbohydrate',
        'sugars',
        'protein',
        'salt',
        'fibre',
      ],
      properties: Object.fromEntries(
        [
          'energyKj',
          'energyKcal',
          'fat',
          'saturatedFat',
          'carbohydrate',
          'sugars',
          'protein',
          'salt',
          'fibre',
        ].map((key) => [key, { type: ['number', 'null'] }]),
      ) as Record<string, unknown>,
    },
    ingredientsText: { type: ['string', 'null'] },
    allergensText: { type: ['string', 'null'] },
    mayContainAllergens: { type: 'array', items: { type: 'string' } },
    claims: { type: 'array', items: { type: 'string' } },
    storageInstructions: { type: ['string', 'null'] },
    manufacturer: { type: ['string', 'null'] },
    externalSources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceType', 'url', 'title', 'fieldsUsed'],
        properties: {
          sourceType: { enum: ['barcode_registry', 'manufacturer', 'retailer', 'web_search'] },
          url: { type: ['string', 'null'] },
          title: { type: ['string', 'null'] },
          fieldsUsed: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['assetId', 'field', 'source', 'confidence'],
        properties: {
          assetId: { type: 'string' },
          field: { type: 'string' },
          source: { enum: ['label', 'barcode_registry', 'manufacturer', 'retailer'] },
          confidence: { enum: ['high', 'medium', 'low'] },
        },
      },
    },
    missingFields: { type: 'array', items: { type: 'string' } },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'labelValue', 'externalValue', 'retainedSource'],
        properties: {
          field: { type: 'string' },
          labelValue: { type: ['string', 'number', 'null'] },
          externalValue: { type: ['string', 'number', 'null'] },
          retainedSource: {
            enum: ['label', 'barcode_registry', 'manufacturer', 'retailer'],
          },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
} as const;

// `basis` cannot be expressed through the Object.fromEntries block above.
// Assign once at module initialization while retaining a serializable schema.
(PRODUCT_SCAN_JSON_SCHEMA.properties.nutrition.properties as Record<string, unknown>).basis = {
  enum: ['per_100g', 'per_100ml', null],
};
