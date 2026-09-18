/**
 * DIRECTION YIELDS TO THE MAIN FLOOR — and a refused Main sweep is never published
 * (owner 2026-09-18; served staging c36574ea).
 *
 * Served: Gelato, Ninja CREAMi Deluxe ×2 = 1340 g, fresh STRAWBERRIES under the
 * published `main-berry-fresh-dairy` v2 policy (Main floor 25 %, MILK 3.5 % as the
 * approved liquid dairy carrier ≥ 30 %), neutral Direction active. HOME's first build
 * is the Main; the customer then adds BANANA 100 g and KIWI 100 g (their exact
 * amounts). Both surfaces refused with „zatwierdzony płynny nośnik mleczny ma 22.8%”:
 *
 *   1. with Direction active the certified Main frontier (332 g) sat BELOW the Main
 *      floor (335 g), so the Crown sweep accepted nothing and handed back the
 *      unsized draft with a `crownRefusal`;
 *   2. the reformulation scaled every other base line to the batch around that
 *      untouched 507 g Main — a diagnostic-only vector;
 *   3. the Main safety backstop exited early for any exact Direction, so that vector
 *      reached the ProductBehavior binding and the customer was told the carrier
 *      share of a recipe nobody proposed (GEL-P0-027: an empty sweep is a refusal,
 *      never an echo).
 *
 * CORE now (A) lets Direction yield to the Main floor through the EXISTING
 * best-achievable consent and (B) sends a refused or diagnostic Main vector through
 * the Main safety check, so an infeasible request ends in its typed conflict.
 *
 * Nothing here types an expected gram number: the seat is HOME's own first build, the
 * policy is the published migration row, and every result is held to CORE's own
 * authority (`evaluateRecipeConstraintAuthority`, `verifyMainEnvelope`, the Apply door).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { recalculateHomeRecipe } from '@/features/home-creator/homeRecalculation';
import { NINJA_CREAMI_DELUXE_NC502EU, deriveMachineSetup } from '@/features/machine-catalog';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { verifyMainEnvelope } from '@/features/product-intelligence/mainEnvelope';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints';
import {
  SORBET_MAIN_IDS,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { OWNER_IDS } from './__fixtures__/ownerFruitMainFixture';
import {
  publishedDairyMainPolicy,
  withPublishedDairyMainPolicy,
} from './__fixtures__/servedDairyMainPolicy';
import {
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  maximizeMainFlavourObjective,
  workingStateFingerprint,
  type BuildPreviewResult,
} from './applyPipeline';
import {
  applyPreviewWithServerAuthority,
  beginPiRecalculation,
  runPiRecalculationWithTerminal,
  selectCanonicalDraft,
  useConstraintStudioStore,
} from './constraintStudioStore';
import { previewCustomerDecisionReason } from './previewCustomerDecision';

vi.setConfig({ testTimeout: 180_000 });

/* ── the server authority: ONE fixture table, never an echo ─────────────────── */

const authority = vi.hoisted(() => ({ table: {} as Record<string, unknown> }));

vi.mock('@/services/productIntelligence', () => ({
  resolveRecipeProposalBehaviorSnapshots: async (input: {
    recipe: { items: readonly { id: string }[] };
    toppings?: readonly { id: string }[];
  }) => {
    const snapshots: Record<string, unknown> = {};
    const unresolvedLineIds: string[] = [];
    for (const lineId of [
      ...input.recipe.items.map((item) => item.id),
      ...(input.toppings ?? []).map((item) => item.id),
    ]) {
      const entry = authority.table[lineId];
      if (entry === undefined) unresolvedLineIds.push(lineId);
      else snapshots[lineId] = structuredClone(entry);
    }
    return { snapshots, unresolvedLineIds };
  },
  validateRecipeBehaviorOnServer: async () => ({ ready: true, staleLineIds: [], lines: [] }),
}));

/* ── the served fixture ─────────────────────────────────────────────────────── */

const BANANA = 'PI-ING-000345';
const KIWI = 'PI-ING-000366';
/** The served `main-berry-fresh-dairy` row, read from the migration that publishes it. */
const BERRY = publishedDairyMainPolicy(
  readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260813110400_product_behavior_classification_queue.sql',
    ),
    'utf8',
  ),
  'main-berry-fresh-dairy',
);
/** Ninja CREAMi Deluxe: one tub (670 g) and the served ×2 (1340 g). */
const DELUXE = deriveMachineSetup(NINJA_CREAMI_DELUXE_NC502EU, 'gelato').recommendedBatchGrams!;
const CREATED_AT = '2026-09-18T10:00:00.000Z';

