/**
 * OWNER FINAL INTEGRATION ADDENDUM — AGENT C, item 6:
 * „THE EXACT MULTI-REMOVE NO-REFRESH FLOW".
 *
 * OWNER'S BINDING INSTRUCTION: „Reproduce the exact remaining live failure:
 * remove several ingredients, immediately click Przelicz z PI, compare with
 * refresh. Do NOT close the refresh defect using only the separate Inulin
 * fixture."
 *
 * WHAT THIS FILE IS. `removalRecalc.test.ts` (FINAL CLOSURE, Agent R) proved
 * the removal SEMANTICS on its own fruit-gelato fixture. This file runs the
 * owner's LITERAL sequence — open a saved recipe → remove Cream → remove SMP →
 * remove Dextrose → edit one more ingredient's grams → immediately press the
 * workbar button — over the REAL stores (no store mocks, no UI wrapper), and
 * compares the COMPLETE canonical payload of that click against the payload of
 * the SAME click after a faithful page reload.
 *
 * WHAT IT FOUND (see docs/product-completion/MULTI_REMOVE_NOREFRESH_LEDGER.md).
 * The literal remove→remove→remove→edit→recalc flow already produced a
 * byte-identical payload and a genuinely usable proposal, both live and
 * refreshed — Agent R's fix holds on the owner's real sequence, not only on its
 * own fixture. But the ASYMMETRY CLASS behind the original bug was still open on
 * two adjacent branches of the same flow, because two of the eight fields
 * `canonicalDraftSerialization` itself calls FORMULATION-MATERIAL were absent
 * from the persistence contract:
 *
 *   1. `exclusions` — `markIngredientUnavailable` writes `excludedIngredientIds`,
 *      which was NOT in `recipePersistPartialize`. Agent R removed `removeItem`
 *      as a writer but left the leak itself open: live payload
 *      `["tara_gum"]` vs refreshed `[]` (first differing field: `exclusions`).
 *      The owner-frozen guarantee „an explicitly unavailable ingredient never
 *      returns" was therefore true only until the next F5.
 *   2. `byLineId` — a §17 padlock writes BOTH halves of one lock: the exact
 *      grams into the (unpersisted) constraint store AND `lock_type: 'grams'`
 *      onto the (persisted) recipe line. After a reload the line stayed
 *      engine-frozen while its padlock evaporated: live payload
 *      `{"milk-base:sucrose":{"mode":"locked","grams":130}}` vs refreshed `{}`
 *      (first differing field: `byLineId`).
 *
 * THE FIX (in the two stores Agent C owns): `excludedIngredientIds` joins
 * `recipePersistPartialize`, and the §17 CONSTRAINT SET alone joins a new
 * `constraintStudioPersistPartialize` (staged preview / issue / feasibility /
 * blocked / history stay working memory — a rehydrated preview would be stale
 * by construction). Rehydration is reconciled, never trusted, so an entry
 * survives only while its line exists AND still carries the engine lock.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput, RecipeItem } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import { recipePersistPartialize, useRecipeStore } from '@/stores/recipeStore';
import { plannedSum } from './applyPipeline';
import {
  canonicalDraftSerialization,
  constraintStudioPersistPartialize,
  reconcileConstraints,
  selectCanonicalDraft,
  useConstraintStudioStore,
} from './constraintStudioStore';

/* ── the owner's saved recipe ─────────────────────────────────────────────── */

const ing = (id: string): EngineIngredient => findDemoIngredient(id)!;

/** Stable saved-recipe line ids — exactly the shape a real `saved_recipes.recipe_input`
 * carries (deterministic `<preset>:<ingredient>` ids that survive save/reload). */
const line = (
  id: string,
  ingredientId: string,
  grams: number,
  lock: RecipeItem['lock_type'] = 'unlocked',
): RecipeItem => ({
  id,
  ingredient: ing(ingredientId),
  planned_grams: grams,
  actual_grams: null,
  lock_type: lock,
});

const CREAM_LINE = 'milk-base:cream_30';
const SMP_LINE = 'milk-base:smp';
const DEXTROSE_LINE = 'milk-base:dextrose';
const MILK_LINE = 'milk-base:milk_3_5';
const SUCROSE_LINE = 'milk-base:sucrose';
const TARA_LINE = 'milk-base:tara_gum';

