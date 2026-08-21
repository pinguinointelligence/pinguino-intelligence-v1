import {
  PRODUCT_SCAN_SCHEMA_VERSION,
  type ProductScanConflict,
  type ProductScanNutrition,
  type ProductScanOverlayState,
  type ProductScanResult,
} from './contracts';
import { validateBarcode } from './barcode';

export interface ProductScanValidation {
  ok: boolean;
  normalized: ProductScanResult | null;
  errors: string[];
  warnings: string[];
  overlayState: ProductScanOverlayState;
}

const objectValue = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const nullableText = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const nullableNumber = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  return [
    ...new Set(
      value.flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : [])),
    ),
  ];
};

const NUTRITION_KEYS = [
  'energyKj',
  'energyKcal',
  'fat',
  'saturatedFat',
  'carbohydrate',
  'sugars',
  'protein',
  'salt',
  'fibre',
] as const;

const HIGH_RISK_INGREDIENTS = [
  'guma tara',
  'tara gum',
  'karagen',
  'carrageenan',
  'guar',
  'locust bean',
  'mączka chleba świętojańskiego',
  'mono- i diglicerydy',
  'mono and diglycerides',
  'polisorbat',
  'polysorbate',
];

export function needsHighRiskDosageEvidence(result: ProductScanResult): boolean {
  const ingredients = result.ingredientsText?.toLocaleLowerCase('pl') ?? '';
  return HIGH_RISK_INGREDIENTS.some((needle) => ingredients.includes(needle));
}

function nutritionValidation(
  raw: Record<string, unknown>,
  errors: string[],
  warnings: string[],
): ProductScanNutrition {
  const basis = raw.basis === 'per_100g' || raw.basis === 'per_100ml' ? raw.basis : null;
  if (raw.basis !== null && basis === null) errors.push('nutrition_basis_invalid');
  const parsed = Object.fromEntries(
    NUTRITION_KEYS.map((key) => {
      const value = nullableNumber(raw[key]);
      if (value === undefined || (value !== null && value < 0))
        errors.push(`nutrition_${key}_invalid`);
      if (
        value !== null &&
        value !== undefined &&
        key !== 'energyKj' &&
        key !== 'energyKcal' &&
        value > 100
      ) {
        errors.push(`nutrition_${key}_over_100`);
      }
      return [key, value === undefined ? null : value];
    }),
  ) as unknown as Omit<ProductScanNutrition, 'basis'>;
  if (
    parsed.sugars !== null &&
    parsed.carbohydrate !== null &&
    parsed.sugars > parsed.carbohydrate
  ) {
    errors.push('nutrition_sugars_gt_carbohydrate');
  }
  if (parsed.saturatedFat !== null && parsed.fat !== null && parsed.saturatedFat > parsed.fat) {
    errors.push('nutrition_saturated_fat_gt_fat');
  }
  const macroTotal = [parsed.fat, parsed.carbohydrate, parsed.protein, parsed.fibre, parsed.salt]
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
  if (macroTotal > 105) errors.push('nutrition_macro_mass_conflict');
  if (parsed.energyKj !== null && parsed.energyKcal !== null) {
    const expected = parsed.energyKcal * 4.184;
    if (Math.abs(parsed.energyKj - expected) > Math.max(40, expected * 0.12)) {
      warnings.push('nutrition_energy_kj_kcal_conflict');
    }
  }
  return { basis, ...parsed };
}

