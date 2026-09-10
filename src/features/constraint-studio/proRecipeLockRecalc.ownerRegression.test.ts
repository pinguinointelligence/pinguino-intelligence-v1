// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { OWNER_MAPPER_INGREDIENTS } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import { classifyViolationBands } from '@/features/formulation/violationBands';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildOptimizePreview, plannedSum, workingStateFingerprint } from './applyPipeline';
import { selectCanonicalDraft, useConstraintStudioStore } from './constraintStudioStore';

const OWNER_GRAMS = {
  milk: 672,
  cream: 130,
  smp: 35,
  sucrose: 130,
  dextrose: 30,
  tara: 3,
} as const;

const ownerRecipe = (targetBatchGrams = 1_000): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: targetBatchGrams,
  machine_capacity_grams: null,
  items: [
    ['milk', OWNER_MAPPER_INGREDIENTS.milk_3_5, OWNER_GRAMS.milk],
    ['cream', OWNER_MAPPER_INGREDIENTS.cream_30, OWNER_GRAMS.cream],
    ['smp', OWNER_MAPPER_INGREDIENTS.smp, OWNER_GRAMS.smp],
    ['sucrose', OWNER_MAPPER_INGREDIENTS.sucrose, OWNER_GRAMS.sucrose],
    ['dextrose', OWNER_MAPPER_INGREDIENTS.dextrose, OWNER_GRAMS.dextrose],
    ['tara', OWNER_MAPPER_INGREDIENTS.tara_gum, OWNER_GRAMS.tara],
  ].map(([id, ingredient, grams]) => ({
    id: String(id),
    ingredient:
      ingredient as (typeof OWNER_MAPPER_INGREDIENTS)[keyof typeof OWNER_MAPPER_INGREDIENTS],
    planned_grams: Number(grams),
    actual_grams: null,
    lock_type: 'unlocked' as const,
  })),
  goals: {
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    formulation_strategy: 'optimal',
    direction_targets_active: true,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
});

const loadOwnerRecipe = (targetBatchGrams = 1_000) => {
  useRecipeStore.getState().loadRecipeInput(ownerRecipe(targetBatchGrams));
};

const lineIds = () => useRecipeStore.getState().items.map((item) => item.id);
const lockAll = () => {
  for (const lineId of lineIds()) useConstraintStudioStore.getState().toggleLock(lineId);
};
const unlockAll = () => {
  for (const lineId of lineIds()) useConstraintStudioStore.getState().toggleLock(lineId);
};

beforeEach(() => {
  localStorage.clear();
  useRecipeStore.getState().resetToDemo();
  useConstraintStudioStore.getState().resetForTests();
  loadOwnerRecipe();
});

