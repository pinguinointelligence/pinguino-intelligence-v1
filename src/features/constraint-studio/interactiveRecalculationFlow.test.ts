/**
 * INTERACTIVE RECALCULATION PREVIEW + CONFLICT RESOLUTION — owner 2026-09-11.
 *
 * The real store runtime end to end (Worker-less, so the canonical computation
 * runs in-process), with ProductBehavior authority answered by a fake server:
 *  - fixture 1: strong secondary reduction → edit + lock inside the preview →
 *    recalculated in the SAME session → applied once → Cofnij exact;
 *  - fixture 2: an existing exact lock is never weakened by interaction;
 *  - fixture 3: two locks → conflict → smallest correction → „Użyj propozycji"
 *    → full legal preview → Zastosuj → Cofnij exact;
 *  - fixture 5: manual override inside the conflict;
 *  - fixture 6: X / Wróć leaves the recipe byte-identical, nothing provisional;
 *  - fixture 7: one history entry, no provisional state survives Apply;
 *  - the door refuses a forged / stale instruction preview.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { ownerFruitRecipe, ownerFruitSnapshots } from './__fixtures__/ownerFruitMainFixture';
import { commitPreview, workingStateFingerprint } from './applyPipeline';
import {
  applyPreviewWithServerAuthority,
  runInteractiveRecalculationWithTerminal,
  runPiRecalculationWithTerminal,
  selectCanonicalDraft,
  useConstraintStudioStore,
} from './constraintStudioStore';
import { lockRelaxationInstructions, type LockConflictDiagnosis } from './lockRelaxation';
import {
  computeOptimizePreviewResult,
  type OptimizePreviewComputation,
  type OptimizePreviewComputationRequest,
} from './optimizePreviewComputation';
import { mergePreviewInstructions } from './previewInstructions';

vi.setConfig({ testTimeout: 180_000 });

/** One-shot replacement for the NEXT canonical Worker solve; otherwise the real runtime. */
const optimizeOverride = vi.hoisted(() => ({
  next: null as
    | null
    | ((request: OptimizePreviewComputationRequest) => OptimizePreviewComputation),
}));

vi.mock('./optimizePreviewRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./optimizePreviewRuntime')>();
  return {
    ...actual,
    runOptimizePreviewOffMainThread: (
      ...args: Parameters<typeof actual.runOptimizePreviewOffMainThread>
    ) => {
      const override = optimizeOverride.next;
      if (override === null) return actual.runOptimizePreviewOffMainThread(...args);
      optimizeOverride.next = null;
      return Promise.resolve(override(args[0]));
    },
  };
});

vi.mock('@/services/productIntelligence', () => ({
  resolveRecipeProposalBehaviorSnapshots: async (input: {
    snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  }) => ({
    snapshots: Object.fromEntries(
      Object.entries(input.snapshots)
        .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
        .map(([lineId, snapshot]) => [
          lineId,
          { ...structuredClone(snapshot), resolutionState: 'RESOLVED' as const },
        ]),
    ),
    unresolvedLineIds: [],
  }),
  validateRecipeBehaviorOnServer: async (input: { module: string }) => ({
    ready: true,
    module: input.module,
    staleLineIds: [],
    lines: [],
  }),
}));

function loadOwner(input: RecipeInput, lockedLineIds: readonly string[] = []) {
  useRecipeStore.getState().loadRecipeInput(input);
  const snapshots = ownerFruitSnapshots(input);
  for (const item of useRecipeStore.getState().items) {
    const snapshot = snapshots[item.id];
    if (snapshot) useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshot);
  }
  // The customer's padlocks, through the SAME action the recipe row uses.
  for (const lineId of lockedLineIds) useConstraintStudioStore.getState().toggleLock(lineId);
}

/** Everything a provisional session must never touch. */
const recipeSnapshot = () => {
  const recipe = useRecipeStore.getState();
  return structuredClone({
    items: recipe.items,
    revision: recipe.draftRevision,
    constraints: useConstraintStudioStore.getState().constraints,
  });
};

