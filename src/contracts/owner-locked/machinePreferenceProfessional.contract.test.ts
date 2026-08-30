/**
 * OWNER-LOCKED — „Maszyna profesjonalna" is an explicit, saveable default.
 *
 * Purely additive alongside `machinePreferenceNewRecipeDefault` and
 * `machinePreferenceCustomMachine`; it weakens nothing in either.
 *
 * Machine Settings could only ever save a Home machine, so a Pro customer had
 * no way to state „Professional is my default" — only to leave the setting
 * empty and rely on the fallback, which is a different statement.
 *
 * Professional introduces NO machine and NO batch rule. `startNewRecipe`
 * already applies the canonical Professional batch and `PROFESSIONAL_DEFAULT`
 * source to anything that is not a `home` machine, so the choice only has to
 * say which kind was picked.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { MACHINE_CATALOG } from '@/features/machine-catalog';
import { buildMachinePreferenceRecord } from '@/features/machine-onboarding/preferenceContracts';
import {
  readProfessionalChoice,
  writeProfessionalChoice,
  userScopedProfessionalKey,
  type ProfessionalChoiceStorage,
} from '@/features/machine-onboarding/professionalMachineChoice';
import { machineAccountDefaultSnapshot } from '@/features/pro-workbench/machineAccountDefault';
import { professionalAccountDefaultSnapshot } from '@/features/pro-workbench/professionalAccountAuthority';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useAuthStore } from '@/stores/authStore';

/* The canonical Professional batch, pinned deliberately: GEL-P0-007 already
   locks „a fresh Professional recipe opens at 1000 g", and the owner restated it
   for this change. It is written here rather than imported from `recipeStore`
   because `newRecipeStarter` and `recipeStore` form a pre-existing module cycle:
   any test whose import graph reaches the starter first sees
   `CANONICAL_PROFESSIONAL_BATCH_G` as `undefined`. Test 2 proves the
   application itself reads the constant and hard-codes nothing. */
const CANONICAL_PROFESSIONAL_BATCH_G = 1000;

const OWNER = 'owner-professional';
const DELUXE_ID = 'ninja-creami-deluxe-nc502eu-eu-es';

const memoryStorage = (): ProfessionalChoiceStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

describe('OWNER-LOCKED — Professional is an explicit saved default', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: null, displayName: null },
      available: true,
    });
    useRecipeProfileStore.getState().resetForTests();
    useRecipeProfileStore.getState().setMachineAccountDefault(null, null);
  });

  it('1. a saved Professional opens a NEW recipe at the canonical 1000 g', () => {
    useRecipeProfileStore
      .getState()
      .setMachineAccountDefault(OWNER, professionalAccountDefaultSnapshot);
    useRecipeStore.getState().startNewRecipe('gelato');

    const state = useRecipeStore.getState();
    expect(state.machineKind).toBe('professional');
    expect(state.machineId).toBeNull();
    expect(state.target_batch_grams).toBe(CANONICAL_PROFESSIONAL_BATCH_G);
    expect(state.machine_capacity_grams).toBeNull();
    expect(state.batch_source).toBe('PROFESSIONAL_DEFAULT');
    expect(state.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(
      CANONICAL_PROFESSIONAL_BATCH_G,
    );
  });

  it('2. it reuses the canonical authority — no second batch constant', () => {
    /* Asserted at SOURCE level on purpose. `newRecipeStarter` and `recipeStore`
       form a pre-existing module cycle: a test that imports the starter first
       sees `CANONICAL_PROFESSIONAL_BATCH_G` as `undefined`. Reading the source
       proves the reuse without making this contract depend on import order. */
    const authority = readFileSync(
      'src/features/pro-workbench/professionalAccountAuthority.ts',
      'utf8',
    );
    expect(authority).toContain('DEFAULT_NEW_RECIPE_BATCH_G');
    // No hand-written batch number anywhere in the Professional lane.
    expect(authority).not.toMatch(/batchGrams:\s*\d/);
    const builder = readFileSync(
      'src/features/pro-workbench/machineAccountDefault.ts',
      'utf8',
    );
    const professionalBlock = builder.slice(builder.indexOf('professionalAccountDefault'));
    expect(professionalBlock).not.toMatch(/targetBatchGrams:\s*\d/);

    expect(professionalAccountDefaultSnapshot('gelato').targetBatchGrams).toBe(
      CANONICAL_PROFESSIONAL_BATCH_G,
    );
    expect(professionalAccountDefaultSnapshot('gelato').batchSource).toBe(
      'PROFESSIONAL_DEFAULT',
    );
  });

  it('3. Professional replaces a saved Home machine rather than coexisting', () => {
    const profile = MACHINE_CATALOG.find((candidate) => candidate.id === DELUXE_ID);
    const record = buildMachinePreferenceRecord({
      profile: profile!,
      isCustom: false,
      setAt: '2026-08-30T14:00:00.000Z',
      catalogVersion: 'test',
    });
    useRecipeProfileStore
      .getState()
      .setMachineAccountDefault(OWNER, (product) =>
        machineAccountDefaultSnapshot(record!, product),
      );
    useRecipeStore.getState().startNewRecipe('gelato');
    expect(useRecipeStore.getState().machineId).toBe(DELUXE_ID);

    useRecipeProfileStore
      .getState()
      .setMachineAccountDefault(OWNER, professionalAccountDefaultSnapshot);
    useRecipeStore.getState().startNewRecipe('gelato');

    const state = useRecipeStore.getState();
    expect(state.machineKind).toBe('professional');
    expect(state.machineId).toBeNull();
    expect(state.target_batch_grams).toBe(CANONICAL_PROFESSIONAL_BATCH_G);
  });

  it('4. Professional carries no Direction and no capacity opinion', () => {
    const snapshot = professionalAccountDefaultSnapshot('sorbet');
    expect(snapshot.machineCapacityGrams).toBeNull();
    expect(snapshot.machineTechnology).toBeNull();
    expect(snapshot.directionTargets).toEqual({
      sweetness: 0,
      softness: 0,
      creaminess: 0,
      flavor: 0,
    });
  });

  it('5. the choice is recorded per account and never leaks between them', () => {
    const storage = memoryStorage();
    expect(readProfessionalChoice(OWNER, storage)).toBe(false);
    expect(writeProfessionalChoice(OWNER, true, storage)).toBe(true);
    expect(readProfessionalChoice(OWNER, storage)).toBe(true);
    expect(readProfessionalChoice('someone-else', storage)).toBe(false);
    expect(userScopedProfessionalKey(OWNER)).toContain(OWNER);

    writeProfessionalChoice(OWNER, false, storage);
    expect(readProfessionalChoice(OWNER, storage)).toBe(false);
  });

  it('6. an unreadable device never invents a Professional default', () => {
    const hostile: ProfessionalChoiceStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readProfessionalChoice(OWNER, hostile)).toBe(false);
    expect(writeProfessionalChoice(OWNER, true, hostile)).toBe(false);
    expect(readProfessionalChoice(OWNER, null)).toBe(false);
  });
});