describe('Owner PRO lock → unlock → Przelicz regression', () => {
  it('unlocked → lock → unlock leaves the canonical lock_type and sidecar unlocked', () => {
    const lineId = 'milk';
    expect(useRecipeStore.getState().items.find((item) => item.id === lineId)?.lock_type).toBe(
      'unlocked',
    );

    useConstraintStudioStore.getState().toggleLock(lineId);
    expect(useRecipeStore.getState().items.find((item) => item.id === lineId)).toMatchObject({
      lock_type: 'grams',
      grams_constraint: { grams: OWNER_GRAMS.milk },
    });
    expect(useConstraintStudioStore.getState().constraints.byLineId[lineId]).toEqual({
      mode: 'locked',
      grams: OWNER_GRAMS.milk,
    });

    useConstraintStudioStore.getState().toggleLock(lineId);
    expect(useRecipeStore.getState().items.find((item) => item.id === lineId)).toMatchObject({
      lock_type: 'unlocked',
    });
    expect(
      useRecipeStore.getState().items.find((item) => item.id === lineId)?.grams_constraint,
    ).toBeUndefined();
    expect(useConstraintStudioStore.getState().constraints.byLineId[lineId]).toBeUndefined();
  });

  it('lock all → unlock all → Przelicz consumes six unlocked solver lines', () => {
    lockAll();
    expect(selectCanonicalDraft().input.items.every((item) => item.lock_type === 'grams')).toBe(
      true,
    );

    unlockAll();
    const draft = selectCanonicalDraft();
    expect(draft.constraints.byLineId).toEqual({});
    expect(
      draft.input.items.map((item) => [
        item.id,
        item.lock_type,
        item.grams_constraint ?? null,
        item.percent_constraint ?? null,
        item.range_constraint ?? null,
      ]),
    ).toEqual(lineIds().map((lineId) => [lineId, 'unlocked', null, null, null]));

    const result = buildOptimizePreview(draft.input, draft.constraints, 'owner-lock-unlock-1000');
    if (result.ok) {
      expect(
        result.preview.proposedInput.items.every((item) => item.lock_type === 'unlocked'),
      ).toBe(true);
      expect(result.preview.proposedInput.target_batch_grams).toBe(1_000);
    } else {
      expect(result.code).toBe('already_clean');
    }
  });

  it('a 670 g canonical target independently reproduces a 670 g proposal after all locks clear', () => {
    loadOwnerRecipe(670);
    lockAll();
    unlockAll();
    const draft = selectCanonicalDraft();

    expect(plannedSum(draft.input)).toBe(1_000);
    expect(draft.input.target_batch_grams).toBe(670);
    expect(draft.constraints.byLineId).toEqual({});
    expect(draft.input.items.every((item) => item.lock_type === 'unlocked')).toBe(true);

    const result = buildOptimizePreview(
      draft.input,
      draft.constraints,
      'owner-lock-unlock-stale-670',
    );
    expect(result.ok, result.ok ? '' : JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(plannedSum(result.preview.proposedInput)).toBe(670);
    expect(result.preview.proposedInput.target_batch_grams).toBe(670);
    expect(
      result.preview.proposedInput.items.find((item) => item.id === 'milk')?.planned_grams,
    ).not.toBe(OWNER_GRAMS.milk);
  });

  it('classifies the screenshot 670 g vector independently from the valid 1000 g vector', () => {
    const screenshotGrams = [419, 67, 30, 120, 31, 3];
    const screenshotCandidate: RecipeInput = {
      ...ownerRecipe(670),
      items: ownerRecipe(670).items.map((item, index) => ({
        ...item,
        planned_grams: screenshotGrams[index]!,
      })),
    };

    expect(plannedSum(screenshotCandidate)).toBe(670);
    expect(classifyViolationBands(screenshotCandidate).hardMetrics).toEqual(
      expect.arrayContaining(['ice_fraction', 'npac', 'pod']),
    );
    expect(classifyViolationBands(ownerRecipe()).hardMetrics).toEqual([]);
  });

  it('locking one line constrains only that line', () => {
    useConstraintStudioStore.getState().toggleLock('tara');
    const draft = selectCanonicalDraft();
    expect(draft.constraints.byLineId).toEqual({ tara: { mode: 'locked', grams: 3 } });
    expect(
      draft.input.items.filter(
        (item) => item.lock_type === 'grams' || item.grams_constraint !== undefined,
      ),
    ).toHaveLength(1);
  });

  it('unlocking a previously locked line makes it movable on the next 670 g recalculation', () => {
    loadOwnerRecipe(670);
    useConstraintStudioStore.getState().toggleLock('milk');
    useConstraintStudioStore.getState().toggleLock('milk');
    const draft = selectCanonicalDraft();
    const result = buildOptimizePreview(draft.input, draft.constraints, 'owner-unlocked-movable');
    expect(result.ok, result.ok ? '' : JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const movedMilk = result.preview.proposedInput.items.find((item) => item.id === 'milk');
    expect(movedMilk?.lock_type).toBe('unlocked');
    expect(movedMilk?.planned_grams).not.toBe(OWNER_GRAMS.milk);
  });

  it('repeated lock/unlock cycles leave no stale lock authority', () => {
    for (let cycle = 0; cycle < 5; cycle += 1) {
      lockAll();
      unlockAll();
    }
    const draft = selectCanonicalDraft();
    expect(draft.constraints.byLineId).toEqual({});
    expect(draft.input.items.every((item) => item.lock_type === 'unlocked')).toBe(true);
    expect(draft.input.items.every((item) => item.grams_constraint === undefined)).toBe(true);
  });

  it('every lock toggle advances revision and changes the canonical fingerprint', () => {
    const before = selectCanonicalDraft();
    const beforeFingerprint = workingStateFingerprint(before.input, before.constraints);
    useConstraintStudioStore.getState().toggleLock('milk');
    const locked = selectCanonicalDraft();
    expect(locked.revision).toBeGreaterThan(before.revision);
    expect(workingStateFingerprint(locked.input, locked.constraints)).not.toBe(beforeFingerprint);

    useConstraintStudioStore.getState().toggleLock('milk');
    const unlocked = selectCanonicalDraft();
    expect(unlocked.revision).toBeGreaterThan(locked.revision);
    expect(workingStateFingerprint(unlocked.input, unlocked.constraints)).toBe(beforeFingerprint);
  });

  it('a lock edit invalidates an old Preview immediately', () => {
    loadOwnerRecipe(670);
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    useConstraintStudioStore.getState().toggleLock('tara');
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toBeNull();
  });

  it('save/reopen preserves only the final intended lock state', () => {
    lockAll();
    unlockAll();
    useConstraintStudioStore.getState().toggleLock('tara');
    const saved = structuredClone(buildRecipeInput(useRecipeStore.getState()));

    useRecipeStore.getState().loadRecipeInput(saved, {
      savedId: 'owner-lock-final',
      savedName: 'Owner lock final',
    });
    const reopened = selectCanonicalDraft();
    expect(reopened.constraints.byLineId).toEqual({ tara: { mode: 'locked', grams: 3 } });
    expect(reopened.input.items.map((item) => [item.id, item.lock_type])).toEqual([
      ['milk', 'unlocked'],
      ['cream', 'unlocked'],
      ['smp', 'unlocked'],
      ['sucrose', 'unlocked'],
      ['dextrose', 'unlocked'],
      ['tara', 'grams'],
    ]);
  });
});