const store = () => useRecipeStore.getState();
const studio = () => useConstraintStudioStore.getState();
const canonicalOf = (item: { ingredient: { id: string; canonical_ingredient_id?: string } }) =>
  item.ingredient.canonical_ingredient_id ?? item.ingredient.id;
const gramsOf = (input: RecipeInput, canonicalId: string) =>
  input.items
    .filter((item) => canonicalOf(item) === canonicalId)
    .reduce((sum, item) => sum + item.planned_grams, 0);
const floorGrams = (percent: number, batch: number) => Math.ceil((percent * batch) / 100);

/** Shared test snapshots + the SERVED berry policy on strawberry, MILK the approved carrier. */
function authorityFor(input: RecipeInput): Record<string, ProductBehaviorSnapshot> {
  const table = productBehaviorTestSnapshots(input, store().toppings);
  for (const item of input.items) {
    const base = table[item.id]!;
    if (canonicalOf(item) === SORBET_MAIN_IDS.strawberry) {
      table[item.id] = withPublishedDairyMainPolicy(base, BERRY);
    }
    if (canonicalOf(item) === OWNER_IDS.milk) {
      table[item.id] = { ...base, approvedLiquidDairyCarrier: true };
    }
  }
  return table;
}

function syncAuthority() {
  authority.table = authorityFor(buildRecipeInput(store()));
  for (const item of store().items) {
    const entry = authority.table[item.id] as ProductBehaviorSnapshot | undefined;
    const current = store().productBehaviorSnapshots[item.id];
    if (entry && (current === undefined || current.resolutionState !== 'RESOLVED')) {
      store().setProductBehaviorSnapshot(item.id, structuredClone(entry));
    }
  }
}

function resetStores() {
  store().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  studio().resetForTests();
  authority.table = {};
}

/** HOME's first build straight at `batch`: the starter, strawberry the AUTO Main. */
async function homeFirstBuild(batch: number): Promise<RecipeInput> {
  resetStores();
  store().rebuildNewRecipeStarter({
    visibleProductType: 'gelato',
    servingModeId: 'temp_minus_11',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1000,
  });
  store().setPriorityMode('AUTO');
  syncAuthority();
  const added = store().addIngredient(sorbetMapperIngredient(SORBET_MAIN_IDS.strawberry), 0);
  if (added.status !== 'added') throw new Error('strawberry was not added');
  syncAuthority();
  store().grantAutomaticPriority(added.lineId);
  store().setBatchGrams(batch, undefined, 'USER_OVERRIDE');
  expect(await recalculateHomeRecipe()).toBe('applied');
  return structuredClone(buildRecipeInput(store()));
}

/** The customer's exact banana and kiwi through the one Base add door both surfaces share. */
function addBananaAndKiwi() {
  for (const id of [BANANA, KIWI]) {
    const added = store().addIngredient(sorbetMapperIngredient(id), 100, {
      amountIntent: 'user_exact',
    });
    if (added.status !== 'added') throw new Error(`${id} was not added`);
    syncAuthority();
  }
}

/** What CORE is asked, exactly as the served Przelicz asks it. */
function coreRequest() {
  const draft = selectCanonicalDraft();
  const snapshots = store().productBehaviorSnapshots as Record<string, ProductBehaviorSnapshot>;
  return {
    input: draft.input,
    constraints: draft.constraints,
    snapshots,
    options: {
      excludedIngredientIds: draft.excludedIngredientIds,
      unavailableMainIngredientIds: draft.unavailableMainIngredientIds,
      requirePracticalPreview: true,
      productBehaviorSnapshots: snapshots,
      technicalOnlyMainLineIds: [] as string[],
      directionFallbackPass: true,
      skipRescueAssessment: true,
    },
  };
}

