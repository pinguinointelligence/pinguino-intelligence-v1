import { describe, expect, it } from 'vitest';
import { recipePersistPartialize, useRecipeStore, type RecipeState } from './recipeStore';
import { findDemoIngredient } from '@/data/demoIngredients';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  selectCanonicalDraft,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { buildRecipeVersion, restoreVersion } from '@/features/pro-core/recipeVersioning';
import { savedToRecipeInput } from '@/features/recipes/recipePayload';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  attachPracticalRecipeAudit,
  practicalRecipeAuditMatchesInput,
  practicalizeRecipeCandidate,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';

const state = {
  mode: 'classic',
  formulation_strategy: 'eco',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  flavor_intensity: 'balanced',
  cost_priority: 'balanced',
  items: [{ id: 'line-1' }],
  target_protein_percent: 22.4,
  direction_targets: { sweetness: -1, softness: 1, creaminess: 0, flavor: 0 },
  direction_targets_active: true,
  activePresetId: 'milk-base',
  savedRecipeId: 'aggregate-42',
  savedRecipeName: 'Moja receptura',
  currentVersionNumber: 3,
  dirty: true,
  draftContextSeq: 7,
  productionThermalMode: 'HEAT_CAPABLE',
} as unknown as RecipeState;

describe('recipePersistPartialize', () => {
  it('PERSISTS the canonical aggregate link (S2 repair — version continuity survives reload)', () => {
    // The link is persisted so the next save appends v(n+1) to the SAME aggregate instead of a
    // new v1. Stale ids are safe: the adapter re-reads the DB-authoritative version and fails
    // honestly if the aggregate is gone (see supabaseRecipes.saveNewVersion).
    const persisted = recipePersistPartialize(state) as Record<string, unknown>;
    expect(persisted.savedRecipeId).toBe('aggregate-42');
    expect(persisted.savedRecipeName).toBe('Moja receptura');
    expect(persisted.currentVersionNumber).toBe(3);
    expect(persisted.dirty).toBe(true);
  });

  it('still persists the in-progress recipe content + preset highlight', () => {
    const persisted = recipePersistPartialize(state);
    expect(persisted.mode).toBe('classic');
    expect(persisted.formulation_strategy).toBe('eco');
    expect(persisted.category).toBe('milk_gelato');
    expect(persisted.items).toBe(state.items);
    expect(persisted.activePresetId).toBe('milk-base');
    expect(persisted.target_batch_grams).toBe(1000);
    expect(persisted.target_protein_percent).toBe(22.4);
    expect(persisted.direction_targets).toEqual({
      sweetness: -1,
      softness: 1,
      creaminess: 0,
      flavor: 0,
    });
    expect(persisted.direction_targets_active).toBe(true);
    expect(persisted.draftContextSeq).toBe(7);
    expect(persisted.productionThermalMode).toBe('HEAT_CAPABLE');
  });

  it('persists Production thermal context without invalidating recipe mathematics or version identity', () => {
    const prior = useRecipeStore.getState();
    try {
      useRecipeStore.setState({ dirty: false, productionThermalMode: null });
      useRecipeStore.getState().setProductionThermalMode('COLD_ONLY');
      expect(useRecipeStore.getState()).toMatchObject({
        productionThermalMode: 'COLD_ONLY',
        dirty: false,
      });
      expect(recipePersistPartialize(useRecipeStore.getState()).productionThermalMode).toBe(
        'COLD_ONLY',
      );
    } finally {
      useRecipeStore.setState(prior, true);
    }
  });
});

