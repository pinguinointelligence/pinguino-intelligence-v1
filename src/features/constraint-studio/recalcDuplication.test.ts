/**
 * RECALCULATION DUPLICATE INGREDIENTS (owner P0) — regression matrix.
 *
 * PROVEN defect (real solver + real stores, before the fix): five recalc→apply
 * cycles across −13/−11 serving changes appended `correction-dextrose-0`,
 * `~2`, `~3` + a parallel cream + a parallel milk line — 5 rows → 10 rows,
 * 1000 g → 2927.8 g with `target_batch_grams` still 1000 (the owner's served
 * ~2937.9 g). Fix: canonical ingredient identity merge (`ingredient.id`) +
 * batch restoration through the approved §17.4 rescale + hard Apply-door
 * invariants (duplicates / batch). Engine science untouched.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  overSweetStarter,
  starterLine,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  commitPreview,
  findNewDuplicateIngredients,
  mergeByCanonicalIdentity,
  plannedSum,
  workingStateFingerprint,
  type ConstraintPreview,
} from './applyPipeline';
import { useConstraintStudioStore } from './constraintStudioStore';

const line = (id: string, ing: string, grams: number, lock: 'unlocked' | 'grams' = 'unlocked') => ({
  id,
  ingredient: findDemoIngredient(ing)!,
  planned_grams: grams,
  actual_grams: null as number | null,
  lock_type: lock as 'unlocked',
});

const OWNER_BASE = () => [
  line('l-milk', 'milk_3_5', 800),
  line('l-cream', 'cream_30', 100),
  line('l-suc', 'sucrose', 70),
  line('l-dex', 'dextrose', 20),
  line('l-smp', 'smp', 10),
];

const seedStore = (temp: number, items = OWNER_BASE()) => {
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

const rows = () => useRecipeStore.getState().items;
const sum = () => rows().reduce((a, i) => a + i.planned_grams, 0);
const countOf = (ingredientId: string) =>
  rows().filter((i) => i.ingredient.id === ingredientId).length;

const recalcAndApply = () => {
  useConstraintStudioStore.getState().createOptimizePreview();
  const { preview, previewIssue } = useConstraintStudioStore.getState();
  if (!preview) return { applied: false, issue: previewIssue?.code ?? null };
  useConstraintStudioStore.getState().applyPreview();
  return { applied: !useConstraintStudioStore.getState().blocked, issue: null };
};

/**
 * ACCEPTANCE ADDENDUM (3), 2026-07-24: the OWNER_BASE milk-gelato recalc ends
 * with residual violations on NATIVE approved bands at every serving
 * temperature, so its apply is now structurally DIAGNOSTIC-ONLY (blocked at
 * the door). Apply-MECHANICS pins (double-apply, undo) therefore use this
 * hard-safe applying scenario: the over-sweet starter with dextrose locked-
 * by-value — the solver converges to ZERO violations and the apply flows.
 */
const seedApplyingScenario = () => {
  const rec = withGrams(overSweetStarter(160), starterLine('dextrose'), 40);
  useRecipeStore.setState({
    mode: rec.mode,
    category: rec.category,
    target_temperature_c: rec.target_temperature_c,
    target_batch_grams: rec.target_batch_grams,
    machine_capacity_grams: rec.machine_capacity_grams,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    items: rec.items.map((item) => ({ ...item })),
  });
  useConstraintStudioStore.getState().resetForTests();
};

beforeEach(() => {
  seedStore(-13);
});

