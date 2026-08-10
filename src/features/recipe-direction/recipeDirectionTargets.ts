import {
  calculateRecipe,
  detectViolations,
  type ProductCategory,
  type RecipeDirectionTarget,
  type RecipeDirectionTargets,
  type RecipeInput,
  type RecipeResult,
  type TargetMetric,
  type TargetRange,
} from '@/engine';
import { getTemperatureRegulatorSettingsOrNull, type ProductProfile } from '@/spine';

export const DEFAULT_RECIPE_DIRECTION_TARGETS: RecipeDirectionTargets = Object.freeze({
  sweetness: 0,
  softness: 0,
  creaminess: 0,
  flavor: 0,
});

export type DirectionAxisStatus =
  | 'working'
  | 'blocked_science'
  | 'blocked_data'
  | 'blocked_runtime';

export interface DirectionAxisPlan {
  axis: keyof RecipeDirectionTargets;
  target: RecipeDirectionTarget;
  status: DirectionAxisStatus;
  metric: TargetMetric | null;
  targetBand: TargetRange | null;
  reason: string | null;
}

export interface RecipeDirectionPlan {
  profile: ProductProfile | null;
  servingTemperatureC: number;
  bands: Partial<Record<TargetMetric, TargetRange>>;
  axes: DirectionAxisPlan[];
}

const profileForCategory = (category: ProductCategory): ProductProfile | null => {
  switch (category) {
    case 'milk_gelato':
    case 'fruit_gelato':
    case 'nut_gelato':
    case 'alcohol_gelato':
    case 'custom':
      return 'standard_gelato';
    case 'chocolate_gelato':
      return 'chocolate_gelato';
    case 'sorbet':
      return 'sorbet';
    case 'vegan_gelato':
      return 'vegan_gelato';
    case 'protein_gelato':
      return 'protein_gelato';
  }
};

const targetThird = (
  band: readonly [number, number],
  target: RecipeDirectionTarget,
): TargetRange => {
  const [min, max] = band;
  const third = (max - min) / 3;
  if (target < 0) return { min, max: min + third };
  if (target > 0) return { min: max - third, max };
  return { min: min + third, max: max - third };
};

const softnessBand = (
  band: readonly [number, number],
  cleanCenter: readonly [number, number],
  target: RecipeDirectionTarget,
): TargetRange => {
  if (target < 0) return { min: band[0], max: cleanCenter[0] };
  if (target > 0) return { min: cleanCenter[1], max: band[1] };
  return { min: cleanCenter[0], max: cleanCenter[1] };
};

export function normalizeRecipeDirectionTargets(
  value: Partial<Record<keyof RecipeDirectionTargets, number>> | null | undefined,
): RecipeDirectionTargets {
  const normalize = (candidate: number | undefined): RecipeDirectionTarget =>
    candidate == null || !Number.isFinite(candidate)
      ? 0
      : candidate < 0
        ? -1
        : candidate > 0
          ? 1
          : 0;
  return {
    sweetness: normalize(value?.sweetness),
    softness: normalize(value?.softness),
    creaminess: normalize(value?.creaminess),
    flavor: normalize(value?.flavor),
  };
}

