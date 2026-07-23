/**
 * FORMULATION APPLY DATA INTEGRITY (owner P0 — the 0.0 g corruption).
 *
 * The owner's exact proposal (STRAWBERRIES/Milk/Cream/SMP/Sucrose/Dextrose/
 * Tara, differentiated grams, 1000 g) must reach the working draft BYTE-FOR-
 * BYTE. Every zeroing path is structurally blocked: per-line validation,
 * independent batch recompute at the guarded store API, atomic write with
 * read-back rollback, stale protection, exact Undo.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useConstraintStudioStore } from './constraintStudioStore';
import { constraintStudioCopy } from './constraintStudioCopy';

/** STRAWBERRIES · Fresh Fruit shaped like the live Mapper row. */
const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};

const seedOwnerDraft = () => {
  useRecipeStore.setState({
    mode: 'classic',
    category: 'milk_gelato',
    visibleProductType: 'gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    items: [],
    excludedIngredientIds: [],
  });
  useConstraintStudioStore.getState().resetForTests();
  useRecipeStore.getState().setVisibleProductType('gelato');
  useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
  useRecipeStore.getState().addIngredient(STRAWBERRIES, 0);
};

const storeRows = () =>
  useRecipeStore.getState().items.map((i) => [i.ingredient.id, i.planned_grams] as const);
const storeSum = () => useRecipeStore.getState().items.reduce((a, i) => a + i.planned_grams, 0);

beforeEach(seedOwnerDraft);

describe('PHASE 10 — the exact owner fixture: Preview grams reach the store byte-for-byte', () => {
  it('preview → apply: same stable IDs, same grams, 1000 g, no zeros, no duplicates (tests 2/4/5/6/7/15)', () => {
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    if (!preview) return;
    const previewRows = preview.proposedInput.items.map(
      (i) => [i.ingredient.id, i.planned_grams] as const,
    );
    // the preview really is the owner's differentiated 7-row 1000 g proposal
    expect(previewRows.length).toBe(7);
    expect(previewRows.every(([, g]) => g > 0)).toBe(true);

    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    // BYTE-FOR-BYTE: identical ids and Object.is-identical grams
    const applied = storeRows();
    expect(applied.length).toBe(previewRows.length);
    for (let i = 0; i < applied.length; i += 1) {
      expect(applied[i]![0]).toBe(previewRows[i]![0]);
      expect(Object.is(applied[i]![1], previewRows[i]![1])).toBe(true);
    }
    expect(Math.abs(storeSum() - 1000)).toBeLessThanOrEqual(0.1);
    expect(applied.some(([, g]) => g === 0)).toBe(false); // test 1/6 — no zeroing
    expect(new Set(applied.map(([id]) => id)).size).toBe(applied.length);
  });

  it('Undo restores the exact pre-Apply draft; save/reopen preserves applied values (tests 18/19)', () => {
    const before = JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items);
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    const appliedSnapshot = JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items);
    useConstraintStudioStore.getState().undoLastApply();
    expect(JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items)).toBe(before);
    // re-apply → save/reopen keeps the exact applied values
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    const saved = buildRecipeInput(useRecipeStore.getState());
    useRecipeStore.getState().loadRecipeInput(saved, { savedId: 'r-int', savedName: 'I' });
    expect(JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items)).toBe(appliedSnapshot);
  });

  it('stale Preview is blocked after an edit (test 17)', () => {
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    // the user edits AFTER preview → source revision no longer matches
    const first = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(first.id, 5);
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('stale_preview');
    expect(storeSum()).toBe(5); // recipe untouched apart from the user's own edit
  });
});

describe('PHASE 5/6/7 — the guarded store API rejects every corruption shape', () => {
  const validInput = (): RecipeInput => buildRecipeInput(useRecipeStore.getState());

  const corrupt = (mutate: (input: RecipeInput) => RecipeInput) => {
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    const before = JSON.stringify(storeRows()); // the applied, healthy draft
    const base = validInput();
    const result = useRecipeStore.getState().applyVerifiedRecipeInput(mutate(structuredClone(base)));
    return { result, before };
  };

  it('NaN grams block the write and nothing changes (test 10)', () => {
    const { result, before } = corrupt((input) => {
      input.items[0]!.planned_grams = Number.NaN;
      return input;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_line');
    expect(JSON.stringify(storeRows())).toBe(before);
  });

  it('negative grams block the write (test 11)', () => {
    const { result } = corrupt((input) => {
      input.items[0]!.planned_grams = -5;
      return input;
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.code === 'invalid_line') {
      expect(constraintStudioCopy.applyGuard.invalidLine('X')).toContain(
        'brakuje prawidłowej gramatury dla składnika',
      );
    }
  });

  it('missing grams (undefined) block the write — never coerced to zero (tests 1/9)', () => {
    const { result } = corrupt((input) => {
      (input.items[0] as { planned_grams?: number }).planned_grams = undefined;
      return input;
    });
    expect(result.ok).toBe(false);
  });

  it('the OWNER CORRUPTION SHAPE — all grams zeroed (total 0.0 g) — is STRUCTURALLY unwritable (tests 13/14)', () => {
    const { result, before } = corrupt((input) => {
      input.items = input.items.map((item) => ({ ...item, planned_grams: 0 }));
      return input;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('batch_mismatch');
    expect(JSON.stringify(storeRows())).toBe(before); // draft untouched
    expect(constraintStudioCopy.applyGuard.batchMismatch(0, 1000)).toContain(
      'Receptura nie została zmieniona.',
    );
  });

  it('a missing stable id blocks the write (test 8)', () => {
    const { result } = corrupt((input) => {
      (input.items[0]!.ingredient as { id: string }).id = '';
      return input;
    });
    expect(result.ok).toBe(false);
  });

  it('an intentional explicit zero on ONE line applies when the batch still balances (test 12)', () => {
    // 7-row applied draft: zero one line, move its grams onto another → valid.
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    const input = structuredClone(validInput());
    const moved = input.items[2]!.planned_grams;
    input.items[2]!.planned_grams = 0;
    input.items[0]!.planned_grams += moved;
    const result = useRecipeStore.getState().applyVerifiedRecipeInput(input);
    expect(result.ok).toBe(true);
    const rows = storeRows();
    expect(rows[2]![1]).toBe(0); // only its own line
    expect(rows.filter(([, g]) => g === 0).length).toBe(1);
    expect(Math.abs(storeSum() - 1000)).toBeLessThanOrEqual(0.1);
  });
});

describe('PHASE 11 — all apply result types still work through the guarded write', () => {
  it('constrained formulation with an exact lock (500 g milk) applies byte-exact', () => {
    const milkLine = useRecipeStore.getState().items.find((i) => i.ingredient.id === 'milk_3_5')!;
    useRecipeStore.getState().setPlannedGrams(milkLine.id, 500);
    useConstraintStudioStore.getState().toggleLock(milkLine.id);
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    const milk = useRecipeStore.getState().items.find((i) => i.id === milkLine.id)!;
    expect(Object.is(milk.planned_grams, 500)).toBe(true);
    expect(Math.abs(storeSum() - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('apply is one-shot: the same preview cannot apply twice (test 16)', () => {
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    useConstraintStudioStore.getState().applyPreview();
    const after = JSON.stringify(storeRows());
    useConstraintStudioStore.setState({ preview });
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('stale_preview');
    expect(JSON.stringify(storeRows())).toBe(after);
  });
});
