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
import { deriveMachineSetup } from '@/features/machine-catalog';
import type { MachinePreferenceRecord } from '@/features/machine-onboarding/preferenceContracts';
import {
  machineDisplayName,
  resolvePreferenceProfile,
} from '@/features/machine-onboarding/machineViews';
import { copy } from '@/copy/en';
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
 * A customer who typed their own „Mój domyślny wsad" gets that number for every
 * product; everyone else gets Gellatti's recommendation FOR THIS PRODUCT.
 * The recommended batch chooses how much a new recipe starts with. The hard
 * gram capacity remains a separate machine fact and may honestly be unknown.
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
  if (setup.resolvedVisibleMode === null) return null;
  /* The customer's own „Mój domyślny wsad" wins for every product, because it
     is a number they typed. Otherwise the recommendation for THIS product wins
     — NOT the one frozen into the record, which was derived for the product
     that happened to be current when the machine was saved. Magimix proposes
     1240 g for sorbet against 950 g for gelato, and reading the record's
     snapshot silently gave sorbet the gelato figure.

     A CUSTOM machine usually has no derived recommendation at all — Gellatti
     says so plainly („Dla tej maszyny nie proponujemy wsadu — ustaw własną
     ilość") — so the typed batch is the ONLY number there is. Requiring a
     recommendation here sent every custom machine back to Professional. */
  const targetBatchGrams = record.userDefaultBatchGrams ?? setup.recommendedBatchGrams;
  if (targetBatchGrams === null || !Number.isFinite(targetBatchGrams) || targetBatchGrams <= 0) {
    return null;
  }
  return {
    visibleProductType,
    mode: 'classic',
    targetBatchGrams,
    batchSource: record.selection.kind === 'custom' ? 'CUSTOM_MACHINE_BATCH' : 'MACHINE_DEFAULT',
    machineKind: 'home',
    machineId: profile.id,
    machineLabel: machineDisplayName(profile),
    machineTechnology: profile.technology,
    homeFormulationModuleId: profile.homeFormulationModuleId,
    servingModeId: setup.resolvedVisibleMode,
    targetTemperatureC: setup.engineTemperatureC,
    // Capacity stays a MACHINE fact and may honestly be unknown for a custom
    // machine; the studio already renders a null capacity without inventing one.
    machineCapacityGrams: setup.hardMaximumBatchGrams,
    directionTargets: DEFAULT_DIRECTION_TARGETS,
    directionIntents: DEFAULT_DIRECTION_INTENTS,
  };
}

/**
 * „Maszyna profesjonalna" chosen explicitly in Machine Settings.
 *
 * Nothing here is a new rule. `startNewRecipe` already applies the canonical
 * Professional batch and `PROFESSIONAL_DEFAULT` source to anything that is not
 * a `home` machine, so this snapshot only has to say WHICH kind was chosen.
 *
 * The canonical grams and serving mode are PASSED IN rather than imported.
 * `newRecipeStarter` and `recipeStore` form a pre-existing module cycle — a
 * module that imports the starter before the store sees
 * `PROFESSIONAL_DEFAULT_BATCH_GRAMS` as `undefined` — and importing either from
 * here would add a new edge into it. The app-level callers already sit safely
 * outside that cycle, so they hand the authority in and this module keeps one
 * source of truth without creating a second hazard.
 */
export function professionalAccountDefault(authority: {
  batchGrams: number;
  servingModeId: string;
  targetTemperatureC: number;
}): (visibleProductType: VisibleProductType) => ProfileSettingsSnapshot {
  return (visibleProductType) => ({
    visibleProductType,
    mode: 'classic',
    targetBatchGrams: authority.batchGrams,
    batchSource: 'PROFESSIONAL_DEFAULT',
    machineKind: 'professional',
    machineId: null,
    machineLabel: copy.proMachine.professionalLabel,
    machineTechnology: null,
    homeFormulationModuleId: null,
    servingModeId: authority.servingModeId,
    targetTemperatureC: authority.targetTemperatureC,
    machineCapacityGrams: null,
    directionTargets: DEFAULT_DIRECTION_TARGETS,
    directionIntents: DEFAULT_DIRECTION_INTENTS,
  });
}