const draftFingerprint = () => {
  const draft = selectCanonicalDraft();
  return workingStateFingerprint(draft.input, draft.constraints);
};

const grams = (input: RecipeInput, lineId: string) =>
  input.items.find((item) => item.id === lineId)?.planned_grams;

const recipeLine = (lineId: string) =>
  useRecipeStore.getState().items.find((item) => item.id === lineId)!;

const settled = async () => {
  await vi.waitFor(() => {
    expect(useConstraintStudioStore.getState().recalculationTerminal?.state).not.toBe('WORKING');
  });
};

const relaxationOf = (
  diagnosis: LockConflictDiagnosis | undefined,
): Extract<LockConflictDiagnosis, { status: 'relaxation_found' }> => {
  if (diagnosis?.status !== 'relaxation_found') {
    throw new Error(`expected a relaxation, got ${JSON.stringify(diagnosis)}`);
  }
  return diagnosis;
};

beforeEach(() => {
  useRecipeStore.getState().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetForTests();
});

describe('interactive recalculation preview — PRO', () => {
  it('fixture 1: strong secondary reduction → edit + lock in the preview → recalculated in place → applied once → Cofnij exact', async () => {
    loadOwner(ownerFruitRecipe({ batch: 1000 }));
    const originalFingerprint = draftFingerprint();
    await runPiRecalculationWithTerminal();
    const first = useConstraintStudioStore.getState().preview;
    expect(first, JSON.stringify(useConstraintStudioStore.getState().previewIssue)).not.toBeNull();
    if (!first) return;
    // The strong, mathematically legal reduction is shown — and PR #276 holds:
    // a secondary flavour may give mass back but never receives more.
    expect(grams(first.proposedInput, 'cranberry')).toBeLessThan(130 / 4);
    expect(grams(first.proposedInput, 'cranberry')!).toBeLessThanOrEqual(130);
    expect(grams(first.proposedInput, 'strawberry')!).toBeLessThanOrEqual(100);
    expect(first.previewInstructions).toBeUndefined();

    const before = recipeSnapshot();
    await runInteractiveRecalculationWithTerminal([
      { lineId: 'cranberry', grams: 20, locked: true },
    ]);
    const session = useConstraintStudioStore.getState();
    expect(session.recalculationTerminal?.state).toBe('PREVIEW_READY');
    const interactive = session.preview;
    expect(interactive).not.toBeNull();
    if (!interactive) return;
    expect(interactive.previewInstructions?.lines).toEqual([
      { lineId: 'cranberry', grams: 20, locked: true },
    ]);
    expect(interactive.previewInstructions?.baseFingerprint).toBe(originalFingerprint);
    expect(grams(interactive.proposedInput, 'cranberry')).toBe(20);
    expect(interactive.nextConstraints.byLineId.cranberry).toEqual({ mode: 'locked', grams: 20 });
    // The customer compares with the recipe ON SCREEN (130 g), not the draft.
    expect(interactive.lines.find((line) => line.lineId === 'cranberry')).toMatchObject({
      beforeGrams: 130,
      afterGrams: 20,
      locked: true,
    });
    expect(session.previewInstructionAuthorization?.lines).toEqual([
      { lineId: 'cranberry', grams: 20, locked: true },
    ]);
    // Provisional: the recipe itself did not move while experimenting.
    expect(recipeSnapshot()).toEqual(before);

    await applyPreviewWithServerAuthority();
    const applied = useConstraintStudioStore.getState();
    expect(applied.blocked, JSON.stringify(applied.blocked)).toBeNull();
    expect(applied.preview).toBeNull();
    expect(applied.history).toHaveLength(1);
    expect(applied.previewInstructionAuthorization).toBeNull();
    expect(applied.lockConflict).toBeNull();
    expect(recipeLine('cranberry')).toMatchObject({
      planned_grams: 20,
      lock_type: 'grams',
      grams_constraint: { grams: 20 },
    });
    expect(selectCanonicalDraft().constraints.byLineId.cranberry).toEqual({
      mode: 'locked',
      grams: 20,
    });
    expect(
      selectCanonicalDraft().input.items.reduce((sum, item) => sum + item.planned_grams, 0),
    ).toBe(1000);

    useConstraintStudioStore.getState().undoLastApply();
    await settled();
    expect(draftFingerprint()).toBe(originalFingerprint);
    expect(useConstraintStudioStore.getState().constraints.byLineId.cranberry).toBeUndefined();
    expect(recipeLine('cranberry')).toMatchObject({ planned_grams: 130, lock_type: 'unlocked' });
    expect(useConstraintStudioStore.getState().history).toHaveLength(0);
  });

  it('fixture 1b: an edited amount WITHOUT the padlock stays a solver input (decrease-only), never a hidden lock', async () => {
    loadOwner(ownerFruitRecipe({ batch: 1000 }));
    await runPiRecalculationWithTerminal();
    await runInteractiveRecalculationWithTerminal([
      { lineId: 'cranberry', grams: 20, locked: false },
    ]);
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.nextConstraints.byLineId.cranberry).toBeUndefined();
    expect(grams(preview.proposedInput, 'cranberry')!).toBeLessThanOrEqual(20);
    expect(preview.proposedInput.items.find((item) => item.id === 'cranberry')?.lock_type).toBe(
      'unlocked',
    );
  });

  it('fixture 7 (plain path): Zastosuj zmiany without edits applies the proposal exactly as before', async () => {
    loadOwner(ownerFruitRecipe({ batch: 1000 }));
    await runPiRecalculationWithTerminal();
    const preview = useConstraintStudioStore.getState().preview!;
    await applyPreviewWithServerAuthority();
    expect(useConstraintStudioStore.getState().history).toHaveLength(1);
    for (const item of preview.proposedInput.items) {
      expect(recipeLine(item.id).planned_grams).toBe(item.planned_grams);
    }
  });

  it('fixture 2: an existing exact lock stays exact through every interactive recalculation', async () => {
    loadOwner(ownerFruitRecipe({ batch: 1000 }), ['strawberry']);
    await runPiRecalculationWithTerminal();
    const first = useConstraintStudioStore.getState().preview;
    expect(first).not.toBeNull();
    if (!first) return;
    expect(grams(first.proposedInput, 'strawberry')).toBe(100);
    await runInteractiveRecalculationWithTerminal([
      { lineId: 'cranberry', grams: 30, locked: true },
    ]);
    const second = useConstraintStudioStore.getState().preview;
    expect(second).not.toBeNull();
    if (!second) return;
    expect(grams(second.proposedInput, 'strawberry')).toBe(100);
    expect(second.nextConstraints.byLineId.strawberry).toEqual({ mode: 'locked', grams: 100 });
    expect(grams(second.proposedInput, 'cranberry')).toBe(30);
  });

  it('fixture 3: two locks → conflict (no dead end) → smallest correction → „Użyj propozycji" → legal preview → Zastosuj → Cofnij exact', async () => {
    loadOwner(ownerFruitRecipe({ batch: 600 }), ['strawberry', 'cranberry']);
    const originalFingerprint = draftFingerprint();
    await runPiRecalculationWithTerminal();
    const failed = useConstraintStudioStore.getState();
    expect(failed.preview).toBeNull();
    expect(failed.previewIssue).not.toBeNull();
    const conflict = failed.lockConflict;
    expect(conflict).not.toBeNull();
    if (!conflict) return;
    expect(conflict.baseFingerprint).toBe(originalFingerprint);
    expect(conflict.sessionInstructions).toEqual([]);
    const relaxation = relaxationOf(conflict.diagnosis);
    expect(relaxation.blockers.map((blocker) => blocker.code)).toContain(
      'liquid_dairy_carrier_below_floor',
    );
    const before = recipeSnapshot();

    await runInteractiveRecalculationWithTerminal(
      mergePreviewInstructions(
        conflict.sessionInstructions,
        lockRelaxationInstructions(relaxation),
      ),
    );
    const staged = useConstraintStudioStore.getState();
    expect(staged.recalculationTerminal?.state).toBe('PREVIEW_READY');
    expect(staged.lockConflict).toBeNull();
    const preview = staged.preview;
    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.diagnosticOnly).not.toBe(true);
    for (const change of relaxation.changes) {
      expect(grams(preview.proposedInput, change.lineId)).toBe(change.toGrams);
      expect(preview.nextConstraints.byLineId[change.lineId]).toEqual({
        mode: 'locked',
        grams: change.toGrams,
      });
    }
    expect(recipeSnapshot()).toEqual(before);

    await applyPreviewWithServerAuthority();
    const applied = useConstraintStudioStore.getState();
    expect(applied.blocked, JSON.stringify(applied.blocked)).toBeNull();
    expect(applied.history).toHaveLength(1);
    for (const change of relaxation.changes) {
      expect(recipeLine(change.lineId)).toMatchObject({
        planned_grams: change.toGrams,
        lock_type: 'grams',
      });
    }

    useConstraintStudioStore.getState().undoLastApply();
    await settled();
    expect(draftFingerprint()).toBe(originalFingerprint);
    expect(useConstraintStudioStore.getState().constraints.byLineId).toMatchObject({
      strawberry: { mode: 'locked', grams: 100 },
      cranberry: { mode: 'locked', grams: 130 },
    });
  });

  it('served shape (staging a7478aa7): a candidate that only the ProductBehavior binding rejects on the Main floor still opens the conflict — never a dead end', async () => {
    loadOwner(ownerFruitRecipe({ batch: 600 }), ['strawberry', 'cranberry']);
    const loadedItems = structuredClone(useRecipeStore.getState().items);
    // Served staging returned exactly this: the canonical solve came back OK
    // with the Crown line untouched, and only the binding inside
    // createOptimizePreview refused it („Grupa Main ma 0.1%; wymagane minimum
    // to 20.0%"). A genuine OK Preview whose proposal is the customer's own
    // locked recipe reproduces that shape without inventing a solver result.
    optimizeOverride.next = (request) => {
      const free = computeOptimizePreviewResult({
        ...request,
        input: {
          ...request.input,
          items: request.input.items.map((item) => {
            if (item.lock_type !== 'grams') return item;
            const unlocked = { ...item, lock_type: 'unlocked' as const };
            delete unlocked.grams_constraint;
            return unlocked;
          }),
        },
        constraints: { byLineId: {} },
      });
      if (!free.ok) throw new Error(`expected a solvable free recipe, got ${free.code}`);
      return {
        result: {
          ...free,
          preview: { ...free.preview, proposedInput: structuredClone(request.input) },
        },
        rescueAdvice: null,
      };
    };
    await runPiRecalculationWithTerminal();
    const failed = useConstraintStudioStore.getState();
    expect(optimizeOverride.next).toBeNull();
    expect(failed.preview).toBeNull();
    const issue = failed.previewIssue;
    if (issue?.code !== 'product_behavior_invalid') {
      throw new Error(`expected the bound ProductBehavior refusal, got ${issue?.code}`);
    }
    expect(issue.messagePl).toContain('Propozycja Gellatti została odrzucona');
    const relaxation = relaxationOf(failed.lockConflict?.diagnosis);
    expect(relaxation.blockers.map((blocker) => blocker.code)).toContain('main_below_floor');
    expect(relaxation.changes.map((change) => change.lineId).sort()).toEqual([
      'cranberry',
      'strawberry',
    ]);
    expect(useRecipeStore.getState().items).toEqual(loadedItems);
    const before = recipeSnapshot();

    // „Użyj propozycji": the real canonical flow re-solves with those amounts.
    await runInteractiveRecalculationWithTerminal(
      mergePreviewInstructions(
        failed.lockConflict!.sessionInstructions,
        lockRelaxationInstructions(relaxation),
      ),
    );
    const staged = useConstraintStudioStore.getState();
    expect(staged.recalculationTerminal?.state).toBe('PREVIEW_READY');
    expect(staged.lockConflict).toBeNull();
    expect(recipeSnapshot()).toEqual(before);
  });

  it('fixture 5: the customer overrides the proposal inside the conflict — same session, updated gap, recipe untouched', async () => {
    loadOwner(ownerFruitRecipe({ batch: 600 }), ['strawberry', 'cranberry']);
    await runPiRecalculationWithTerminal();
    const before = recipeSnapshot();
    const firstGap = useConstraintStudioStore
      .getState()
      .lockConflict?.diagnosis.blockers.find(
        (blocker) => blocker.code === 'liquid_dairy_carrier_below_floor',
      );

    // „Cranberry 130 g → 90 g 🔒 → Przelicz": still impossible.
    await runInteractiveRecalculationWithTerminal([
      { lineId: 'cranberry', grams: 90, locked: true },
    ]);
    const second = useConstraintStudioStore.getState();
    expect(second.preview).toBeNull();
    expect(second.lockConflict?.sessionInstructions).toEqual([
      { lineId: 'cranberry', grams: 90, locked: true },
    ]);
    const secondRelaxation = relaxationOf(second.lockConflict?.diagnosis);
    expect(secondRelaxation.locks.find((lock) => lock.lineId === 'cranberry')?.grams).toBe(90);
    const secondGap = secondRelaxation.blockers.find(
      (blocker) => blocker.code === 'liquid_dairy_carrier_below_floor',
    );
    // The remaining gap is recomputed for the customer's own value: less
    // Cranberry leaves more room for the liquid base, never less.
    if (firstGap?.actualPercent != null && secondGap?.actualPercent != null) {
      expect(secondGap.actualPercent).toBeGreaterThanOrEqual(firstGap.actualPercent);
    }
    expect(recipeSnapshot()).toEqual(before);

    // The customer's own, feasible amounts.
    await runInteractiveRecalculationWithTerminal(
      mergePreviewInstructions(second.lockConflict!.sessionInstructions, [
        { lineId: 'strawberry', grams: 40, locked: true },
        { lineId: 'cranberry', grams: 50, locked: true },
      ]),
    );
    const third = useConstraintStudioStore.getState();
    expect(third.preview, JSON.stringify(third.previewIssue)).not.toBeNull();
    if (!third.preview) return;
    expect(grams(third.preview.proposedInput, 'strawberry')).toBe(40);
    expect(grams(third.preview.proposedInput, 'cranberry')).toBe(50);
    expect(recipeSnapshot()).toEqual(before);
  });

  it('fixture 6: X / Wróć after several edits leaves the recipe byte-identical and nothing provisional', async () => {
    loadOwner(ownerFruitRecipe({ batch: 600 }), ['strawberry', 'cranberry']);
    await runPiRecalculationWithTerminal();
    const before = recipeSnapshot();
    await runInteractiveRecalculationWithTerminal([
      { lineId: 'cranberry', grams: 90, locked: true },
    ]);
    await runInteractiveRecalculationWithTerminal([
      { lineId: 'cranberry', grams: 50, locked: true },
      { lineId: 'strawberry', grams: 40, locked: false },
    ]);
    useConstraintStudioStore.getState().cancelPreview();
    const state = useConstraintStudioStore.getState();
    expect(state.preview).toBeNull();
    expect(state.lockConflict).toBeNull();
    expect(state.previewInstructionAuthorization).toBeNull();
    expect(state.pendingInstructionCommit).toBeNull();
    expect(state.history).toHaveLength(0);
    expect(recipeSnapshot()).toEqual(before);
  });

  it('fixture 8 (HOME): Crown on one line only → every reduction is exposed; edit + lock + recalculate; the preview writes no Crown and no 1 g seed', async () => {
    loadOwner(ownerFruitRecipe({ batch: 1000 }));
    // HOME offers the Crown to every user-added BASE line through the SAME
    // canonical authority; a line Main cannot carry is refused on its own.
    for (const lineId of ['strawberry', 'cranberry']) {
      useRecipeStore.getState().setMainIngredient(lineId, 'home');
    }
    const crowned = () =>
      useRecipeStore
        .getState()
        .items.filter((item) => item.lock_type === 'main')
        .map((item) => item.id);
    expect(crowned()).toEqual(['watermelon']);
    const seedsBefore = [...useRecipeStore.getState().crownAutoSeededLineIds];

    await runPiRecalculationWithTerminal();
    const first = useConstraintStudioStore.getState().preview;
    expect(first).not.toBeNull();
    if (!first) return;
    // The non-Crown lines may be reduced by the Solver — and the preview SAYS so.
    const reduced = first.lines
      .filter(
        (line) =>
          line.kind === 'changed' &&
          line.afterGrams !== null &&
          line.beforeGrams !== null &&
          line.afterGrams < line.beforeGrams,
      )
      .map((line) => line.lineId);
    expect(reduced).toEqual(expect.arrayContaining(['strawberry', 'cranberry']));

    await runInteractiveRecalculationWithTerminal([
      { lineId: 'strawberry', grams: 60, locked: true },
    ]);
    const second = useConstraintStudioStore.getState().preview;
    expect(second).not.toBeNull();
    if (!second) return;
    expect(grams(second.proposedInput, 'strawberry')).toBe(60);
    expect(crowned()).toEqual(['watermelon']);

    await applyPreviewWithServerAuthority();
    expect(useConstraintStudioStore.getState().history).toHaveLength(1);
    expect(crowned()).toEqual(['watermelon']);
    expect(useRecipeStore.getState().crownAutoSeededLineIds).toEqual(seedsBefore);
    expect(recipeLine('strawberry')).toMatchObject({ planned_grams: 60, lock_type: 'grams' });
    expect(recipeLine('cranberry').lock_type).toBe('unlocked');
  });

  it('the door refuses an instruction preview whose authorization was forged or went stale', async () => {
    loadOwner(ownerFruitRecipe({ batch: 1000 }));
    await runPiRecalculationWithTerminal();
    await runInteractiveRecalculationWithTerminal([
      { lineId: 'cranberry', grams: 20, locked: true },
    ]);
    const session = useConstraintStudioStore.getState();
    const preview = session.preview!;
    const authorization = session.previewInstructionAuthorization!;
    const draft = selectCanonicalDraft();
    const snapshots = useRecipeStore.getState().productBehaviorSnapshots;
    const attempt = (auth: typeof authorization | null) =>
      commitPreview(
        draft.input,
        draft.constraints,
        preview,
        '2026-09-11T10:00:00.000Z',
        'forged',
        draft.excludedIngredientIds,
        draft.revision,
        null,
        null,
        null,
        null,
        snapshots,
        [],
        session.proposalProductBehaviorAuthorization,
        null,
        { requirePracticalPreview: true },
        auth,
      );
    expect(attempt(null)).toMatchObject({ ok: false, code: 'stale_preview' });
    expect(
      attempt({ ...authorization, lines: [{ lineId: 'cranberry', grams: 21, locked: true }] }),
    ).toMatchObject({ ok: false, code: 'stale_preview' });
    expect(attempt({ ...authorization, baseFingerprint: 'other' })).toMatchObject({
      ok: false,
      code: 'stale_preview',
    });
    // A recipe edit in the meantime invalidates the staged session entirely.
    useRecipeStore.getState().setPlannedGrams('milk', recipeLine('milk').planned_grams + 1);
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewInstructionAuthorization).toBeNull();
  });
});
