/**
 * The account's saved machine preference, expressed as the profile defaults a
 * NEW recipe starts from.
 *
 * Two authorities described the same customer intent and never met. `/machine`
 * writes a `MachinePreferenceRecord` through `MachinePreferenceStore`, while
 * `startNewRecipe` reads `useRecipeProfileStore` (backed by
 * `user_recipe_defaults`). An account that had only ever set its machine
 * therefore had no recipe default at all, and every new recipe fell through to
 * the Professional fallback — the saved machine was simply never consulted.
 *
 * This module is the bridge, and it derives NOTHING itself: the machine, its
 * serving mode and its batch all come from the existing registry
 * (`resolvePreferenceProfile` → `deriveMachineSetup` → `effectiveDefaultBatchGrams`),
 * exactly as the in-recipe machine picker derives them in
 * `WorkbenchSettingsLine.selectHome`. No machine and no gram figure is written
 * here.
 */
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import { deriveMachineSetup } from '@/features/machine-catalog';
import {
  effectiveDefaultBatchGrams,
  type MachinePreferenceRecord,
} from '@/features/machine-onboarding/preferenceContracts';
import {
  machineDisplayName,
  resolvePreferenceProfile,
} from '@/features/machine-onboarding/machineViews';
import type { VisibleProductType } from '@/features/studio/productType';
import {
  DEFAULT_DIRECTION_INTENTS,
  DEFAULT_DIRECTION_TARGETS,
  type ProfileSettingsSnapshot,
} from './recipeProfileStore';

/**
 * The profile defaults implied by a saved machine preference for one product
 * type, or `null` when the saved machine cannot serve that product — in which
 * case the caller keeps the existing Professional fallback rather than
 * inventing a substitute.
 *
 * The batch is the record's EFFECTIVE default, so a customer who typed their
 * own „Mój domyślny wsad" gets that number and everyone else gets Gellatti's
 * recommendation for the machine. Capacity stays a machine fact and is always
 * the derived recommendation.
 *
 * Direction is deliberately neutral: a machine preference says which machine
 * and how much, never how sweet.
 */
export function machineAccountDefaultSnapshot(
  record: MachinePreferenceRecord,
  visibleProductType: VisibleProductType,
): ProfileSettingsSnapshot | null {
  const profile = resolvePreferenceProfile(record);
  if (profile === null) return null;
  const setup = deriveMachineSetup(profile, visibleProductType);
  if (setup.resolvedVisibleMode === null || setup.recommendedBatchGrams === null) return null;
  const targetTemperatureC = temperatureForMode(setup.resolvedVisibleMode);
  if (targetTemperatureC === null) return null;
  const targetBatchGrams = effectiveDefaultBatchGrams(record) ?? setup.recommendedBatchGrams;
  if (!Number.isFinite(targetBatchGrams) || targetBatchGrams <= 0) return null;
  return {
    visibleProductType,
    mode: 'classic',
    targetBatchGrams,
    batchSource:
      record.selection.kind === 'custom' ? 'CUSTOM_MACHINE_BATCH' : 'MACHINE_DEFAULT',
    machineKind: 'home',
    machineId: profile.id,
    machineLabel: machineDisplayName(profile),
    machineTechnology: profile.technology,
    servingModeId: setup.resolvedVisibleMode,
    targetTemperatureC,
    machineCapacityGrams: setup.recommendedBatchGrams,
    directionTargets: DEFAULT_DIRECTION_TARGETS,
    directionIntents: DEFAULT_DIRECTION_INTENTS,
  };
}
