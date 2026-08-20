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
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  isUndoAvailable,
  selectCanonicalDraft,
  useConstraintStudioStore,
} from './constraintStudioStore';
import { constraintStudioCopy } from './constraintStudioCopy';
import { commitPreview, workingStateFingerprint } from './applyPipeline';

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
    machine_capacity_source: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    formulation_strategy: 'optimal',
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    direction_targets_active: false,
    items: [],
    excludedIngredientIds: [],
    unavailableMainIngredientIds: [],
    productBehaviorSnapshots: {},
  });
  useConstraintStudioStore.getState().resetForTests();
  useRecipeStore.getState().setVisibleProductType('gelato');
  useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
  // OWNER FINAL INTEGRATION ADDENDUM items 1+2 (2026-07-25): the fruit now
  // carries a real amount. A dairy fruit gelato is canonical `milk_gelato`, and
  // no APPROVED milk template has a `fruit` role now that the reference-derived
  // `fruit_gelato_ref_v1` is quarantined — so a 0 g fruit is (correctly) an
  // honest „give me the amount" stop rather than a preview (pinned in
  // zeroGramSemantics.test.ts / liveRuntime.test.ts). This file's guarantees —
  // byte-for-byte preview→store transfer, the guarded-write rejections, the
  // batch invariant and one-shot apply — are about the APPLY path and are
  // unchanged; the seed just has to be a recipe PI can actually formulate.
  useRecipeStore.getState().addIngredient(STRAWBERRIES, 350);
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

  it('keeps canonical Undo available after a Direction Apply', () => {
    useRecipeStore.getState().setDirectionTarget('sweetness', 2);
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();

    const studio = useConstraintStudioStore.getState();
    const last = studio.history[studio.history.length - 1];
    expect(isUndoAvailable(last, selectCanonicalDraft().input, studio.constraints)).toBe(true);
  });

  it('stale Preview is blocked after an edit (test 17)', () => {
    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = useConstraintStudioStore.getState().preview;
    expect(staged).not.toBeNull();
    const editableInput = buildRecipeInput(useRecipeStore.getState());
    useRecipeStore.setState({
      productBehaviorSnapshots: productBehaviorTestSnapshots(editableInput),
    });
    // the user edits AFTER preview → source revision no longer matches
    const first = useRecipeStore.getState().items[0]!;
    const untouchedSum = useRecipeStore
      .getState()
      .items.slice(1)
      .reduce((sum, item) => sum + item.planned_grams, 0);
    useRecipeStore.getState().setPlannedGrams(first.id, 5);
    // Owner P0 NIGHTLY (Phase 3): the material edit invalidates the staged
    // preview immediately — and a resurrected stale preview still cannot
    // apply (monotonic revision + fingerprint at the commit door).
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    useConstraintStudioStore.setState({ preview: staged });
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('stale_preview');
    expect(storeSum()).toBe(untouchedSum + 5); // untouched apart from the user's own edit
  });

  it('trustless Apply rejects a forged change to an Engine-native Required line', () => {
    const required = useRecipeStore
      .getState()
      .items.find((item) => item.ingredient.name.includes('STRAWBERRIES'))!;
    useRecipeStore.getState().setLockType(required.id, 'required');
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    if (!preview) return;

    const forged = structuredClone(preview);
    const forgedRequired = forged.proposedInput.items.find((item) => item.id === required.id)!;
    forgedRequired.planned_grams += 1;
    const balancing = forged.proposedInput.items.find((item) => item.id !== required.id)!;
    balancing.planned_grams -= 1;
    useConstraintStudioStore.setState({ preview: forged });

    useConstraintStudioStore.getState().applyPreview();
    // The forged executable vector no longer matches the independently
    // re-derived practical candidate. Either guard is sufficient, but the
    // practical proof is intentionally checked before the legacy constraint
    // payload so a forged Preview never becomes rounding authority.
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('practicalization_invalid');
    expect(
      useRecipeStore.getState().items.find((item) => item.id === required.id)?.planned_grams,
    ).toBe(required.planned_grams);
  });

  it('trustless Apply cannot forge physical actual grams or unlock an already-added line', () => {
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    if (!preview) return;

    const constraints = { byLineId: {} } as const;
    const current = buildRecipeInput(useRecipeStore.getState());
    const physical = current.items[0]!;
    physical.actual_grams = 100;
    physical.lock_type = 'already_added';

    const forgedActual = structuredClone(preview);
    forgedActual.baseDraftRevision = undefined;
    forgedActual.baseFingerprint = workingStateFingerprint(current, constraints);
    const forgedActualLine = forgedActual.proposedInput.items.find(
      (item) => item.id === physical.id,
    )!;
    forgedActualLine.actual_grams = 999;
    forgedActualLine.lock_type = 'already_added';

    expect(
      commitPreview(current, constraints, forgedActual, '2026-08-10T13:00:00Z', 'forged-actual'),
    ).toMatchObject({
      ok: false,
      code: 'physical_actual_violated',
      lineNames: [physical.ingredient.name],
    });

    const forgedActualRemoval = structuredClone(preview);
    forgedActualRemoval.baseDraftRevision = undefined;
    forgedActualRemoval.baseFingerprint = workingStateFingerprint(current, constraints);
    const forgedActualRemovalLine = forgedActualRemoval.proposedInput.items.find(
      (item) => item.id === physical.id,
    )!;
    forgedActualRemovalLine.actual_grams = null;
    forgedActualRemovalLine.lock_type = 'already_added';

    expect(
      commitPreview(
        current,
        constraints,
        forgedActualRemoval,
        '2026-08-10T13:00:00Z',
        'forged-actual-removal',
      ),
    ).toMatchObject({
      ok: false,
      code: 'physical_actual_violated',
      lineNames: [physical.ingredient.name],
    });

    const forgedLock = structuredClone(preview);
    forgedLock.baseDraftRevision = undefined;
    forgedLock.baseFingerprint = workingStateFingerprint(current, constraints);
    const forgedLockLine = forgedLock.proposedInput.items.find((item) => item.id === physical.id)!;
    forgedLockLine.actual_grams = 100;
    forgedLockLine.lock_type = 'unlocked';

    expect(
      commitPreview(current, constraints, forgedLock, '2026-08-10T13:00:01Z', 'forged-lock'),
    ).toMatchObject({
      ok: false,
      code: 'physical_actual_violated',
      lineNames: [physical.ingredient.name],
    });

    const forgedPlan = structuredClone(preview);
    forgedPlan.baseDraftRevision = undefined;
    forgedPlan.baseFingerprint = workingStateFingerprint(current, constraints);
    const forgedPlanLine = forgedPlan.proposedInput.items.find((item) => item.id === physical.id)!;
    forgedPlanLine.actual_grams = 100;
    forgedPlanLine.lock_type = 'already_added';
    forgedPlanLine.planned_grams = physical.planned_grams + 500;

    expect(
      commitPreview(current, constraints, forgedPlan, '2026-08-10T13:00:02Z', 'forged-plan'),
    ).toMatchObject({
      ok: false,
      code: 'physical_actual_violated',
      lineNames: [physical.ingredient.name],
    });
  });

  it.each(['already_added', 'required', 'main'] as const)(
    'trustless Apply cannot forge an unlocked line into %s',
    (forgedLockType) => {
      useConstraintStudioStore.getState().createOptimizePreview();
      const preview = useConstraintStudioStore.getState().preview;
      expect(preview).not.toBeNull();
      if (!preview) return;

      const constraints = { byLineId: {} } as const;
      const current = buildRecipeInput(useRecipeStore.getState());
      const unlocked = current.items.find((item) => item.lock_type === 'unlocked')!;
      const forged = structuredClone(preview);
      forged.baseDraftRevision = undefined;
      forged.baseFingerprint = workingStateFingerprint(current, constraints);
      const forgedLine = forged.proposedInput.items.find((item) => item.id === unlocked.id)!;
      forgedLine.lock_type = forgedLockType;

      expect(
        commitPreview(
          current,
          constraints,
          forged,
          '2026-08-10T13:00:03Z',
          `forged-${forgedLockType}`,
        ),
      ).toMatchObject({
        ok: false,
        code: 'physical_actual_violated',
        lineNames: [unlocked.ingredient.name],
      });
    },
  );
});

describe('PHASE 5/6/7 — the guarded store API rejects every corruption shape', () => {
  const validInput = (): RecipeInput => buildRecipeInput(useRecipeStore.getState());

  const corrupt = (mutate: (input: RecipeInput) => RecipeInput) => {
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    const before = JSON.stringify(storeRows()); // the applied, healthy draft
    const base = validInput();
    const result = useRecipeStore
      .getState()
      .applyVerifiedRecipeInput(mutate(structuredClone(base)));
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
    // Inulin is optional and no longer silently inserted. This lock-path test
    // selects it explicitly so its former solids contribution remains present.
    useRecipeStore.getState().addIngredient(findDemoIngredient('inulin')!, 20);
    useRecipeStore.setState({
      productBehaviorSnapshots: productBehaviorTestSnapshots(
        buildRecipeInput(useRecipeStore.getState()),
      ),
    });
    useRecipeStore.getState().setPlannedGrams(milkLine.id, 500);
    // The remaining test exercises the pure solver/Apply lock contract. Runtime
    // proposal snapshots are supplied by the server-authority wrapper.
    useRecipeStore.setState({ productBehaviorSnapshots: {} });
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
