/**
 * LIVE FAILURE 1 — STALE STATE (owner P0 NIGHTLY, Phase 1–4).
 *
 * Owner repro: open saved recipe → set grams to 0 → immediate „Przelicz z PI"
 * → refuses or follows an EARLIER constraint/exclusion state; after a page
 * refresh the SAME visible state formulates fine.
 *
 * ROOT CAUSE (verified on the pre-fix base, this file's Phase 1 test): the
 * §17 constraint session (`constraintStudioStore.byLineId`) is NOT persisted
 * and was NOT cleared by `loadRecipeInput` — `reconcile()` only prunes entries
 * whose line id vanished. Saved recipes have STABLE line ids, so a padlock
 * from an earlier session draft survived into the reloaded draft and silently
 * constrained routing/formulation (the refresh wiped the in-memory store,
 * which is why the same visible state worked after F5).
 *
 * THE FIX (pinned here): ONE canonical draft selector + monotonic
 * `draftRevision` + `draftContextSeq` — a load/preset/reset starts a FRESH §17
 * context and every material edit invalidates staged results.
 *
 * This file intentionally computes the Phase 1 canonical serialization INLINE
 * (not via the new selector) so the equality contract itself stays
 * fix-independent and the test is a true before/after instrument.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CORRECTION_CANDIDATES, type EngineIngredient } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { recipePersistPartialize, useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { plannedSum } from './applyPipeline';
import {
  canonicalDraftSerialization,
  reconcileConstraints,
  selectCanonicalDraft,
  useConstraintStudioStore,
} from './constraintStudioStore';

const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};
const MILK = findDemoIngredient('milk_3_5')!;

/** Full store reset — a clean session start. */
const resetSession = () => {
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
    savedRecipeId: null,
    savedRecipeName: null,
    dirty: false,
  });
  useConstraintStudioStore.getState().resetForTests();
};

beforeEach(resetSession);

/** The owner Phase 1 equality contract, computed INLINE (fix-independent):
 * items (id, ingredient, grams, actuals, lock) + effective §17 byLineId +
 * exclusions + batch + category + temperature + tier + machine capacity. */
const serializeLiveDraft = (): string => {
  const recipe = useRecipeStore.getState();
  const input = buildRecipeInput(recipe);
  const constraints = reconcileConstraints(
    recipe.items,
    useConstraintStudioStore.getState().constraints,
  );
  return JSON.stringify({
    items: input.items.map((item) => [
      item.id,
      item.ingredient.id,
      item.planned_grams,
      item.actual_grams,
      item.lock_type,
    ]),
    byLineId: constraints.byLineId,
    exclusions: [...recipe.excludedIngredientIds],
    batch: input.target_batch_grams,
    category: input.category,
    temperature: input.target_temperature_c,
    tier: input.mode,
    machineCapacity: input.machine_capacity_grams,
  });
};

/** Simulated page refresh: the recipe store rehydrates its persisted slice;
 * the §17 session store (NOT persisted) starts empty — exactly what F5 does. */
const simulateRefresh = () => {
  const persisted = recipePersistPartialize(useRecipeStore.getState());
  useConstraintStudioStore.getState().resetForTests();
  useRecipeStore.setState({ ...persisted });
};

/** The owner's exact sequence: session draft with a §17 padlock → save →
 * load the saved recipe → set grams to 0 → (caller runs Przelicz). */
const runOwnerSequence = () => {
  // Session 1 — the user builds a draft and padlocks milk at its grams.
  useRecipeStore.getState().addIngredient(MILK, 500);
  useRecipeStore.getState().addIngredient(STRAWBERRIES, 350);
  useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 150);
  const milkLine = useRecipeStore.getState().items.find((i) => i.ingredient.id === MILK.id)!;
  useConstraintStudioStore.getState().toggleLock(milkLine.id); // §17 padlock @500 g
  // The recipe is SAVED — the stored RecipeInput has STABLE line ids and the
  // engine grams-lock, but §17 constraints are session state, never stored.
  const saved = structuredClone(buildRecipeInput(useRecipeStore.getState()));

  // Later — the user OPENS the saved recipe (same session, no refresh)…
  useRecipeStore.getState().loadRecipeInput(saved, { savedId: 'r-owner', savedName: 'Owner' });
  // …and sets the strawberries to 0 g (the owner's live edit).
  const strawLine = useRecipeStore.getState().items.find((i) => i.ingredient.id === STRAWBERRIES.id)!;
  useRecipeStore.getState().setPlannedGrams(strawLine.id, 0);
  return { saved, milkLineId: milkLine.id, strawLineId: strawLine.id };
};