export function validateProductScanResult(value: unknown): ProductScanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const root = objectValue(value);
  if (!root || root.schemaVersion !== PRODUCT_SCAN_SCHEMA_VERSION) {
    return {
      ok: false,
      normalized: null,
      errors: ['schema_version_invalid'],
      warnings,
      overlayState: 'BLOCKED',
    };
  }
  const identity = objectValue(root.identity);
  const packageValue = objectValue(root.package);
  const nutritionRaw = objectValue(root.nutrition);
  if (!identity || !packageValue || !nutritionRaw) {
    return {
      ok: false,
      normalized: null,
      errors: ['required_object_missing'],
      warnings,
      overlayState: 'BLOCKED',
    };
  }
  const displayName = nullableText(identity.displayName);
  const originalName = nullableText(identity.originalName);
  const brand = nullableText(identity.brand);
  const explicitlyUnbranded = identity.explicitlyUnbranded === true;
  if (displayName === undefined || originalName === undefined || brand === undefined) {
    errors.push('identity_text_invalid');
  }
  if (!displayName && !originalName) errors.push('product_identity_missing');
  if (!brand && !explicitlyUnbranded) errors.push('brand_or_unbranded_missing');
  const labelLanguages = stringArray(identity.labelLanguages);
  if (!labelLanguages) errors.push('label_languages_invalid');

  const netQuantity = nullableNumber(packageValue.netQuantity);
  const unit = ['g', 'kg', 'ml', 'l'].includes(String(packageValue.unit))
    ? (packageValue.unit as 'g' | 'kg' | 'ml' | 'l')
    : null;
  if (netQuantity === undefined || (netQuantity !== null && netQuantity <= 0))
    errors.push('net_quantity_invalid');
  if (netQuantity !== null && netQuantity !== undefined && unit === null)
    errors.push('net_quantity_unit_missing');

  const barcodes = Array.isArray(root.barcodes)
    ? root.barcodes.flatMap((item) => {
        const row = objectValue(item);
        if (!row || typeof row.value !== 'string') return [];
        const valid = validateBarcode(
          row.value,
          typeof row.format === 'string' ? row.format : null,
        );
        if (!valid) {
          errors.push('barcode_checksum_invalid');
          return [];
        }
        return [{ value: valid.value, format: valid.format }];
      })
    : [];
  if (!Array.isArray(root.barcodes)) errors.push('barcodes_invalid');

  const ingredientsText = nullableText(root.ingredientsText);
  const allergensText = nullableText(root.allergensText);
  const mayContainAllergens = stringArray(root.mayContainAllergens);
  const claims = stringArray(root.claims);
  const missingFields = stringArray(root.missingFields);
  const resultWarnings = stringArray(root.warnings);
  if (
    ingredientsText === undefined ||
    allergensText === undefined ||
    !mayContainAllergens ||
    !claims ||
    !missingFields ||
    !resultWarnings
  ) {
    errors.push('array_or_text_contract_invalid');
  }

  const conflicts: ProductScanConflict[] = Array.isArray(root.conflicts)
    ? root.conflicts.flatMap((item) => {
        const row = objectValue(item);
        if (
          !row ||
          typeof row.field !== 'string' ||
          !['label', 'barcode_registry', 'manufacturer', 'retailer'].includes(
            String(row.retainedSource),
          )
        ) {
          errors.push('conflict_contract_invalid');
          return [];
        }
        if (row.retainedSource !== 'label' && row.labelValue !== null) {
          errors.push('label_must_win_conflict');
        }
        return [row as unknown as ProductScanConflict];
      })
    : [];
  if (!Array.isArray(root.conflicts)) errors.push('conflicts_invalid');

  const evidence = Array.isArray(root.evidence)
    ? root.evidence.flatMap((item) => {
        const row = objectValue(item);
        if (
          !row ||
          typeof row.assetId !== 'string' ||
          typeof row.field !== 'string' ||
          !['label', 'barcode_registry', 'manufacturer', 'retailer'].includes(String(row.source)) ||
          !['high', 'medium', 'low'].includes(String(row.confidence))
        ) {
          errors.push('evidence_contract_invalid');
          return [];
        }
        return [row as unknown as ProductScanResult['evidence'][number]];
      })
    : [];
  if (!Array.isArray(root.evidence)) errors.push('evidence_invalid');
  const externalSources = Array.isArray(root.externalSources)
    ? root.externalSources.flatMap((item) => {
        const row = objectValue(item);
        const fieldsUsed = stringArray(row?.fieldsUsed);
        const sourceType = row?.sourceType;
        const url = nullableText(row?.url);
        if (
          !row ||
          !fieldsUsed ||
          !['barcode_registry', 'manufacturer', 'retailer', 'web_search'].includes(
            String(sourceType),
          ) ||
          (url !== null && url !== undefined && !/^https:\/\//i.test(url))
        ) {
          errors.push('external_source_contract_invalid');
          return [];
        }
        return [
          {
            sourceType: sourceType as ProductScanResult['externalSources'][number]['sourceType'],
            url: url ?? null,
            title: nullableText(row.title) ?? null,
            fieldsUsed,
          },
        ];
      })
    : [];
  if (!Array.isArray(root.externalSources)) errors.push('external_sources_invalid');

  const normalized: ProductScanResult = {
    schemaVersion: PRODUCT_SCAN_SCHEMA_VERSION,
    identity: {
      displayName: displayName ?? null,
      originalName: originalName ?? null,
      brand: brand ?? null,
      explicitlyUnbranded,
      category: nullableText(identity.category) ?? null,
      variant: nullableText(identity.variant) ?? null,
      countryOfOrigin: nullableText(identity.countryOfOrigin) ?? null,
      labelLanguages: labelLanguages ?? [],
    },
    package: {
      netQuantity: netQuantity ?? null,
      unit,
      netQuantityText: nullableText(packageValue.netQuantityText) ?? null,
    },
    barcodes,
    nutrition: nutritionValidation(nutritionRaw, errors, warnings),
    ingredientsText: ingredientsText ?? null,
    allergensText: allergensText ?? null,
    mayContainAllergens: mayContainAllergens ?? [],
    claims: claims ?? [],
    storageInstructions: nullableText(root.storageInstructions) ?? null,
    manufacturer: nullableText(root.manufacturer) ?? null,
    externalSources,
    evidence,
    missingFields: [
      ...new Set([...(missingFields ?? []), ...errors.filter((item) => item.endsWith('_missing'))]),
    ],
    conflicts,
    warnings: [...new Set([...(resultWarnings ?? []), ...warnings])],
  };

  const criticalMissing = [
    normalized.identity.displayName ?? normalized.identity.originalName,
    normalized.identity.brand ?? (normalized.identity.explicitlyUnbranded ? 'unbranded' : null),
    normalized.package.netQuantity,
    normalized.package.unit,
    normalized.ingredientsText,
    normalized.allergensText,
    normalized.nutrition.basis,
    normalized.nutrition.energyKcal,
    normalized.nutrition.fat,
    normalized.nutrition.carbohydrate,
    normalized.nutrition.protein,
    normalized.nutrition.salt,
  ].some((item) => item === null);
  const highRisk = needsHighRiskDosageEvidence(normalized);
  if (highRisk) warnings.push('high_risk_additive_requires_behavior_and_dosage_evidence');
  const overlayState: ProductScanOverlayState =
    errors.length > 0 || criticalMissing
      ? 'SCAN_DRAFT'
      : highRisk
        ? 'USABLE_FOR_OWNER'
        : 'PENDING_PUBLICATION';
  return {
    ok: errors.length === 0,
    normalized,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    overlayState,
  };
}

