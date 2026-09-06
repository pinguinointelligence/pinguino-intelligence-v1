import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import {
  MACHINE_CATALOG,
  MACHINE_CATALOG_VERSION,
  SAGE_SMART_SCOOP_BCI600,
  listActiveHomeMachines,
} from '@/features/machine-catalog';
import {
  buildMachineContextView,
  buildMachinePreferenceRecord,
  buildMachineSettingsView,
  buildMachineTileViews,
  resolvePreferenceProfile,
} from '@/features/machine-onboarding';
import { machineEducationById } from '@/features/education';
import {
  attachRecipeProfileMetadata,
  readRecipeProfileMetadata,
} from '@/features/pro-workbench/recipeProfilePersistence';

const active = listActiveHomeMachines(MACHINE_CATALOG);

describe('canonical machine registry cross-surface parity', () => {
  it('gives every active machine the same canonical identity in onboarding, settings, recipe and Production', () => {
    const onboardingProfiles = buildMachineTileViews().flatMap((tile) => tile.selectableProfiles);
    const onboardingIds = new Set(onboardingProfiles.map((profile) => profile.id));

    for (const profile of active) {
      expect(onboardingIds.has(profile.id), `onboarding: ${profile.id}`).toBe(true);
      const preference = buildMachinePreferenceRecord({
        profile,
        isCustom: false,
        setAt: '2026-08-28T12:00:00.000Z',
        catalogVersion: MACHINE_CATALOG_VERSION,
      });
      expect(preference, `preference: ${profile.id}`).not.toBeNull();
      expect(resolvePreferenceProfile(preference!)?.id).toBe(profile.id);
      expect(buildMachineSettingsView(preference!)?.name).toBe(profile.displayName);
      expect(buildMachineContextView(preference!)?.name).toBe(profile.displayName);

      const production = machineEducationById(profile.id);
      expect(production?.sourceMachineId, `production: ${profile.id}`).toBe(profile.id);
      expect(production?.steps.length).toBeGreaterThan(0);
      const instructions = production!.steps.join(' ').toLocaleLowerCase('pl');
      if (profile.technology === 'compressor') {
        expect(instructions, `compressor must not freeze bowl: ${profile.id}`).not.toMatch(
          /zamro(?:ź|ż).*mis/,
        );
      }
      if (profile.technology === 'frozen_bowl') {
        expect(instructions, `frozen bowl must be pre-frozen: ${profile.id}`).toMatch(
          /zamro(?:ź|ż).*mis/,
        );
      }
      if (profile.technology === 'respin' || profile.technology === 'respin_soft') {
        expect(production?.category, `respin routing: ${profile.id}`).toBe('frozen_container');
      }
    }
    expect(new Set(onboardingProfiles.map((profile) => profile.id)).size).toBe(
      onboardingProfiles.length,
    );
  });

  it('the optional Pro Home selector source is exactly the active canonical registry', () => {
    expect(active.map((profile) => profile.id)).toEqual(
      MACHINE_CATALOG.filter((profile) => profile.active).map((profile) => profile.id),
    );
  });

  it('Sage machine id + recommended batch survive while legacy pseudo-capacity is cleared', () => {
    const input: RecipeInput = {
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 950,
      machine_capacity_grams: 950,
      machine_capacity_source: 'machine',
      items: [],
    };
    const persisted = attachRecipeProfileMetadata(input, {
      visibleProductType: 'gelato',
      mode: 'classic',
      formulationStrategy: 'optimal',
      targetBatchGrams: 950,
      machineKind: 'home',
      machineId: SAGE_SMART_SCOOP_BCI600.id,
      machineLabel: 'Sage Smart Scoop',
      servingModeId: 'fresh',
      targetTemperatureC: -11,
      machineCapacityGrams: 950,
      directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    });
    const reopened = readRecipeProfileMetadata(persisted);
    expect(reopened).toMatchObject({
      machineKind: 'home',
      machineId: SAGE_SMART_SCOOP_BCI600.id,
      machineLabel: 'Sage Smart Scoop',
      targetBatchGrams: 950,
      machineCapacityGrams: null,
    });
    expect(machineEducationById(reopened!.machineId)?.sourceMachineId).toBe(
      SAGE_SMART_SCOOP_BCI600.id,
    );
  });
});