/** „Gelato mleczne · 1000 g" — a COMPLETE saved milk gelato that really contains
 * the three lines the owner removes (Cream, SMP, Dextrose). */
const ownerSavedRecipe = (): RecipeInput =>
  structuredClone({
    items: [
      line(MILK_LINE, 'milk_3_5', 670),
      line(CREAM_LINE, 'cream_30', 130),
      line(SMP_LINE, 'smp', 35),
      line(SUCROSE_LINE, 'sucrose', 130),
      line(DEXTROSE_LINE, 'dextrose', 30),
      line(TARA_LINE, 'tara_gum', 5),
    ],
    mode: 'classic' as const,
    category: 'milk_gelato' as const,
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { flavor_intensity: 'balanced' as const, cost_priority: 'balanced' as const },
  });

const SAVED_LINE_IDS = [MILK_LINE, CREAM_LINE, SMP_LINE, SUCROSE_LINE, DEXTROSE_LINE, TARA_LINE];

/** The REAL load path: `loadRecipeInput` with a saved-recipe link, so the draft
 * context behaves exactly like opening a saved recipe from „Moje receptury". */
const openSavedRecipe = () =>
  useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe(), {
    savedId: 'r-owner-multi-remove',
    savedName: 'Gelato mleczne',
    versionNumber: 4,
    versionDate: '2026-07-20T10:00:00.000Z',
  });

/* ── session lifecycle ────────────────────────────────────────────────────── */

const resetSession = () => {
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
    items: [],
    excludedIngredientIds: [],
    activePresetId: null,
    savedRecipeId: null,
    savedRecipeName: null,
    currentVersionNumber: null,
    currentVersionDate: null,
    machineKind: null,
    servingModeId: null,
    machineId: null,
    machineLabel: null,
    dirty: false,
    draftRevision: 0,
    draftContextSeq: 0,
  });
  useConstraintStudioStore.getState().resetForTests();
};

beforeEach(resetSession);

/**
 * THE FAITHFUL PAGE RELOAD. Both stores are module singletons, so „fresh store
 * instances" means: keep EXACTLY what each store's `partialize` writes to
 * localStorage, reset everything else to its initial value, then merge the
 * persisted slice back — which is precisely what zustand's persist middleware
 * does on rehydration (shallow merge over the initial state), including the
 * constraint store's reconciling `merge`.
 *
 * Nothing here reaches around the partialize: if a formulation-material field
 * ever leaves the persistence contract again, this helper drops it and the
 * comparison below fails on that exact field name.
 */
const simulateReload = () => {
  const persistedRecipe = structuredClone(recipePersistPartialize(useRecipeStore.getState()));
  const persistedSession = structuredClone(
    constraintStudioPersistPartialize(useConstraintStudioStore.getState()),
  );

  resetSession(); // every store back to its initial value (a brand-new tab)

  useRecipeStore.setState({
    ...persistedRecipe,
    // NOT persisted by contract — a fresh session legitimately starts at 0.
    draftRevision: 0,
    draftContextSeq: 0,
  });
  useConstraintStudioStore.setState({
    // The store's own persist `merge` reconciles the rehydrated §17 entries
    // against the rehydrated lines before anything can read them.
    constraints: reconcileConstraints(
      useRecipeStore.getState().items,
      persistedSession.constraints,
    ),
  });
};

/* ── the FULL canonical payload at the moment of the click ────────────────── */

interface CanonicalPayload {
  /** Byte-comparable formulation-material half — a reload MUST reproduce it. */
  material: Record<string, unknown>;
  /** Session metadata a reload legitimately resets (documented, not compared). */
  sessionMeta: Record<string, unknown>;
}