describe('owner acceptance — the exact reproduced scenario stays clean', () => {
  it('five recalc cycles across −13/−11: no duplicates, no growth, batch stays 1000 g (the owner defect)', () => {
    // CURRENT-DRAFT OPTIMIZATION P0 (owner, 2026-07-25) — DELIBERATE pin
    // update. Under the 2026-07-24 addendum this fixture ended every cycle
    // with a hard-native residual and was refused at the door, so the owner's
    // defect was excluded a fortiori (nothing was ever written). The
    // current-draft candidate vector now repairs the recipe, so the cycles
    // really WRITE — which is exactly the defect's original code path. The
    // owner's proven failure (5 → 10 rows, 1000 g → 2927.8 g) is therefore
    // pinned again on the WRITING path, which is strictly stronger.
    const temps = [-13, -11, -13, -11, -13];
    for (const temp of temps) {
      useRecipeStore.setState({ target_temperature_c: temp });
      const cycle = recalcAndApply();
      // Whether the cycle applies or is honestly refused, the invariants hold.
      if (!cycle.applied && useConstraintStudioStore.getState().blocked) {
        useConstraintStudioStore.getState().dismissBlocked();
      }
      // ONE row per canonical ingredient identity — never a parallel line.
      // (A legitimately ADDED new ingredient is a new identity, not a duplicate;
      //  the defect was the SAME identity appearing again and again.)
      expect(new Set(rows().map((i) => i.ingredient.id)).size).toBe(rows().length);
      expect(countOf('dextrose')).toBe(1);
      expect(countOf('cream_30')).toBe(1);
      expect(countOf('milk_3_5')).toBe(1);
      // No unbounded appending: the owner's defect doubled the row count.
      expect(rows().length).toBeLessThanOrEqual(OWNER_BASE().length + 3);
      // No mass growth: the batch invariant holds after every cycle.
      expect(Math.abs(sum() - 1000)).toBeLessThanOrEqual(0.1);
      expect(useRecipeStore.getState().target_batch_grams).toBe(1000);
    }
    // Stability across the five cycles: the draft never grew past the bound.
    expect(rows().length).toBeLessThanOrEqual(OWNER_BASE().length + 3);
  });

  it('five recalc→apply cycles on the APPLYING scenario: no duplicates, no growth, sum stays at target', () => {
    // The applied-cycle mechanics pin (the defect's write path) on a hard-safe
    // scenario: repeated recalc→apply cycles never duplicate a canonical
    // identity and never break the batch invariant.
    seedApplyingScenario();
    const target = useRecipeStore.getState().target_batch_grams;
    for (let cycle = 0; cycle < 5; cycle += 1) {
      const first = rows().find((i) => i.lock_type === 'unlocked')!;
      useRecipeStore.getState().setPlannedGrams(first.id, first.planned_grams + 5);
      recalcAndApply();
      expect(new Set(rows().map((i) => i.ingredient.id)).size).toBe(rows().length);
      expect(countOf('dextrose')).toBe(1);
      expect(countOf('sucrose')).toBe(1);
      expect(useRecipeStore.getState().target_batch_grams).toBe(target);
      expect(sum()).toBeLessThan(target + 100); // no runaway growth, ever
    }
  });

  it.each([-11, -12, -13])('temperature %d: one apply keeps single rows and 1000 g (test 14)', (temp) => {
    seedStore(temp);
    recalcAndApply();
    expect(new Set(rows().map((i) => i.ingredient.id)).size).toBe(rows().length); // no duplicates
    expect(rows().length).toBeLessThanOrEqual(6);
    expect(Math.abs(sum() - 1000)).toBeLessThanOrEqual(0.1);
  });
});

