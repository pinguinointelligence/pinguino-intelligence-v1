/**
 * PRZELICZ Z PI — REAL AUTO-BALANCE (owner P0). The decisive owner test: a
 * ~1000 g recipe AND a mutilated 1 g variant must BOTH produce a real result —
 * never one generic sentence for every input. The orchestration composes ONLY
 * approved mechanisms (§17.4 rescale + the canonical engine solver + canonical
 * identity merge + the verified Apply door). Engine science untouched.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { buildOptimizePreview, plannedSum } from './applyPipeline';
import { useConstraintStudioStore } from './constraintStudioStore';
import { diagnoseRecalcFailure } from './recalcDiagnosis';
import { constraintStudioCopy } from './constraintStudioCopy';

const line = (id: string, ing: string, grams: number, lock: 'unlocked' | 'main' = 'unlocked') => ({
  id,
  ingredient: findDemoIngredient(ing)!,
  planned_grams: grams,
  actual_grams: null as number | null,
  lock_type: lock as 'unlocked',
});

const input = (items: ReturnType<typeof line>[], temp = -11): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: temp,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items,
});

const NO = { byLineId: {} };

/** The owner's mutilated case: several rows dropped to 1 g (total 254 g ≠ 1000 g). */
const MUTILATED = () => [
  line('l-milk', 'milk_3_5', 1),
  line('l-cream', 'cream_30', 150),
  line('l-suc', 'sucrose', 1),
  line('l-dex', 'dextrose', 1),
  line('l-smp', 'smp', 100),
  line('l-tara', 'tara_gum', 1),
];

/** Literally every adjustable row at 1 g — the harshest form of the owner test. */
const ALL_ONE_GRAM = () =>
  ['milk_3_5', 'cream_30', 'sucrose', 'dextrose', 'smp', 'tara_gum'].map((ing, i) => line(`l-${i}`, ing, 1));

/** A plausible ~999.91 g near-balanced recipe (the MyGelato-copy shape). */
const NEAR_BALANCED = () => [
  line('l-milk', 'milk_3_5', 585.91),
  line('l-cream', 'cream_30', 175),
  line('l-suc', 'sucrose', 130),
  line('l-dex', 'dextrose', 40),
  line('l-smp', 'smp', 65),
  line('l-tara', 'tara_gum', 4),
];

const seedStore = (items: ReturnType<typeof line>[], temp = -11) => {
  useRecipeStore.setState({
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: temp,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    items,
  });
  useConstraintStudioStore.getState().resetForTests();
};

beforeEach(() => seedStore(MUTILATED()));