describe('PHASE 1 — deterministic owner repro: live state ≡ refreshed state (test 1)', () => {
  it('the canonical draft serializes IDENTICALLY before and after a simulated refresh', () => {
    runOwnerSequence();

    const live = serializeLiveDraft();
    const liveParsed = JSON.parse(live) as Record<string, unknown>;

    simulateRefresh();
    const refreshed = serializeLiveDraft();
    const refreshedParsed = JSON.parse(refreshed) as Record<string, unknown>;

    // Field-by-field first-difference diagnostics (the Phase 1 ledger data).
    for (const key of Object.keys(liveParsed)) {
      expect(JSON.stringify(liveParsed[key]), `first differing field: ${key}`).toBe(
        JSON.stringify(refreshedParsed[key]),
      );
    }
    expect(live).toBe(refreshed);
  });

  it('„Przelicz z PI" after the owner sequence formulates WITHOUT a refresh (the live failure)', () => {
    const { strawLineId } = runOwnerSequence();
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    // The 0 g fruit line was FILLED (zero-gram semantics, no refresh needed) —
    // never held at an earlier session's locked grams.
    const straw = preview!.proposedInput.items.find((i) => i.id === strawLineId)!;
    expect(straw.planned_grams).toBeGreaterThan(0);
    expect(Math.abs(plannedSum(preview!.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('loading a saved recipe starts a FRESH §17 context (stale padlock never survives)', () => {
    runOwnerSequence();
    expect(useConstraintStudioStore.getState().constraints.byLineId).toEqual({});
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().history).toEqual([]);
  });
});

describe('PHASE 3 — revision invalidation (tests 2–4)', () => {
  const seedCompleteDraft = () => {
    useRecipeStore.getState().addIngredient(MILK, 600);
    useRecipeStore.getState().addIngredient(findDemoIngredient('cream_30')!, 200);
    useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 200);
  };

  it('a gram edit invalidates the staged preview instantly (test 2)', () => {
    seedCompleteDraft();
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(
      useConstraintStudioStore.getState().preview ?? useConstraintStudioStore.getState().previewIssue,
    ).not.toBeNull();
    const line = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(line.id, 123);
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
  });

  it('an add/remove invalidates the staged preview instantly (test 3)', () => {
    seedCompleteDraft();
    useConstraintStudioStore.getState().createOptimizePreview();
    useRecipeStore.getState().addIngredient(findDemoIngredient('dextrose')!, 30);
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue).toBeNull();

    useConstraintStudioStore.getState().createOptimizePreview();
    const removable = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().removeItem(removable.id);
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
  });

  it('a batch / lock / §17 change invalidates the staged preview instantly (test 4)', () => {
    seedCompleteDraft();
    useConstraintStudioStore.getState().createOptimizePreview();
    useRecipeStore.getState().setBatchGrams(1200);
    expect(useConstraintStudioStore.getState().preview).toBeNull();

    useConstraintStudioStore.getState().createOptimizePreview();
    const line = useRecipeStore.getState().items[0]!;
    useConstraintStudioStore.getState().toggleLock(line.id);
    expect(useConstraintStudioStore.getState().preview).toBeNull();
  });

  it('a stale-REVISION preview is rejected at the commit door even when the fingerprint matches (test 5)', () => {
    seedCompleteDraft();
    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = useConstraintStudioStore.getState().preview;
    expect(staged).not.toBeNull();

    // Edit… and edit BACK: the fingerprint returns to the preview's base, but
    // the monotonic revision has advanced — only the revision guard can catch
    // this (the exact class of silent staleness the owner hit).
    const line = useRecipeStore.getState().items[0]!;
    const original = line.planned_grams;
    useRecipeStore.getState().setPlannedGrams(line.id, original + 50);
    useRecipeStore.getState().setPlannedGrams(line.id, original);

    useConstraintStudioStore.setState({ preview: staged });
    const before = JSON.stringify(useRecipeStore.getState().items);
    useConstraintStudioStore.getState().applyPreview();
    expect(JSON.stringify(useRecipeStore.getState().items)).toBe(before); // untouched
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('stale_preview');
  });
});

describe('PHASE 4 — zero-gram semantics WITHOUT refresh (tests 6–8)', () => {
  it('OWNER A no-refresh: gelato, artifact-locked 0 g fruit fills after a poisoned session (test 6)', () => {
    // Poison the session first: an EARLIER draft with §17 locks.
    useRecipeStore.getState().addIngredient(MILK, 400);
    const early = useRecipeStore.getState().items[0]!;
    useConstraintStudioStore.getState().toggleLock(early.id);
    // The owner's saved recipe: strawberries 0 g wearing an artifact grams-lock.
    const saved = buildRecipeInput(useRecipeStore.getState());
    const poisoned = structuredClone({
      ...saved,
      category: 'fruit_gelato' as const,
      items: [
        { id: 'l-straw', ingredient: STRAWBERRIES, planned_grams: 0, actual_grams: null, lock_type: 'grams' as const },
        { id: 'l-milk', ingredient: MILK, planned_grams: 0, actual_grams: null, lock_type: 'unlocked' as const },
      ],
    });
    useRecipeStore.getState().loadRecipeInput(poisoned);
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    const grams = (id: string) => preview!.proposedInput.items.find((i) => i.id === id)?.planned_grams;
    expect(grams('l-straw')!).toBeGreaterThan(0);
    expect(grams('l-milk')!).toBeGreaterThan(0);
    expect(Math.abs(plannedSum(preview!.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('OWNER B no-refresh: sorbet from 0 g selected fruit after a poisoned session (test 7)', () => {
    useRecipeStore.getState().addIngredient(MILK, 400);
    useConstraintStudioStore.getState().toggleLock(useRecipeStore.getState().items[0]!.id);
    const saved = buildRecipeInput(useRecipeStore.getState());
    const poisoned = structuredClone({
      ...saved,
      category: 'sorbet' as const,
      items: [
        { id: 'l-straw', ingredient: STRAWBERRIES, planned_grams: 0, actual_grams: null, lock_type: 'grams' as const },
      ],
    });
    useRecipeStore.getState().loadRecipeInput(poisoned);
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    expect(preview!.proposedInput.items.find((i) => i.id === 'l-straw')!.planned_grams).toBeGreaterThan(0);
    const byIng = (ing: string) =>
      preview!.proposedInput.items.find((i) => i.ingredient.id === ing)?.planned_grams ?? 0;
    for (const dairy of ['milk_3_5', 'cream_30', 'smp']) expect(byIng(dairy)).toBe(0);
  });

  it('OWNER C no-refresh: an EXPLICIT §17 zero set AFTER the load stays honored (test 8)', () => {
    const saved = structuredClone({
      ...buildRecipeInput(useRecipeStore.getState()),
      category: 'sorbet' as const,
      items: [
        { id: 'l-straw', ingredient: STRAWBERRIES, planned_grams: 600, actual_grams: null, lock_type: 'unlocked' as const },
        { id: 'l-water', ingredient: DEFAULT_CORRECTION_CANDIDATES.find((c) => c.id === 'water')!.ingredient, planned_grams: 181, actual_grams: null, lock_type: 'unlocked' as const },
        { id: 'l-suc', ingredient: findDemoIngredient('sucrose')!, planned_grams: 103.8, actual_grams: null, lock_type: 'unlocked' as const },
        { id: 'l-dex', ingredient: findDemoIngredient('dextrose')!, planned_grams: 59, actual_grams: null, lock_type: 'unlocked' as const },
        { id: 'l-inulin', ingredient: findDemoIngredient('inulin')!, planned_grams: 55.4, actual_grams: null, lock_type: 'unlocked' as const },
        { id: 'l-tara', ingredient: findDemoIngredient('tara_gum')!, planned_grams: 0.8, actual_grams: null, lock_type: 'unlocked' as const },
      ],
    });
    useRecipeStore.getState().loadRecipeInput(saved);
    // The user CONSCIOUSLY zeroes inulin and padlocks it (§17 explicit zero).
    useRecipeStore.getState().setPlannedGrams('l-inulin', 0);
    useConstraintStudioStore.getState().toggleLock('l-inulin');
    expect(useConstraintStudioStore.getState().constraints.byLineId['l-inulin']).toEqual({
      mode: 'locked',
      grams: 0,
    });
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    const inulin = preview!.proposedInput.items.find((i) => i.id === 'l-inulin')!;
    expect(Object.is(inulin.planned_grams, 0)).toBe(true); // the explicit zero stays
  });
});

describe('determinism — 10 repeated no-refresh cycles (test 9)', () => {
  it('the same draft produces the byte-identical proposal 10× in a row', () => {
    runOwnerSequence();
    const proposals: string[] = [];
    for (let cycle = 0; cycle < 10; cycle += 1) {
      useConstraintStudioStore.getState().createOptimizePreview();
      const { preview, previewIssue } = useConstraintStudioStore.getState();
      expect(previewIssue).toBeNull();
      expect(preview).not.toBeNull();
      proposals.push(
        JSON.stringify(preview!.proposedInput.items.map((i) => [i.id, i.ingredient.id, i.planned_grams, i.lock_type])),
      );
      useConstraintStudioStore.getState().cancelPreview();
    }
    for (const serialized of proposals) expect(serialized).toBe(proposals[0]);
  });
});

describe('the canonical selector is the ONE draft source (test 10)', () => {
  it('selector output matches the store truth field-for-field and carries the revision', () => {
    const { strawLineId } = runOwnerSequence();
    const draft = selectCanonicalDraft();
    const recipe = useRecipeStore.getState();
    expect(draft.revision).toBe(recipe.draftRevision);
    expect(draft.contextSeq).toBe(recipe.draftContextSeq);
    expect(draft.input.items.map((i) => i.id)).toContain(strawLineId);
    expect(draft.input.target_batch_grams).toBe(recipe.target_batch_grams);
    expect(draft.input.category).toBe(recipe.category);
    expect(draft.input.target_temperature_c).toBe(recipe.target_temperature_c);
    expect(draft.excludedIngredientIds).toEqual(recipe.excludedIngredientIds);
    expect(draft.savedRecipe.id).toBe(recipe.savedRecipeId);
    // The serialization contract equals the inline Phase 1 contract.
    expect(canonicalDraftSerialization(draft)).toBe(serializeLiveDraft());
  });
});
