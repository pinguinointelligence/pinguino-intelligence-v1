/**
 * Store-level pins (§17.1–§17.2, §19.2, §20.3):
 *  - the padlock records the EXACT grams and maps to engine lock_type 'grams';
 *    while locked the REAL solver never moves the line; after unlock it can
 *    (§17.2 steps 2–6, engine-verified);
 *  - Apply through the store writes the recipe ONLY via the verify-gated
 *    pipeline; a forged preview is BLOCKED and the recipe stays untouched;
 *  - batch rescale through the store preserves locked grams byte-for-byte;
 *  - Undo restores the EXACT pre-apply state and is refused after unrelated
 *    edits (never destroys newer work);
 *  - feasibility surfaces the honest §18.5 no_reliable_bound outcome.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import {
  alcoholAndSugarHeavyJimBeam,
  overSweetStarter,
  starterLine,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from './constraintStudioStore';

const SUCROSE = starterLine('sucrose');
const DEXTROSE = starterLine('dextrose');
const MILK = starterLine('milk_3_5');

const loadRecipe = (input: RecipeInput) => useRecipeStore.getState().loadRecipeInput(input);
const recipeItems = () => useRecipeStore.getState().items;
const lineGrams = (lineId: string): number => {
  const line = recipeItems().find((item) => item.id === lineId);
  if (!line) throw new Error(`line ${lineId} missing`);
  return line.planned_grams;
};
const lineLockType = (lineId: string) =>
  recipeItems().find((item) => item.id === lineId)?.lock_type;

/** The ADD-fixable scenario pinned by the feasibility tests. */
const loadAddFixScenario = () => {
  loadRecipe(withGrams(overSweetStarter(160), DEXTROSE, 40));
  useConstraintStudioStore.getState().toggleLock(SUCROSE);
  useConstraintStudioStore.getState().toggleLock(DEXTROSE);
};

beforeEach(() => {
  useRecipeStore.getState().resetToDemo();
  useConstraintStudioStore.getState().resetForTests();
});

describe('§17.1/§17.2 padlock', () => {
  it('locks the EXACT current grams and maps onto engine lock_type grams', () => {
    loadRecipe(overSweetStarter(220));
    useConstraintStudioStore.getState().toggleLock(SUCROSE);

    const constraint = useConstraintStudioStore.getState().constraints.byLineId[SUCROSE];
    expect(constraint).toEqual({ mode: 'locked', grams: 220 });
    expect(lineLockType(SUCROSE)).toBe('grams');
  });

  it('while locked, the REAL solver preview never moves the line; unlocked, it can (§17.2 steps 3–6)', () => {
    // Machine capacity blocks the dilution ADD escape, so the genuine fix is
    // reducing sucrose (evidence pinned by the feasibility conflict test) —
    // exactly the move a lock must forbid and an unlock must re-allow.
    loadRecipe({ ...overSweetStarter(150), machine_capacity_grams: 1050 });
    useConstraintStudioStore.getState().toggleLock(SUCROSE);

    useConstraintStudioStore.getState().createOptimizePreview();
    const lockedState = useConstraintStudioStore.getState();
    if (lockedState.preview) {
      const sucroseDiff = lockedState.preview.lines.find((line) => line.lineId === SUCROSE);
      expect(sucroseDiff?.kind).toBe('unchanged');
      expect(Object.is(sucroseDiff?.afterGrams, 150)).toBe(true);
    } else {
      // equally honest: nothing applicable at all under the lock
      expect(lockedState.previewIssue?.code).toBe('no_proposal');
    }

    // §17.2 steps 4–6: unlock → the solver may change the line again.
    useConstraintStudioStore.getState().toggleLock(SUCROSE);
    expect(lineLockType(SUCROSE)).toBe('unlocked');
    useConstraintStudioStore.getState().createOptimizePreview();
    const unlockedState = useConstraintStudioStore.getState();
    expect(unlockedState.preview).not.toBeNull();
    const movedDiff = unlockedState.preview?.lines.find((line) => line.lineId === SUCROSE);
    expect(movedDiff?.kind).toBe('changed');
    expect((movedDiff?.afterGrams ?? Number.NaN) < 150).toBe(true);
  });

  it('padlock is inert on a line with actual grams (poured material, spec §15)', () => {
    loadRecipe(overSweetStarter(220));
    useRecipeStore.getState().setActualGrams(SUCROSE, 220);
    useConstraintStudioStore.getState().toggleLock(SUCROSE);
    expect(useConstraintStudioStore.getState().constraints.byLineId[SUCROSE]).toBeUndefined();
  });

  it('a manual lock-dropdown override consciously drops the §17 constraint', () => {
    loadRecipe(overSweetStarter(220));
    useConstraintStudioStore.getState().toggleLock(SUCROSE);
    useConstraintStudioStore.getState().onLineLockTypeChanged(SUCROSE, 'unlocked');
    expect(useConstraintStudioStore.getState().constraints.byLineId[SUCROSE]).toBeUndefined();
  });

  it('reconcile prunes constraints whose lines vanished (preset reload)', () => {
    loadRecipe(overSweetStarter(220));
    useConstraintStudioStore.getState().toggleLock(SUCROSE);
    loadRecipe(alcoholAndSugarHeavyJimBeam()); // different line ids
    useConstraintStudioStore.getState().reconcile();
    expect(useConstraintStudioStore.getState().constraints.byLineId).toEqual({});
  });
});