const capturePayload = (): CanonicalPayload => {
  const recipe = useRecipeStore.getState();
  const session = useConstraintStudioStore.getState();
  const draft = selectCanonicalDraft();
  const currentIds = new Set(recipe.items.map((item) => item.id));

  return {
    material: {
      // rendered / store line ids + grams + actuals + lock types
      lines: recipe.items.map((item) => [
        item.id,
        item.ingredient.id,
        item.planned_grams,
        item.actual_grams,
        item.lock_type,
      ]),
      // the ids the pipeline itself will see (buildRecipeInput seam)
      pipelineLines: draft.input.items.map((item) => [item.id, item.planned_grams, item.lock_type]),
      // §17 constraints (effective, reconciled against the current lines)
      constraintsByLineId: draft.constraints.byLineId,
      // explicit exclusions == the „unavailable" registry (one source, C2)
      exclusions: [...draft.excludedIngredientIds],
      unavailableIngredientIds: [...recipe.excludedIngredientIds],
      // which of the saved recipe's lines are gone
      removedLineIds: SAVED_LINE_IDS.filter((id) => !currentIds.has(id)),
      // role mappings AS THE PIPELINE RESOLVES THEM
      roleMappings: recipe.items.map((item) => [item.id, resolveFunctionalRole(item.ingredient)]),
      // batch + total
      targetBatchGrams: draft.input.target_batch_grams,
      currentTotalGrams: recipe.items.reduce((sum, item) => sum + item.planned_grams, 0),
      // product type (visible) + internal profile (engine policy) + tier + temp
      visibleProductType: recipe.visibleProductType,
      internalCategory: draft.input.category,
      tier: draft.input.mode,
      temperatureC: draft.input.target_temperature_c,
      // machine context (routing/UX + the capacity that really reaches the engine)
      machine: {
        ...draft.machine,
        storedCapacityGrams: recipe.machine_capacity_grams,
        capacitySource: recipe.machine_capacity_source,
        effectiveCapacityGrams: draft.input.machine_capacity_grams,
      },
      // saved-recipe metadata
      savedRecipe: { ...draft.savedRecipe, versionDate: recipe.currentVersionDate },
      // staged preview — must be empty at every click moment
      stagedPreviewKind: session.preview?.kind ?? null,
      stagedPreviewIssueCode: session.previewIssue?.code ?? null,
    },
    sessionMeta: {
      draftRevision: draft.revision,
      draftContextSeq: draft.contextSeq,
      dirty: recipe.dirty,
      /**
       * The §20 undo history is WORKING MEMORY by design: each record holds a
       * byte-exact in-memory pre-apply snapshot, and the durable equivalent is
       * the save→version path. It is captured here (the owner asked for it in
       * the payload) but is deliberately session-scoped, so a reload resets it
       * — „Cofnij" is offered for the current session's applies only.
       */
      applyHistoryLength: session.history.length,
    },
  };
};

/** Comparable projection of a staged preview (timestamps/revision excluded —
 * they are session metadata by construction). */
const projectStagedResult = () => {
  const { preview, previewIssue } = useConstraintStudioStore.getState();
  if (previewIssue) return { outcome: 'issue' as const, code: previewIssue.code };
  if (!preview) return { outcome: 'nothing' as const };
  return {
    outcome: 'preview' as const,
    kind: preview.kind,
    baseFingerprint: preview.baseFingerprint,
    batchReconciliationOnly: preview.batchReconciliationOnly ?? false,
    missingRoles: preview.formulation?.missingRoles ?? [],
    roleTrace: (preview.formulation?.roleTrace ?? []).map((row) => [
      row.role,
      row.hard,
      row.outcome,
      row.excluded,
    ]),
    items: preview.proposedInput.items.map((item) => [
      item.id,
      item.ingredient.id,
      item.planned_grams,
      item.lock_type,
    ]),
    total: plannedSum(preview.proposedInput),
  };
};

/** THE canonical recalculation entry point the workbar „Przelicz z PI" button
 * calls (ProWorkspacePage → `startRecalc`). No UI, no wrapper, no timeout. */
const clickPrzeliczZPi = () => useConstraintStudioStore.getState().createOptimizePreview();

/** The owner's LITERAL sequence, WITHOUT any reload in between. */
const runOwnerLiteralSequence = () => {
  openSavedRecipe();
  useRecipeStore.getState().removeItem(CREAM_LINE); // remove Cream
  useRecipeStore.getState().removeItem(SMP_LINE); // remove SMP
  useRecipeStore.getState().removeItem(DEXTROSE_LINE); // remove Dextrose
  useRecipeStore.getState().setPlannedGrams(SUCROSE_LINE, 140); // edit one more value
};

/** Field-by-field first-difference report (the ledger instrument). */
const firstDifferingField = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): string | null => {
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return key;
  }
  return null;
};