export function mergeExternalFacts(
  label: ProductScanResult,
  external: Partial<ProductScanResult>,
): ProductScanResult {
  // External sources can fill a null but can never silently replace a label fact.
  const conflicts = [...label.conflicts];
  const choose = <T extends string | number>(
    field: string,
    labelValue: T | null,
    externalValue: T | null | undefined,
  ): T | null => {
    if (labelValue !== null) {
      if (externalValue !== null && externalValue !== undefined && externalValue !== labelValue) {
        conflicts.push({ field, labelValue, externalValue, retainedSource: 'label' });
      }
      return labelValue;
    }
    return externalValue ?? null;
  };
  return {
    ...label,
    identity: {
      ...label.identity,
      displayName: choose(
        'identity.displayName',
        label.identity.displayName,
        external.identity?.displayName,
      ),
      brand: choose('identity.brand', label.identity.brand, external.identity?.brand),
    },
    package: {
      ...label.package,
      netQuantity: choose(
        'package.netQuantity',
        label.package.netQuantity,
        external.package?.netQuantity,
      ),
      unit: choose('package.unit', label.package.unit, external.package?.unit),
    },
    nutrition: Object.fromEntries(
      Object.entries(label.nutrition).map(([field, value]) => [
        field,
        choose(
          `nutrition.${field}`,
          value,
          external.nutrition?.[field as keyof ProductScanNutrition] as
            | number
            | string
            | null
            | undefined,
        ),
      ]),
    ) as unknown as ProductScanNutrition,
    ingredientsText: choose('ingredientsText', label.ingredientsText, external.ingredientsText),
    allergensText: choose('allergensText', label.allergensText, external.allergensText),
    externalSources: [...label.externalSources, ...(external.externalSources ?? [])],
    conflicts,
  };
}
