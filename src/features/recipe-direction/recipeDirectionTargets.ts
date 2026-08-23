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
  /** Exact owner preference center. This is an optimization objective only;
   * native Engine bands remain the hard safety authority. */
  targetCenter: number | null;
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

const targetFifth = (
  band: readonly [number, number],
  target: RecipeDirectionTarget,
): TargetRange => {
  const [min, max] = band;
  const fifth = (max - min) / 5;
  const index = target + 2;
  return { min: min + index * fifth, max: min + (index + 1) * fifth };
};

/** Scope guard: profiles outside this Gelato-only change retain their accepted
 * three-zone calibration even though the stored target is now lossless. */
const legacyTargetThird = (
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
  const firmSpanMidpoint = (band[0] + cleanCenter[0]) / 2;
  const softSpanMidpoint = (cleanCenter[1] + band[1]) / 2;
  // The persisted field predates the visible label and is still named
  // `softness`, but its sign follows the customer-facing Twardość control:
  // -2 = more soft (higher NPAC), +2 = more firm (lower NPAC).
  if (target === -2) return { min: softSpanMidpoint, max: band[1] };
  if (target === -1) return { min: cleanCenter[1], max: softSpanMidpoint };
  if (target === 1) return { min: firmSpanMidpoint, max: cleanCenter[0] };
  if (target === 2) return { min: band[0], max: firmSpanMidpoint };
  return { min: cleanCenter[0], max: cleanCenter[1] };
};

export const SORBET_SWEETNESS_TARGET_CENTERS: Readonly<Record<RecipeDirectionTarget, number>> =
  Object.freeze({
    [-2]: 16,
    [-1]: 18,
    0: 20,
    1: 22,
    2: 24,
  });

export const SORBET_HARDNESS_TARGET_CENTERS: Readonly<
  Record<-11 | -12 | -13, Readonly<Record<RecipeDirectionTarget, number>>>
> = Object.freeze({
  [-11]: Object.freeze({ [-2]: 39.5, [-1]: 38.5, 0: 37.5, 1: 36.5, 2: 35.5 }),
  [-12]: Object.freeze({ [-2]: 48.3, [-1]: 46.9, 0: 45.5, 1: 44.1, 2: 42.7 }),
  [-13]: Object.freeze({ [-2]: 54.3, [-1]: 52.9, 0: 51.5, 1: 50.1, 2: 48.7 }),
});

const exactPreferencePoint = (center: number): TargetRange => ({ min: center, max: center });

export function normalizeRecipeDirectionTargets(
  value: Partial<Record<keyof RecipeDirectionTargets, number>> | null | undefined,
): RecipeDirectionTargets {
  const normalize = (candidate: number | undefined): RecipeDirectionTarget => {
    if (candidate == null || !Number.isFinite(candidate)) return 0;
    return Math.max(-2, Math.min(2, Math.round(candidate))) as RecipeDirectionTarget;
  };
  return {
    sweetness: normalize(value?.sweetness),
    softness: normalize(value?.softness),
    creaminess: normalize(value?.creaminess),
    flavor: normalize(value?.flavor),
  };
}

/**
 * The plan depends ONLY on these four values, and the pipeline rebuilds it many
 * times per solve (every violation measure, every candidate, every advisor
 * simulation). Memoising on that exact value fingerprint — not on object
 * identity — is safe for any caller and removes a large amount of repeated work
 * from the Direction and Rescue hot paths.
 */
const DIRECTION_PLAN_CACHE_LIMIT = 512;
const directionPlanCache = new Map<string, RecipeDirectionPlan>();

const directionPlanKey = (input: RecipeInput): string =>
  [
    input.category,
    input.target_temperature_c,
    input.goals?.direction_targets_active === true ? 1 : 0,
    input.goals?.direction_targets?.sweetness ?? 0,
    input.goals?.direction_targets?.softness ?? 0,
    input.goals?.direction_targets?.creaminess ?? 0,
    input.goals?.direction_targets?.flavor ?? 0,
  ].join('|');

export function buildRecipeDirectionPlan(input: RecipeInput): RecipeDirectionPlan {
  const cacheKey = directionPlanKey(input);
  const cached = directionPlanCache.get(cacheKey);
  if (cached) return cached;
  const plan = computeRecipeDirectionPlan(input);
  if (directionPlanCache.size >= DIRECTION_PLAN_CACHE_LIMIT) directionPlanCache.clear();
  directionPlanCache.set(cacheKey, plan);
  return plan;
}

