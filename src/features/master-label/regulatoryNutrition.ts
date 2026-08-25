import type { LabelNutritionPer100g } from '@/data/label/nutritionLabel';
import type { MarketProfileCode } from './marketProfiles';

export interface RegulatoryNutritionInputs {
  servingDescription: Record<string, string>;
  servingQuantityG: number | null;
  servingsPerContainer: number | null;
  transFatGPer100g: number | null;
  cholesterolMgPer100g: number | null;
  sodiumMgPer100g: number | null;
  addedSugarsGPer100g: number | null;
  vitaminDMcgPer100g: number | null;
  calciumMgPer100g: number | null;
  ironMgPer100g: number | null;
  potassiumMgPer100g: number | null;
  canadaReferenceAmountG: number | null;
  canadaFopProductClass: 'general_food' | 'main_dish';
  canadaFopExemption: 'none' | 'exempt' | 'prohibited' | 'unresolved';
  canadaFopExemptionReason: string;
  /** Approved Health Canada ready-to-use artwork identifier. Never synthesized locally. */
  canadaFopAssetId: string | null;
}

export interface CanadaFopAssessment {
  state: 'required' | 'not_required' | 'exempt' | 'prohibited' | 'unresolved';
  thresholdPercentDv: 10 | 15 | 30 | null;
  basisQuantityG: number | null;
  highIn: Array<'saturated_fat' | 'sugars' | 'sodium'>;
  percentDailyValues: {
    saturatedFat: number | null;
    sugars: number | null;
    sodium: number | null;
  };
  reason: string;
}

export interface RegulatoryNutritionReadiness {
  ready: boolean;
  missing: string[];
}

export const DEFAULT_REGULATORY_NUTRITION: RegulatoryNutritionInputs = Object.freeze({
  servingDescription: {},
  servingQuantityG: null,
  servingsPerContainer: null,
  transFatGPer100g: null,
  cholesterolMgPer100g: null,
  sodiumMgPer100g: null,
  addedSugarsGPer100g: null,
  vitaminDMcgPer100g: null,
  calciumMgPer100g: null,
  ironMgPer100g: null,
  potassiumMgPer100g: null,
  canadaReferenceAmountG: null,
  canadaFopProductClass: 'general_food',
  canadaFopExemption: 'unresolved',
  canadaFopExemptionReason: '',
  canadaFopAssetId: null,
});

const finiteNonNegative = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0;

const finitePositive = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value > 0;

const everyLanguage = (value: Record<string, string>, languages: readonly string[]): boolean =>
  languages.every((language) => Boolean(value[language]?.trim()));

export function defaultRegulatoryNutrition(
  nutrition: LabelNutritionPer100g | null,
  languages: readonly string[],
): RegulatoryNutritionInputs {
  return {
    ...DEFAULT_REGULATORY_NUTRITION,
    servingDescription: Object.fromEntries(languages.map((language) => [language, ''])),
    // Sodium is a presentation projection from the Engine's salt authority:
    // EU salt = sodium × 2.5, therefore sodium mg = salt g × 400.
    sodiumMgPer100g: nutrition ? nutrition.salt_g * 400 : null,
  };
}