describe('manual ingredient target contract', () => {
  it('records the latest direct gram edit as the one soft user target and keeps presence anchors', () => {
    const prior = useRecipeStore.getState();
    try {
      const recipe = ownerSameInputRecipe();
      useRecipeStore.getState().loadRecipeInput({
        ...recipe,
        items: recipe.items.map((item) => ({
          ...item,
          user_intent_anchor_grams: item.planned_grams,
        })),
      });
      useRecipeStore.setState({
        productBehaviorSnapshots: productBehaviorTestSnapshots(
          buildRecipeInput(useRecipeStore.getState()),
        ),
      });
      const first = useRecipeStore.getState().items[0]!;
      const second = useRecipeStore.getState().items[1]!;

      useRecipeStore.getState().setPlannedGrams(first.id, 500);
      expect(useRecipeStore.getState().items.find((item) => item.id === first.id)).toMatchObject({
        planned_grams: 500,
        user_intent_anchor_grams: 500,
        user_target_grams: 500,
      });

      useRecipeStore.getState().setPlannedGrams(second.id, 50);
      const after = useRecipeStore.getState().items;
      expect(after.find((item) => item.id === first.id)?.user_target_grams).toBeUndefined();
      expect(after.find((item) => item.id === first.id)?.user_intent_anchor_grams).toBe(500);
      expect(after.find((item) => item.id === second.id)).toMatchObject({
        planned_grams: 50,
        user_intent_anchor_grams: 50,
        user_target_grams: 50,
      });
    } finally {
      useRecipeStore.setState(prior, true);
    }
  });

  it('keeps an explicit manual zero as the current target without a positive-presence anchor', () => {
    const prior = useRecipeStore.getState();
    try {
      useRecipeStore.getState().loadRecipeInput(ownerSameInputRecipe());
      const lineId = useRecipeStore.getState().items[0]!.id;
      useRecipeStore.getState().setPlannedGrams(lineId, 0);
      const line = useRecipeStore.getState().items.find((item) => item.id === lineId);
      expect(line).toMatchObject({ planned_grams: 0, user_target_grams: 0 });
      expect(line?.user_intent_anchor_grams).toBeUndefined();
    } finally {
      useRecipeStore.setState(prior, true);
    }
  });
});

describe('saved practical recipe provenance', () => {
  it('rehydrates a matching verified whole-gram fingerprint and invalidates it after an edit', () => {
    const prior = useRecipeStore.getState();
    try {
      const practical = practicalizeRecipeCandidate(ownerSameInputRecipe(), { byLineId: {} });
      expect(practical.ok).toBe(true);
      if (!practical.ok) return;
      useRecipeStore.getState().loadRecipeInput(practical.audit.executableInput, {
        savedId: 'recipe-practical',
      });
      const canonicalSavedInput = buildRecipeInput(useRecipeStore.getState());
      const saved = attachPracticalRecipeAudit(
        canonicalSavedInput,
        practical.audit.exactInput,
        '2026-08-11T12:00:00.000Z',
      );
      useRecipeStore.getState().loadRecipeInput(saved, { savedId: 'recipe-practical' });
      useRecipeStore.setState({
        productBehaviorSnapshots: productBehaviorTestSnapshots(
          buildRecipeInput(useRecipeStore.getState()),
        ),
      });
      const loaded = useRecipeStore.getState();
      const loadedInput = buildRecipeInput(loaded);
      expect(practicalRecipeAuditMatchesInput(loadedInput, loaded.practicalRecipeAudit)).toBe(true);
      useRecipeStore
        .getState()
        .setPlannedGrams(loaded.items[0]!.id, loaded.items[0]!.planned_grams + 1);
      expect(
        practicalRecipeAuditMatchesInput(
          buildRecipeInput(useRecipeStore.getState()),
          useRecipeStore.getState().practicalRecipeAudit,
        ),
      ).toBe(false);
    } finally {
      useRecipeStore.setState(prior);
    }
  });

  it('writes the exact audit returned by Save into the persisted linked draft', () => {
    const prior = useRecipeStore.getState();
    try {
      const practical = practicalizeRecipeCandidate(ownerSameInputRecipe(), { byLineId: {} });
      expect(practical.ok).toBe(true);
      if (!practical.ok) return;
      useRecipeStore.getState().loadRecipeInput(practical.audit.executableInput, {
        savedId: null,
      });
      const current = buildRecipeInput(useRecipeStore.getState());
      const payload = attachPracticalRecipeAudit(
        current,
        practical.audit.exactInput,
        '2026-08-11T12:30:00.000Z',
      );
      const audit = readPracticalRecipeAudit(payload);
      expect(audit).not.toBeNull();
      useRecipeStore
        .getState()
        .markSaved('saved-practical', 'Owner G17', 1, '2026-08-11T12:31:00.000Z', audit);
      const saved = useRecipeStore.getState();
      expect(saved.dirty).toBe(false);
      expect(
        practicalRecipeAuditMatchesInput(buildRecipeInput(saved), saved.practicalRecipeAudit),
      ).toBe(true);
      expect(recipePersistPartialize(saved).practicalRecipeAudit).toEqual(audit);
    } finally {
      useRecipeStore.setState(prior, true);
    }
  });
});

