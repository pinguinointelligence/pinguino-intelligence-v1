import { beforeEach, describe, expect, it } from 'vitest';
import {
  directionTargetNeedsConsent,
  DEFAULT_DIRECTION_TARGET_ORIGINS,
  LEGACY_DIRECTION_TARGET_ORIGINS,
} from '@/features/recipe-direction/directionTargetOrigin';
import { directionFeasibility } from '@/features/constraint-studio/directionFeasibility';
import type { RecipeInput } from '@/engine';
import type { RecipeState } from '@/stores/recipeStore';
import {
  attachRecipeProfileMetadata,
  profileSnapshotFromState,
  readRecipeProfileMetadata,
} from './recipeProfilePersistence';
import { useRecipeProfileStore } from './recipeProfileStore';

const recipeInput = (): RecipeInput =>
  ({ category: 'gelato', target_batch_grams: 1000, items: [] }) as unknown as RecipeInput;

const recipeState = (): RecipeState =>
  ({
    visibleProductType: 'gelato',
    mode: 'classic',
    formulation_strategy: 'classic',
    target_batch_grams: 1000,
    batch_source: 'PROFESSIONAL_USER_BATCH',
    machineKind: 'professional',
    machineId: null,
    machineLabel: 'Profesjonalna',
    machineTechnology: null,
    homeFormulationModuleId: null,
    servingModeId: 'temp_minus_11',
    target_temperature_c: -11,
    machine_capacity_grams: null,
  }) as unknown as RecipeState;

/*
 * OD-29 (Owner 19.09.2026) — whose level is it?
 *
 * A level the customer moved themselves is a decision the product must defend: when it
 * turns out to be unreachable, the nearest value may be applied only with their consent.
 * A level nobody chose is the system's own default and carries no such promise. This is
 * the only place that fact is recorded, and it is recorded for HOME and PRO alike.
 */
const origins = () => useRecipeProfileStore.getState().directionTargetOrigins;

describe('DIR-ORIGIN — the profile store records who chose each level', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
  });

  it('DIR-ORIGIN-01 every axis starts as the system default — nobody has chosen anything', () => {
    expect(origins()).toEqual(DEFAULT_DIRECTION_TARGET_ORIGINS);
    for (const axis of ['sweetness', 'softness', 'creaminess', 'flavor'] as const) {
      expect(origins()[axis]).toBe('system_default');
    }
  });

  it('DIR-ORIGIN-02 moving an axis makes THAT axis the customer’s, and only that one', () => {
    useRecipeProfileStore.getState().moveAxisTarget('sweetness', -1);
    expect(origins().sweetness).toBe('user_explicit');
    expect(origins().softness).toBe('system_default');
    expect(origins().creaminess).toBe('system_default');
    expect(origins().flavor).toBe('system_default');
  });

  it('DIR-ORIGIN-03 the finer intent control carries the same authorship', () => {
    useRecipeProfileStore.getState().moveAxisIntent('softness', 1);
    expect(origins().softness).toBe('user_explicit');
    expect(origins().sweetness).toBe('system_default');
  });

  it('DIR-ORIGIN-04 a restore carries the provenance it is given — the choice survives the reload', () => {
    /* Owner correction 19.09: `targetOrigin` is PROVENANCE, not „did they click in this
       session”. A level chosen yesterday, saved and reopened today is still theirs, or a
       reload would let the product change a deliberate choice without asking. */
    useRecipeProfileStore
      .getState()
      .setDirectionTargets(
        { sweetness: -1, softness: 1, creaminess: 0, flavor: 0 },
        { ...DEFAULT_DIRECTION_TARGET_ORIGINS, sweetness: 'user_explicit' },
      );
    expect(useRecipeProfileStore.getState().directionTargets.sweetness).toBe(-1);
    expect(origins().sweetness).toBe('user_explicit');
    expect(origins().softness).toBe('system_default');
  });

  it('DIR-ORIGIN-04b a record with no provenance is legacy_unknown, never a silent system default', () => {
    // A missing word is not permission: unknown provenance is treated as the customer's.
    useRecipeProfileStore
      .getState()
      .setDirectionTargets({ sweetness: -1, softness: 0, creaminess: 0, flavor: 0 });
    expect(origins()).toEqual(LEGACY_DIRECTION_TARGET_ORIGINS);
    expect(directionTargetNeedsConsent(origins().sweetness)).toBe(true);
  });

  it('DIR-ORIGIN-04c a reset to the profile defaults hands the levels back to the system', () => {
    useRecipeProfileStore.getState().moveAxisTarget('sweetness', -1);
    expect(origins().sweetness).toBe('user_explicit');
    useRecipeProfileStore.getState().resetDirectionTargetsToDefaults();
    expect(origins()).toEqual(DEFAULT_DIRECTION_TARGET_ORIGINS);
    expect(directionTargetNeedsConsent(origins().sweetness)).toBe(false);
  });

  it('DIR-ORIGIN-05 a reset forgets authorship along with the levels', () => {
    useRecipeProfileStore.getState().moveAxisTarget('flavor', 1);
    expect(origins().flavor).toBe('user_explicit');
    useRecipeProfileStore.getState().resetForTests();
    expect(origins()).toEqual(DEFAULT_DIRECTION_TARGET_ORIGINS);
  });
});

