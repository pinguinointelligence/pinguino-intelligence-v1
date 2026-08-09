import type { RecipeInput } from '@/engine';
import { copy } from '@/copy/en';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import type { RecipeState } from '@/stores/recipeStore';
import type {
  DirectionTarget,
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
const TARGETS = new Set<DirectionTarget>([-2, -1, 0, 1, 2]);
const PROFESSIONAL_SERVING_IDS = [
  'fresh',
  'temp_minus_11',
  'temp_minus_12',
  'temp_minus_13',
] as const;

export function profileSnapshotFromState(
  state: RecipeState,
  directionTargets: DirectionTargets,
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
  };
}

const validTargets = (value: unknown): value is DirectionTargets => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['sweetness', 'softness', 'creaminess', 'flavor'].every((axis) =>
    TARGETS.has(record[axis] as DirectionTarget),
  );
};

/** Add UI-only recipe metadata. Engine fields and item grams remain byte-for-byte unchanged. */
export function attachRecipeProfileMetadata(
  input: RecipeInput,
  settings: ProfileSettingsSnapshot,
): RecipeInput {
  return {
    ...input,
    [PROFILE_METADATA_KEY]: {
      ...settings,
      directionTargets: { ...settings.directionTargets },
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
    !validTargets(record.directionTargets)
  ) {
    return null;
  }
  return {
    ...(record as unknown as ProfileSettingsSnapshot),
    formulationStrategy: normalizeFormulationStrategy(
      (record.formulationStrategy as string | undefined) ?? (record.mode as string),
    ),
  };
}

export { PROFILE_METADATA_KEY };
