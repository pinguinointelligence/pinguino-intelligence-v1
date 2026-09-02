/**
 * OWNER-LOCKED — a custom machine's typed batch is a default in its own right.
 *
 * Purely additive coverage alongside `machinePreferenceNewRecipeDefault`; it
 * weakens nothing there.
 *
 * A custom machine usually derives NO recommendation — Gellatti says so
 * plainly: „Dla tej maszyny nie proponujemy wsadu — ustaw własną ilość." The
 * snapshot builder used to bail whenever the derived recommendation was null,
 * which is exactly that case, so a saved custom machine with a typed 1200 g
 * batch still opened every new recipe on Professional 1000 g.
 *
 * The typed batch is the only number such a machine has. When there is no
 * number at all, nothing is invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MACHINE_CATALOG } from '@/features/machine-catalog';
import { buildMachinePreferenceRecord } from '@/features/machine-onboarding/preferenceContracts';
import { machineAccountDefaultSnapshot } from '@/features/pro-workbench/machineAccountDefault';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore, PROFESSIONAL_DEFAULT_BATCH_GRAMS } from '@/stores/recipeStore';
import { useAuthStore } from '@/stores/authStore';

const OWNER = 'owner-custom-machine';
const DELUXE_ID = 'ninja-creami-deluxe-nc502eu-eu-es';

const baseProfile = () => {
  const profile = MACHINE_CATALOG.find((candidate) => candidate.id === DELUXE_ID);
  if (!profile) throw new Error('catalogue changed: Deluxe is gone');
  return profile;
};

describe('OWNER-LOCKED — a custom machine is a real default', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: null, displayName: null },
      available: true,
    });
    useRecipeProfileStore.getState().resetForTests();
    useRecipeProfileStore.getState().setMachineAccountDefault(null, null);
  });

  it('a typed batch becomes the new-recipe default even with no recommendation', () => {
    const base = baseProfile();
    const custom = {
      ...base,
      id: 'custom-qa-machine',
      capacity: { ...base.capacity, manufacturerMaxMixGrams: null },
    };
    const record = buildMachinePreferenceRecord({
      profile: custom,
      isCustom: true,
      setAt: '2026-08-30T12:00:00.000Z',
      catalogVersion: 'test',
    });
    expect(record).not.toBeNull();
    const withTypedBatch = { ...record!, userDefaultBatchGrams: 1200 };

    useRecipeProfileStore
      .getState()
      .setMachineAccountDefault(OWNER, (product) =>
        machineAccountDefaultSnapshot(withTypedBatch, product),
      );
    useRecipeStore.getState().startNewRecipe('gelato');

    const state = useRecipeStore.getState();
    expect(state.machineKind).toBe('home');
    expect(state.machineId).toBe('custom-qa-machine');
    expect(state.target_batch_grams).toBe(1200);
    expect(state.batch_source).toBe('CUSTOM_MACHINE_BATCH');
    expect(state.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(1200);
  });

  it('no recommendation and no typed batch invents nothing', () => {
    const base = baseProfile();
    const record = buildMachinePreferenceRecord({
      profile: {
        ...base,
        id: 'custom-no-capacity',
        capacity: {
          ...base.capacity,
          vesselCapacityMl: null,
          maximumLiquidMixMl: null,
          workingCapacityMl: null,
          manufacturerMaxMixGrams: null,
        },
      } as never,
      isCustom: true,
      setAt: '2026-08-30T12:00:00.000Z',
      catalogVersion: 'test',
    });
    if (record === null) return; // the builder itself refused — equally correct
    expect(
      machineAccountDefaultSnapshot({ ...record, userDefaultBatchGrams: null }, 'gelato'),
    ).toBeNull();
  });

  it('the Professional fallback still stands when nothing is published', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    expect(useRecipeStore.getState().target_batch_grams).toBe(PROFESSIONAL_DEFAULT_BATCH_GRAMS);
  });
});
