import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type EffectiveRecipeItem,
  type EngineIngredient,
  type RecipeInput,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { IngredientRow } from '@/features/ingredient-builder/IngredientRow';
import {
  buildBatchRescalePreview,
  buildOptimizePreview,
  buildSuggestedFixPreview,
  commitPreview,
  directionTargetFingerprint,
  findCanonicalDuplicateIngredients,
  plannedSum,
  workingStateFingerprint,
  type ConstraintPreview,
} from '@/features/constraint-studio/applyPipeline';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';

const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  canonical_ingredient_id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};

const BANANA: EngineIngredient = {
  ...findDemoIngredient('banana')!,
  id: 'PI-ING-000345',
  canonical_ingredient_id: 'PI-ING-000345',
  name: 'BANANA · Fresh Fruit',
  category: 'fruit',
};

const PISTACHIO: EngineIngredient = {
  ...findDemoIngredient('pistachio_paste')!,
  canonical_ingredient_id: 'pistachio_paste',
};

const line = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  lock_type: RecipeInput['items'][number]['lock_type'] = 'main',
) => ({ id, ingredient, planned_grams: grams, actual_grams: null, lock_type });

const ownerInput = (
  bananaGrams = 100,
  strawberryGrams = 100,
  extra: RecipeInput['items'] = [],
  batch = 1000,
): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -13,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items: [line('line-banana', BANANA, bananaGrams), line('line-strawberry', STRAWBERRIES, strawberryGrams), ...extra],
});

const NO = { byLineId: {} };

beforeEach(() => {
  useConstraintStudioStore.getState().resetForTests();
  useRecipeStore.setState({
    mode: 'classic',
    category: 'milk_gelato',
    visibleProductType: 'gelato',
    target_temperature_c: -13,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    machine_capacity_source: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    items: [],
    excludedIngredientIds: [],
    unavailableMainIngredientIds: [],
  });
});

describe('multi-main role is a set in the canonical recipe draft', () => {
  it('marking a second line Main never demotes the first; demoting one changes only that line', () => {
    useRecipeStore.setState({
      items: [line('line-banana', BANANA, 100, 'unlocked'), line('line-strawberry', STRAWBERRIES, 100, 'unlocked')],
    });

    useRecipeStore.getState().setMainIngredient('line-banana');
    useRecipeStore.getState().setMainIngredient('line-strawberry');
    expect(useRecipeStore.getState().items.map((item) => item.lock_type)).toEqual(['main', 'main']);

    useRecipeStore.getState().setLockType('line-banana', 'unlocked');
    expect(useRecipeStore.getState().items.map((item) => item.lock_type)).toEqual(['unlocked', 'main']);
  });

  it('renders the existing crown for every Main line without redesigning it', () => {
    const actions = {
      setPlannedGrams: () => undefined,
      setActualGrams: () => undefined,
      setLockType: () => undefined,
      setMainIngredient: () => undefined,
      removeItem: () => undefined,
    };
    const render = (item: RecipeInput['items'][number]) =>
      renderToStaticMarkup(
        <IngredientRow
          item={{ ...item, effective_grams: item.planned_grams, difference: 0, is_actual: false } as EffectiveRecipeItem}
          totalBatchG={200}
          actions={actions}
        />,
      );
    expect(render(line('line-banana', BANANA, 100))).toContain('Składnik główny');
    expect(render(line('line-strawberry', STRAWBERRIES, 100))).toContain('Składnik główny');
  });
});

