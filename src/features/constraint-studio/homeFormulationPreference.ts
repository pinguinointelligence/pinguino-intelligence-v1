import { calculateRecipe, type RecipeInput, type RecipeResult } from '@/engine';
import { HOME_FORMULATION_MODULES, type HomeFormulationModuleId } from '@/features/machine-catalog';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { getTemperatureRegulatorSettingsOrNull } from '@/spine';

export interface HomeFormulationPreferenceMeasure {
  readonly moduleId: HomeFormulationModuleId;
  readonly applicable: boolean;
  readonly actualNpac: number | null;
  readonly targetNpac: number | null;
  /** Band-normalized distance; null means intentionally neutral/not applicable. */
  readonly distance: number | null;
  readonly nativeBand: readonly [number, number] | null;
  readonly cleanCenter: readonly [number, number] | null;
}

/**
 * Score one candidate against the Home machine's brand-neutral preference.
 * It reuses the approved regulator band and clean center; it neither supplies
 * an override band nor mutates the RecipeInput/Engine result.
 */
export function evaluateHomeFormulationPreference(
  input: RecipeInput,
  moduleId: HomeFormulationModuleId,
  calculatedResult?: RecipeResult,
): HomeFormulationPreferenceMeasure {
  const empty = {
    moduleId,
    applicable: false,
    actualNpac: null,
    targetNpac: null,
    distance: null,
    nativeBand: null,
    cleanCenter: null,
  } as const;
  if (HOME_FORMULATION_MODULES[moduleId].preference.pac === 'neutral') return empty;
  const directionPlan = buildRecipeDirectionPlan(input);
  const profile = directionPlan.profile;
  const softnessAxis = directionPlan.axes.find((axis) => axis.axis === 'softness');
  if (
    profile === null ||
    softnessAxis?.status !== 'working' ||
    softnessAxis.metric !== 'npac' ||
    (input.target_temperature_c !== -11 &&
      input.target_temperature_c !== -12 &&
      input.target_temperature_c !== -13)
  ) {
    return empty;
  }
  const regulator = getTemperatureRegulatorSettingsOrNull(profile, input.target_temperature_c);
  if (!regulator?.npac?.cleanCenter) return empty;
  const nativeBand = regulator.npac.band;
  const cleanCenter = regulator.npac.cleanCenter;
  const targetNpac =
    moduleId === 'FROZEN_BOWL'
      ? (nativeBand[0] + cleanCenter[0]) / 2
      : moduleId === 'COMPRESSOR'
        ? cleanCenter[0]
        : (cleanCenter[1] + nativeBand[1]) / 2;
  const actualNpac = (calculatedResult ?? calculateRecipe(input)).npac_points;
  if (actualNpac === null || !Number.isFinite(actualNpac)) return empty;
  const span = Math.max(Number.EPSILON, nativeBand[1] - nativeBand[0]);
  return {
    moduleId,
    applicable: true,
    actualNpac,
    targetNpac,
    distance: Math.abs(actualNpac - targetNpac) / span,
    nativeBand,
    cleanCenter,
  };
}