export function regulatoryNutritionReadiness(
  market: MarketProfileCode,
  nutrition: LabelNutritionPer100g | null,
  inputs: RegulatoryNutritionInputs,
  languages: readonly string[],
): RegulatoryNutritionReadiness {
  const missing: string[] = [];
  if (!nutrition) return { ready: false, missing: ['Brak finalnych danych Nutrition.'] };
  if (nutrition.saturated_fat_g === null) missing.push('Brak tłuszczów nasyconych.');
  if (nutrition.sugars_g === null) missing.push('Brak cukrów.');

  if (market === 'EU' || market === 'UK') {
    return { ready: missing.length === 0, missing };
  }

  if (!finitePositive(inputs.servingQuantityG)) missing.push('Brak wielkości porcji.');
  if (!finitePositive(inputs.servingsPerContainer))
    missing.push('Brak liczby porcji w opakowaniu.');
  if (!everyLanguage(inputs.servingDescription, languages)) {
    missing.push('Brak opisu porcji we wszystkich wymaganych językach.');
  }
  if (!finiteNonNegative(inputs.sodiumMgPer100g)) missing.push('Brak sodu.');

  if (market === 'AU_NZ') return { ready: missing.length === 0, missing };

  if (!finiteNonNegative(inputs.transFatGPer100g)) missing.push('Brak tłuszczów trans.');
  if (!finiteNonNegative(inputs.cholesterolMgPer100g)) missing.push('Brak cholesterolu.');
  if (!finiteNonNegative(inputs.calciumMgPer100g)) missing.push('Brak wapnia.');
  if (!finiteNonNegative(inputs.ironMgPer100g)) missing.push('Brak żelaza.');
  if (!finiteNonNegative(inputs.potassiumMgPer100g)) missing.push('Brak potasu.');

  if (market === 'US') {
    if (!finiteNonNegative(inputs.addedSugarsGPer100g)) missing.push('Brak cukrów dodanych.');
    if (!finiteNonNegative(inputs.vitaminDMcgPer100g)) missing.push('Brak witaminy D.');
  }

  if (market === 'CA') {
    if (!finitePositive(inputs.canadaReferenceAmountG)) {
      missing.push('Brak kanadyjskiej reference amount.');
    }
    if (inputs.canadaFopExemption === 'unresolved') {
      missing.push('Nie rozstrzygnięto kanadyjskiego FOP/exemption.');
    }
    if (
      (inputs.canadaFopExemption === 'exempt' || inputs.canadaFopExemption === 'prohibited') &&
      !inputs.canadaFopExemptionReason.trim()
    ) {
      missing.push('Brak udokumentowanej podstawy wyjątku FOP.');
    }
  }
  return { ready: missing.length === 0, missing };
}

const perQuantity = (per100: number, quantityG: number): number => (per100 * quantityG) / 100;

export function assessCanadaFop(
  nutrition: LabelNutritionPer100g | null,
  inputs: RegulatoryNutritionInputs,
): CanadaFopAssessment {
  if (inputs.canadaFopExemption === 'exempt' || inputs.canadaFopExemption === 'prohibited') {
    return {
      state: inputs.canadaFopExemption,
      thresholdPercentDv: null,
      basisQuantityG: null,
      highIn: [],
      percentDailyValues: { saturatedFat: null, sugars: null, sodium: null },
      reason: inputs.canadaFopExemptionReason || 'Zastosowano udokumentowany wyjątek.',
    };
  }
  const reference = inputs.canadaReferenceAmountG;
  const serving = inputs.servingQuantityG;
  if (
    !nutrition ||
    nutrition.saturated_fat_g === null ||
    nutrition.sugars_g === null ||
    !finiteNonNegative(inputs.sodiumMgPer100g) ||
    !finitePositive(reference) ||
    !finitePositive(serving)
  ) {
    return {
      state: 'unresolved',
      thresholdPercentDv: null,
      basisQuantityG: null,
      highIn: [],
      percentDailyValues: { saturatedFat: null, sugars: null, sodium: null },
      reason: 'Brak danych wymaganych do oceny FOP.',
    };
  }
  const basisQuantityG = Math.max(reference, serving);
  const thresholdPercentDv: 10 | 15 | 30 =
    inputs.canadaFopProductClass === 'main_dish' ? 30 : reference <= 30 ? 10 : 15;
  const percentDailyValues = {
    saturatedFat: (perQuantity(nutrition.saturated_fat_g, basisQuantityG) / 20) * 100,
    sugars: (perQuantity(nutrition.sugars_g, basisQuantityG) / 100) * 100,
    sodium: (perQuantity(inputs.sodiumMgPer100g, basisQuantityG) / 2300) * 100,
  };
  const highIn: CanadaFopAssessment['highIn'] = [];
  if (percentDailyValues.saturatedFat >= thresholdPercentDv) highIn.push('saturated_fat');
  if (percentDailyValues.sugars >= thresholdPercentDv) highIn.push('sugars');
  if (percentDailyValues.sodium >= thresholdPercentDv) highIn.push('sodium');
  return {
    state: highIn.length > 0 ? 'required' : 'not_required',
    thresholdPercentDv,
    basisQuantityG,
    highIn,
    percentDailyValues,
    reason:
      highIn.length > 0
        ? 'Co najmniej jeden składnik odżywczy osiąga próg FOP.'
        : 'Żaden składnik odżywczy nie osiąga progu FOP.',
  };
}

export const percentDailyValue = (amount: number, dailyValue: number): number =>
  Math.round((amount / dailyValue) * 100);

export const amountPerServing = (per100: number | null, servingG: number | null): number | null =>
  finiteNonNegative(per100) && finiteNonNegative(servingG) ? perQuantity(per100, servingG) : null;