describe('recipe direction target store contract', () => {
  it('uses exact three-state targets and invalidates Preview material state once per move', () => {
    const prior = useRecipeStore.getState();
    try {
      useRecipeStore.setState({
        direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
        direction_targets_active: false,
        dirty: false,
        draftRevision: 70,
      });
      useRecipeStore.getState().moveDirectionTarget('sweetness', 1);
      expect(useRecipeStore.getState()).toMatchObject({
        direction_targets: { sweetness: 1, softness: 0, creaminess: 0, flavor: 0 },
        direction_targets_active: true,
        dirty: true,
        draftRevision: 71,
      });
      useRecipeStore.getState().moveDirectionTarget('sweetness', 1);
      expect(useRecipeStore.getState().direction_targets.sweetness).toBe(1);
      expect(useRecipeStore.getState().draftRevision).toBe(71);
    } finally {
      useRecipeStore.setState(prior, true);
    }
  });
});

describe('formulation strategy store contract', () => {
  it('changes strategy without changing Engine mode and invalidates the draft exactly once', () => {
    const prior = useRecipeStore.getState();
    try {
      useRecipeStore.setState({
        mode: 'classic',
        formulation_strategy: 'optimal',
        dirty: false,
        draftRevision: 40,
      });
      useRecipeStore.getState().setFormulationStrategy('eco');
      const next = useRecipeStore.getState();
      expect(next.formulation_strategy).toBe('eco');
      expect(next.mode).toBe('classic');
      expect(next.dirty).toBe(true);
      expect(next.draftRevision).toBe(41);
    } finally {
      useRecipeStore.setState(prior, true);
    }
  });
});

describe('saved range and availability sidecars', () => {
  it('survives save → reopen with the exact line range and canonical exclusion', () => {
    const priorRecipe = useRecipeStore.getState();
    const priorConstraint = useConstraintStudioStore.getState();
    try {
      useRecipeStore.setState({
        ...priorRecipe,
        items: [],
        excludedIngredientIds: [],
        unavailableMainIngredientIds: [],
        draftRevision: 0,
      });
      useConstraintStudioStore.getState().resetForTests();
      useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 600);
      useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 400);
      const [milk, sucrose] = useRecipeStore.getState().items;
      expect(useConstraintStudioStore.getState().setRangeConstraint(milk!.id, 550, 650).ok).toBe(
        true,
      );
      useRecipeStore.getState().setIngredientUnavailable(sucrose!.id, true);

      const saved = buildRecipeInput(useRecipeStore.getState());
      expect(saved.items.find((item) => item.id === milk!.id)?.range_constraint).toEqual({
        min_grams: 550,
        max_grams: 650,
      });
      expect(saved.goals?.excluded_ingredient_ids).toContain(
        sucrose!.ingredient.canonical_ingredient_id,
      );

      useRecipeStore.getState().loadRecipeInput(structuredClone(saved), {
        savedId: 'range-recipe',
        savedName: 'Zakres',
        versionNumber: 2,
      });
      useConstraintStudioStore.getState().resetDraftSession();
      expect(selectCanonicalDraft().constraints.byLineId[milk!.id]).toEqual({
        mode: 'range',
        minGrams: 550,
        maxGrams: 650,
      });
      expect(useRecipeStore.getState().excludedIngredientIds).toContain(
        sucrose!.ingredient.canonical_ingredient_id,
      );
    } finally {
      useRecipeStore.setState(priorRecipe, true);
      useConstraintStudioStore.setState(priorConstraint, true);
    }
  });
});

