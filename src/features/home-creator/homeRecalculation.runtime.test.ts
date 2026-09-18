/** @vitest-environment jsdom */
/**
 * HOME's ONE recalculation orchestration, end to end (owner §18, 2026-09-18).
 *
 * `recalculateHomeRecipe` = HOME's bootstrap instructions → the shared CORE runner →
 * the one Apply door for a CLEAN result; anything the customer must decide is left
 * staged. HOME owns no recipe math, so every assertion here is an invariant of CORE's
 * answer (Σ Base = target, whole grams, a practical audit, locks and priorities kept)
 * — never a gram number typed into the test.
 *
 * The real stores, solver (in-process: no Worker in jsdom), practicalization and
 * Apply door run. Only the server authority is answered, by a SERVER-AUTHORITY-TABLE
 * fake: every requested line gets `structuredClone(table[lineId])` from ONE fixture
 * snapshot map. The solver is tapped by a PASS-THROUGH spy (it records, then calls
 * the real runtime).
 */
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineIngredient, RecipeInput, RecipeItem } from '@/engine';
import {
  OWNER_IDS,
  ownerFruitRecipe,
  ownerFruitSnapshots,
} from '@/features/constraint-studio/__fixtures__/ownerFruitMainFixture';
import {
  SERVED_FRUIT,
  servedSorbetRecipe,
  servedSorbetSnapshots,
} from '@/features/constraint-studio/__fixtures__/servedSorbetThreeFruitFixture';
import {
  applyPreviewWithServerAuthority,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import type { OptimizePreviewComputationRequest } from '@/features/constraint-studio/optimizePreviewComputation';
import { AUTO_CROWN_SEED } from '@/features/formulation/crownBootstrapProvenance';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { toppingCreationDefaultGrams } from '@/features/recipe-composition/toppingCreationDefault';
import {
  SORBET_MAIN_IDS,
  sorbetMapperIngredient,
  sorbetTopping,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { recalculateHomeRecipe } from './homeRecalculation';
import { HomeRecalculate } from './ui/HomeRecalculate';

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

/* ── the solver: a PASS-THROUGH tap ─────────────────────────────────────────── */

type SolverRequest = Omit<OptimizePreviewComputationRequest, 'createdAt'>;

const solver = vi.hoisted(() => ({ requests: [] as unknown[] }));

vi.mock('@/features/constraint-studio/optimizePreviewRuntime', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/constraint-studio/optimizePreviewRuntime')>();
  return {
    ...actual,
    runOptimizePreviewOffMainThread: (
      ...args: Parameters<typeof actual.runOptimizePreviewOffMainThread>
    ) => {
      const { createdAt, ...request } = args[0];
      void createdAt;
      solver.requests.push(structuredClone(request));
      return actual.runOptimizePreviewOffMainThread(...args);
    },
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const requests = () => solver.requests as SolverRequest[];

/* ── the ONE authority map ──────────────────────────────────────────────────── */

const BANANA = 'PI-ING-000345';
const KIWI = 'PI-ING-000366';
const MAIN_CAPABLE_FRUIT = new Set<string>([SORBET_MAIN_IDS.strawberry, SORBET_MAIN_IDS.lime]);
/** The served Sorbet exact-fruit policy fields (servedSorbetThreeFruitFixture). */
const SORBET_MAIN_FIELDS = [
  'mainClassification',
  'behaviorRole',
  'mainCapability',
  'mainAuthority',
  'mainCalibrationLevel',
  'mainPolicyId',
  'mainPolicyVersion',
  'ecoFloorPercent',
  'optimalCeilingPercent',
  'hardLimitPercent',
  'multiMainHardLimitPercent',
  'mainEquivalentFactor',
  'mainBasis',
  'familyId',
  'subfamilyId',
  'formId',
  'blockReasons',
] as const;
/** The published fresh-fruit dairy Main policy fields (ownerFruitMainFixture). */
const DAIRY_MAIN_FIELDS = [
  'familyId',
  'formId',
  'mainClassification',
  'mainPolicyId',
  'mainPolicyVersion',
  'ecoFloorPercent',
  'optimalCeilingPercent',
  'hardLimitPercent',
  'mainEquivalentFactor',
  'mainBasis',
  'requiresLiquidDairyCarrier',
  'liquidDairyCarrierFloorPercent',
] as const;

const pick = (from: object, fields: readonly string[]) =>
  Object.fromEntries(
    fields.map((field) => [field, structuredClone((from as Record<string, unknown>)[field])]),
  );

const canonicalOf = (item: { ingredient: { id: string; canonical_ingredient_id?: string } }) =>
  item.ingredient.canonical_ingredient_id ?? item.ingredient.id;

/**
 * The shared test snapshots (`productBehaviorTestSnapshots`, STANDARD_ONLY), with the
 * Main-capable fruit carrying a published Main policy — Sorbet: the served exact
 * strawberry policy; gelato: the fresh-fruit dairy policy with milk as its approved
 * carrier. Banana and kiwi keep the fixture default (they are not Main-capable here).
 */
function authorityFor(
  input: RecipeInput,
  toppings = useRecipeStore.getState().toppings,
): Record<string, ProductBehaviorSnapshot> {
  const table = productBehaviorTestSnapshots(input, toppings);
  const servedFruit = servedSorbetSnapshots(servedSorbetRecipe())[SERVED_FRUIT.strawberry]!;
  const owner = ownerFruitSnapshots(ownerFruitRecipe());
  for (const item of input.items) {
    const base = table[item.id]!;
    if (MAIN_CAPABLE_FRUIT.has(canonicalOf(item))) {
      table[item.id] =
        input.category === 'sorbet'
          ? ({
              ...base,
              ...pick(servedFruit, SORBET_MAIN_FIELDS),
              moduleEligibility: { ...base.moduleEligibility, MAIN: 'eligible' },
              sharedFacts: {
                ...base.sharedFacts!,
                profileEligibility: [...servedFruit.sharedFacts!.profileEligibility],
              },
            } as ProductBehaviorSnapshot)
          : ({ ...base, ...pick(owner.watermelon!, DAIRY_MAIN_FIELDS) } as ProductBehaviorSnapshot);
    }
    if (input.category !== 'sorbet' && canonicalOf(item) === OWNER_IDS.milk) {
      table[item.id] = { ...base, approvedLiquidDairyCarrier: true };
    }
  }
  return table;
}

const refreshAuthority = () => {
  const state = useRecipeStore.getState();
  authority.table = authorityFor(buildRecipeInput(state), state.toppings);
};

/* ── HOME's own doors ───────────────────────────────────────────────────────── */

const store = () => useRecipeStore.getState();
const studio = () => useConstraintStudioStore.getState();
const line = (lineId: string) => store().items.find((item) => item.id === lineId)!;
const baseSum = () => store().items.reduce((sum, item) => sum + item.planned_grams, 0);

/** HOME's first build: the canonical starter, then a draft born in AUTO. */
function homeStarter(visible: 'gelato' | 'sorbet', priority: 'AUTO' | 'MANUAL' = 'AUTO') {
  store().rebuildNewRecipeStarter({
    visibleProductType: visible,
    servingModeId: 'temp_minus_11',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1000,
  });
  if (priority === 'AUTO') store().setPriorityMode('AUTO');
  refreshAuthority();
  for (const item of store().items) {
    store().setProductBehaviorSnapshot(
      item.id,
      structuredClone(authority.table[item.id]) as ProductBehaviorSnapshot,
    );
  }
}

/** HOME's one add door (HomeCreatorPage `addIngredientLine`): an amount the customer
 * gave is `user_exact`; the resolved behaviour lands on the line; then the AUTOMATIC
 * priority door. */
function homeAdd(ingredient: EngineIngredient, grams: number): string {
  const added = store().addIngredient(
    ingredient,
    grams,
    grams > 0 ? { amountIntent: 'user_exact' } : undefined,
  );
  if (added.status !== 'added') throw new Error(`${ingredient.name} was not added`);
  refreshAuthority();
  store().setProductBehaviorSnapshot(
    added.lineId,
    structuredClone(authority.table[added.lineId]) as ProductBehaviorSnapshot,
  );
  store().grantAutomaticPriority(added.lineId);
  return added.lineId;
}

/** HOME's topping door (HomeCreatorPage `addConfirmedTopping`). */
function homeAddTopping(ingredient: EngineIngredient, grams: number): string {
  store().addTopping(ingredient, grams);
  const topping = store().toppings.find(
    (item) => canonicalOf(item) === canonicalOf({ ingredient }),
  )!;
  refreshAuthority();
  store().setProductBehaviorSnapshot(
    topping.id,
    structuredClone(authority.table[topping.id]) as ProductBehaviorSnapshot,
  );
  return topping.id;
}

const fruit = (canonicalId: string) => sorbetMapperIngredient(canonicalId);

/** Every line a whole gram, Σ Base exactly the target, the result verified. */
function expectFinishedRecipe(target: number) {
  const state = store();
  expect(state.target_batch_grams).toBe(target);
  expect(baseSum()).toBe(target);
  for (const item of state.items) expect(Number.isInteger(item.planned_grams)).toBe(true);
  expect(state.practicalRecipeAudit).not.toBeNull();
  expect(studio().preview).toBeNull();
  expect(studio().blocked).toBeNull();
  expect(studio().postApplyNotice).toBeNull();
}

/** A READY gelato: HOME's first build with strawberry as the invisible AUTO Main. */
async function readyGelato() {
  homeStarter('gelato');
  const strawberry = homeAdd(fruit(SORBET_MAIN_IDS.strawberry), 0);
  expect(await recalculateHomeRecipe()).toBe('applied');
  expectFinishedRecipe(1000);
  return { strawberry };
}

/** What a refusal/decision must never write. */
const recipeSnapshot = () =>
  structuredClone({
    items: store().items,
    target: store().target_batch_grams,
    revision: store().draftRevision,
    audit: store().practicalRecipeAudit,
  });

/** The customer's answer to a Direction consent, through the SAME CORE the dialog's
 * button calls (`HomeRecalculate`: acceptBestDirectionCandidate → Zastosuj). */
async function acceptDirectionAndApply() {
  expect(studio().directionBestCandidate).not.toBeNull();
  studio().acceptBestDirectionCandidate();
  expect(studio().preview).not.toBeNull();
  await applyPreviewWithServerAuthority();
}

beforeEach(() => {
  store().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  studio().resetForTests();
  solver.requests = [];
  authority.table = {};
});

describe('HOME recalculation orchestration — runtime', () => {
  it('HOME-RECALC-01 gelato first build: the 0 g AUTO Main is sized by CORE and applied', async () => {
    homeStarter('gelato');
    const strawberry = homeAdd(fruit(SORBET_MAIN_IDS.strawberry), 0);
    expect(store().priority_mode).toBe('AUTO');
    expect(line(strawberry)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    const target = store().target_batch_grams;

    expect(await recalculateHomeRecipe()).toBe('applied');

    // CORE was asked with the 1 g bootstrap on the calculation COPY only.
    expect(requests()[0]!.input.items.find((item) => item.id === strawberry)).toMatchObject({
      planned_grams: 1,
      lock_type: 'main',
      amount_provenance: AUTO_CROWN_SEED,
    });
    expect(line(strawberry).lock_type).toBe('main');
    expect(line(strawberry).planned_grams).toBeGreaterThan(0);
    expectFinishedRecipe(target);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  });

  it('HOME-RECALC-02 sorbet, one fresh fruit, invisible AUTO Main: a decision first, then the real recipe', async () => {
    homeStarter('sorbet');
    const strawberry = homeAdd(fruit(SORBET_MAIN_IDS.strawberry), 0);
    const reservedBefore = store().starterReservedMainGrams;
    expect(reservedBefore).toBeGreaterThan(0);
    const target = store().target_batch_grams;
    const before = recipeSnapshot();

    expect(await recalculateHomeRecipe()).toBe('decision');

    // CORE's Direction consent is staged, NOTHING is written.
    expect(studio().directionBestCandidate).not.toBeNull();
    expect(studio().preview).toBeNull();
    expect(studio().recalculationTerminal).toEqual({ state: 'PREVIEW_READY' });
    expect(recipeSnapshot()).toEqual(before);
    expect(line(strawberry).planned_grams).toBe(0);
    expect(
      studio().directionBestCandidate!.proposedInput.items.find((item) => item.id === strawberry)!
        .planned_grams,
    ).toBeGreaterThan(0);

    await acceptDirectionAndApply();

    expect(line(strawberry).lock_type).toBe('main');
    expect(line(strawberry).planned_grams).toBeGreaterThan(0);
    expectFinishedRecipe(target);
    // The starter's reservation for the unchosen Main is retired by the real Main.
    expect(store().starterReservedMainGrams).toBe(0);
  });

  it('HOME-RECALC-03 sorbet with two fresh fruits (Multi-Main): both sized, equal priority split', async () => {
    homeStarter('sorbet');
    const strawberry = homeAdd(fruit(SORBET_MAIN_IDS.strawberry), 0);
    const lime = homeAdd(fruit(SORBET_MAIN_IDS.lime), 0);
    expect([line(strawberry).lock_type, line(lime).lock_type]).toEqual(['main', 'main']);
    const target = store().target_batch_grams;

    const outcome = await recalculateHomeRecipe();
    expect(outcome).toBe('decision');
    // Both 0 g priorities were bootstrapped on the copy.
    expect(studio().directionBestCandidate!.previewInstructions?.lines).toEqual([
      { lineId: strawberry, grams: 1, locked: false, bootstrap: true },
      { lineId: lime, grams: 1, locked: false, bootstrap: true },
    ]);
    await acceptDirectionAndApply();

    expect(line(strawberry)).toMatchObject({ lock_type: 'main' });
    expect(line(lime)).toMatchObject({ lock_type: 'main' });
    expect(line(strawberry).planned_grams).toBeGreaterThan(0);
    expect(line(lime).planned_grams).toBeGreaterThan(0);
    expect(line(strawberry).main_ratio_weight).toBe(line(lime).main_ratio_weight);
    expect(line(strawberry).planned_grams).toBe(line(lime).planned_grams);
    expectFinishedRecipe(target);
  });

  it('HOME-RECALC-04 sorbet with an explicitly given fruit amount: that amount is kept exactly', async () => {
    homeStarter('sorbet');
    const strawberry = homeAdd(fruit(SORBET_MAIN_IDS.strawberry), 0);
    const banana = homeAdd(fruit(BANANA), 100);
    const given = line(banana).planned_grams;
    expect(line(banana)).toMatchObject({
      lock_type: 'grams',
      grams_constraint: { grams: given },
      user_target_grams: given,
    });
    const target = store().target_batch_grams;

    const outcome = await recalculateHomeRecipe();
    if (outcome === 'decision') await acceptDirectionAndApply();
    else expect(outcome).toBe('applied');

    expect(line(banana)).toMatchObject({
      planned_grams: given,
      lock_type: 'grams',
      grams_constraint: { grams: given },
    });
    expect(line(strawberry).lock_type).toBe('main');
    expect(line(strawberry).planned_grams).toBeGreaterThan(0);
    expectFinishedRecipe(target);
  });

  it('HOME-RECALC-04b an explicit Main amount outside its exact policy is refused, never rewritten', async () => {
    homeStarter('sorbet');
    const strawberry = homeAdd(fruit(SORBET_MAIN_IDS.strawberry), 450);
    const given = line(strawberry).planned_grams;
    expect(line(strawberry)).toMatchObject({
      lock_type: 'main',
      grams_constraint: { grams: given },
    });
    const before = recipeSnapshot();

    expect(await recalculateHomeRecipe()).toBe('decision');

    // CORE says why (the exact Sorbet Main policy), and the customer's amount stands.
    expect(studio().preview).toBeNull();
    expect(studio().recalculationTerminal?.state).toBe('BLOCKED_WITH_EXACT_ACTION');
    const issue = studio().previewIssue;
    expect(issue?.ok === false && issue.code).toBe('product_behavior_invalid');
    expect(
      issue?.ok === false && 'violations' in issue
        ? issue.violations?.map((violation) => violation.code)
        : [],
    ).toContain('main_below_floor');
    expect(recipeSnapshot()).toEqual(before);
    expect(line(strawberry).planned_grams).toBe(given);
  });

  it('HOME-RECALC-05 an explicit MANUAL crown is, for the solver, the same priority as the AUTO one', async () => {
    const starter = buildCanonicalNewRecipeStarter({
      visibleProductType: 'gelato',
      servingModeId: 'temp_minus_11',
      formulationStrategy: 'optimal',
      targetBatchGrams: 1000,
    });
    const seat: RecipeInput = {
      mode: 'classic',
      category: starter.category,
      target_temperature_c: starter.targetTemperatureC,
      target_batch_grams: starter.targetBatchGrams,
      machine_capacity_grams: null,
      goals: {
        formulation_strategy: starter.formulationStrategy,
        direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
        direction_targets_active: true,
      },
      items: [
        ...structuredClone(starter.items),
        {
          id: 'fruit-strawberry',
          ingredient: fruit(SORBET_MAIN_IDS.strawberry),
          planned_grams: 0,
          actual_grams: null,
          lock_type: 'unlocked',
        } satisfies RecipeItem,
      ],
    };
    const run = async (crown: 'auto' | 'manual') => {
      store().resetToDemo();
      useRecipeProfileStore.getState().resetForTests();
      studio().resetForTests();
      solver.requests = [];
      store().loadRecipeInput(structuredClone(seat));
      authority.table = authorityFor(seat, []);
      for (const item of store().items) {
        store().setProductBehaviorSnapshot(
          item.id,
          structuredClone(authority.table[item.id]) as ProductBehaviorSnapshot,
        );
      }
      if (crown === 'auto') {
        store().setPriorityMode('AUTO');
        store().grantAutomaticPriority('fruit-strawberry');
      } else {
        expect(store().priority_mode).toBe('MANUAL');
        store().setLockType('fruit-strawberry', 'main', 'home');
      }
      const mainBefore = structuredClone(line('fruit-strawberry'));
      const mode = store().priority_mode;
      const outcome = await recalculateHomeRecipe();
      const applied = studio().history.at(-1)?.before.presentation?.preview;
      return {
        outcome,
        mode,
        mainBefore,
        requests: structuredClone(requests()),
        staged: applied?.proposedInput.items.map((item) => ({
          id: item.id,
          planned_grams: item.planned_grams,
          lock_type: item.lock_type,
        })),
        final: structuredClone(store().items),
      };
    };
    const auto = await run('auto');
    const manual = await run('manual');

    // Two different HOME doors…
    expect([auto.mode, manual.mode]).toEqual(['AUTO', 'MANUAL']);
    for (const main of [auto.mainBefore, manual.mainBefore]) {
      expect(main).toMatchObject({ planned_grams: 0, lock_type: 'main' });
      expect(main.amount_provenance).toBeUndefined();
    }
    // …one question to CORE, one answer.
    expect(auto.outcome).toBe('applied');
    expect(manual.outcome).toBe('applied');
    expect(manual.requests.length).toBeGreaterThan(0);
    expect(manual.requests).toEqual(auto.requests);
    expect(manual.staged).toEqual(auto.staged);
    expect(manual.final).toEqual(auto.final);
    expectFinishedRecipe(seat.target_batch_grams);
  });

  it('HOME-RECALC-06 the served 1200 g defect: banana 100 g + kiwi 100 g into a READY 1000 g gelato', async () => {
    const { strawberry } = await readyGelato();
    const target = store().target_batch_grams;
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);

    const banana = homeAdd(fruit(BANANA), 100);
    const kiwi = homeAdd(fruit(KIWI), 100);
    const given = { [banana]: line(banana).planned_grams, [kiwi]: line(kiwi).planned_grams };
    // The served state: 1200 g of lines under a 1000 g header, and CORE says so.
    expect(baseSum()).toBe(target + given[banana]! + given[kiwi]!);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);

    expect(await recalculateHomeRecipe()).toBe('applied');

    for (const lineId of [banana, kiwi]) {
      expect(line(lineId)).toMatchObject({
        planned_grams: given[lineId],
        lock_type: 'grams',
        grams_constraint: { grams: given[lineId] },
      });
    }
    expect(line(strawberry).lock_type).toBe('main');
    expect(line(strawberry).planned_grams).toBeGreaterThan(0);
    // The header value's source never moved: CORE brought the lines back to it.
    expect(store().target_batch_grams).toBe(target);
    expectFinishedRecipe(target);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  });

  it('HOME-RECALC-07 a topping never asks for a recalculation and never enters the Base sum or the solve', async () => {
    await readyGelato();
    const target = store().target_batch_grams;
    const topping = homeAddTopping(
      sorbetTopping('fixture', 0).ingredient as EngineIngredient,
      toppingCreationDefaultGrams(store().items),
    );
    expect(store().toppings.find((item) => item.id === topping)!.planned_grams).toBeGreaterThan(0);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    store().setToppingGrams(topping, store().toppings[0]!.planned_grams + 10);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    expect(baseSum()).toBe(target);
    const toppingGrams = store().toppings.find((item) => item.id === topping)!.planned_grams;

    // A Base change does ask — and the solve it starts never sees the topping.
    const banana = homeAdd(fruit(BANANA), 100);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
    solver.requests = [];
    expect(await recalculateHomeRecipe()).toBe('applied');
    expect(requests().length).toBeGreaterThan(0);
    for (const request of requests()) {
      expect(request.input.items.map((item) => item.id)).not.toContain(topping);
      expect(request.input.items.map((item) => item.id)).toContain(banana);
    }
    expectFinishedRecipe(target);
    expect(store().toppings.find((item) => item.id === topping)!.planned_grams).toBe(toppingGrams);
  });

  it('HOME-RECALC-08 a declined or refused state is not solved again for the same draftRevision', async () => {
    homeStarter('sorbet');
    homeAdd(fruit(SORBET_MAIN_IDS.strawberry), 0);
    expect(await recalculateHomeRecipe()).toBe('decision');
    const solvedFor = store().draftRevision;
    const before = recipeSnapshot();
    const asked = requests().length;

    // The page opens HOME's review dialog to PRESENT the staged answer
    // (`presentCurrent`): the dialog must not solve the same recipe again.
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onClose = vi.fn();
    await act(async () =>
      root.render(
        createElement(HomeRecalculate, {
          open: true,
          context: 'initial',
          presentCurrent: true,
          onClose,
          onApplied: () => undefined,
        }),
      ),
    );
    // DialogShell renders into a portal on document.body.
    expect(document.querySelector('[data-testid="home-recalc-direction-best"]')).not.toBeNull();
    expect(requests()).toHaveLength(asked);

    // The customer declines: nothing provisional survives, nothing is written, and the
    // revision the page pinned is still the current one — the page's guard
    // (`autoRecalculatedFor.current === recipe.draftRevision`) therefore holds while
    // CORE keeps `awaitingRecalculation` raised.
    await act(async () =>
      document.querySelector<HTMLElement>('[data-testid="home-recalc-close"]')!.click(),
    );
    expect(onClose).toHaveBeenCalled();
    expect(studio().directionBestCandidate).toBeNull();
    expect(recipeSnapshot()).toEqual(before);
    expect(store().draftRevision).toBe(solvedFor);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
    expect(requests()).toHaveLength(asked);
    await act(async () => root.unmount());
    host.remove();

    // A refusal leaves the revision untouched as well.
    const refused = homeAdd(fruit(BANANA), 700);
    const refusedFor = store().draftRevision;
    const refusedBefore = recipeSnapshot();
    expect(await recalculateHomeRecipe()).toBe('decision');
    // CORE publishes its refusal (never a silent over-target recipe)…
    expect(studio().previewIssue?.ok).toBe(false);
    expect(studio().recalculationTerminal?.state).toBe('BLOCKED_WITH_EXACT_ACTION');
    expect(studio().preview).toBeNull();
    expect(studio().directionBestCandidate).toBeNull();
    expect(recipeSnapshot()).toEqual(refusedBefore);
    expect(store().draftRevision).toBe(refusedFor);
    expect(line(refused).planned_grams).toBe(
      refusedBefore.items.find((item) => item.id === refused)!.planned_grams,
    );

    // The page rule that relies on it — HomeCreatorPage is not mountable in this
    // harness (router, auth, catalogue, managed authority), so its guard is pinned at
    // the source: one run per revision, the pin taken BEFORE the run starts, and
    // never behind the dialog.
    const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
    const effect = page.slice(
      page.indexOf('const autoRecalculatedFor = useRef<number | null>(null);'),
      page.indexOf("/** §35's automatic choice undone"),
    );
    expect(effect).toContain('if (autoRecalculatedFor.current === recipe.draftRevision) return;');
    expect(effect).toContain('if (reviewAction !== null || automaticReview !== null) return;');
    expect(
      effect.indexOf('autoRecalculatedFor.current = useRecipeStore.getState().draftRevision;'),
    ).toBeLessThan(effect.indexOf('recalculateHomeRecipe()'));
    expect(effect.indexOf('autoRecalculatedFor.current = useRecipeStore')).toBeGreaterThan(0);
  });
});