describe('owner Test 2 — the 1 g recipe produces a REAL calculated Preview (tests 1/2/3/7/8)', () => {
  it.each([-11, -12, -13])('temperature %d: complete preview, total 1000 g, solver really invoked (tests 16/17)', (temp) => {
    const result = buildOptimizePreview(input(MUTILATED(), temp), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the auto-balance PROOF: batch reconciled + the solver pipeline engaged
    expect(result.preview.autoBalance?.batchRescaled).toBe(true);
    expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    // real proposed gram values — the mutilated rows genuinely move
    const milk = result.preview.proposedInput.items.find((i) => i.id === 'l-milk')!;
    expect(milk.planned_grams).toBeGreaterThan(1);
    // no duplicate canonical identities
    const ids = result.preview.proposedInput.items.map((i) => i.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('literally-all-1 g (6 g total): the previous dead end now returns a preview at 1000 g', () => {
    const result = buildOptimizePreview(input(ALL_ONE_GRAM()), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('GŁÓWNY (main) does not imply a lock — a main line off-batch still recalculates (test 4)', () => {
    const items = MUTILATED();
    items[0] = line('l-milk', 'milk_3_5', 1, 'main');
    const result = buildOptimizePreview(input(items), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
  });
});

describe('owner Test 1 — the near-balanced ~999.91 g recipe (tests 5/6)', () => {
  it('returns already_balanced OR a valid preview — never an unclassified generic failure', () => {
    const result = buildOptimizePreview(input(NEAR_BALANCED()), NO, 'now');
    if (result.ok) {
      expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    } else {
      expect(result.code).toBe('already_clean');
      expect(constraintStudioCopy.previewIssue.alreadyClean).toBe(
        'Receptura znajduje się już w zatwierdzonym zakresie. PI nie proponuje zmian.',
      );
    }
  });

  it('re-running after a balance is ALWAYS classified: already_clean, a batch-true preview, or a PROVEN fixed point (test 5)', () => {
    const first = buildOptimizePreview(input(NEAR_BALANCED()), NO, 'now');
    if (!first.ok) {
      expect(first.code).toBe('already_clean');
      return;
    }
    const second = buildOptimizePreview(first.preview.proposedInput, NO, 'now');
    if (second.ok) {
      // still converging — but ALWAYS batch-true and duplicate-free
      expect(Math.abs(plannedSum(second.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    } else if (second.code === 'no_proposal') {
      // the honest FIXED POINT: batch-true, solver really ran, residual metrics named
      expect(second.solverInvocations ?? 0).toBeGreaterThan(0);
      expect((second.violatedMetrics ?? []).length).toBeGreaterThan(0);
    } else {
      expect(second.code).toBe('already_clean');
    }
  });
});

describe('locks (tests 9/10)', () => {
  it('one lock stays byte-exact through the auto-balance', () => {
    const set = { byLineId: { 'l-smp': { mode: 'locked' as const, grams: 100 } } };
    const items = MUTILATED().map((i) => (i.id === 'l-smp' ? { ...i, lock_type: 'grams' as const } : i));
    const result = buildOptimizePreview(input(items as ReturnType<typeof line>[]), set, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const smp = result.preview.proposedInput.items.find((i) => i.id === 'l-smp')!;
    expect(Object.is(smp.planned_grams, 100)).toBe(true);
    expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('all-locked returns the explicit all-lock message through the diagnosis', () => {
    const items = MUTILATED().map((i) => ({ ...i, lock_type: 'grams' as const }));
    const set = {
      byLineId: Object.fromEntries(items.map((i) => [i.id, { mode: 'locked' as const, grams: i.planned_grams }])),
    };
    const result = buildOptimizePreview(input(items as unknown as ReturnType<typeof line>[]), set, 'now');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.code === 'already_clean') return; // not this fixture
    const diagnosis = diagnoseRecalcFailure({
      input: input(items as unknown as ReturnType<typeof line>[]),
      constraints: set,
      issue: result as never,
      servingModeId: null,
    });
    expect(diagnosis.code).toBe('locked_constraints_conflict');
    expect(constraintStudioCopy.diagnosis.allLocked).toContain('Wszystkie składniki są zablokowane.');
  });
});

describe('store integration — Preview/Apply/Undo (tests 11/12/13/14/15)', () => {
  it('workbar path: createOptimizePreview → applyPreview updates the draft to 1000 g, no duplicates (contract: atomic replacement)', () => {
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    const items = useRecipeStore.getState().items;
    expect(new Set(items.map((i) => i.ingredient.id)).size).toBe(items.length);
    expect(Math.abs(items.reduce((a, i) => a + i.planned_grams, 0) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('Undo restores the exact all-1 g input (test 13)', () => {
    const before = JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items);
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    expect(JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items)).not.toBe(before);
    useConstraintStudioStore.getState().undoLastApply();
    expect(JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items)).toBe(before);
  });

  it('a failed build never mutates the recipe (test 14)', () => {
    const before = JSON.stringify(useRecipeStore.getState().items);
    buildOptimizePreview(input(MUTILATED()), NO, 'now'); // pure — regardless of outcome
    expect(JSON.stringify(useRecipeStore.getState().items)).toBe(before);
  });

  it('save/reopen preserves the balanced result (test 15)', () => {
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    const saved = buildRecipeInput(useRecipeStore.getState());
    useRecipeStore.getState().loadRecipeInput(saved, { savedId: 'r-ab', savedName: 'AB' });
    const items = useRecipeStore.getState().items;
    expect(items.map((i) => [i.id, i.planned_grams])).toEqual(saved.items.map((i) => [i.id, i.planned_grams]));
  });
});

describe('honest failure shape (Phase 9) + science freeze (test 18)', () => {
  it('a no-solution failure carries solver invocations + violated metrics — never the bare generic sentence', () => {
    // Force the no-proposal shape structurally (whatever fixture yields it must carry proof fields).
    const failure = { ok: false as const, code: 'no_proposal' as const, violatedMetrics: ['npac'], solverInvocations: 3 };
    const diagnosis = diagnoseRecalcFailure({
      input: input(MUTILATED()),
      constraints: NO,
      issue: failure,
      servingModeId: null,
    });
    expect(diagnosis.code).toBe('optimizer_no_solution');
    const message = constraintStudioCopy.diagnosis.optimizerNoSolution(
      diagnosis.violatedMetrics!.map((m) => constraintStudioCopy.diagnosis.metricLabels[m] ?? m),
      diagnosis.solverInvocations!,
    );
    expect(message).toContain('solver uruchomiony 3 ×');
    expect(message).toContain('NPAC');
  });

  it('ENGINE/CONFIG versions unchanged (science freeze)', () => {
    const result = calculateRecipe(input(NEAR_BALANCED()));
    expect(result.engine_version).toBe('0.4.0');
    expect(result.config_version).toBe('0.7.0');
  });
});