describe('saved percentage lock contract', () => {
  it('survives save, reload and immutable version restore after a batch resize', () => {
    const priorRecipe = useRecipeStore.getState();
    const priorConstraint = useConstraintStudioStore.getState();
    try {
      useRecipeStore.setState({ ...priorRecipe, items: [], target_batch_grams: 1000 });
      useConstraintStudioStore.getState().resetForTests();
      useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 130);
      const sucrose = useRecipeStore.getState().items[0]!;
      useConstraintStudioStore.getState().togglePercentLock(sucrose.id);
      useRecipeStore.getState().setBatchGrams(1200);

      const saved = buildRecipeInput(useRecipeStore.getState());
      const version = buildRecipeVersion(
        {
          recipeId: 'percent-recipe',
          ownerUserId: 'owner',
          versionNumber: 1,
          recipeInput: saved,
          trace: { engineVersion: 'test', configVersion: 'test' },
          source: 'manual',
          createdBy: 'owner',
          createdAt: '2026-08-11T00:00:00.000Z',
        },
        'percent-v1',
      );
      useRecipeStore.getState().loadRecipeInput(structuredClone(version.recipeInput));
      expect(useRecipeStore.getState().items[0]).toMatchObject({
        lock_type: 'percent',
        planned_grams: 156,
      });

      const restored = restoreVersion(
        [version],
        1,
        'owner',
        '2026-08-11T00:01:00.000Z',
        'percent-v2',
      );
      expect(restored.recipeInput.items[0]).toMatchObject({
        lock_type: 'percent',
        planned_grams: 156,
      });
      expect(restored.recipeInput.target_batch_grams).toBe(1200);
    } finally {
      useRecipeStore.setState(priorRecipe, true);
      useConstraintStudioStore.setState(priorConstraint, true);
    }
  });

  it.each(['main', 'required', 'already_added'] as const)(
    'persists a % partii sidecar without weakening the %s role through save, reload and version restore',
    (role) => {
      const priorRecipe = useRecipeStore.getState();
      const priorConstraint = useConstraintStudioStore.getState();
      try {
        useRecipeStore.setState({ ...priorRecipe, items: [], target_batch_grams: 1000 });
        useConstraintStudioStore.getState().resetForTests();
        useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 130);
        const line = useRecipeStore.getState().items[0]!;
        useRecipeStore.getState().setLockType(line.id, role);
        useConstraintStudioStore.getState().togglePercentLock(line.id);
        useConstraintStudioStore.getState().resizeBatchGrams(1200);

        const saved = savedToRecipeInput(
          JSON.parse(JSON.stringify(buildRecipeInput(useRecipeStore.getState()))) as unknown,
        );
        expect(saved.items[0]).toMatchObject({
          lock_type: role,
          planned_grams: 156,
          percent_constraint: { percent: 13 },
        });
        const version = buildRecipeVersion(
          {
            recipeId: `percent-${role}`,
            ownerUserId: 'owner',
            versionNumber: 1,
            recipeInput: saved,
            trace: { engineVersion: 'test', configVersion: 'test' },
            source: 'manual',
            createdBy: 'owner',
            createdAt: '2026-08-11T00:00:00.000Z',
          },
          `percent-${role}-v1`,
        );

        useRecipeStore.getState().loadRecipeInput(structuredClone(version.recipeInput), {
          savedId: `percent-${role}`,
          savedName: role,
          versionNumber: 1,
        });
        expect(selectCanonicalDraft().constraints.byLineId[line.id]).toEqual({
          mode: 'percent',
          percent: 13,
        });
        expect(useRecipeStore.getState().items[0]).toMatchObject({
          lock_type: role,
          planned_grams: 156,
          percent_constraint: { percent: 13 },
        });

        const restored = restoreVersion(
          [version],
          1,
          'owner',
          '2026-08-11T00:01:00.000Z',
          `percent-${role}-v2`,
        );
        expect(restored.recipeInput.items[0]).toMatchObject({
          lock_type: role,
          planned_grams: 156,
          percent_constraint: { percent: 13 },
        });
      } finally {
        useRecipeStore.setState(priorRecipe, true);
        useConstraintStudioStore.setState(priorConstraint, true);
      }
    },
  );

  it.each(['main', 'required', 'already_added'] as const)(
    'atomically replaces a %% lock with durable exact grams on a %s role',
    (role) => {
      const priorRecipe = useRecipeStore.getState();
      const priorConstraint = useConstraintStudioStore.getState();
      try {
        useRecipeStore.setState({ ...priorRecipe, items: [], target_batch_grams: 1000 });
        useConstraintStudioStore.getState().resetForTests();
        useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 130);
        const line = useRecipeStore.getState().items[0]!;
        useRecipeStore.getState().setLockType(line.id, role);
        useConstraintStudioStore.getState().togglePercentLock(line.id);
        useConstraintStudioStore.getState().toggleLock(line.id);

        expect(selectCanonicalDraft().constraints.byLineId[line.id]).toEqual({
          mode: 'locked',
          grams: 130,
        });
        expect(useRecipeStore.getState().items[0]).toMatchObject({
          lock_type: role,
          planned_grams: 130,
          grams_constraint: { grams: 130 },
        });
        expect(useRecipeStore.getState().items[0]?.percent_constraint).toBeUndefined();

        useConstraintStudioStore.getState().resizeBatchGrams(1200);
        expect(useRecipeStore.getState().items[0]?.planned_grams).toBe(130);

        const saved = savedToRecipeInput(
          JSON.parse(JSON.stringify(buildRecipeInput(useRecipeStore.getState()))) as unknown,
        );
        const version = buildRecipeVersion(
          {
            recipeId: `grams-${role}`,
            ownerUserId: 'owner',
            versionNumber: 1,
            recipeInput: saved,
            trace: { engineVersion: 'test', configVersion: 'test' },
            source: 'manual',
            createdBy: 'owner',
            createdAt: '2026-08-11T00:00:00.000Z',
          },
          `grams-${role}-v1`,
        );

        useRecipeStore.getState().loadRecipeInput(structuredClone(version.recipeInput));
        expect(selectCanonicalDraft().constraints.byLineId[line.id]).toEqual({
          mode: 'locked',
          grams: 130,
        });
        expect(useRecipeStore.getState().items[0]).toMatchObject({
          lock_type: role,
          planned_grams: 130,
          grams_constraint: { grams: 130 },
        });

        const restored = restoreVersion(
          [version],
          1,
          'owner',
          '2026-08-11T00:01:00.000Z',
          `grams-${role}-v2`,
        );
        expect(restored.recipeInput.items[0]).toMatchObject({
          lock_type: role,
          planned_grams: 130,
          grams_constraint: { grams: 130 },
        });
      } finally {
        useRecipeStore.setState(priorRecipe, true);
        useConstraintStudioStore.setState(priorConstraint, true);
      }
    },
  );

  it.each(['main', 'required', 'already_added'] as const)(
    'persists a direct exact-grams lock on a %s role after reopen',
    (role) => {
      const priorRecipe = useRecipeStore.getState();
      const priorConstraint = useConstraintStudioStore.getState();
      try {
        useRecipeStore.setState({ ...priorRecipe, items: [], target_batch_grams: 1000 });
        useConstraintStudioStore.getState().resetForTests();
        useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 130);
        const line = useRecipeStore.getState().items[0]!;
        useRecipeStore.getState().setLockType(line.id, role);
        useConstraintStudioStore.getState().toggleLock(line.id);

        const saved = savedToRecipeInput(
          JSON.parse(JSON.stringify(buildRecipeInput(useRecipeStore.getState()))) as unknown,
        );
        useRecipeStore.getState().loadRecipeInput(saved);

        expect(selectCanonicalDraft().constraints.byLineId[line.id]).toEqual({
          mode: 'locked',
          grams: 130,
        });
        expect(useRecipeStore.getState().items[0]).toMatchObject({
          lock_type: role,
          grams_constraint: { grams: 130 },
        });
      } finally {
        useRecipeStore.setState(priorRecipe, true);
        useConstraintStudioStore.setState(priorConstraint, true);
      }
    },
  );

  it('persists an explicit Multi-Main ratio independently from grams and exact locks', () => {
    const priorRecipe = useRecipeStore.getState();
    const priorConstraint = useConstraintStudioStore.getState();
    try {
      useRecipeStore.setState({ ...priorRecipe, items: [], target_batch_grams: 1000 });
      useConstraintStudioStore.getState().resetForTests();
      useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 200);
      const line = useRecipeStore.getState().items[0]!;
      useRecipeStore.getState().setLockType(line.id, 'main');
      useRecipeStore.getState().setMainRatioWeight(line.id, 2);
      useConstraintStudioStore.getState().toggleLock(line.id);

      const saved = savedToRecipeInput(
        JSON.parse(JSON.stringify(buildRecipeInput(useRecipeStore.getState()))) as unknown,
      );
      expect(saved.items[0]).toMatchObject({
        lock_type: 'main',
        main_ratio_weight: 2,
        grams_constraint: { grams: 200 },
      });

      useRecipeStore.getState().loadRecipeInput(saved);
      expect(useRecipeStore.getState().items[0]).toMatchObject({
        lock_type: 'main',
        main_ratio_weight: 2,
        grams_constraint: { grams: 200 },
      });
      expect(selectCanonicalDraft().constraints.byLineId[line.id]).toEqual({
        mode: 'locked',
        grams: 200,
      });

      useRecipeStore.getState().setStandardIngredient(line.id);
      expect(useRecipeStore.getState().items[0]).toMatchObject({
        lock_type: 'grams',
        grams_constraint: { grams: 200 },
      });
      expect(useRecipeStore.getState().items[0]?.main_ratio_weight).toBeUndefined();
      expect(selectCanonicalDraft().constraints.byLineId[line.id]).toEqual({
        mode: 'locked',
        grams: 200,
      });

      // Removing the crown is deliberately independent from the exact grams
      // lock. It also retires the Main-only ratio metadata.
      expect(useRecipeStore.getState().items[0]?.main_ratio_weight).toBeUndefined();
    } finally {
      useRecipeStore.setState(priorRecipe, true);
      useConstraintStudioStore.setState(priorConstraint, true);
    }
  });

  it('restores canonical percentage grams after the batch field is cleared and re-entered', () => {
    const priorRecipe = useRecipeStore.getState();
    const priorConstraint = useConstraintStudioStore.getState();
    try {
      useRecipeStore.setState({ ...priorRecipe, items: [], target_batch_grams: 1000 });
      useConstraintStudioStore.getState().resetForTests();
      useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 130);
      const line = useRecipeStore.getState().items[0]!;
      useConstraintStudioStore.getState().togglePercentLock(line.id);

      useConstraintStudioStore.getState().resizeBatchGrams(0);
      expect(useRecipeStore.getState().items[0]!.planned_grams).toBe(130);
      useConstraintStudioStore.getState().resizeBatchGrams(1200);

      expect(useRecipeStore.getState().items[0]).toMatchObject({
        lock_type: 'percent',
        planned_grams: 156,
        percent_constraint: { percent: 13 },
      });
      expect(selectCanonicalDraft().constraints.byLineId[line.id]).toEqual({
        mode: 'percent',
        percent: 13,
      });
    } finally {
      useRecipeStore.setState(priorRecipe, true);
      useConstraintStudioStore.setState(priorConstraint, true);
    }
  });
});

describe('ingredient-table draft isolation', () => {
  it('drops unresolved Required metadata when another recipe is opened', () => {
    const priorRecipe = useRecipeStore.getState();
    const priorUx = useIngredientTableUxStore.getState();
    try {
      useIngredientTableUxStore.getState().markRequiredRemoved('recipe-a-line', 'Private A');
      expect(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).not.toEqual({});

      useRecipeStore.getState().loadRecipeInput(buildRecipeInput(priorRecipe), {
        savedId: 'recipe-b',
        savedName: 'Recipe B',
        versionNumber: 1,
      });

      expect(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).toEqual({});
      expect(useIngredientTableUxStore.getState().metaByLineId).toEqual({});
    } finally {
      useRecipeStore.setState(priorRecipe, true);
      useIngredientTableUxStore.setState(priorUx, true);
    }
  });
});
