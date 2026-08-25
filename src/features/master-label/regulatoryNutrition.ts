import type { LabelNutritionPer100g } from '@/data/label/nutritionLabel';
import type { MarketProfileCode } from './marketProfiles';

export type UsNutritionFormatFamily = 'auto' | 'standard' | 'tabular' | 'linear' | 'dual_column';
export type CanadaNutritionFormatFamily = 'auto' | 'standard' | 'narrow' | 'bilingual_standard';
export type CanadaProductForm = 'tub' | 'cake_sandwich_cone' | 'single_portion' | 'unresolved';

export interface RegulatoryNutritionInputs {
  energyKjPer100g?: number | null;
  energyAuthority?: 'unresolved' | 'market_factors' | 'laboratory';
  servingDescription: Record<string, string>;
  servingQuantityG: number | null;
  servingVolumeMl?: number | null;
  servingsPerContainer: number | null;
  productDensityGPerMl?: number | null;
  transFatGPer100g: number | null;
  cholesterolMgPer100g: number | null;
  sodiumMgPer100g: number | null;
  addedSugarsGPer100g: number | null;
  vitaminDMcgPer100g: number | null;
  calciumMgPer100g: number | null;
  ironMgPer100g: number | null;
  potassiumMgPer100g: number | null;
  usRaccVolumeMl?: number | null;
  usFormatFamily?: UsNutritionFormatFamily;
  canadaProductForm?: CanadaProductForm;
  canadaReferenceAmountMl?: number | null;
  /** Legacy mass projection retained only for old immutable snapshots. */
  canadaReferenceAmountG: number | null;
  canadaFormatFamily?: CanadaNutritionFormatFamily;
  canadaFopProductClass: 'general_food' | 'main_dish';
  canadaFopExemption: 'none' | 'exempt' | 'prohibited' | 'unresolved';
  canadaFopExemptionReason: string;
  /** Approved Health Canada ready-to-use artwork identifier. Never synthesized locally. */
  canadaFopAssetId: string | null;
  /** Version from the official Health Canada asset package manifest. */
  canadaFopAssetPackageVersion?: string | null;
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

export interface UsServingPlan {
  state: 'single_serving' | 'multi_serving' | 'dual_column' | 'unresolved';
  ratioToRacc: number | null;
  referenceAmountG: number | null;
  requiredServingG: number | null;
  expectedServingsPerContainer: number | null;
  requiredFormat: 'standard' | 'dual_column' | 'unresolved';
}

export const US_ICE_CREAM_RACC_ML = 160;

export const CANADA_REFERENCE_AMOUNTS_ML: Readonly<
  Record<Exclude<CanadaProductForm, 'unresolved'>, number>
> = Object.freeze({
  tub: 188,
  cake_sandwich_cone: 125,
  single_portion: 75,
});

export const DEFAULT_REGULATORY_NUTRITION: RegulatoryNutritionInputs = Object.freeze({
  energyKjPer100g: null,
  energyAuthority: 'unresolved',
  servingDescription: {},
  servingQuantityG: null,
  servingVolumeMl: null,
  servingsPerContainer: null,
  productDensityGPerMl: null,
  transFatGPer100g: null,
  cholesterolMgPer100g: null,
  sodiumMgPer100g: null,
  addedSugarsGPer100g: null,
  vitaminDMcgPer100g: null,
  calciumMgPer100g: null,
  ironMgPer100g: null,
  potassiumMgPer100g: null,
  usRaccVolumeMl: US_ICE_CREAM_RACC_ML,
  usFormatFamily: 'auto',
  canadaProductForm: 'unresolved',
  canadaReferenceAmountMl: null,
  canadaReferenceAmountG: null,
  canadaFormatFamily: 'auto',
  canadaFopProductClass: 'general_food',
  canadaFopExemption: 'unresolved',
  canadaFopExemptionReason: '',
  canadaFopAssetId: null,
  canadaFopAssetPackageVersion: null,
});

const finiteNonNegative = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(value) && value >= 0;

const finitePositive = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(value) && value > 0;

const everyLanguage = (value: Record<string, string>, languages: readonly string[]): boolean =>
  languages.every((language) => Boolean(value[language]?.trim()));

export function defaultRegulatoryNutrition(
  nutrition: LabelNutritionPer100g | null,
  languages: readonly string[],
): RegulatoryNutritionInputs {
  return {
    ...DEFAULT_REGULATORY_NUTRITION,
    servingDescription: Object.fromEntries(languages.map((language) => [language, ''])),
    // Presentation projection only: EU salt = sodium × 2.5.
    sodiumMgPer100g: nutrition ? nutrition.salt_g * 400 : null,
  };
}

export function canadaReferenceAmountMl(inputs: RegulatoryNutritionInputs): number | null {
  if (finitePositive(inputs.canadaReferenceAmountMl)) return inputs.canadaReferenceAmountMl;
  const form = inputs.canadaProductForm ?? 'unresolved';
  return form === 'unresolved' ? null : CANADA_REFERENCE_AMOUNTS_ML[form];
}

export function canadaReferenceAmountG(inputs: RegulatoryNutritionInputs): number | null {
  if (finitePositive(inputs.canadaReferenceAmountG)) return inputs.canadaReferenceAmountG;
  const volume = canadaReferenceAmountMl(inputs);
  return finitePositive(volume) && finitePositive(inputs.productDensityGPerMl)
    ? volume * inputs.productDensityGPerMl
    : null;
}

export function usReferenceAmountG(inputs: RegulatoryNutritionInputs): number | null {
  const volume = finitePositive(inputs.usRaccVolumeMl)
    ? inputs.usRaccVolumeMl
    : US_ICE_CREAM_RACC_ML;
  return finitePositive(inputs.productDensityGPerMl) ? volume * inputs.productDensityGPerMl : null;
}

export function resolveUsServingPlan(
  inputs: RegulatoryNutritionInputs,
  packageNetWeightG: number | null,
): UsServingPlan {
  const referenceAmountG = usReferenceAmountG(inputs);
  if (!finitePositive(referenceAmountG) || !finitePositive(packageNetWeightG)) {
    return {
      state: 'unresolved',
      ratioToRacc: null,
      referenceAmountG,
      requiredServingG: null,
      expectedServingsPerContainer: null,
      requiredFormat: 'unresolved',
    };
  }
  const ratioToRacc = packageNetWeightG / referenceAmountG;
  if (ratioToRacc < 2) {
    return {
      state: 'single_serving',
      ratioToRacc,
      referenceAmountG,
      requiredServingG: packageNetWeightG,
      expectedServingsPerContainer: 1,
      requiredFormat: 'standard',
    };
  }
  if (ratioToRacc <= 3) {
    return {
      state: 'dual_column',
      ratioToRacc,
      referenceAmountG,
      requiredServingG: referenceAmountG,
      expectedServingsPerContainer: ratioToRacc,
      requiredFormat: 'dual_column',
    };
  }
  return {
    state: 'multi_serving',
    ratioToRacc,
    referenceAmountG,
    requiredServingG: referenceAmountG,
    expectedServingsPerContainer: ratioToRacc,
    requiredFormat: 'standard',
  };
}

export function usServingAndFormatIssues(
  inputs: RegulatoryNutritionInputs,
  packageNetWeightG: number | null,
  availableDisplaySurfaceCm2: number | null | undefined,
): string[] {
  const plan = resolveUsServingPlan(inputs, packageNetWeightG);
  if (plan.state === 'unresolved' || !plan.requiredServingG || !plan.expectedServingsPerContainer) {
    return ['Nie można rozstrzygnąć FDA serving/RACC dla wybranego opakowania.'];
  }
  const issues: string[] = [];
  const tolerance = Math.max(1, plan.requiredServingG * 0.01);
  if (
    !finitePositive(inputs.servingQuantityG) ||
    Math.abs(inputs.servingQuantityG - plan.requiredServingG) > tolerance
  ) {
    issues.push(
      `FDA serving size musi wynosić ${Math.round(plan.requiredServingG)} g dla tego opakowania i RACC.`,
    );
  }
  if (
    !finitePositive(inputs.servingsPerContainer) ||
    Math.abs(inputs.servingsPerContainer - plan.expectedServingsPerContainer) > 0.11
  ) {
    issues.push(
      `Liczba porcji powinna wynosić ${plan.expectedServingsPerContainer.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}.`,
    );
  }
  const selected = inputs.usFormatFamily ?? 'auto';
  if (selected === 'standard' && plan.requiredFormat === 'dual_column') {
    issues.push('Opakowanie 200–300% RACC wymaga FDA dual-column per serving / per container.');
  }
  if (selected === 'dual_column' && plan.requiredFormat !== 'dual_column') {
    issues.push('Dual-column jest właściwy wyłącznie dla opakowania 200–300% RACC.');
  }
  if (selected === 'tabular' || selected === 'linear') {
    if (!finitePositive(availableDisplaySurfaceCm2) || availableDisplaySurfaceCm2 > 258.064) {
      issues.push('FDA tabular/linear wymaga potwierdzonej powierzchni etykietowania ≤ 40 in².');
    }
    if (
      selected === 'linear' &&
      finitePositive(availableDisplaySurfaceCm2) &&
      availableDisplaySurfaceCm2 >= 77.4192
    ) {
      issues.push(
        'FDA linear jest dozwolony dopiero, gdy kwalifikujące opakowanie nie mieści formatu tabularnego.',
      );
    }
  }
  return issues;
}

/** Bilingual standard Figure 3.4(B), measured software footprint: 29.7 cm². */
export function canadaNftFormatIssues(
  inputs: RegulatoryNutritionInputs,
  availableDisplaySurfaceCm2: number | null | undefined,
): string[] {
  const issues: string[] = [];
  if (!finitePositive(availableDisplaySurfaceCm2)) {
    issues.push('Brak potwierdzonej kanadyjskiej available display surface (ADS).');
  } else if (29.7 > availableDisplaySurfaceCm2 * 0.15 + 0.001) {
    issues.push(
      'Bilingual NFT Figure 3.4(B) zajmuje więcej niż 15% ADS; wybierz większe opakowanie albo zatwierdzoną ścieżkę małego opakowania.',
    );
  }
  const selected = inputs.canadaFormatFamily ?? 'auto';
  if (selected !== 'auto' && selected !== 'bilingual_standard') {
    issues.push(
      'Ten renderer obsługuje bilingual standard Figure 3.4(B), nie hybrydę unilingual/narrow.',
    );
  }
  return issues;
}

export function canadaServingIssues(inputs: RegulatoryNutritionInputs): string[] {
  const referenceVolume = canadaReferenceAmountMl(inputs);
  if (!finitePositive(referenceVolume)) {
    return ['Wybierz kanadyjską kategorię reference amount dla formy produktu.'];
  }
  const issues: string[] = [];
  if (
    !finitePositive(inputs.servingVolumeMl) ||
    Math.abs(inputs.servingVolumeMl - referenceVolume) > 0.1
  ) {
    issues.push(`Canadian serving size musi używać reference amount ${referenceVolume} mL.`);
  }
  if (!finitePositive(inputs.productDensityGPerMl)) {
    issues.push(
      'Brak potwierdzonej gęstości do przeliczenia kanadyjskiej porcji mL na masę odżywczą.',
    );
  } else {
    const expectedMass = referenceVolume * inputs.productDensityGPerMl;
    if (
      !finitePositive(inputs.servingQuantityG) ||
      Math.abs(inputs.servingQuantityG - expectedMass) > Math.max(0.1, expectedMass * 0.001)
    ) {
      issues.push(
        `Masa obliczeniowa kanadyjskiej porcji musi wynosić ${expectedMass.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} g z potwierdzonej gęstości.`,
      );
    }
  }
  return issues;
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
  if (
    (market === 'EU' || market === 'UK' || market === 'AU_NZ') &&
    (!finiteNonNegative(inputs.energyKjPer100g) || inputs.energyAuthority === 'unresolved')
  ) {
    missing.push('Brak energii kJ obliczonej z właściwych współczynników rynku lub laboratorium.');
  }

  if (market === 'EU' || market === 'UK' || market === 'WORLD') {
    return { ready: missing.length === 0, missing };
  }

  if (!finitePositive(inputs.servingQuantityG)) missing.push('Brak wielkości porcji w gramach.');
  if (market !== 'CA' && !finitePositive(inputs.servingsPerContainer)) {
    missing.push('Brak liczby porcji w opakowaniu.');
  }
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
    if (!finitePositive(inputs.productDensityGPerMl)) {
      missing.push('Brak potwierdzonej gęstości produktu do przeliczenia FDA RACC 2/3 cup.');
    }
    if (!finiteNonNegative(inputs.addedSugarsGPer100g)) missing.push('Brak cukrów dodanych.');
    if (!finiteNonNegative(inputs.vitaminDMcgPer100g)) missing.push('Brak witaminy D.');
  }