describe('DIR-ORIGIN — provenance survives save, reload and restore', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
  });

  it('DIR-ORIGIN-06 user_explicit → save → full reload → restore → still user_explicit, still consent-required', () => {
    /* The whole point of provenance (Owner correction 19.09): a level chosen yesterday,
       saved, and opened today is STILL the customer's. Without this, a reload would let
       the product move a deliberate choice to its nearest feasible value without asking. */
    useRecipeProfileStore.getState().moveAxisTarget('sweetness', -1);
    const chosen = useRecipeProfileStore.getState();
    expect(chosen.directionTargets.sweetness).toBe(-1);
    expect(chosen.directionTargetOrigins.sweetness).toBe('user_explicit');

    // SAVE: the recipe carries the levels and whose they are.
    const saved = attachRecipeProfileMetadata(
      recipeInput(),
      profileSnapshotFromState(
        recipeState(),
        chosen.directionTargets,
        chosen.directionIntents,
        chosen.directionTargetOrigins,
      ),
    );

    // FULL RELOAD: nothing of this session survives.
    useRecipeProfileStore.getState().resetForTests();
    expect(useRecipeProfileStore.getState().directionTargetOrigins).toEqual(
      DEFAULT_DIRECTION_TARGET_ORIGINS,
    );

    // RESTORE from the saved recipe.
    const restored = readRecipeProfileMetadata(saved)!;
    expect(restored.directionTargetOrigins!.sweetness).toBe('user_explicit');
    useRecipeProfileStore
      .getState()
      .setDirectionTargets(restored.directionTargets, restored.directionTargetOrigins);

    expect(useRecipeProfileStore.getState().directionTargets.sweetness).toBe(-1);
    expect(origins().sweetness).toBe('user_explicit');

    // And an unreachable −1 still waits for the customer, exactly as before the reload.
    const feasibility = directionFeasibility({
      report: {
        profile: 'gelato' as never,
        failureKind: 'SEARCH_FAILED',
        requestedTargets: { sweetness: -1, softness: 0, creaminess: 0, flavor: 0 } as never,
        attempts: [],
        best: {
          attemptIndex: 0,
          targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 } as never,
          targetReached: false,
          runtimeMs: 1,
          preview: { applied: true } as never,
          originalTargetScore: null,
          preservedOriginallySatisfiedAxes: true,
        },
        totalRuntimeMs: 1,
      },
      failure: null,
      recipe: recipeInput(),
      constraints: { byLineId: {} } as never,
      origins: origins(),
    });
    expect(feasibility.feasible).toBe(false);
    expect(feasibility.requiresConsent).toBe(true);
  });

  it('DIR-ORIGIN-07 a saved recipe written before provenance existed asks instead of assuming', () => {
    const legacy = attachRecipeProfileMetadata(
      recipeInput(),
      profileSnapshotFromState(recipeState(), {
        sweetness: -1,
        softness: 0,
        creaminess: 0,
        flavor: 0,
      } as never),
    );
    const restored = readRecipeProfileMetadata(legacy)!;
    expect(restored.directionTargetOrigins).toEqual(LEGACY_DIRECTION_TARGET_ORIGINS);
    expect(directionTargetNeedsConsent(restored.directionTargetOrigins!.sweetness)).toBe(true);
  });
});
