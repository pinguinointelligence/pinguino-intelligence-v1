import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import {
  MACHINE_CATALOG,
  MACHINE_CATALOG_VERSION,
  SAGE_SMART_SCOOP_BCI600,
  deriveMachineSetup,
  listActiveHomeMachines,
  recommendMachineBatch,
} from '@/features/machine-catalog';
import {
  buildMachineContextView,
  buildMachinePreferenceRecord,
  buildMachineSettingsView,
  buildMachineTileViews,
  machineDisplayName,
  searchMachineTiles,
  withUserDefaultBatch,
} from '@/features/machine-onboarding';
import { machineEducationById } from '@/features/education';

const NOW = '2026-08-28T12:00:00.000Z';

function sageRecord() {
  const record = buildMachinePreferenceRecord({
    profile: SAGE_SMART_SCOOP_BCI600,
    isCustom: false,
    setAt: NOW,
    catalogVersion: MACHINE_CATALOG_VERSION,
  });
  if (record === null) throw new Error('Sage should be a supported Home profile');
  return record;
}

describe('Sage Smart Scoop — approved activation and shared Gellatti batch rule', () => {
  it('is one active canonical profile with the public name and all search aliases', () => {
    const sageProfiles = MACHINE_CATALOG.filter((profile) =>
      [profile.id, profile.brand, profile.family, ...profile.modelCodes]
        .join(' ')
        .toLowerCase()
        .includes('sage'),
    );
    expect(sageProfiles).toEqual([SAGE_SMART_SCOOP_BCI600]);
    expect(listActiveHomeMachines(MACHINE_CATALOG)).toContain(SAGE_SMART_SCOOP_BCI600);
    expect(machineDisplayName(SAGE_SMART_SCOOP_BCI600)).toBe('Sage Smart Scoop');

    const views = buildMachineTileViews();
    for (const query of [
      'Sage',
      'Sage the Smart Scoop',
      'Breville',
      'BCI600',
      'SCI600',
      'SCI600BSS2EEU1',
    ]) {
      const matches = searchMachineTiles(views, query).filter(
        (view) => view.kind === 'catalog_family',
      );
      expect(matches.map((view) => view.label), query).toEqual(['Sage Smart Scoop']);
      expect(matches[0]?.selectable, query).toBe(true);
    }
  });

  it('records verified 1.0 L self-cooling facts without bowl pre-freezing', () => {
    expect(SAGE_SMART_SCOOP_BCI600.capacity.vesselCapacityMl).toBe(1000);
    expect(SAGE_SMART_SCOOP_BCI600.technology).toBe('compressor');
    expect(SAGE_SMART_SCOOP_BCI600.requiresPreFreeze).toBe(false);
    expect(SAGE_SMART_SCOOP_BCI600.preFreezeTarget).toBe('none');
    expect(SAGE_SMART_SCOOP_BCI600.specificationStatus).toBe('verified');
    expect(SAGE_SMART_SCOOP_BCI600.active).toBe(true);
  });

  it('derives 950 g through the shared 95% rule and keeps it editable', () => {
    expect(recommendMachineBatch(SAGE_SMART_SCOOP_BCI600)).toMatchObject({
      grams: 950,
      safetyFactorApplied: 0.95,
      estimated: false,
    });
    expect(deriveMachineSetup(SAGE_SMART_SCOOP_BCI600).recommendedBatchGrams).toBe(950);

    const initial = sageRecord();
    expect(initial.defaultBatch).toMatchObject({ kind: 'grams', grams: 950 });
    expect(buildMachineSettingsView(initial)).toMatchObject({
      name: 'Sage Smart Scoop',
      recommendedGrams: 950,
      userDefaultGrams: 950,
    });

    const edited = withUserDefaultBatch(initial, 875, '2026-08-28T13:00:00.000Z');
    expect(edited).not.toBeNull();
    expect(buildMachineSettingsView(edited!)).toMatchObject({
      recommendedGrams: 950,
      userDefaultGrams: 875,
      usesOwnDefault: true,
    });
    expect(buildMachineContextView(edited!)).toMatchObject({
      name: 'Sage Smart Scoop',
      defaultBatchGrams: 875,
    });
  });

  it('resolves Sage Production instructions and never freezes the bowl', () => {
    const guide = machineEducationById(SAGE_SMART_SCOOP_BCI600.id);
    expect(guide?.sourceMachineId).toBe(SAGE_SMART_SCOOP_BCI600.id);
    expect(guide?.title).toBe('SAGE SMART SCOOP');
    expect(guide?.steps).toContain('Jeśli chcesz, użyj PRE-COOL przed wlaniem mieszanki.');
    expect(guide?.steps.at(-1)).toContain('KEEP COOL');
    expect(guide?.steps.at(-1)).toContain('3 godzin');
    expect(guide?.steps.join(' ').toLowerCase()).not.toMatch(
      /zamroź|zamraż|freeze.*mis|mis.*freeze/,
    );
  });

  it('the machine recommendation cannot alter Base Engine math at the same final grams', () => {
    const input: RecipeInput = {
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 950,
      machine_capacity_grams: null,
      items: [],
    };
    expect(calculateRecipe(input)).toEqual(calculateRecipe({ ...input }));
  });
});
