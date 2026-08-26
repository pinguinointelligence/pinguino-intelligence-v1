import type {
  EvidenceSource,
  ProductEvidenceField,
  ProductEvidenceInput,
} from '../../../src/features/product-intelligence/productEvidenceConfidence.ts';
import type { WorkingNumericField } from '../../../src/features/product-intelligence/productFieldTruth.ts';
import type {
  ProductSemanticClassification,
  ProductSemanticEvidence,
} from '../../../src/features/product-intelligence/productRecognition.ts';
import type { ProfileMatchInput } from '../../../src/features/product-intelligence/mapperValueInference.ts';

type JsonObject = Record<string, unknown>;

const objectValue = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const evidenceRows = (root: JsonObject): JsonObject[] =>
  Array.isArray(root.evidence) ? root.evidence.map(objectValue) : [];

const externalRows = (root: JsonObject): JsonObject[] =>
  Array.isArray(root.externalSources) ? root.externalSources.map(objectValue) : [];

const SCAN_FIELD_PATHS: Readonly<Partial<Record<ProductEvidenceField, string[]>>> = {
  identity: ['identity.displayName', 'identity.originalName'],
  brand: ['identity.brand'],
  manufacturer: ['manufacturer'],
  variant: ['identity.variant'],
  netQuantity: ['package.netQuantity', 'package.netQuantityText'],
  ingredients: ['ingredientsText'],
  allergens: ['allergensText', 'mayContainAllergens'],
  nutritionBasis: ['nutrition.basis'],
  energyKcal: ['nutrition.energyKcal'],
  fat: ['nutrition.fat'],
  carbohydrate: ['nutrition.carbohydrate'],
  sugars: ['nutrition.sugars'],
  fiber: ['nutrition.fibre'],
  protein: ['nutrition.protein'],
  salt: ['nutrition.salt'],
  barcode: ['barcodes'],
  countryOfOrigin: ['identity.countryOfOrigin'],
  dosage: ['productionDeclarations.dosageText'],
  technicalParameters: ['productionDeclarations.technicalParametersText'],
  technicalSource: ['productionDeclarations.technicalParametersText'],
};

const sourceForExternalType = (value: unknown): EvidenceSource => {
  if (value === 'manufacturer') return 'manufacturer';
  if (value === 'barcode_registry') return 'barcode_registry';
  if (value === 'retailer') return 'retailer';
  return 'web_search';
};

function hasDirectLabelEvidence(root: JsonObject, paths: readonly string[]): boolean {
  return evidenceRows(root).some(
    (row) =>
      row.source === 'label' &&
      row.directVisibility === true &&
      typeof row.field === 'string' &&
      paths.includes(row.field),
  );
}

function externalEvidenceSource(root: JsonObject, paths: readonly string[]): EvidenceSource | null {
  for (const row of externalRows(root)) {
    const fields = Array.isArray(row.fieldsUsed)
      ? row.fieldsUsed.filter((field): field is string => typeof field === 'string')
      : [];
    if (paths.some((path) => fields.includes(path))) return sourceForExternalType(row.sourceType);
  }
  return null;
}

const pathValue = (root: JsonObject, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => objectValue(value)[key], root);

function presentForField(root: JsonObject, field: ProductEvidenceField): boolean {
  const paths = SCAN_FIELD_PATHS[field] ?? [];
  return paths.some((path) => {
    const value = pathValue(root, path);
    return (
      (typeof value === 'string' && value.trim().length > 0) ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (Array.isArray(value) && value.length > 0)
    );
  });
}

function evidenceSource(
  root: JsonObject,
  field: ProductEvidenceField,
  userConfirmed: ReadonlySet<ProductEvidenceField>,
): EvidenceSource | null {
  if (!presentForField(root, field)) return null;
  if (userConfirmed.has(field)) return 'user_confirmed';
  const paths = SCAN_FIELD_PATHS[field] ?? [];
  if (hasDirectLabelEvidence(root, paths)) return 'label';
  return externalEvidenceSource(root, paths) ?? (field === 'barcode' ? 'label' : null);
}

const MACRO_FIELDS: Readonly<Record<string, WorkingNumericField>> = {
  energyKcal: 'kcal_per_100g',
  fat: 'fat_percent',
  protein: 'protein_percent',
  carbohydrate: 'carbohydrate_percent',
  sugars: 'total_sugars_percent',
  fibre: 'fiber_percent',
  salt: 'salt_percent',
};

