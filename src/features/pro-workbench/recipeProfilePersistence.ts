import type { RecipeInput } from '@/engine';
import { copy } from '@/copy/en';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import type { RecipeState } from '@/stores/recipeStore';
import type {
  DirectionIntents,
  DirectionTargets,
  PersistedIngredientUxMeta,
  ProfileSettingsSnapshot,
} from './recipeProfileStore';
import { normalizeFormulationStrategy } from '@/features/formulation-strategy/strategy';
import type { ProductDoseMeta } from '@/features/ingredient-builder/productDoseSuggestion';
import {
  HOME_ENGINE_TEMPERATURE_C,
  MACHINE_CATALOG,
  homeFormulationModuleForTechnology,
  isHomeFormulationModuleId,
  type MachineTechnology,
  type HomeFormulationModuleId,
} from '@/features/machine-catalog';

const PROFILE_METADATA_KEY = 'pinguino_profile_v1' as const;

type PersistedRecipeInput = RecipeInput & {
  [PROFILE_METADATA_KEY]?: unknown;
};

const PRODUCT_TYPES = new Set(['gelato', 'sorbet', 'vegan', 'protein']);
const MODES = new Set(['eco', 'classic', 'premium', 'signature']);
const BATCH_SOURCES = new Set([
  'MACHINE_DEFAULT',
  'USER_OVERRIDE',
  'PROFESSIONAL_DEFAULT',
  'PROFESSIONAL_USER_BATCH',
  'CUSTOM_MACHINE_BATCH',
]);
const MACHINE_TECHNOLOGIES = new Set([
  'respin',
  'respin_soft',
  'compressor',
  'frozen_bowl',
  'continuous_soft_serve',
]);
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
    batchSource: state.batch_source,
    machineKind: state.machineKind ?? 'professional',
    machineId: state.machineId,
    machineLabel: state.machineLabel ?? copy.proMachine.professionalLabel,
    machineTechnology: state.machineTechnology,
    homeFormulationModuleId: state.homeFormulationModuleId,
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
    axes.map((axis) => [axis, Math.max(-2, Math.min(2, Math.round(record[axis] as number)))]),
  ) as unknown as DirectionTargets;
};

/** Add UI-only recipe metadata. Engine fields and item grams remain byte-for-byte unchanged. */
export function attachRecipeProfileMetadata(
  input: RecipeInput,
  settings: ProfileSettingsSnapshot,
  ingredientUxByLineId: Readonly<Record<string, PersistedIngredientUxMeta>> = {},
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
    (record.machineTechnology !== undefined &&
      record.machineTechnology !== null &&
      !MACHINE_TECHNOLOGIES.has(record.machineTechnology as string)) ||
    typeof record.machineLabel !== 'string' ||
    typeof record.servingModeId !== 'string' ||
    typeof record.targetTemperatureC !== 'number' ||
    (record.machineCapacityGrams !== null && typeof record.machineCapacityGrams !== 'number') ||
    !normalizedLegacyTargets(record.directionTargets)
  ) {
    return null;
  }
  const canonicalTargets =
    normalizedDirectionIntents(record.directionIntents) ??
    normalizedDirectionIntents(record.directionTargets)!;
  const batchSource = BATCH_SOURCES.has(record.batchSource as string)
    ? (record.batchSource as ProfileSettingsSnapshot['batchSource'])
    : record.machineKind === 'home'
      ? typeof record.machineId === 'string' && record.machineId.startsWith('custom-')
        ? 'CUSTOM_MACHINE_BATCH'
        : 'MACHINE_DEFAULT'
      : 'PROFESSIONAL_USER_BATCH';
  const catalogProfile =
    typeof record.machineId === 'string'
      ? (MACHINE_CATALOG.find((profile) => profile.id === record.machineId) ?? null)
      : null;
  const catalogTechnology = catalogProfile?.technology ?? null;
  const machineTechnology = (record.machineTechnology ??
    catalogTechnology) as MachineTechnology | null;
  const expectedModuleId =
    record.machineKind === 'home' && machineTechnology !== null
      ? homeFormulationModuleForTechnology(machineTechnology)
      : null;
  const homeFormulationModuleId =
    record.machineKind === 'home' ? (record.homeFormulationModuleId ?? expectedModuleId) : null;
  if (
    record.machineKind === 'home' &&
    (!isHomeFormulationModuleId(homeFormulationModuleId) ||
      homeFormulationModuleId !== expectedModuleId)
  ) {
    return null;
  }
  return {
    ...(record as unknown as ProfileSettingsSnapshot),
    machineTechnology,
    homeFormulationModuleId: homeFormulationModuleId as HomeFormulationModuleId | null,
    targetTemperatureC:
      record.machineKind === 'home'
        ? HOME_ENGINE_TEMPERATURE_C
        : (record.targetTemperatureC as number),
    // Historical Home metadata stored the soft recommendation in this Engine
    // hard-capacity field. Re-resolve only direct gram authority from the
    // catalog; custom/unknown legacy records stay honestly null.
    machineCapacityGrams:
      record.machineKind === 'home'
        ? (catalogProfile?.capacity.hardMaximumBatchGrams ?? null)
        : (record.machineCapacityGrams as number | null),
    batchSource,
    directionTargets: canonicalTargets,
    directionIntents: canonicalTargets,
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
): Readonly<Record<string, PersistedIngredientUxMeta>> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const result: Record<string, PersistedIngredientUxMeta> = {};
  for (const [lineId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!lineId || !raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (row.role !== 'standard' && row.role !== 'addition') continue;
    const dose = normalizedProductDose(row.dose);
    result[lineId] = {
      role: row.role,
      required: row.required === true,
      ...(dose ? { dose } : {}),
    };
  }
  return result;
};

const normalizedProductDose = (value: unknown): ProductDoseMeta | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  if (
    row.provenance !== 'NONE' &&
    row.provenance !== 'AUTO_SUGGESTED' &&
    row.provenance !== 'USER_SET' &&
    row.provenance !== 'UNKNOWN'
  ) {
    return undefined;
  }
  if (row.groupId !== null && typeof row.groupId !== 'string') return undefined;
  const optionalNumber = (candidate: unknown): candidate is number | null =>
    candidate === null ||
    (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0);
  if (!optionalNumber(row.suggestedPercent) || !optionalNumber(row.suggestedTotalGrams)) {
    return undefined;
  }
  const groupId = typeof row.groupId === 'string' ? row.groupId.trim() : row.groupId;
  const hasSuggestionEvidence =
    typeof groupId === 'string' &&
    groupId.length > 0 &&
    typeof row.suggestedPercent === 'number' &&
    row.suggestedPercent <= 100 &&
    typeof row.suggestedTotalGrams === 'number';
  const hasNoSuggestionEvidence =
    groupId === null && row.suggestedPercent === null && row.suggestedTotalGrams === null;
  if (
    (row.provenance === 'AUTO_SUGGESTED' && !hasSuggestionEvidence) ||
    ((row.provenance === 'NONE' || row.provenance === 'UNKNOWN') && !hasNoSuggestionEvidence) ||
    (row.provenance === 'USER_SET' && !hasSuggestionEvidence && !hasNoSuggestionEvidence)
  ) {
    return undefined;
  }
  return {
    provenance: row.provenance,
    groupId,
    suggestedPercent: row.suggestedPercent,
    suggestedTotalGrams: row.suggestedTotalGrams,
  };
};

export { PROFILE_METADATA_KEY };