  if (market === 'CA') {
    missing.push(...canadaServingIssues(inputs));
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
  const referenceMass = canadaReferenceAmountG(inputs);
  const referenceVolume = canadaReferenceAmountMl(inputs);
  const serving = inputs.servingQuantityG;
  if (
    !nutrition ||
    nutrition.saturated_fat_g === null ||
    nutrition.sugars_g === null ||
    !finiteNonNegative(inputs.sodiumMgPer100g) ||
    !finitePositive(referenceMass) ||
    !finitePositive(referenceVolume) ||
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
  const basisQuantityG = Math.max(referenceMass, serving);
  const thresholdPercentDv: 10 | 15 | 30 =
    inputs.canadaFopProductClass === 'main_dish' ? 30 : referenceVolume <= 30 ? 10 : 15;
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

/** 21 CFR 101.9(c)(8): vitamins/minerals use 2/5/10 %DV increments. */
export function roundUsVitaminMineralPercentDv(amount: number, dailyValue: number): number {
  const percent = (amount / dailyValue) * 100;
  if (percent < 1) return 0;
  if (percent < 2) return 2;
  if (percent <= 10) return roundTo(percent, 2);
  if (percent <= 50) return roundTo(percent, 5);
  return roundTo(percent, 10);
}

export const amountPerServing = (per100: number | null, servingG: number | null): number | null =>
  finiteNonNegative(per100) && finiteNonNegative(servingG) ? perQuantity(per100, servingG) : null;

const roundTo = (value: number, step: number): number => {
  const rounded = Math.round((value + Number.EPSILON) / step) * step;
  const stable = Number(rounded.toFixed(6));
  return Object.is(stable, -0) ? 0 : stable;
};

/** Current 21 CFR 101.9 label rounding buckets. */
export function roundUsCalories(value: number): number {
  if (value < 5) return 0;
  return roundTo(value, value <= 50 ? 5 : 10);
}

export function roundUsFatGrams(value: number): number {
  if (value < 0.5) return 0;
  return roundTo(value, value < 5 ? 0.5 : 1);
}

export function roundUsCholesterolMg(value: number): number | '<5' {
  if (value < 2) return 0;
  if (value < 5) return '<5';
  return roundTo(value, 5);
}

export function roundUsSodiumMg(value: number): number {
  if (value < 5) return 0;
  return roundTo(value, value <= 140 ? 5 : 10);
}

export function roundUsWholeGram(value: number): number | '<1' {
  if (value < 0.5) return 0;
  if (value < 1) return '<1';
  return roundTo(value, 1);
}

export const roundUsVitaminDMcg = (value: number): number => roundTo(value, 0.1);
export const roundUsCalciumMg = (value: number): number => roundTo(value, 10);
export const roundUsIronMg = (value: number): number => roundTo(value, 0.1);
export const roundUsPotassiumMg = (value: number): number => roundTo(value, 10);

/** Health Canada rounding categories used by the NFT renderer. */
export function roundCanadaCalories(value: number): number {
  // Zero is reserved for products that also meet the regulatory "free of
  // energy" condition. Gellatti does not infer that claim.
  if (value < 5) return roundTo(value, 1);
  if (value <= 50) return roundTo(value, 5);
  return roundTo(value, 10);
}

export function roundCanadaFatGrams(value: number): number {
  if (value < 0.5) return roundTo(value, 0.1);
  if (value <= 5) return roundTo(value, 0.5);
  return roundTo(value, 1);
}

export function roundCanadaMg(value: number): number {
  // Sodium: without an independently confirmed "free of sodium/salt" claim,
  // values below 5 mg are declared to the nearest 1 mg.
  if (value < 5) return roundTo(value, 1);
  if (value <= 140) return roundTo(value, 5);
  return roundTo(value, 10);
}

export function roundCanadaCholesterolMg(value: number): number {
  // The zero declaration below 2 mg is claim-dependent. In its absence the
  // ordinary Canadian 5 mg increment is the fail-safe declaration.
  return roundTo(value, 5);
}

export function roundCanadaPotassiumCalciumMg(value: number): number {
  if (value < 5) return 0;
  if (value < 50) return roundTo(value, 10);
  if (value < 250) return roundTo(value, 25);
  return roundTo(value, 50);
}

export function roundCanadaIronMg(value: number): number {
  if (value < 0.05) return 0;
  if (value < 0.5) return roundTo(value, 0.1);
  if (value < 2.5) return roundTo(value, 0.25);
  return roundTo(value, 0.5);
}

export function roundCanadaProteinGrams(value: number): number {
  return value < 0.5 ? roundTo(value, 0.1) : roundTo(value, 1);
}

export function resolveUsFormatFamily(
  inputs: RegulatoryNutritionInputs,
  packageNetWeightG: number | null,
): Exclude<UsNutritionFormatFamily, 'auto'> | 'unresolved' {
  if (inputs.usFormatFamily && inputs.usFormatFamily !== 'auto') return inputs.usFormatFamily;
  return resolveUsServingPlan(inputs, packageNetWeightG).requiredFormat;
}

export function roundUsServingsPerContainer(value: number): string {
  if (!finitePositive(value)) return '—';
  if (value < 2) return '1';
  if (value <= 5) return roundTo(value, 0.5).toFixed(1).replace(/\.0$/, '');
  return String(roundTo(value, 1));
}