describe('§19 apply through the store', () => {
  it('applies a verified optimize preview: recipe updated, locks byte-stable, history recorded', () => {
    loadAddFixScenario();
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();

    useConstraintStudioStore.getState().applyPreview();

    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().history.length).toBe(1);
    expect(Object.is(lineGrams(SUCROSE), 160)).toBe(true);
    expect(Object.is(lineGrams(DEXTROSE), 40)).toBe(true);
  });

  it('BLOCKS a forged preview: Polish message, recipe UNTOUCHED, no history entry', () => {
    loadAddFixScenario();
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    if (!preview) return;

    // Forge the staged proposal so it moves a locked line.
    useConstraintStudioStore.setState({
      preview: {
        ...preview,
        proposedInput: {
          ...preview.proposedInput,
          items: preview.proposedInput.items.map((item) =>
            item.id === SUCROSE ? { ...item, planned_grams: 100 } : item,
          ),
        },
      },
    });

    const before = JSON.stringify(recipeItems());
    useConstraintStudioStore.getState().applyPreview();

    expect(JSON.stringify(recipeItems())).toBe(before); // recipe untouched
    const blocked = useConstraintStudioStore.getState().blocked;
    expect(blocked?.code).toBe('constraints_violated');
    expect(blocked?.messagePl).toContain('Receptura nie została zmieniona');
    expect(useConstraintStudioStore.getState().history.length).toBe(0);
  });

  it('a preview goes stale when the recipe changes before Apply', () => {
    loadAddFixScenario();
    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = useConstraintStudioStore.getState().preview;
    expect(staged).not.toBeNull();
    useRecipeStore.getState().setPlannedGrams(MILK, 555);

    // Owner P0 NIGHTLY (Phase 3): the MATERIAL EDIT ITSELF invalidates the
    // staged preview — instantly, not only at the Apply attempt.
    expect(useConstraintStudioStore.getState().preview).toBeNull();

    const before = JSON.stringify(recipeItems());
    useConstraintStudioStore.getState().applyPreview(); // no-op without a preview
    expect(JSON.stringify(recipeItems())).toBe(before);

    // And even a resurrected stale preview can never apply: the commit door
    // rejects it (monotonic revision guard + fingerprint), recipe untouched.
    useConstraintStudioStore.setState({ preview: staged });
    useConstraintStudioStore.getState().applyPreview();
    expect(JSON.stringify(recipeItems())).toBe(before);
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('stale_preview');
    expect(useConstraintStudioStore.getState().preview).toBeNull();
  });

  it('batch rescale through the store: locked grams preserved byte-for-byte (§17.4)', () => {
    loadRecipe(overSweetStarter(160));
    useConstraintStudioStore.getState().toggleLock(SUCROSE);

    useConstraintStudioStore.getState().createBatchRescalePreview(2000);
    useConstraintStudioStore.getState().applyPreview();

    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(Object.is(lineGrams(SUCROSE), 160)).toBe(true);
    expect(useRecipeStore.getState().target_batch_grams).toBe(2000);
    const total = recipeItems().reduce((sum, item) => sum + item.planned_grams, 0);
    expect(Math.abs(total - 2000)).toBeLessThanOrEqual(0.1);
  });
});

