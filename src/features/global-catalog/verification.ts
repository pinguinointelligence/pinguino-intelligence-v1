import type { CatalogCandidateInput, CatalogNutrition, VerificationOutcome } from './contracts';
import { isValidGtin, normalizeEan, normalizeNetQuantity } from './normalization';

export const AUTOMATIC_OCR_MIN_CONFIDENCE = 85;
export const AUTOMATIC_NORMALIZATION_MIN_CONFIDENCE = 90;

function finitePercent(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}

function energyCoherent(nutrition: CatalogNutrition): boolean {
  if (nutrition.energyKcal === null) return false;
  if (nutrition.fat === null || nutrition.carbohydrate === null || nutrition.protein === null) return false;
  const estimated = nutrition.fat * 9 + nutrition.carbohydrate * 4 + nutrition.protein * 4 + (nutrition.fibre ?? 0) * 2;
  const tolerance = Math.max(35, estimated * 0.25);
  return Math.abs(nutrition.energyKcal - estimated) <= tolerance;
}

export function verifyCatalogCandidate(candidate: CatalogCandidateInput): VerificationOutcome {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const warnings: string[] = [];
  const name = candidate.displayName?.trim() || candidate.originalName?.trim();
  if (!name) missingFields.push('product_name');
  if (!candidate.brand?.trim() && !candidate.explicitlyUnbranded) missingFields.push('brand_or_unbranded');
  const quantity = normalizeNetQuantity(candidate.netQuantity, candidate.netUnit);
  if (quantity.value === null) missingFields.push('net_quantity_unit');
  if (!candidate.market?.trim()) missingFields.push('market_of_sale');
  if (candidate.nutrition.basis === 'unknown') missingFields.push('nutrition_basis');
  for (const field of ['energyKcal', 'fat', 'carbohydrate', 'protein', 'salt'] as const) {
    if (candidate.nutrition[field] === null) missingFields.push(`nutrition_${field}`);
  }
  for (const [field, value] of Object.entries(candidate.nutrition)) {
    if (field === 'basis' || value === null) continue;
    if (!finitePercent(value as number) && field !== 'energyKcal') invalidFields.push(`nutrition_${field}`);
  }
  if (candidate.nutrition.energyKcal !== null && (candidate.nutrition.energyKcal < 0 || candidate.nutrition.energyKcal > 1000)) {
    invalidFields.push('nutrition_energyKcal');
  }
  if (candidate.nutrition.sugars !== null && candidate.nutrition.carbohydrate !== null && candidate.nutrition.sugars > candidate.nutrition.carbohydrate + 0.01) {
    invalidFields.push('nutrition_sugars_gt_carbohydrate');
  }
  if (!energyCoherent(candidate.nutrition)) invalidFields.push('nutrition_energy_macro_conflict');
  if (!candidate.evidence.ingredientsText?.trim()) missingFields.push('ingredients_text');
  if (!candidate.evidence.allergensText?.trim()) missingFields.push('allergens_text');
  if (!candidate.evidence.imageRoles.includes('front')) missingFields.push('front_package_image');
  if (!candidate.evidence.imageRoles.some((role) => role === 'nutrition_table' || role === 'back')) missingFields.push('nutrition_image');
  if (candidate.ean && !isValidGtin(candidate.ean)) invalidFields.push('ean_gtin_check_digit');
  if (!candidate.mappedIngredientId) warnings.push('no_engine_mapping');

  const automaticEvidenceStrong =
    candidate.source === 'ocr_automatic' &&
    (candidate.evidence.ocrConfidence ?? 0) >= AUTOMATIC_OCR_MIN_CONFIDENCE &&
    (candidate.evidence.normalizationConfidence ?? 0) >= AUTOMATIC_NORMALIZATION_MIN_CONFIDENCE;
  const complete = missingFields.length === 0 && invalidFields.length === 0;
  if (complete && automaticEvidenceStrong) {
    return { status: 'verified', method: 'automatic', usable: true, missingFields, invalidFields, warnings };
  }

  const manualMinimum =
    Boolean(name) &&
    Boolean(candidate.brand?.trim() || candidate.explicitlyUnbranded) &&
    quantity.value !== null &&
    Boolean(candidate.market?.trim()) &&
    Boolean(candidate.evidence.ingredientsText?.trim()) &&
    Boolean(candidate.evidence.allergensText?.trim()) &&
    candidate.nutrition.basis !== 'unknown' &&
    ['energyKcal', 'fat', 'carbohydrate', 'protein', 'salt'].every((field) => candidate.nutrition[field as keyof CatalogNutrition] !== null) &&
    invalidFields.length === 0;
  if (manualMinimum && (candidate.source === 'manual_completion' || candidate.manuallyCompletedFields.length > 0)) {
    return { status: 'manual_unverified', method: 'manual_unverified', usable: true, missingFields, invalidFields, warnings };
  }
  return { status: 'blocked', method: 'blocked', usable: false, missingFields, invalidFields, warnings };
}

export function catalogEngineEligibility(input: {
  status: 'verified' | 'manual_unverified' | 'blocked';
  mappedIngredientId: string | null;
}): { base: boolean; topping: boolean } {
  if (input.status === 'blocked') return { base: false, topping: false };
  return { base: Boolean(input.mappedIngredientId), topping: true };
}

export function normalizedCandidateEan(candidate: CatalogCandidateInput): string | null {
  return normalizeEan(candidate.ean);
}