/* ── 1/2/4 — the literal click, fully captured, genuinely usable ──────────── */

describe('owner item 6.1/6.2 — the literal multi-remove sequence, no reload', () => {
  it('opens the SAVED recipe through the real load path with a live aggregate link', () => {
    openSavedRecipe();
    const recipe = useRecipeStore.getState();
    expect(recipe.items.map((item) => item.id)).toEqual(SAVED_LINE_IDS);
    expect(recipe.savedRecipeId).toBe('r-owner-multi-remove');
    expect(recipe.currentVersionNumber).toBe(4);
    // A loaded recipe starts a FRESH §17 context (no inherited padlocks).
    expect(useConstraintStudioStore.getState().constraints.byLineId).toEqual({});
    expect(useConstraintStudioStore.getState().history).toEqual([]);
  });

  it('remove Cream → SMP → Dextrose → edit grams leaves NO orphan state at the click moment', () => {
    runOwnerLiteralSequence();
    const payload = capturePayload();

    expect(payload.material.removedLineIds).toEqual([CREAM_LINE, SMP_LINE, DEXTROSE_LINE]);
    expect(payload.material.lines).toEqual([
      [MILK_LINE, 'milk_3_5', 670, null, 'unlocked'],
      [SUCROSE_LINE, 'sucrose', 140, null, 'unlocked'],
      [TARA_LINE, 'tara_gum', 5, null, 'unlocked'],
    ]);
    // No orphan §17 entry, no exclusion invented by a removal (C2), no staged
    // result surviving the edits, no half-applied history.
    expect(payload.material.constraintsByLineId).toEqual({});
    expect(payload.material.exclusions).toEqual([]);
    expect(payload.material.unavailableIngredientIds).toEqual([]);
    expect(payload.material.stagedPreviewKind).toBeNull();
    expect(payload.material.stagedPreviewIssueCode).toBeNull();
    expect(payload.sessionMeta.applyHistoryLength).toBe(0);
    // The role map is rebuilt from the CURRENT lines only.
    expect((payload.material.roleMappings as unknown[]).length).toBe(3);
    expect(payload.material.targetBatchGrams).toBe(1000);
    expect(payload.material.currentTotalGrams).toBe(815);
  });

  it('the IMMEDIATE „Przelicz z PI" produces a genuinely usable proposal (owner item 6.4)', () => {
    runOwnerLiteralSequence();
    clickPrzeliczZPi();
    const { preview, previewIssue } = useConstraintStudioStore.getState();

    // Not a stale-state failure, not an orphan-constraint refusal, and above
    // all NOT the `missing_required_role` the removal-as-exclusion bug caused.
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    expect(Math.abs(plannedSum(preview!.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);

    // The vacated ROLES are genuinely refilled — removal is not exclusion…
    const proposedIngredients = preview!.proposedInput.items.map((item) => item.ingredient.id);
    expect(proposedIngredients).toContain('dextrose'); // sugar_freezing_control (HARD)
    // …but never by restoring the removed LINE identity (stale role mapping).
    for (const removed of [CREAM_LINE, SMP_LINE, DEXTROSE_LINE]) {
      expect(preview!.proposedInput.items.some((item) => item.id === removed)).toBe(false);
    }
    // No duplicate canonical identities in the proposal.
    expect(new Set(proposedIngredients).size).toBe(proposedIngredients.length);
  });
});

/* ── 3 — live payload vs the payload after a real reload ──────────────────── */

describe('owner item 6.3 — live click ≡ post-refresh click, field by field', () => {
  it('the FULL canonical payload is byte-identical before and after the reload', () => {
    runOwnerLiteralSequence();
    const live = capturePayload();

    simulateReload();
    const refreshed = capturePayload();

    // Report the FIRST differing field by name (pre-fix instrument: this is
    // where `exclusions` / `byLineId` used to show up).
    expect(firstDifferingField(live.material, refreshed.material)).toBeNull();
    expect(JSON.stringify(live.material)).toBe(JSON.stringify(refreshed.material));

    // The canonical serializer agrees — the equality contract, not just this file.
    expect(canonicalDraftSerialization(selectCanonicalDraft())).toBe(
      JSON.stringify(JSON.parse(canonicalDraftSerialization(selectCanonicalDraft()))),
    );

    // Session metadata legitimately resets (documented, never material).
    expect(refreshed.sessionMeta.draftRevision).toBe(0);
    expect(refreshed.sessionMeta.draftContextSeq).toBe(0);
    expect(live.sessionMeta.draftRevision).not.toBe(0);
  });

  it('the §20 undo history is session-scoped ON PURPOSE (the one non-material reset)', () => {
    runOwnerLiteralSequence();
    clickPrzeliczZPi();
    useConstraintStudioStore.getState().applyPreview();
    const live = capturePayload();
    expect(live.sessionMeta.applyHistoryLength).toBe(1);

    simulateReload();
    const refreshed = capturePayload();
    // The DRAFT the apply produced survives byte-for-byte…
    expect(firstDifferingField(live.material, refreshed.material)).toBeNull();
    // …only the in-memory „Cofnij" affordance is session-scoped.
    expect(refreshed.sessionMeta.applyHistoryLength).toBe(0);
  });

  it('the IDENTICAL click on both sides yields the IDENTICAL result', () => {
    runOwnerLiteralSequence();
    clickPrzeliczZPi();
    const liveResult = projectStagedResult();
    expect(liveResult.outcome).toBe('preview');

    // Cancel first: the staged preview is working memory and must NOT be what
    // carries the equality (a rehydrated preview would be stale by construction).
    useConstraintStudioStore.getState().cancelPreview();
    simulateReload();
    clickPrzeliczZPi();
    const refreshedResult = projectStagedResult();

    expect(JSON.stringify(refreshedResult)).toBe(JSON.stringify(liveResult));
  });

  it('the immediate click is not merely equal — it is equal AND usable on both sides', () => {
    runOwnerLiteralSequence();
    clickPrzeliczZPi();
    const liveTotal = plannedSum(useConstraintStudioStore.getState().preview!.proposedInput);
    useConstraintStudioStore.getState().cancelPreview();

    simulateReload();
    clickPrzeliczZPi();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    expect(plannedSum(preview!.proposedInput)).toBe(liveTotal);
  });
});

/* ── 3/4 — the two asymmetry branches this addendum sealed ────────────────── */

describe('owner item 6.4 — the persistence asymmetries that remained (root cause + fix)', () => {
  it('an EXPLICIT „Niedostępny" survives the reload — exclusions are draft-material', () => {
    // Pre-fix first differing field: `exclusions` (live ["cream_30"] vs []).
    openSavedRecipe();
    useRecipeStore.getState().markIngredientUnavailable(CREAM_LINE);
    useRecipeStore.getState().removeItem(SMP_LINE);
    useRecipeStore.getState().removeItem(DEXTROSE_LINE);
    useRecipeStore.getState().setPlannedGrams(SUCROSE_LINE, 140);
    const live = capturePayload();
    expect(live.material.exclusions).toEqual(['cream_30']);

    simulateReload();
    const refreshed = capturePayload();
    expect(firstDifferingField(live.material, refreshed.material)).toBeNull();

    // The owner-frozen guarantee now holds ACROSS a reload too.
    clickPrzeliczZPi();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    if (preview) {
      expect(preview.proposedInput.items.some((i) => i.ingredient.id === 'cream_30')).toBe(false);
    } else {
      expect(previewIssue).not.toBeNull(); // honest structured refusal, never a silent return
    }
  });

  it('a §17 padlock survives the reload — both halves of one lock, or neither', () => {
    // Pre-fix first differing field: `byLineId` — the engine half (`lock_type:
    // 'grams'`) was persisted while the padlock half evaporated, leaving a
    // reloaded draft frozen with no lock to show for it.
    openSavedRecipe();
    useConstraintStudioStore.getState().toggleLock(SUCROSE_LINE); // padlock @130 g
    useRecipeStore.getState().removeItem(CREAM_LINE);
    useRecipeStore.getState().removeItem(SMP_LINE);
    useRecipeStore.getState().removeItem(DEXTROSE_LINE);
    useRecipeStore.getState().setPlannedGrams(MILK_LINE, 680);
    const live = capturePayload();
    expect(live.material.constraintsByLineId).toEqual({
      [SUCROSE_LINE]: { mode: 'locked', grams: 130 },
    });

    simulateReload();
    const refreshed = capturePayload();
    expect(firstDifferingField(live.material, refreshed.material)).toBeNull();
    // Byte-exact grams across the reload (frozen invariant: locks are Object.is).
    const rehydrated = useConstraintStudioStore.getState().constraints.byLineId[SUCROSE_LINE];
    expect(rehydrated?.mode).toBe('locked');
    expect(Object.is(rehydrated?.mode === 'locked' ? rehydrated.grams : NaN, 130)).toBe(true);
    // And the engine half still agrees.
    expect(
      useRecipeStore.getState().items.find((i) => i.id === SUCROSE_LINE)!.lock_type,
    ).toBe('grams');
  });

  it('a rehydrated §17 entry whose line is gone is RECONCILED away, never trusted', () => {
    openSavedRecipe();
    useConstraintStudioStore.getState().toggleLock(CREAM_LINE);
    // Persist the §17 half, then reload against a draft whose line was removed
    // in another surface (the shape a stale localStorage pair really takes).
    const persistedSession = structuredClone(
      constraintStudioPersistPartialize(useConstraintStudioStore.getState()),
    );
    useRecipeStore.getState().removeItem(CREAM_LINE);
    const persistedRecipe = structuredClone(recipePersistPartialize(useRecipeStore.getState()));
    resetSession();
    useRecipeStore.setState({ ...persistedRecipe, draftRevision: 0, draftContextSeq: 0 });
    useConstraintStudioStore.setState({
      constraints: reconcileConstraints(
        useRecipeStore.getState().items,
        persistedSession.constraints,
      ),
    });
    expect(useConstraintStudioStore.getState().constraints.byLineId).toEqual({});
  });

  it('a NEW draft context still wipes both persisted halves (no cross-draft leak)', () => {
    openSavedRecipe();
    useConstraintStudioStore.getState().toggleLock(SUCROSE_LINE);
    useRecipeStore.getState().markIngredientUnavailable(CREAM_LINE);
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual(['cream_30']);

    // Opening ANOTHER saved recipe = a whole new draft context.
    openSavedRecipe();
    expect(useConstraintStudioStore.getState().constraints.byLineId).toEqual({});
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual([]);
    // …and the wipe is what gets persisted, so the reload cannot resurrect it.
    expect(constraintStudioPersistPartialize(useConstraintStudioStore.getState())).toEqual({
      constraints: { byLineId: {} },
    });
    expect(
      (recipePersistPartialize(useRecipeStore.getState()) as { excludedIngredientIds: string[] })
        .excludedIngredientIds,
    ).toEqual([]);
  });

  it('the persistence contract covers EVERY formulation-material field (structural pin)', () => {
    // If a future change drops one of these from a partialize, the live click
    // and the post-refresh click start formulating from different inputs again
    // — which is exactly the owner's bug. Pinned by name.
    runOwnerLiteralSequence();
    useConstraintStudioStore.getState().toggleLock(SUCROSE_LINE);
    useRecipeStore.getState().markIngredientUnavailable(TARA_LINE);

    const persistedRecipe = recipePersistPartialize(useRecipeStore.getState());
    for (const key of [
      'items',
      'excludedIngredientIds',
      'target_batch_grams',
      'category',
      'target_temperature_c',
      'mode',
      'machine_capacity_grams',
      'machine_capacity_source',
    ]) {
      expect(Object.keys(persistedRecipe), `missing from recipe partialize: ${key}`).toContain(key);
    }
    expect(Object.keys(constraintStudioPersistPartialize(useConstraintStudioStore.getState()))).toEqual(
      ['constraints'],
    );
    // Staged working memory is deliberately NOT persisted.
    const sessionKeys = Object.keys(
      constraintStudioPersistPartialize(useConstraintStudioStore.getState()),
    );
    for (const forbidden of ['preview', 'previewIssue', 'blocked', 'feasibility', 'history']) {
      expect(sessionKeys, `${forbidden} must stay working memory`).not.toContain(forbidden);
    }
  });
});

/* ── 5 — 20-cycle no-refresh endurance run ────────────────────────────────── */

describe('owner item 6.5 — 20 no-refresh cycles mixing every draft mutation', () => {
  it('remove / add back / set 0 g / lock / unlock / unavailable / edit / recalc / apply-or-cancel × 20', () => {
    openSavedRecipe();
    const store = () => useRecipeStore.getState();
    const session = () => useConstraintStudioStore.getState();
    /** USER line identities that were removed — the saved recipe's own ids and
     * anything the user added by hand. A toolbox line the pipeline creates
     * carries a DETERMINISTIC id (`formulation-<ingredient>`), so the same id
     * legitimately reappears when the same role is refilled later; that is a
     * fresh toolbox line, not a restored user identity. The identity guarantee
     * for those is invariant (d2) below: an id may never come back wearing a
     * DIFFERENT canonical ingredient. */
    const everRemovedUserLineIds = new Set<string>();
    /** lineId → canonical ingredient id, for every line ever seen. */
    const identityByLineId = new Map<string, string>();

    for (let cycle = 0; cycle < 20; cycle += 1) {
      // (1) edit grams — nudge the first unlocked line.
      const editable = store().items.find((i) => i.lock_type === 'unlocked');
      if (editable) store().setPlannedGrams(editable.id, Math.max(0, editable.planned_grams - 3));

      // (2) remove — every 3rd cycle drop one unlocked non-primary line.
      if (cycle % 3 === 0 && store().items.length > 2) {
        const removable = store().items.find(
          (i) => i.lock_type === 'unlocked' && i.ingredient.id !== 'milk_3_5',
        );
        if (removable) {
          if (SAVED_LINE_IDS.includes(removable.id)) everRemovedUserLineIds.add(removable.id);
          store().removeItem(removable.id);
        }
      }

      // (3) add back — every 3rd cycle (offset) re-add sucrose explicitly.
      if (cycle % 3 === 1 && !store().items.some((i) => i.ingredient.id === 'sucrose')) {
        store().addIngredient(ing('sucrose'), 120);
      }

      // (4) set 0 g — every 4th cycle zero an unlocked line (fillable state).
      if (cycle % 4 === 0) {
        const zeroable = store().items.find((i) => i.lock_type === 'unlocked');
        if (zeroable) store().setPlannedGrams(zeroable.id, 0);
      }

      // (5) mark unavailable — every 5th cycle, then (6) explicitly add back
      //     on the following cycle, so the exclusion lifecycle is exercised.
      if (cycle % 5 === 4) {
        const victim = store().items.find((i) => i.ingredient.id === 'tara_gum');
        if (victim) store().markIngredientUnavailable(victim.id);
      }
      if (cycle % 5 === 0 && store().excludedIngredientIds.includes('tara_gum')) {
        store().addIngredient(ing('tara_gum'), 5);
      }

      // (7) lock … (8) unlock — the §17 padlock round trip on the milk line.
      const milk = store().items.find((i) => i.ingredient.id === 'milk_3_5');
      if (milk) {
        session().toggleLock(milk.id);
        expect(session().constraints.byLineId[milk.id]).toBeDefined();
        session().toggleLock(milk.id);
        expect(session().constraints.byLineId[milk.id]).toBeUndefined();
      }

      // (9) recalculate … (10) apply or cancel (alternating).
      session().createOptimizePreview();
      if (session().preview) {
        if (cycle % 2 === 0) session().applyPreview();
        else session().cancelPreview();
      }

      /* ── invariants after EVERY cycle ── */
      const items = store().items;
      const liveIds = new Set(items.map((i) => i.id));

      // (a) no stale constraints — every §17 entry points at a live line.
      for (const lineId of Object.keys(session().constraints.byLineId)) {
        expect(liveIds.has(lineId), `stale constraint ${lineId} @cycle ${cycle}`).toBe(true);
      }
      // (b) no stale exclusions — excluded and present are mutually exclusive.
      for (const excluded of store().excludedIngredientIds) {
        expect(
          items.some((i) => i.ingredient.id === excluded),
          `excluded ${excluded} is present @cycle ${cycle}`,
        ).toBe(false);
      }
      // (c) no duplicate canonical ingredients.
      expect(new Set(items.map((i) => i.ingredient.id)).size, `dupes @cycle ${cycle}`).toBe(
        items.length,
      );
      // (d1) no wrong role restoration — a refilled role NEVER resurrects a
      //      removed USER line identity (that is a stale role mapping).
      for (const removedId of everRemovedUserLineIds) {
        expect(liveIds.has(removedId), `removed line ${removedId} returned @cycle ${cycle}`).toBe(
          false,
        );
      }
      // (d2) …and NO line id ever changes what ingredient it stands for, so a
      //      reused deterministic toolbox id can never smuggle a different role
      //      into a line the UI/constraints already address by that id.
      for (const item of items) {
        const known = identityByLineId.get(item.id);
        expect(known ?? item.ingredient.id, `identity swap on ${item.id} @cycle ${cycle}`).toBe(
          item.ingredient.id,
        );
        identityByLineId.set(item.id, item.ingredient.id);
      }
      // (e) the batch target never drifts.
      expect(store().target_batch_grams, `batch drift @cycle ${cycle}`).toBe(1000);
      // (f) staged state is never left dangling across a cycle boundary.
      expect(session().preview, `dangling preview @cycle ${cycle}`).toBeNull();
    }

    // (g) determinism: the SAME canonical input yields the SAME result twice.
    const runOnce = () => {
      session().createOptimizePreview();
      const projected = JSON.stringify(projectStagedResult());
      session().cancelPreview();
      return projected;
    };
    const inputBefore = canonicalDraftSerialization(selectCanonicalDraft());
    const first = runOnce();
    expect(canonicalDraftSerialization(selectCanonicalDraft())).toBe(inputBefore);
    expect(runOnce()).toBe(first);

    // (h) …and a reload at the END of 20 no-refresh cycles still agrees.
    const liveMaterial = capturePayload().material;
    simulateReload();
    expect(firstDifferingField(liveMaterial, capturePayload().material)).toBeNull();
    expect(runOnce()).toBe(first);
  });
});

/* ── 6 — the three distinct zero/removal states, WITHOUT a refresh ────────── */

describe('owner item 6.6 — fillable 0 g / exact-locked 0 / explicitly unavailable', () => {
  it('all three stay distinct on the immediate click, no reload anywhere', () => {
    openSavedRecipe();
    // (a) selected-unlocked 0 g — a SELECTED but unfilled line: fillable.
    useRecipeStore.getState().setPlannedGrams(SUCROSE_LINE, 0);
    // (b) exact-locked 0 — the §17 padlock protects a deliberate zero.
    useRecipeStore.getState().setPlannedGrams(TARA_LINE, 0);
    useConstraintStudioStore.getState().toggleLock(TARA_LINE);
    // (c) EXPLICITLY unavailable — removed AND excluded.
    useRecipeStore.getState().markIngredientUnavailable(CREAM_LINE);

    clickPrzeliczZPi();
    const { preview } = useConstraintStudioStore.getState();
    expect(preview).not.toBeNull();
    const byLine = (id: string) => preview!.proposedInput.items.find((item) => item.id === id);

    expect(byLine(SUCROSE_LINE)!.planned_grams).toBeGreaterThan(0); // (a) filled
    expect(Object.is(byLine(TARA_LINE)!.planned_grams, 0)).toBe(true); // (b) stays exactly 0
    expect(preview!.proposedInput.items.some((i) => i.ingredient.id === 'cream_30')).toBe(false); // (c)
  });

  it('the same three states survive a reload unchanged (the asymmetry is closed)', () => {
    openSavedRecipe();
    useRecipeStore.getState().setPlannedGrams(SUCROSE_LINE, 0);
    useRecipeStore.getState().setPlannedGrams(TARA_LINE, 0);
    useConstraintStudioStore.getState().toggleLock(TARA_LINE);
    useRecipeStore.getState().markIngredientUnavailable(CREAM_LINE);
    const live = capturePayload();

    simulateReload();
    expect(firstDifferingField(live.material, capturePayload().material)).toBeNull();

    clickPrzeliczZPi();
    const { preview } = useConstraintStudioStore.getState();
    expect(preview).not.toBeNull();
    const byLine = (id: string) => preview!.proposedInput.items.find((item) => item.id === id);
    expect(byLine(SUCROSE_LINE)!.planned_grams).toBeGreaterThan(0);
    expect(Object.is(byLine(TARA_LINE)!.planned_grams, 0)).toBe(true);
    expect(preview!.proposedInput.items.some((i) => i.ingredient.id === 'cream_30')).toBe(false);
  });
});