describe('§20.3 Undo', () => {
  it('restores the EXACT pre-apply state (grams, batch, constraints, ids)', () => {
    loadAddFixScenario();
    const gramsBefore = recipeItems().map((item) => [item.id, item.planned_grams] as const);
    const batchBefore = useRecipeStore.getState().target_batch_grams;
    const constraintsBefore = JSON.stringify(
      useConstraintStudioStore.getState().constraints.byLineId,
    );

    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().history.length).toBe(1);

    useConstraintStudioStore.getState().undoLastApply();

    const restored = recipeItems();
    expect(restored.map((item) => item.id)).toEqual(gramsBefore.map(([id]) => id));
    for (const [id, grams] of gramsBefore) {
      const line = restored.find((item) => item.id === id);
      expect(Object.is(line?.planned_grams, grams)).toBe(true);
    }
    expect(useRecipeStore.getState().target_batch_grams).toBe(batchBefore);
    expect(JSON.stringify(useConstraintStudioStore.getState().constraints.byLineId)).toBe(
      constraintsBefore,
    );
    expect(useConstraintStudioStore.getState().history.length).toBe(0);
  });

  it('refuses to undo after an unrelated manual edit (never destroys newer work)', () => {
    loadAddFixScenario();
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();

    useRecipeStore.getState().setPlannedGrams(MILK, 777);
    const snapshot = JSON.stringify(recipeItems());

    useConstraintStudioStore.getState().undoLastApply();

    expect(JSON.stringify(recipeItems())).toBe(snapshot); // no-op
    expect(useConstraintStudioStore.getState().history.length).toBe(1); // record kept
  });
});

describe('§18 feasibility through the store', () => {
  it('surfaces the honest no_reliable_bound outcome for the unfixable scenario', () => {
    loadRecipe(alcoholAndSugarHeavyJimBeam());
    const studio = useConstraintStudioStore.getState();
    studio.toggleLock('jim-beam:whiskey_40');
    studio.toggleLock('jim-beam:sucrose');

    useConstraintStudioStore.getState().runFeasibility();

    const analysis = useConstraintStudioStore.getState().feasibility;
    expect(analysis?.status).toBe('no_reliable_bound');
    if (analysis?.status !== 'no_reliable_bound') return;
    expect(analysis.reasonCode).toBe('not_solvable_by_constraint_changes');
    expect([...analysis.lineIds].sort()).toEqual(['jim-beam:sucrose', 'jim-beam:whiskey_40']);
  });

  it('suggested §18.2 fix flows through preview → verify-gated apply and lands clean', () => {
    loadRecipe(overSweetStarter(220));
    useConstraintStudioStore.getState().toggleLock(SUCROSE);
    useConstraintStudioStore.getState().runFeasibility();

    const analysis = useConstraintStudioStore.getState().feasibility;
    expect(analysis?.status).toBe('infeasible_with_bound');
    if (analysis?.status !== 'infeasible_with_bound') return;
    const action = analysis.conflict.suggestedActions[0];
    if (action?.type !== 'set_max') throw new Error('expected set_max');

    useConstraintStudioStore
      .getState()
      .createSuggestedFixPreview({ type: 'set_max', lineId: action.lineId, grams: action.grams });
    useConstraintStudioStore.getState().applyPreview();

    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(Object.is(lineGrams(SUCROSE), action.grams)).toBe(true);
    expect(useConstraintStudioStore.getState().constraints.byLineId[SUCROSE]).toEqual({
      mode: 'locked',
      grams: action.grams,
    });
    const last = useConstraintStudioStore.getState().history.at(-1);
    expect(last?.kind).toBe('suggested_fix');
    expect(last?.violationsAfter).toBe(0);
  });
});