export function buildRecipeDirectionPlan(input: RecipeInput): RecipeDirectionPlan {
  const targets = normalizeRecipeDirectionTargets(input.goals?.direction_targets);
  // Legacy/direct Engine inputs had no direction contract. Keep their solver
  // behavior byte-compatible; the canonical Pro draft always serializes this
  // object, including the neutral (0) clean-middle intent.
  const enabled = input.goals?.direction_targets_active === true;
  const profile = profileForCategory(input.category);
  const regulator = profile
    ? getTemperatureRegulatorSettingsOrNull(profile, input.target_temperature_c)
    : null;

  const axes: DirectionAxisPlan[] = [];
  const bands: Partial<Record<TargetMetric, TargetRange>> = {};

  // Operational means the COMPLETE -1/0/+1 matrix has produced a native-safe,
  // applicable Preview (or an already-reached state) for this exact profile ×
  // temperature. A POD band alone is not proof that the current formulation
  // route can honor it.
  const sweetnessOperational =
    profile === 'standard_gelato' ||
    (profile === 'sorbet' && input.target_temperature_c === -11) ||
    (profile === 'chocolate_gelato' &&
      (input.target_temperature_c === -11 || input.target_temperature_c === -12));
  const softnessOperational = profile === 'standard_gelato';

  if (regulator?.pod && sweetnessOperational) {
    const targetBand = targetThird(regulator.pod.band, targets.sweetness);
    if (enabled) bands.pod = targetBand;
    axes.push({
      axis: 'sweetness',
      target: targets.sweetness,
      status: 'working',
      metric: 'pod',
      targetBand,
      reason: null,
    });
  } else if (!sweetnessOperational && regulator?.pod) {
    axes.push({
      axis: 'sweetness',
      target: targets.sweetness,
      status: 'blocked_runtime',
      metric: 'pod',
      targetBand: null,
      reason:
        'Pełna ścieżka −1/0/+1 dla tego profilu i temperatury nie ma jeszcze zweryfikowanego, bezpiecznego Preview/Apply.',
    });
  } else {
    axes.push({
      axis: 'sweetness',
      target: targets.sweetness,
      status: 'blocked_data',
      metric: 'pod',
      targetBand: null,
      reason: 'Brak zatwierdzonego zakresu POD dla tego profilu i temperatury.',
    });
  }

  if (regulator?.npac?.cleanCenter && softnessOperational) {
    const targetBand = softnessBand(
      regulator.npac.band,
      regulator.npac.cleanCenter,
      targets.softness,
    );
    if (enabled) bands.npac = targetBand;
    axes.push({
      axis: 'softness',
      target: targets.softness,
      status: 'working',
      metric: 'npac',
      targetBand,
      reason: null,
    });
  } else if (!softnessOperational && regulator?.npac?.cleanCenter) {
    axes.push({
      axis: 'softness',
      target: targets.softness,
      status: 'blocked_science',
      metric: 'npac',
      targetBand: null,
      reason:
        'Brak zweryfikowanej, profilowej kalibracji miękkości dla tej kategorii; PI nie używa zastępczej krzywej mlecznej.',
    });
  } else {
    axes.push({
      axis: 'softness',
      target: targets.softness,
      status: 'blocked_data',
      metric: 'npac',
      targetBand: null,
      reason: 'Brak zatwierdzonego czystego centrum NPAC dla tego profilu i temperatury.',
    });
  }

  axes.push(
    {
      axis: 'creaminess',
      target: targets.creaminess,
      status: 'blocked_science',
      metric: null,
      targetBand: null,
      reason:
        'Brak zatwierdzonego modelu sensorycznej kremowości; sam tłuszcz nie jest kremowością.',
    },
    {
      axis: 'flavor',
      target: targets.flavor,
      status: 'blocked_data',
      metric: null,
      targetBand: null,
      reason: 'Brak zweryfikowanych profili mocy smaku dla poszczególnych klas składników.',
    },
  );

  return { profile, servingTemperatureC: input.target_temperature_c, bands, axes };
}

/** Immutable preference view. Engine values and native global bands stay untouched. */
export function resultWithRecipeDirectionTargets(
  result: RecipeResult,
  plan: RecipeDirectionPlan,
): RecipeResult {
  return {
    ...result,
    indicators: result.indicators.map((indicator) => {
      const band = plan.bands[indicator.key as TargetMetric];
      return band ? { ...indicator, band: { ...band } } : indicator;
    }),
  };
}

export function recipeDirectionViolations(input: RecipeInput) {
  const plan = buildRecipeDirectionPlan(input);
  return detectViolations(resultWithRecipeDirectionTargets(calculateRecipe(input), plan));
}
