import type { RecipeInput } from '@/engine';
import { copy } from '@/copy/en';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import type { RecipeState } from '@/stores/recipeStore';
import type {
  DirectionIntents,
  DirectionTargets,
  ProfileSettingsSnapshot,
} from './recipeProfileStore';
import { normalizeFormulationStrategy } from '@/features/formulation-strategy/strategy';

const PROFILE_METADATA_KEY = 'pinguino_profile_v1' as const;

type PersistedRecipeInput = RecipeInput & {
  [PROFILE_METADATA_KEY]?: unknown;
};

const PRODUCT_TYPES = new Set(['gelato', 'sorbet', 'vegan', 'protein']);
const MODES = new Set(['eco', 'classic', 'premium', 'signature']);
const PROFESSIONAL_SERVING_IDS = [
  'fresh',
  'temp_minus_11',
  'temp_minus_12',
  'temp_minus_13',
] as const;

export function profileSnapshotFromState(
  state: RecipeState,
  directionTargets: DirectionTargets,
  directionIntents?: DirectionIntents,
): ProfileSettingsSnapshot {
  const servingModeId =
    state.servingModeId ??
    PROFESSIONAL_SERVING_IDS.find(
      (id) => id !== 'fresh' && temperatureForMode(id) === state.target_temperature_c,
    ) ??
    'temp_minus_11';
  return {
    visibleProductType: state.visibleProductType,
    mode: state.mode,
    formulationStrategy: state.formulation_strategy,
    targetBatchGrams: state.target_batch_grams,
    machineKind: state.machineKind ?? 'professional',
    machineId: state.machineId,
    machineLabel: state.machineLabel ?? copy.proMachine.professionalLabel,
    servingModeId,
    targetTemperatureC: state.target_temperature_c,
    machineCapacityGrams: state.machine_capacity_grams,
    directionTargets,
    ...(directionIntents ? { directionIntents: { ...directionIntents } } : {}),
  };
}

const normalizedLegacyTargets = (value: unknown): DirectionTargets | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const axes = ['sweetness', 'softness', 'creaminess', 'flavor'] as const;
  if (!axes.every((axis) => typeof record[axis] === 'number' && Number.isFinite(record[axis]))) {
    return null;
  }
  return Object.fromEntries(
    axes.map((axis) => [
      axis,
      (record[axis] as number) < 0 ? -1 : (record[axis] as number) > 0 ? 1 : 0,
    ]),
  ) as unknown as DirectionTargets;
};

/** Add UI-only recipe metadata. Engine fields and item grams remain byte-for-byte unchanged. */
export function attachRecipeProfileMetadata(
  input: RecipeInput,
  settings: ProfileSettingsSnapshot,
  ingredientUxByLineId: Readonly<
    Record<string, { role: 'standard' | 'addition'; required: boolean }>
  > = {},
): RecipeInput {
  return {
    ...input,
    [PROFILE_METADATA_KEY]: {
      ...settings,
      directionTargets: { ...settings.directionTargets },
      directionIntents: settings.directionIntents
        ? { ...settings.directionIntents }
        : { ...settings.directionTargets },
      ingredientUxByLineId: structuredClone(ingredientUxByLineId),
    },
  } as PersistedRecipeInput;
}

/** Tolerant load seam: legacy recipes simply return null and keep their stored Engine input. */
export function readRecipeProfileMetadata(input: RecipeInput): ProfileSettingsSnapshot | null {
  const value = (input as PersistedRecipeInput)[PROFILE_METADATA_KEY];
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    !PRODUCT_TYPES.has(record.visibleProductType as string) ||
    !MODES.has(record.mode as string) ||
    typeof record.targetBatchGrams !== 'number' ||
    !Number.isFinite(record.targetBatchGrams) ||
    record.targetBatchGrams <= 0 ||
    (record.machineKind !== 'professional' && record.machineKind !== 'home') ||
    (record.machineId !== null && typeof record.machineId !== 'string') ||
    typeof record.machineLabel !== 'string' ||
    typeof record.servingModeId !== 'string' ||
    typeof record.targetTemperatureC !== 'number' ||
    (record.machineCapacityGrams !== null && typeof record.machineCapacityGrams !== 'number') ||
    !normalizedLegacyTargets(record.directionTargets)
  ) {
    return null;
  }
  return {
    ...(record as unknown as ProfileSettingsSnapshot),
    directionTargets: normalizedLegacyTargets(record.directionTargets)!,
    directionIntents:
      normalizedDirectionIntents(record.directionIntents) ??
      normalizedDirectionIntents(record.directionTargets),
    ingredientUxByLineId: normalizedIngredientUx(record.ingredientUxByLineId),
    formulationStrategy: normalizeFormulationStrategy(
      (record.formulationStrategy as string | undefined) ?? (record.mode as string),
    ),
  };
}

const normalizedDirectionIntents = (value: unknown): DirectionIntents | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const axes = ['sweetness', 'softness', 'creaminess', 'flavor'] as const;
  if (!axes.every((axis) => typeof record[axis] === 'number' && Number.isFinite(record[axis]))) {
    return undefined;
  }
  return Object.fromEntries(
    axes.map((axis) => [axis, Math.max(-2, Math.min(2, Math.round(record[axis] as number)))]),
  ) as unknown as DirectionIntents;
};

const normalizedIngredientUx = (
  value: unknown,
): Readonly<Record<string, { role: 'standard' | 'addition'; required: boolean }>> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const result: Record<string, { role: 'standard' | 'addition'; required: boolean }> = {};
  for (const [lineId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!lineId || !raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (row.role !== 'standard' && row.role !== 'addition') continue;
    result[lineId] = { role: row.role, required: row.required === true };
  }
  return result;
};

export { PROFILE_METADATA_KEY };