function computeRecipeDirectionPlan(input: RecipeInput): RecipeDirectionPlan {
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

  // Operational means the COMPLETE -2/-1/0/+1/+2 matrix has produced a native-safe,
  // applicable Preview (or an already-reached state) for this exact profile ×
  // temperature. A POD band alone is not proof that the current formulation
  // route can honor it.
  const sweetnessOperational =
    profile === 'vegan_gelato' ||
    profile === 'standard_gelato' ||
    // PROTEIN SWEETNESS — qualified against this gate's own criterion by the
    // complete -2..+2 x -2..+2 x 3 temperatures x 2 strategies matrix (150
    // states: all natively hard-safe, all claim-qualified, all applied, zero
    // executable 0 g rows). POD is composition-derived from each ingredient's
    // own stored pod_value, and the target subdivides the Protein profile's OWN
    // approved POD band -- no borrowed dairy curve, no invented reference.
    profile === 'protein_gelato' ||
    (profile === 'sorbet' &&
      (input.target_temperature_c === -11 ||
        input.target_temperature_c === -12 ||
        input.target_temperature_c === -13)) ||
    (profile === 'chocolate_gelato' &&
      (input.target_temperature_c === -11 || input.target_temperature_c === -12));

  // PROTEIN HARDNESS stays BLOCKED, and deliberately so.
  //
  // Hardness is targeted through NPAC, i.e. freezing-point depression. Borrowing
  // the Gelato NPAC→hardness calibration for Protein is not defensible: at an
  // otherwise constant formulation, instrumental hardness rises 13.60 N → 47.66 N
  // as protein goes 4 % → 10 % (Applied Food Research 2(1) 100029, 2022,
  // DOI 10.1016/j.afres.2021.100029, Table 1 / Fig. 2). The same NPAC therefore
  // does NOT mean the same hardness in a high-protein mix, and no published
  // controlled series reports NPAC/PAC alongside hardness for high-protein
  // frozen desserts, so the protein-specific curve cannot be derived from the
  // literature that exists. Unblocking it would require an owner calibration
  // decision, not a code change — see reports/PROTEIN_FINAL_CLOSEOUT_2026-08-23.md.
  const softnessOperational =
    profile === 'vegan_gelato' ||
    profile === 'standard_gelato' ||
    (profile === 'sorbet' &&
      (input.target_temperature_c === -11 ||
        input.target_temperature_c === -12 ||
        input.target_temperature_c === -13));

  if (regulator?.pod && sweetnessOperational) {
    const targetCenter =
      profile === 'sorbet' ? SORBET_SWEETNESS_TARGET_CENTERS[targets.sweetness] : null;
    const targetBand =
      targetCenter !== null
        ? exactPreferencePoint(targetCenter)
        : // Vegan (RC-1) and Protein both use the SAME five-region derivation as
          // standard Gelato, each applied to its OWN approved POD band.
          // `targetFifth` splits an already-approved band into five monotonic
          // fifths, so nothing is invented and no dairy reference is borrowed.
          // The legacy three-zone branch collapses −2/−1 (and +1/+2) onto one
          // recipe, which would make a five-position selector lie.
          profile === 'standard_gelato' ||
            profile === 'vegan_gelato' ||
            profile === 'protein_gelato'
          ? targetFifth(regulator.pod.band, targets.sweetness)
          : legacyTargetThird(regulator.pod.band, targets.sweetness);
    if (enabled) bands.pod = targetBand;
    axes.push({
      axis: 'sweetness',
      target: targets.sweetness,
      status: 'working',
      metric: 'pod',
      targetBand,
      targetCenter,
      reason: null,
    });
  } else if (!sweetnessOperational && regulator?.pod) {
    axes.push({
      axis: 'sweetness',
      target: targets.sweetness,
      status: 'blocked_runtime',
      metric: 'pod',
      targetBand: null,
      targetCenter: null,
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
      targetCenter: null,
      reason: 'Brak zatwierdzonego zakresu POD dla tego profilu i temperatury.',
    });
  }

  if (regulator?.npac?.cleanCenter && softnessOperational) {
    const sorbetTemperature = input.target_temperature_c as -11 | -12 | -13;
    const targetCenter =
      profile === 'sorbet'
        ? (SORBET_HARDNESS_TARGET_CENTERS[sorbetTemperature]?.[targets.softness] ?? null)
        : null;
    const targetBand =
      targetCenter !== null
        ? exactPreferencePoint(targetCenter)
        : softnessBand(regulator.npac.band, regulator.npac.cleanCenter, targets.softness);
    if (enabled) bands.npac = targetBand;
    axes.push({
      axis: 'softness',
      target: targets.softness,
      status: 'working',
      metric: 'npac',
      targetBand,
      targetCenter,
      reason: null,
    });
  } else if (!softnessOperational && regulator?.npac?.cleanCenter) {
    axes.push({
      axis: 'softness',
      target: targets.softness,
      status: 'blocked_science',
      metric: 'npac',
      targetBand: null,
      targetCenter: null,
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
      targetCenter: null,
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
      targetCenter: null,
      reason:
        'Brak zatwierdzonego modelu sensorycznej kremowości; sam tłuszcz nie jest kremowością.',
    },
    {
      axis: 'flavor',
      target: targets.flavor,
      status: 'blocked_data',
      metric: null,
      targetBand: null,
      targetCenter: null,
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

/**
 * `precomputed` lets a caller that already holds `calculateRecipe(input)` skip a
 * second full recipe computation. Hot path: the Rescue advisor measures every
 * simulated candidate, and since Rescue was decoupled from Direction it runs for
 * profiles that previously returned early. Purely an optimisation — the returned
 * violations are identical.
 */
export function recipeDirectionViolations(input: RecipeInput, precomputed?: RecipeResult) {
  const plan = buildRecipeDirectionPlan(input);
  return detectViolations(
    resultWithRecipeDirectionTargets(precomputed ?? calculateRecipe(input), plan),
  );
}

/** Exact five-step routes use lexicographic distance-to-target ranking in the
 * optimizer. This deliberately excludes legacy three-zone profiles. */
export function hasActiveExactDirectionObjective(input: RecipeInput): boolean {
  if (input.goals?.direction_targets_active !== true) return false;
  const plan = buildRecipeDirectionPlan(input);
  return plan.axes.some(
    (axis) =>
      axis.status === 'working' &&
      axis.targetBand !== null &&
      // A profile qualifies for the EXACT five-step objective when its axis
      // carries either an exact preference point (Sorbet's target centres) or a
      // genuine five-way band subdivision. Protein subdivides its own approved
      // POD band into fifths exactly as Standard Gelato does.
      (plan.profile === 'standard_gelato' ||
        plan.profile === 'protein_gelato' ||
        axis.targetCenter !== null),
  );
}
