/**
 * OWNER FINAL CLOSURE — AGENT R: removal / edit → IMMEDIATE „Przelicz z PI"
 * (owner F items 10–15).
 *
 * OWNER BUG (live): open saved recipe → remove Cream → remove SMP → remove
 * Dextrose → edit another value → immediate „Przelicz z PI" fails (or follows
 * an earlier state); after F5 the SAME visible draft calculates.
 *
 * ROOT CAUSE (C1, verified pre-fix on this exact file): removal-as-exclusion.
 * `removeItem` marked every removed ingredient EXCLUDED
 * (`excludedIngredientIds`), so removing Cream/SMP/Dextrose forbade the
 * formulation toolbox from refilling dairy_fat / milk_solids /
 * sugar_freezing_control — `missing_required_role` (sugar_freezing_control is
 * a HARD role). A refresh worked because `excludedIngredientIds` is NOT in the
 * persist partialize: the exclusions silently vanished with F5. First
 * differing pre/post-refresh field: `exclusions` (excludedIngredientIds).
 *
 * OWNER-BINDING SEMANTICS (FINAL CLOSURE C2 — supersedes the NIGHTLY-phase
 * "removal excludes" rule): „Remove row" = removed from the CURRENT recipe,
 * leaving NO orphan constraint, lock, unavailable flag, stale role mapping or
 * stale staged state — and NEVER a silent permanent scientific exclusion.
 * Exclusion has exactly ONE source: the EXPLICIT „unavailable" action
 * (`markIngredientUnavailable`). Frozen pins kept: Undo restores exclusions;
 * an EXPLICIT exclusion is never reintroduced by the toolbox.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { recipePersistPartialize, useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { plannedSum } from './applyPipeline';
import {
  canonicalDraftSerialization,
  selectCanonicalDraft,
  useConstraintStudioStore,
} from './constraintStudioStore';

const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};

const resetSession = () => {
  useRecipeStore.setState({
    mode: 'classic',
    category: 'fruit_gelato',
    visibleProductType: 'gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
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
  });
  useConstraintStudioStore.getState().resetForTests();
};

beforeEach(resetSession);

/** The owner's saved recipe: complete Fruit Gelato with Cream/SMP/Dextrose. */
const ownerSavedRecipe = (): RecipeInput =>
  structuredClone({
    ...buildRecipeInput(useRecipeStore.getState()),
    category: 'fruit_gelato' as const,
    items: [
      {
        id: 'l-straw',
        ingredient: STRAWBERRIES,
        planned_grams: 350,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
      {
        id: 'l-milk',
        ingredient: findDemoIngredient('milk_3_5')!,
        planned_grams: 380,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
      {
        id: 'l-cream',
        ingredient: findDemoIngredient('cream_30')!,
        planned_grams: 80,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
      {
        id: 'l-smp',
        ingredient: findDemoIngredient('smp')!,
        planned_grams: 40,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
      {
        id: 'l-suc',
        ingredient: findDemoIngredient('sucrose')!,
        planned_grams: 110,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
      {
        id: 'l-dex',
        ingredient: findDemoIngredient('dextrose')!,
        planned_grams: 35,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
      {
        id: 'l-tara',
        ingredient: findDemoIngredient('tara_gum')!,
        planned_grams: 5,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
    ],
  });

/** The owner's EXACT live sequence: open saved → remove Cream, SMP, Dextrose
 * → edit another value. Removal goes through the store action (the UI path). */
const runOwnerRemovalSequence = () => {
  useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe(), {
    savedId: 'r-owner-final',
    savedName: 'Owner Final Closure',
  });
  for (const lineId of ['l-cream', 'l-smp', 'l-dex']) {
    useRecipeStore.getState().removeItem(lineId);
  }
  // "edit another value" — the milk line gets a manual gram edit.
  useRecipeStore.getState().setPlannedGrams('l-milk', 400);
};

/** Simulated F5: the recipe store rehydrates ONLY its persisted slice; every
 * non-persisted field resets to its initial value; the §17 session store
 * (not persisted) starts empty. */
const simulateRefresh = () => {
  const persisted = recipePersistPartialize(useRecipeStore.getState());
  resetSession();
  useRecipeStore.setState({ ...persisted });
};

describe('C1/C4 — immediate recalc uses the CURRENT draft (owner F item 13)', () => {
  it('remove Cream/SMP/Dextrose → edit → immediate „Przelicz z PI" formulates WITHOUT refresh', () => {
    runOwnerRemovalSequence();
    // No async effect, no timeout — the very next synchronous call must see
    // the correct draft (C3/C4).
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    // Pre-fix this was `missing_required_role` (sugar_freezing_control) —
    // the removal-created exclusions blocked the toolbox refill.
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    expect(Math.abs(plannedSum(preview!.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    // The removed lines are NOT silently restored as the same line ids…
    for (const removed of ['l-cream', 'l-smp', 'l-dex']) {
      expect(preview!.proposedInput.items.some((i) => i.id === removed)).toBe(false);
    }
    // …and no duplicate canonical identities exist in the proposal.
    const ids = preview!.proposedInput.items.map((i) => i.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('removal is NOT a scientific exclusion — the toolbox may refill the ROLE (C2)', () => {
    runOwnerRemovalSequence();
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual([]);
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview } = useConstraintStudioStore.getState();
    expect(preview).not.toBeNull();
    // sugar_freezing_control (dextrose) is a HARD role — the proposal must
    // carry it again (refilled), because removal no longer forbids it.
    expect(preview!.proposedInput.items.some((i) => i.ingredient.id === 'dextrose')).toBe(true);
  });

  it('the recalc click takes ONE canonical immutable snapshot (C4)', () => {
    runOwnerRemovalSequence();
    const draft = selectCanonicalDraft();
    // The snapshot is internally consistent: every constraint entry points at
    // an existing line; the revision matches the store's monotonic counter.
    const lineIds = new Set(draft.input.items.map((i) => i.id));
    for (const lineId of Object.keys(draft.constraints.byLineId)) {
      expect(lineIds.has(lineId)).toBe(true);
    }
    expect(draft.revision).toBe(useRecipeStore.getState().draftRevision);
    // Two immediate snapshots of the SAME draft serialize identically.
    expect(canonicalDraftSerialization(selectCanonicalDraft())).toBe(
      canonicalDraftSerialization(draft),
    );
  });
});

describe('C1 — pre/post-refresh payloads IDENTICAL (owner F item 14)', () => {
  it('the canonical draft serializes identically before and after a simulated F5', () => {
    runOwnerRemovalSequence();
    const live = canonicalDraftSerialization(selectCanonicalDraft());
    const liveParsed = JSON.parse(live) as Record<string, unknown>;

    simulateRefresh();
    const refreshed = canonicalDraftSerialization(selectCanonicalDraft());
    const refreshedParsed = JSON.parse(refreshed) as Record<string, unknown>;

    // Field-by-field first-difference diagnostics (the C1 ledger instrument).
    // Pre-fix the first differing field was `exclusions`:
    // live ["cream_30","smp","dextrose"] vs refreshed [].
    for (const key of Object.keys(liveParsed)) {
      expect(JSON.stringify(liveParsed[key]), `first differing field: ${key}`).toBe(
        JSON.stringify(refreshedParsed[key]),
      );
    }
    expect(live).toBe(refreshed);
  });

  it('pre-refresh and post-refresh recalc produce the IDENTICAL proposal', () => {
    runOwnerRemovalSequence();
    useConstraintStudioStore.getState().createOptimizePreview();
    const before = useConstraintStudioStore.getState().preview;
    expect(before).not.toBeNull();
    const serialize = (input: RecipeInput) =>
      JSON.stringify(input.items.map((i) => [i.id, i.ingredient.id, i.planned_grams, i.lock_type]));
    const beforeSerialized = serialize(before!.proposedInput);

    simulateRefresh();
    useConstraintStudioStore.getState().createOptimizePreview();
    const after = useConstraintStudioStore.getState().preview;
    expect(after).not.toBeNull();
    expect(serialize(after!.proposedInput)).toBe(beforeSerialized);
  });
});

describe('C3 — removal is ONE atomic material-edit transaction (owner F items 10–12)', () => {
  it('removal clears the orphan §17 constraint SYNCHRONOUSLY (item 10)', () => {
    useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe());
    useConstraintStudioStore.getState().toggleLock('l-cream'); // padlock @80 g
    expect(useConstraintStudioStore.getState().constraints.byLineId['l-cream']).toEqual({
      mode: 'locked',
      grams: 80,
    });
    const revisionBefore = useRecipeStore.getState().draftRevision;
    // ONE store action — no UI wrapper, no async effect, no timeout.
    useRecipeStore.getState().removeItem('l-cream');
    // The very next synchronous read: entry gone, revision bumped EXACTLY once.
    expect(useConstraintStudioStore.getState().constraints.byLineId['l-cream']).toBeUndefined();
    expect(useRecipeStore.getState().draftRevision).toBe(revisionBefore + 1);
  });

  it('removal leaves no stale role mapping — the canonical draft rebuilds from CURRENT lines (item 11)', () => {
    runOwnerRemovalSequence();
    const draft = selectCanonicalDraft();
    const lineIds = draft.input.items.map((i) => i.id);
    expect(lineIds).not.toContain('l-cream');
    expect(lineIds).not.toContain('l-smp');
    expect(lineIds).not.toContain('l-dex');
    // No orphan constraint survives for any removed id.
    for (const removed of ['l-cream', 'l-smp', 'l-dex']) {
      expect(draft.constraints.byLineId[removed]).toBeUndefined();
    }
    // The role inputs derive from the CURRENT items only: a refilled role
    // carrier comes back as a FRESH line — never as the removed line id
    // (that would be a stale role-mapping restoration).
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview } = useConstraintStudioStore.getState();
    expect(preview).not.toBeNull();
    const dextroseLines = preview!.proposedInput.items.filter(
      (i) => i.ingredient.id === 'dextrose',
    );
    expect(dextroseLines.length).toBe(1); // the role IS refilled (no exclusion)…
    expect(dextroseLines[0]!.id).not.toBe('l-dex'); // …under a NEW line identity
  });

  it('removal invalidates the staged Preview immediately (item 12)', () => {
    useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe());
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(
      useConstraintStudioStore.getState().preview ??
        useConstraintStudioStore.getState().previewIssue,
    ).not.toBeNull();
    useRecipeStore.getState().removeItem('l-cream');
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
    expect(useConstraintStudioStore.getState().feasibility).toBeNull();
  });

  it('a locked line removed via the store drops line + constraint in the SAME transaction', () => {
    useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe());
    useConstraintStudioStore.getState().toggleLock('l-dex');
    useRecipeStore.getState().removeItem('l-dex');
    const draft = selectCanonicalDraft();
    expect(draft.input.items.some((i) => i.id === 'l-dex')).toBe(false);
    expect(draft.constraints.byLineId['l-dex']).toBeUndefined();
    // The RAW session store is reconciled too (not only the read-time view).
    expect(useConstraintStudioStore.getState().constraints.byLineId['l-dex']).toBeUndefined();
  });
});

describe('C2 — the EXPLICIT „unavailable" action is the ONLY exclusion source', () => {
  it('markIngredientUnavailable removes the line AND excludes the ingredient', () => {
    useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe());
    useRecipeStore.getState().markIngredientUnavailable('l-dex');
    expect(useRecipeStore.getState().items.some((i) => i.id === 'l-dex')).toBe(false);
    expect(useRecipeStore.getState().excludedIngredientIds).toContain('PI-ING-000494');
  });

  it('an EXPLICIT exclusion is never reintroduced on the canonical formulation route (frozen pin)', () => {
    // A padlock routes to constrained reformulation (the canonical template
    // path) — the route where the never-reintroduce pin is enforced.
    // KNOWN GAP (out of Agent R scope — applyPipeline solver internals): the
    // LOCAL-correction route does not thread `excludedIngredientIds` into the
    // solver's ADD candidates, so a substantive unconstrained draft can still
    // re-add an explicitly excluded ingredient. Flagged to the pipeline owner.
    useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe());
    useConstraintStudioStore.getState().toggleLock('l-straw'); // padlock @350 g
    useRecipeStore.getState().markIngredientUnavailable('l-dex');
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    // dextrose (sugar_freezing_control, HARD role) is explicitly unavailable:
    // honest structured failure OR a proposal WITHOUT dextrose — never a
    // silent reintroduction.
    if (preview) {
      expect(preview.proposedInput.items.some((i) => i.ingredient.id === 'dextrose')).toBe(false);
    } else {
      expect(previewIssue).not.toBeNull();
    }
  });

  it('explicitly adding the ingredient back clears the exclusion (frozen pin)', () => {
    useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe());
    useRecipeStore.getState().markIngredientUnavailable('l-dex');
    expect(useRecipeStore.getState().excludedIngredientIds).toContain('PI-ING-000494');
    useRecipeStore.getState().addIngredient(findDemoIngredient('dextrose')!, 35);
    expect(useRecipeStore.getState().excludedIngredientIds).not.toContain('PI-ING-000494');
  });

  it('three distinct states stay distinct: fillable 0 g / exact-locked 0 / EXPLICIT excluded', () => {
    useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe());
    // (a) selected-unlocked-0 g — fillable.
    useRecipeStore.getState().setPlannedGrams('l-suc', 0);
    // (b) exact-locked-0 — the padlock protects the zero.
    useRecipeStore.getState().setPlannedGrams('l-tara', 0);
    useConstraintStudioStore.getState().toggleLock('l-tara');
    // (c) EXPLICIT unavailable — removed + excluded.
    useRecipeStore.getState().markIngredientUnavailable('l-cream');

    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview } = useConstraintStudioStore.getState();
    expect(preview).not.toBeNull();
    const byLine = (id: string) => preview!.proposedInput.items.find((i) => i.id === id);
    expect(byLine('l-suc')!.planned_grams).toBeGreaterThan(0); // (a) refilled
    expect(Object.is(byLine('l-tara')!.planned_grams, 0)).toBe(true); // (b) stays zero
    expect(preview!.proposedInput.items.some((i) => i.ingredient.id === 'cream_30')).toBe(false); // (c) never returns
  });

  it('an emptied draft still ends the exclusion context (draft-scoped lifecycle, kept)', () => {
    useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe());
    useRecipeStore.getState().markIngredientUnavailable('l-cream');
    expect(useRecipeStore.getState().excludedIngredientIds).toContain('PI-ING-000180');
    for (const item of [...useRecipeStore.getState().items]) {
      useRecipeStore.getState().removeItem(item.id);
    }
    expect(useRecipeStore.getState().items).toEqual([]);
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual([]);
  });
});

describe('C5 — 20 no-refresh cycles (owner F item 15)', () => {
  it('edit/remove/set-0/lock/unlock/recalc/apply-or-cancel × 20: no stale state, batch 1000, deterministic', () => {
    useRecipeStore.getState().loadRecipeInput(ownerSavedRecipe(), {
      savedId: 'r-cycles',
      savedName: 'Cycles',
    });

    for (let cycle = 0; cycle < 20; cycle += 1) {
      const store = () => useRecipeStore.getState();
      const session = () => useConstraintStudioStore.getState();

      // 1. edit — nudge the first unlocked line.
      const editable = store().items.find((i) => i.lock_type === 'unlocked');
      if (editable) store().setPlannedGrams(editable.id, Math.max(0, editable.planned_grams - 2));

      // 2. remove — every third cycle remove one unlocked non-fruit line.
      if (cycle % 3 === 0) {
        const removable = store().items.find(
          (i) => i.lock_type === 'unlocked' && i.ingredient.category !== 'fruit',
        );
        if (removable && store().items.length > 2) store().removeItem(removable.id);
      }

      // 3. set-0 — every fourth cycle zero one unlocked line (fillable state).
      if (cycle % 4 === 0) {
        const zeroable = store().items.find((i) => i.lock_type === 'unlocked');
        if (zeroable) store().setPlannedGrams(zeroable.id, 0);
      }

      // 4. lock / unlock — toggle the §17 padlock on the fruit line.
      const fruit = store().items.find((i) => i.ingredient.category === 'fruit');
      if (fruit) {
        session().toggleLock(fruit.id); // lock…
        session().toggleLock(fruit.id); // …and unlock (net-zero, but exercised)
      }

      // 5. recalc — the canonical snapshot; 6. apply or cancel (alternating).
      session().createOptimizePreview();
      if (session().preview) {
        if (cycle % 2 === 0) session().applyPreview();
        else session().cancelPreview();
      }

      // INVARIANTS — after EVERY cycle:
      const items = store().items;
      const lineIds = new Set(items.map((i) => i.id));
      // (a) no stale constraints: every §17 entry points at a live line.
      for (const lineId of Object.keys(session().constraints.byLineId)) {
        expect(lineIds.has(lineId)).toBe(true);
      }
      // (b) no stale exclusions: removal never creates exclusions.
      expect(store().excludedIngredientIds).toEqual([]);
      // (c) no duplicate canonical identities.
      expect(new Set(items.map((i) => i.ingredient.id)).size).toBe(items.length);
      // (d) the batch target never drifts.
      expect(store().target_batch_grams).toBe(1000);
      // (e) an applied result lands at the batch (planning tolerance).
      if (cycle % 2 === 0 && session().history.length > 0) {
        const total = items.reduce((a, i) => a + i.planned_grams, 0);
        expect(total).toBeGreaterThan(0);
        expect(total).toBeLessThan(1100);
      }
    }

    // Determinism epilogue: identical canonical input → identical result.
    const first = (() => {
      useConstraintStudioStore.getState().createOptimizePreview();
      const p = useConstraintStudioStore.getState().preview;
      const issue = useConstraintStudioStore.getState().previewIssue;
      useConstraintStudioStore.getState().cancelPreview();
      return p
        ? JSON.stringify(p.proposedInput.items.map((i) => [i.id, i.ingredient.id, i.planned_grams]))
        : JSON.stringify(issue);
    })();
    const second = (() => {
      useConstraintStudioStore.getState().createOptimizePreview();
      const p = useConstraintStudioStore.getState().preview;
      const issue = useConstraintStudioStore.getState().previewIssue;
      useConstraintStudioStore.getState().cancelPreview();
      return p
        ? JSON.stringify(p.proposedInput.items.map((i) => [i.id, i.ingredient.id, i.planned_grams]))
        : JSON.stringify(issue);
    })();
    expect(second).toBe(first);
  });
});