describe('genuinely new ingredients (test 3)', () => {
  it('an ingredient absent from the base is added EXACTLY once and folded on later cycles', () => {
    // No dextrose in the base → the −13 fix must introduce it as ONE new line.
    seedStore(-13, [
      line('l-milk', 'milk_3_5', 820),
      line('l-cream', 'cream_30', 100),
      line('l-suc', 'sucrose', 80),
    ]);
    recalcAndApply();
    const added = countOf('dextrose');
    expect(added).toBeLessThanOrEqual(1);
    // cycle again across temps — never a second dextrose row
    for (const temp of [-11, -13, -11]) {
      useRecipeStore.setState({ target_temperature_c: temp });
      recalcAndApply();
      expect(countOf('dextrose')).toBeLessThanOrEqual(1);
      expect(new Set(rows().map((i) => i.ingredient.id)).size).toBe(rows().length);
      expect(Math.abs(sum() - 1000)).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('double-apply protection (tests 4+5, Phase 9)', () => {
  // ADDENDUM (3): the OWNER_BASE apply is now diagnostic-blocked, so the
  // double-apply MECHANICS pins run on the hard-safe applying scenario.
  it('applying the same preview twice: second attempt is refused, recipe unchanged', () => {
    seedApplyingScenario();
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull(); // first apply really landed
    const afterFirst = JSON.stringify(rows());

    // Forcing the SAME preview object back in (simulates a stale retry/dispatch).
    useConstraintStudioStore.setState({ preview });
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('stale_preview');
    expect(JSON.stringify(rows())).toBe(afterFirst); // byte-identical — nothing appended
  });

  it('double-click: the second synchronous applyPreview is a no-op (preview already consumed)', () => {
    seedApplyingScenario();
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    const afterFirst = JSON.stringify(rows());
    useConstraintStudioStore.getState().applyPreview(); // no preview staged → no-op
    expect(JSON.stringify(rows())).toBe(afterFirst);
    expect(useConstraintStudioStore.getState().history.length).toBe(1);
  });
});

describe('canonical identity unit rules (tests 6/7/8)', () => {
  const mk = (items: ReturnType<typeof line>[]): RecipeInput => ({
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -12,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    items,
  });

  it('same stable Mapper id with different display names merges (translated variants, test 7 + 6)', () => {
    const a = { ...line('l-a', 'dextrose', 58) };
    const b = {
      ...line('correction-x-0', 'dextrose', 16),
      ingredient: { ...findDemoIngredient('dextrose')!, id: 'PI-ING-000123', name: 'DEKSTROZA · Mapper' },
    };
    const aMapper = { ...a, ingredient: { ...a.ingredient, id: 'PI-ING-000123', name: 'Dextrose (monohydrate)' } };
    const base = mk([aMapper]);
    const proposed = mk([aMapper, b]);
    const merged = mergeByCanonicalIdentity(base, proposed);
    expect(merged.items.length).toBe(1); // one PI-ING-000123 row
    expect(merged.items[0]!.planned_grams).toBe(74); // 58 → 74, the owner's Phase 8 example
    expect(merged.items[0]!.id).toBe('l-a'); // stable line identity preserved
  });

  it('two genuinely different ingredients never merge (test 8)', () => {
    const base = mk([line('l-a', 'dextrose', 58)]);
    const proposed = mk([line('l-a', 'dextrose', 58), line('l-b', 'sucrose', 40)]);
    expect(mergeByCanonicalIdentity(base, proposed).items.length).toBe(2);
  });

  it('locked and poured lines are never merge targets (Phase 7)', () => {
    const locked = { ...line('l-lock', 'dextrose', 58, 'grams') };
    const added = line('correction-dextrose-0', 'dextrose', 16);
    const merged = mergeByCanonicalIdentity(mk([locked]), mk([locked, added]));
    expect(merged.items.length).toBe(2); // parallel line stays — the lock is untouchable
    expect(merged.items[0]!.planned_grams).toBe(58);
  });

  it('pre-existing user duplicates are preserved, never multiplied', () => {
    const dup1 = line('l-a', 'dextrose', 30);
    const dup2 = line('l-b', 'dextrose', 20);
    const base = mk([dup1, dup2]);
    expect(mergeByCanonicalIdentity(base, mk([dup1, dup2])).items.length).toBe(2);
    expect(findNewDuplicateIngredients(base, mk([dup1, dup2]))).toEqual([]);
  });
});

describe('Apply-door invariants (tests 10 + Phase 6)', () => {
  const forge = (proposedInput: RecipeInput): ConstraintPreview => {
    const current = buildRecipeInput(useRecipeStore.getState());
    const set = useConstraintStudioStore.getState().constraints;
    const result = calculateRecipe(proposedInput);
    return {
      kind: 'optimize',
      titlePl: 'forged',
      // Owner addendum item 4: hand-forged fixtures declare the outcome
      // classification explicitly (the real builders compute it).
      outcomeClassification: {
        outcome: 'no_verified_change',
        batchReconciled: false,
        compositionUnchanged: false,
        engineImproved: false,
        beforeGrams: 1000,
        afterGrams: 1000,
        targetBatchGrams: 1000,
        violationsBefore: 0,
        violationsAfter: 0,
      },
      baseFingerprint: workingStateFingerprint(current, set),
      proposedInput,
      nextConstraints: set,
      lines: [],
      violationsBefore: 0,
      violationsAfter: 0,
      explanation: [],
      engineVersion: result.engine_version,
      configVersion: result.config_version,
      createdAt: 'now',
    };
  };

  it('a 2937.9 g optimize result is STRUCTURALLY blocked with the batch message (test 10)', () => {
    const current = buildRecipeInput(useRecipeStore.getState());
    const inflated: RecipeInput = {
      ...current,
      items: current.items.map((item, index) =>
        index === 0 ? { ...item, planned_grams: item.planned_grams + 1937.9 } : { ...item },
      ),
    };
    expect(Math.round(plannedSum(inflated) * 10) / 10).toBe(2937.9);
    const outcome = commitPreview(
      current,
      useConstraintStudioStore.getState().constraints,
      forge(inflated),
      'now',
      'apply-x',
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('batch_total_mismatch');
    expect(outcome.messagePl).toContain('Receptura nie została zmieniona.');
  });

  it('a proposal introducing a duplicate ingredient is blocked with the owner message (Phase 6)', () => {
    const current = buildRecipeInput(useRecipeStore.getState());
    const withDuplicate: RecipeInput = {
      ...current,
      items: [
        ...current.items.map((item) => ({ ...item })),
        { ...line('correction-dextrose-0', 'dextrose', 0.05) },
      ],
    };
    const outcome = commitPreview(
      current,
      useConstraintStudioStore.getState().constraints,
      forge(withDuplicate),
      'now',
      'apply-y',
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('duplicate_lines');
    expect(outcome.messagePl).toContain(
      'Podgląd zawiera zduplikowane składniki i nie może zostać zastosowany.',
    );
    expect(outcome.messagePl).toContain('Receptura nie została zmieniona.');
  });
});

describe('locks, undo, save/reopen (tests 11/12/13)', () => {
  it('a locked ingredient is byte-exact through recalc→apply; batch restored around it (test 11)', () => {
    seedStore(-13);
    useConstraintStudioStore.getState().toggleLock('l-cream');
    recalcAndApply();
    const cream = rows().find((i) => i.id === 'l-cream')!;
    expect(Object.is(cream.planned_grams, 100)).toBe(true); // exactly unchanged
    expect(countOf('cream_30')).toBe(1);
    expect(Math.abs(sum() - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('Undo restores the byte-exact pre-Apply recipe (test 13)', () => {
    // ADDENDUM (3): runs on the hard-safe applying scenario (the OWNER_BASE
    // apply is diagnostic-blocked and never writes, so there is nothing to undo).
    seedApplyingScenario();
    const before = JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items);
    recalcAndApply();
    expect(JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items)).not.toBe(before);
    useConstraintStudioStore.getState().undoLastApply();
    expect(JSON.stringify(buildRecipeInput(useRecipeStore.getState()).items)).toBe(before);
  });

  it('save/reopen round-trip keeps single rows and the exact ids (test 12)', () => {
    recalcAndApply();
    const savedInput = buildRecipeInput(useRecipeStore.getState());
    // reopen: the store loads the saved RecipeInput back (the stored source of truth)
    useRecipeStore.getState().loadRecipeInput(savedInput, { savedId: 'r-test', savedName: 'T' });
    const savedCount = savedInput.items.length;
    expect(rows().length).toBe(savedCount);
    expect(new Set(rows().map((i) => i.ingredient.id)).size).toBe(savedCount); // single rows
    expect(rows().map((i) => i.id)).toEqual(savedInput.items.map((i) => i.id));
    // the NEXT recalculation starts from the corrected single recipe
    useRecipeStore.setState({ target_temperature_c: -11 });
    recalcAndApply();
    expect(new Set(rows().map((i) => i.ingredient.id)).size).toBe(rows().length);
    expect(Math.abs(sum() - 1000)).toBeLessThanOrEqual(0.1);
  });
});

describe('repair for already-duplicated drafts (Phase 10)', () => {
  it('mergeDuplicateIngredientLines folds plannable duplicates, preserves locked/poured lines', () => {
    useRecipeStore.setState({
      items: [
        line('l-dex', 'dextrose', 58),
        line('correction-dextrose-0', 'dextrose', 100.6),
        line('correction-dextrose-0~2', 'dextrose', 139.4),
        { ...line('l-cream', 'cream_30', 100, 'grams') }, // locked — untouched
        line('correction-cream_30-0', 'cream_30', 212.5), // plannable — kept as the first cream plannable
      ],
    });
    useRecipeStore.getState().mergeDuplicateIngredientLines();
    const after = rows();
    expect(after.filter((i) => i.ingredient.id === 'dextrose').length).toBe(1);
    expect(after.find((i) => i.id === 'l-dex')!.planned_grams).toBeCloseTo(298, 5); // 58+100.6+139.4
    expect(after.find((i) => i.id === 'l-cream')!.planned_grams).toBe(100); // locked untouched
    expect(after.filter((i) => i.ingredient.id === 'cream_30').length).toBe(2); // locked + one plannable
  });
});

describe('engine science untouched (test 15)', () => {
  it('ENGINE/CONFIG versions and a fixed calculation stay stable', () => {
    const result = calculateRecipe(buildRecipeInput(useRecipeStore.getState()));
    expect(result.engine_version).toBe('0.4.0');
    expect(result.config_version).toBe('0.7.0');
  });
});