export interface CustomerProductProfileProposal {
  matchInput: ProfileMatchInput;
  declared: Partial<Record<WorkingNumericField, number>>;
  declaredBasis: Partial<Record<WorkingNumericField, 'product_declared' | 'user_confirmed'>>;
  evidence: ProductEvidenceInput;
  recognitionEvidence: ProductSemanticEvidence;
  trustedRecognition: ProductSemanticClassification;
}

/**
 * Adapter only: Scanner evidence is translated into the exact proposal consumed
 * by the shared PR/PM PRODUCT_PROFILE_V1 authority. It contains no Mapper
 * calculation, no Product Accuracy weight and no Engine formula.
 */
export function customerProductProfileProposal(input: {
  scanResult: unknown;
  recognitionEvidence: ProductSemanticEvidence;
  recognition: ProductSemanticClassification;
  userConfirmedFields?: readonly ProductEvidenceField[];
}): CustomerProductProfileProposal | null {
  const root = objectValue(input.scanResult);
  const identity = objectValue(root.identity);
  const nutrition = objectValue(root.nutrition);
  const declarations = objectValue(root.productionDeclarations);
  const name = text(identity.displayName) ?? text(identity.originalName);
  const brand = text(identity.brand);
  const explicitlyUnbranded = identity.explicitlyUnbranded === true;
  const gtin = input.recognitionEvidence.gtin?.replace(/\D/g, '') ?? null;
  if (!name || (!brand && !explicitlyUnbranded) || !gtin) return null;

  const userConfirmed = new Set(input.userConfirmedFields ?? []);
  const declared: Partial<Record<WorkingNumericField, number>> = {};
  const declaredBasis: CustomerProductProfileProposal['declaredBasis'] = {};
  if (nutrition.basis === 'per_100g') {
    for (const [key, field] of Object.entries(MACRO_FIELDS)) {
      const value = finiteNumber(nutrition[key]);
      if (value === null || (key !== 'energyKcal' && value > 100)) continue;
      declared[field] = value;
      const evidenceField = (key === 'fibre' ? 'fiber' : key) as ProductEvidenceField;
      declaredBasis[field] = userConfirmed.has(evidenceField)
        ? 'user_confirmed'
        : 'product_declared';
    }
  }
  const abv = finiteNumber(declarations.alcoholAbv);
  if (abv !== null && abv <= 100) {
    declared.alcohol_percent = abv;
    declaredBasis.alcohol_percent = userConfirmed.has('technicalParameters')
      ? 'user_confirmed'
      : 'product_declared';
  }

  const fields: ProductEvidenceInput['fields'] = {};
  for (const field of Object.keys(SCAN_FIELD_PATHS) as ProductEvidenceField[]) {
    const source = evidenceSource(root, field, userConfirmed);
    if (source) fields[field] = source;
  }
  // A locally checksum-validated GTIN is exact package evidence even when the
  // barcode decoder did not emit a Vision evidence rectangle.
  fields.barcode = fields.barcode ?? 'label';

  const unresolvedConflicts = Array.isArray(root.conflicts)
    ? root.conflicts.flatMap((value) => {
        const conflict = objectValue(value);
        return conflict.retainedSource === null && typeof conflict.field === 'string'
          ? [conflict.field]
          : [];
      })
    : [];
  const knownMacros: ProfileMatchInput['knownMacros'] = {};
  for (const field of [
    'fat_percent',
    'protein_percent',
    'carbohydrate_percent',
    'total_sugars_percent',
    'fiber_percent',
    'salt_percent',
    'alcohol_percent',
  ] as const) {
    if (typeof declared[field] === 'number') knownMacros[field] = declared[field];
  }

  return {
    matchInput: {
      name,
      variant: input.recognitionEvidence.variant,
      brand,
      category: input.recognitionEvidence.category,
      subcategory: input.recognitionEvidence.subcategory,
      barcode: gtin,
      knownMacros,
      technical: input.recognition.isTechnicalProduct,
      semantic: input.recognition,
    },
    declared,
    declaredBasis,
    evidence: {
      kind: input.recognition.isTechnicalProduct ? 'technical' : 'normal_food',
      fields,
      validatedBarcode: true,
      exactCanonicalMatch: false,
      mapperFamilyMatch: input.recognition.ingredientFamily !== 'unknown',
      materialConflicts: unresolvedConflicts,
    },
    recognitionEvidence: input.recognitionEvidence,
    trustedRecognition: input.recognition,
  };
}