describe('owner runtime fixtures — identity and ratio are hard formulation intent', () => {
  it('permanently forbids the observed 100/100 → 0/0 and 0/positive applicable proposal', () => {
    const before = ownerInput();
    const runtime = buildOptimizePreview(before, NO, '2026-08-08T00:00:00.000Z');
    expect(runtime.ok).toBe(true);
    if (runtime.ok) {
      expect(runtime.preview.diagnosticOnly).toBe(false);
      expect(runtime.preview.formulation?.proof?.verdict).toBe('all_bands_in_range');
      expect(runtime.preview.violationsAfter).toBe(0);
    }
    const after = runtime.ok ? runtime.preview.proposedInput : null;
    if (after === null) return; // an honest infeasible stop is allowed

    const banana = after.items.find((item) => item.id === 'line-banana');
    const strawberry = after.items.find((item) => item.id === 'line-strawberry');
    expect(banana).toBeDefined();
    expect(strawberry).toBeDefined();
    expect(banana!.lock_type).toBe('main');
    expect(strawberry!.lock_type).toBe('main');
    expect(banana!.planned_grams).toBeGreaterThan(0);
    expect(strawberry!.planned_grams).toBeGreaterThan(0);
    expect(banana!.planned_grams / strawberry!.planned_grams).toBeCloseTo(1, 8);
    expect(findCanonicalDuplicateIngredients(after)).toEqual([]);
    expect(Math.abs(plannedSum(after) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('preserves a 2:1 Main ratio or stops honestly', () => {
    const runtime = buildOptimizePreview(ownerInput(200, 100), NO, '2026-08-08T00:00:00.000Z');
    expect(runtime.ok).toBe(true);
    if (runtime.ok) {
      expect(runtime.preview.diagnosticOnly).toBe(false);
      expect(runtime.preview.formulation?.proof?.verdict).toBe('all_bands_in_range');
      expect(runtime.preview.violationsAfter).toBe(0);
    }
    const after = runtime.ok ? runtime.preview.proposedInput : null;
    if (after === null) return;
    const banana = after.items.find((item) => item.id === 'line-banana')!;
    const strawberry = after.items.find((item) => item.id === 'line-strawberry')!;
    expect(banana.planned_grams).toBeGreaterThan(0);
    expect(strawberry.planned_grams).toBeGreaterThan(0);
    expect(banana.planned_grams / strawberry.planned_grams).toBeCloseTo(2, 8);
  });

  it('preserves three positive Main identities and their 1:1:1 ratio', () => {
    const result = buildOptimizePreview(
      ownerInput(100, 100, [line('line-pistachio', PISTACHIO, 100)]),
      NO,
      '2026-08-08T00:00:00.000Z',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.preview.proposedInput;
    const mains = ['line-banana', 'line-strawberry', 'line-pistachio'].map(
      (id) => after.items.find((item) => item.id === id)!,
    );
    expect(mains.every((item) => item && item.lock_type === 'main' && item.planned_grams > 0)).toBe(true);
    expect(mains[0]!.planned_grams / mains[1]!.planned_grams).toBeCloseTo(1, 8);
    expect(mains[1]!.planned_grams / mains[2]!.planned_grams).toBeCloseTo(1, 8);
  });

  it('returns an explicit conflict for a Main-ratio + exact-lock batch impossibility', () => {
    const input = ownerInput(500, 500, [], 800);
    const result = buildOptimizePreview(
      input,
      { byLineId: { 'line-banana': { mode: 'locked', grams: 500 } } },
      '2026-08-08T00:00:00.000Z',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result as { code: string }).code).toBe('main_ratio_conflict');
  });

  it('honors a compatible Main range without drifting the group ratio', () => {
    const result = buildOptimizePreview(
      ownerInput(100, 100),
      { byLineId: { 'line-banana': { mode: 'range', minGrams: 100, maxGrams: 250 } } },
      '2026-08-08T00:00:00.000Z',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const banana = result.preview.proposedInput.items.find((item) => item.id === 'line-banana')!;
    const strawberry = result.preview.proposedInput.items.find(
      (item) => item.id === 'line-strawberry',
    )!;
    expect(banana.planned_grams).toBeGreaterThanOrEqual(100);
    expect(banana.planned_grams).toBeLessThanOrEqual(250);
    expect(banana.planned_grams / strawberry.planned_grams).toBeCloseTo(1, 8);
  });

  it('combines Direction with 2:1 Multi-Main and a range constraint', () => {
    const input: RecipeInput = {
      ...ownerInput(200, 100),
      goals: {
        direction_targets: {
          sweetness: 1,
          softness: 1,
          creaminess: 0,
          flavor: 0,
        },
        direction_targets_active: true,
      },
    };
    const constraints = {
      byLineId: {
        'line-banana': { mode: 'range' as const, minGrams: 160, maxGrams: 300 },
      },
    };
    const result = buildOptimizePreview(input, constraints, '2026-08-10T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.preview.proposedInput;
    const banana = after.items.find((item) => item.id === 'line-banana')!;
    const strawberry = after.items.find((item) => item.id === 'line-strawberry')!;

    expect(detectViolations(calculateRecipe(after))).toEqual([]);
    expect(banana.planned_grams / strawberry.planned_grams).toBeCloseTo(2, 8);
    expect(banana.planned_grams).toBeGreaterThanOrEqual(160);
    expect(banana.planned_grams).toBeLessThanOrEqual(300);

    const assessment = result.preview.directionAssessment;
    const consent =
      assessment?.reached === false
        ? {
            baseFingerprint: result.preview.baseFingerprint,
            targetFingerprint: directionTargetFingerprint(input),
            candidateFingerprint: workingStateFingerprint(
              result.preview.proposedInput,
              result.preview.nextConstraints,
            ),
          }
        : null;
    expect(
      commitPreview(
        input,
        constraints,
        result.preview,
        '2026-08-10T00:01:00.000Z',
        'direction-multi-main-locks',
        [],
        undefined,
        null,
        null,
        consent,
      ).ok,
    ).toBe(true);
  });

  it('batch reconciliation preserves a free Main ratio and rejects an exact-lock drift', () => {
    const free = buildBatchRescalePreview(ownerInput(100, 100, [], 200), NO, 400, 'now');
    expect(free.ok).toBe(true);
    if (free.ok) {
      const [banana, strawberry] = free.preview.proposedInput.items;
      expect(banana!.planned_grams / strawberry!.planned_grams).toBeCloseTo(1, 8);
    }

    const conflict = buildBatchRescalePreview(
      ownerInput(100, 100, [], 200),
      { byLineId: { 'line-banana': { mode: 'locked', grams: 100 } } },
      300,
      'now',
    );
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.code).toBe('main_ratio_conflict');
  });

  it('suggested fixes cannot silently rewrite a positive Main ratio', () => {
    const result = buildSuggestedFixPreview(
      ownerInput(100, 100, [], 200),
      NO,
      { type: 'set_min', lineId: 'line-banana', grams: 150 },
      'now',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('main_ratio_conflict');
  });

  it('production actuals remain authoritative and never make a Main line adjustable', () => {
    const input = ownerInput();
    input.items[0] = { ...input.items[0]!, actual_grams: 100 };
    const result = buildOptimizePreview(input, NO, '2026-08-08T00:00:00.000Z');
    if (!result.ok) {
      expect([
        'already_clean',
        'no_proposal',
        'unsafe_proposal',
        'best_safe_result',
      ]).toContain(result.code);
      return; // an honest no-proposal/diagnostic stop is allowed
    }
    const banana = result.preview.proposedInput.items.find((item) => item.id === 'line-banana')!;
    expect(banana.actual_grams).toBe(100);
    expect(banana.planned_grams).toBe(100);
    expect(banana.lock_type).toBe('main');
  });
});

describe('persistence, Apply and Undo boundaries', () => {
  it('save, reopen and version restore preserve roles, stable lines and canonical ids', () => {
    const saved = JSON.parse(JSON.stringify(ownerInput())) as RecipeInput;
    useRecipeStore.getState().loadRecipeInput(saved, {
      savedId: 'multi-main-owner',
      savedName: 'Banana + Strawberry',
      versionNumber: 3,
    });
    const reopened = buildRecipeInput(useRecipeStore.getState());
    expect(
      reopened.items.map((item) => [
        item.id,
        item.ingredient.canonical_ingredient_id,
        item.lock_type,
      ]),
    ).toEqual([
      ['line-banana', 'PI-ING-000345', 'main'],
      ['line-strawberry', 'PI-ING-001553', 'main'],
    ]);
    expect(useRecipeStore.getState().currentVersionNumber).toBe(3);
  });

  it('real Preview → Apply → Undo preserves and then restores the exact Main set', () => {
    useRecipeStore.getState().loadRecipeInput(ownerInput());
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();

    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    const appliedMains = useRecipeStore
      .getState()
      .items.filter((item) => item.lock_type === 'main');
    expect(appliedMains.map((item) => item.id)).toEqual(['line-banana', 'line-strawberry']);
    expect(appliedMains[0]!.planned_grams / appliedMains[1]!.planned_grams).toBeCloseTo(1, 8);

    useConstraintStudioStore.getState().undoLastApply();
    const restored = useRecipeStore.getState().items;
    expect(restored.map((item) => [item.id, item.planned_grams, item.lock_type])).toEqual([
      ['line-banana', 100, 'main'],
      ['line-strawberry', 100, 'main'],
    ]);
  });

  it('Main + unavailable stops explicitly until that canonical ingredient is re-added', () => {
    useRecipeStore.getState().loadRecipeInput(ownerInput());
    useRecipeStore.getState().markIngredientUnavailable('line-banana');
    expect(useRecipeStore.getState().items.map((item) => item.id)).toEqual(['line-strawberry']);
    expect(useRecipeStore.getState().unavailableMainIngredientIds).toEqual([
      BANANA.canonical_ingredient_id,
    ]);

    useConstraintStudioStore.getState().createOptimizePreview();
    const stopped = useConstraintStudioStore.getState().previewIssue;
    expect(stopped?.code).toBe('main_ingredient_unavailable');
    expect(useConstraintStudioStore.getState().preview).toBeNull();

    useRecipeStore.getState().addIngredient(BANANA, 100);
    expect(useRecipeStore.getState().unavailableMainIngredientIds).toEqual([]);
    expect(
      useRecipeStore.getState().items.find((item) => item.ingredient.id === BANANA.id)?.lock_type,
    ).toBe('main');
  });

  it('the trustless Apply door rejects a forged proposal that removes Main identity', () => {
    const current = ownerInput();
    const forgedInput: RecipeInput = {
      ...current,
      items: current.items.map((item, index) =>
        index === 0 ? { ...item, planned_grams: 0, lock_type: 'unlocked' } : item,
      ),
    };
    const forged: ConstraintPreview = {
      kind: 'batch_rescale',
      titlePl: 'forged',
      baseFingerprint: workingStateFingerprint(current, NO),
      proposedInput: forgedInput,
      nextConstraints: NO,
      lines: [],
      violationsBefore: 0,
      violationsAfter: 0,
      explanation: [],
      engineVersion: '0.4.0',
      configVersion: '0.7.0',
      createdAt: 'now',
      outcomeClassification: {
        outcome: 'no_verified_change',
        batchReconciled: false,
        compositionUnchanged: false,
        engineImproved: false,
        beforeGrams: 200,
        afterGrams: 100,
        targetBatchGrams: 1000,
        violationsBefore: 0,
        violationsAfter: 0,
      },
    };
    const result = commitPreview(current, NO, forged, 'now', 'change-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The universal line-contract gate now rejects the forged lock transition
    // before the later Main-specific identity gate can run.
    expect((result as { code: string }).code).toBe('physical_actual_violated');
  });
});