/** Everything CORE promises for the served 1340 g answer, on any recipe vector. */
function expectServedBerryRecipe(
  recipe: RecipeInput,
  snapshots: Record<string, ProductBehaviorSnapshot>,
) {
  const batch = recipe.target_batch_grams;
  expect(recipe.items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
  expect(recipe.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(batch);
  expect(gramsOf(recipe, SORBET_MAIN_IDS.strawberry)).toBeGreaterThanOrEqual(
    floorGrams(BERRY.ecoFloorPercent, batch),
  );
  expect(gramsOf(recipe, OWNER_IDS.milk)).toBeGreaterThanOrEqual(
    floorGrams(BERRY.liquidDairyCarrierFloorPercent!, batch),
  );
  expect(gramsOf(recipe, BANANA)).toBe(100);
  expect(gramsOf(recipe, KIWI)).toBe(100);
  const verdict = evaluateRecipeConstraintAuthority({
    recipe,
    snapshots,
    module: 'OPTIMAL',
    technicalOnlyMainLineIds: [],
  });
  expect(verdict.issues).toEqual([]);
  expect(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal', enforceFloor: true }).ok).toBe(
    true,
  );
}

beforeEach(() => {
  resetStores();
});

describe('served 1340 g banana + kiwi — Direction yields to the Main floor', () => {
  it('the Main technical maximum reaches the floor and passes the Main envelope', async () => {
    await homeFirstBuild(DELUXE * 2);
    addBananaAndKiwi();
    const { input, constraints, options, snapshots } = coreRequest();
    expect(input.target_batch_grams).toBe(DELUXE * 2);

    const { input: sized, proof } = maximizeMainFlavourObjective(
      input,
      input,
      constraints,
      options,
    );
    expect(proof).not.toBeNull();
    // A real, fully gated proposal — never the refused echo of the incoming 507 g Main.
    expect(proof!.crownRefusal).toBeUndefined();
    expect(proof!.status).toBe('best_achievable');
    expect(proof!.provenMaximum).toBe(false);
    expect(proof!.limitingTechnicalRules).toContain('direction_yields_to_main_floor');
    expect(gramsOf(sized, SORBET_MAIN_IDS.strawberry)).toBeGreaterThanOrEqual(
      floorGrams(BERRY.ecoFloorPercent, input.target_batch_grams),
    );
    expect(
      verifyMainEnvelope({ recipe: sized, snapshots, mode: 'optimal', enforceFloor: true }).ok,
    ).toBe(true);
    // The customer's goals ride along: Direction is still what they asked for.
    expect(sized.goals).toEqual(input.goals);
    expect(sized.goals?.direction_targets_active).toBe(true);

    // Control: Direction is exactly what yielded. The same request without Direction
    // needs no yield and reaches the very same recipe vector.
    const noDirection: RecipeInput = {
      ...input,
      goals: { ...input.goals, direction_targets_active: false },
    };
    const plain = maximizeMainFlavourObjective(noDirection, noDirection, constraints, options);
    expect(plain.proof?.crownRefusal).toBeUndefined();
    expect(plain.proof?.limitingTechnicalRules ?? []).not.toContain(
      'direction_yields_to_main_floor',
    );
    expect(plain.input.items.map((item) => [item.id, item.planned_grams])).toEqual(
      sized.items.map((item) => [item.id, item.planned_grams]),
    );
  });

  it('CORE proposes a recipe that passes the constraint authority and asks for Direction consent', async () => {
    await homeFirstBuild(DELUXE * 2);
    addBananaAndKiwi();
    const { input, constraints, options, snapshots } = coreRequest();

    const result = buildOptimizePreview(input, constraints, CREATED_AT, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { preview } = result;
    expect(preview.diagnosticOnly).not.toBe(true);
    expect(preview.mainObjective?.crownRefusal).toBeUndefined();
    expectServedBerryRecipe(preview.proposedInput, snapshots);
    // Direction was yielded, and the customer is asked — never auto-consented.
    expect(preview.directionTargetUnreached).toBe(true);
    expect(
      assessRecipeDirection(preview.proposedInput, calculateRecipe(preview.proposedInput)).reached,
    ).toBe(false);
    expect(previewCustomerDecisionReason(preview)).toBe('direction_not_reached');
    expect(bindProductBehaviorToPreview({ ok: true, preview: { ...preview } }, snapshots).ok).toBe(
      true,
    );

    // The Apply door refuses without the customer's consent …
    const commit = (consent: Parameters<typeof commitPreview>[9]) =>
      commitPreview(
        input,
        constraints,
        structuredClone(preview),
        CREATED_AT,
        'change-1',
        [],
        undefined,
        null,
        null,
        consent,
        null,
        snapshots,
        [],
        null,
        null,
        { requirePracticalPreview: true },
      );
    const refused = commit(null);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('direction_consent_required');
    // … and applies exactly this recipe with it.
    const applied = commit({
      baseFingerprint: preview.baseFingerprint,
      targetFingerprint: directionTargetFingerprint(input),
      candidateFingerprint: workingStateFingerprint(preview.proposedInput, preview.nextConstraints),
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.verified.input.items.map((item) => [item.id, item.planned_grams])).toEqual(
      preview.proposedInput.items.map((item) => [item.id, item.planned_grams]),
    );
  });

  it('HOME (recalculateHomeRecipe) and PRO (runPiRecalculationWithTerminal): decision → consent → the same recipe', async () => {
    const seat = await homeFirstBuild(DELUXE * 2);

    // HOME: the shared PRZELICZ leaves a decision, never an automatic Apply.
    addBananaAndKiwi();
    const homeBefore = structuredClone(store().items);
    expect(await recalculateHomeRecipe()).toBe('decision');
    expect(store().items).toEqual(homeBefore);
    expect(studio().previewIssue).toBeNull();
    const homeCandidate = studio().directionBestCandidate;
    expect(homeCandidate).not.toBeNull();
    expect(previewCustomerDecisionReason(homeCandidate!)).toBe('direction_not_reached');
    studio().acceptBestDirectionCandidate();
    await applyPreviewWithServerAuthority();
    expect(studio().blocked).toBeNull();
    expect(studio().preview).toBeNull();
    const homeFinal = buildRecipeInput(store());
    expectServedBerryRecipe(
      homeFinal,
      store().productBehaviorSnapshots as Record<string, ProductBehaviorSnapshot>,
    );
    expect(store().practicalRecipeAudit).not.toBeNull();

    // PRO: the same recipe, PRO's own entry, the same consent.
    resetStores();
    store().loadRecipeInput(structuredClone(seat));
    syncAuthority();
    addBananaAndKiwi();
    const proBefore = structuredClone(store().items);
    await runPiRecalculationWithTerminal(undefined, beginPiRecalculation());
    expect(store().items).toEqual(proBefore);
    expect(studio().directionFallbackReport).toBeNull();
    expect(studio().directionBestCandidate).not.toBeNull();
    studio().acceptBestDirectionCandidate();
    await applyPreviewWithServerAuthority();
    expect(studio().blocked).toBeNull();
    const proFinal = buildRecipeInput(store());

    const byIngredient = (recipe: RecipeInput) =>
      Object.fromEntries(recipe.items.map((item) => [canonicalOf(item), item.planned_grams]));
    expect(byIngredient(proFinal)).toEqual(byIngredient(homeFinal));
  });
});

describe('no recipe keeps both fruit amounts — a typed conflict, never the carrier share', () => {
  for (const [label, batch] of [
    ['1000 g', 1000],
    ['670 g (Ninja CREAMi Deluxe)', DELUXE],
  ] as const) {
    it(`${label}: CORE ends in its lock conflict and the recipe is untouched`, async () => {
      await homeFirstBuild(batch);
      addBananaAndKiwi();
      const { input, constraints, options } = coreRequest();

      const result: BuildPreviewResult = buildOptimizePreview(
        input,
        constraints,
        CREATED_AT,
        options,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('impossible_under_constraints');
      if (result.code !== 'impossible_under_constraints') return;
      // The conflict names the customer's own amount.
      expect([BANANA, KIWI]).toContain(
        canonicalOf(input.items.find((item) => item.id === result.conflict?.lineId)!),
      );

      for (const run of [
        () => recalculateHomeRecipe(),
        () => runPiRecalculationWithTerminal(undefined, beginPiRecalculation()),
      ]) {
        const before = structuredClone(store().items);
        await run();
        expect(store().items).toEqual(before);
        expect(studio().preview).toBeNull();
        expect(studio().directionBestCandidate).toBeNull();
        expect(studio().previewIssue?.ok).toBe(false);
        expect(studio().previewIssue?.ok === false && studio().previewIssue!.code).toBe(
          'impossible_under_constraints',
        );
        expect(studio().recalculationTerminal).toMatchObject({ state: 'LOCK_CHANGE_REQUIRED' });
        // CORE's lock diagnosis offers the relaxation of the customer's own amount.
        expect(studio().lockConflict?.diagnosis.status).toBe('relaxation_found');
      }
    });
  }
});
