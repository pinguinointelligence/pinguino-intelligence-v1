/**
 * HOME batch scenarios — the owner's §15 evidence table (owner §18, 2026-09-18).
 *
 * For every scenario the REAL run records TARGET, Σ BASE before, the change, Σ BASE
 * after, and whether the target, the customer's locks and the priorities were kept —
 * and asserts them. Nothing here types an expected gram number: each result is held
 * to CORE's invariants (Σ Base = target in whole grams, locks exact, Main kept) and to
 * the PRO path (the same change, from the same recipe, through PRO's own doors and
 * PRO's own CORE entry). Where the target cannot be met without breaking an explicit
 * amount, CORE must SAY so (a refusal / lock conflict) — never exceed the target.
 *
 * The table is written by the run itself (node:fs) ONLY when HOME_BATCH_TABLE_OUT names
 * the file to write; an ordinary test run never writes outside the repository.
 *
 * The Main-capable fruit carries the SERVED dairy Main policy, read from the migration
 * that publishes it (STRAWBERRIES: `main-berry-fresh-dairy` v2, floor 25 %). The harness
 * once gave strawberry the WATERMELON fixture fields (floor 20 %), and that 5 % gap is
 * exactly where the served 1340 g banana + kiwi refusal hid.
 *
 * Only the server authority is answered (SERVER-AUTHORITY-TABLE fake: every requested
 * line gets `structuredClone(table[lineId])` from ONE fixture map); the solver runs
 * in-process through a PASS-THROUGH tap.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { OWNER_IDS } from '@/features/constraint-studio/__fixtures__/ownerFruitMainFixture';
import {
  publishedDairyMainPolicy,
  withPublishedDairyMainPolicy,
  type PublishedDairyMainPolicy,
} from '@/features/constraint-studio/__fixtures__/servedDairyMainPolicy';
import {
  SERVED_FRUIT,
  SERVED_FRUIT_IDS,
  servedSorbetRecipe,
  servedSorbetSnapshots,
} from '@/features/constraint-studio/__fixtures__/servedSorbetThreeFruitFixture';
import {
  applyPreviewWithServerAuthority,
  beginPiRecalculation,
  runPiRecalculationWithTerminal,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import type { OptimizePreviewComputationRequest } from '@/features/constraint-studio/optimizePreviewComputation';
import { previewCustomerDecisionReason } from '@/features/constraint-studio/previewCustomerDecision';
import {
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_NC302EU,
  deriveMachineSetup,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { toppingCreationDefaultGrams } from '@/features/recipe-composition/toppingCreationDefault';
import {
  SORBET_MAIN_IDS,
  sorbetMapperIngredient,
  sorbetTopping,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { recalculateHomeRecipe } from './homeRecalculation';

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

/* ── the ONE authority map ──────────────────────────────────────────────────── */

const BANANA = 'PI-ING-000345';
const KIWI = 'PI-ING-000366';
const MAIN_CAPABLE_FRUIT = new Set<string>([SORBET_MAIN_IDS.strawberry, SORBET_MAIN_IDS.lime]);
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
/** The migration that publishes staging's Main policies (the served rows, read as data). */
const SERVED_POLICY_SQL = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260813110400_product_behavior_classification_queue.sql',
  ),
  'utf8',
);
/** The published milk_gelato Main policy each Main-capable fruit is served with. */
const SERVED_DAIRY_POLICY: Readonly<Record<string, PublishedDairyMainPolicy>> = {
  [SORBET_MAIN_IDS.strawberry]: publishedDairyMainPolicy(
    SERVED_POLICY_SQL,
    'main-berry-fresh-dairy',
  ),
  [SORBET_MAIN_IDS.lime]: publishedDairyMainPolicy(SERVED_POLICY_SQL, 'main-fruit-fresh-dairy'),
};

const pick = (from: object, fields: readonly string[]) =>
  Object.fromEntries(
    fields.map((field) => [field, structuredClone((from as Record<string, unknown>)[field])]),
  );

const canonicalOf = (item: { ingredient: { id: string; canonical_ingredient_id?: string } }) =>
  item.ingredient.canonical_ingredient_id ?? item.ingredient.id;

/** Shared test snapshots + a published Main policy on the Main-capable fruit (Sorbet:
 * the served exact strawberry policy; gelato: the SERVED dairy policy row, milk as its
 * approved carrier). The served three-fruit seat uses its own served snapshots. */
function authorityFor(input: RecipeInput): Record<string, ProductBehaviorSnapshot> {
  const toppings = useRecipeStore.getState().toppings;
  if (input.items.some((item) => SERVED_FRUIT_IDS.includes(item.id))) {
    return {
      ...servedSorbetSnapshots(input),
      ...productBehaviorTestSnapshots({ ...input, items: [] }, toppings),
    };
  }
  const table = productBehaviorTestSnapshots(input, toppings);
  const servedFruit = servedSorbetSnapshots(servedSorbetRecipe())[SERVED_FRUIT.strawberry]!;
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
          : withPublishedDairyMainPolicy(base, SERVED_DAIRY_POLICY[canonicalOf(item)]!);
    }
    if (input.category !== 'sorbet' && canonicalOf(item) === OWNER_IDS.milk) {
      table[item.id] = { ...base, approvedLiquidDairyCarrier: true };
    }
  }
  return table;
}

const store = () => useRecipeStore.getState();
const studio = () => useConstraintStudioStore.getState();
const baseSum = () => store().items.reduce((sum, item) => sum + item.planned_grams, 0);

/** Every line (Base and Topping) carries its resolved authority, exactly as the
 * managed pass / the add doors leave it. */
function syncAuthority() {
  authority.table = authorityFor(buildRecipeInput(store()));
  for (const lineId of [
    ...store().items.map((item) => item.id),
    ...store().toppings.map((item) => item.id),
  ]) {
    const entry = authority.table[lineId] as ProductBehaviorSnapshot | undefined;
    const current = store().productBehaviorSnapshots[lineId];
    if (entry && (current === undefined || current.resolutionState !== 'RESOLVED')) {
      store().setProductBehaviorSnapshot(lineId, structuredClone(entry));
    }
  }
}

const resetStores = () => {
  store().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  studio().resetForTests();
  solver.requests = [];
  authority.table = {};
};

/* ── the two sides' doors ───────────────────────────────────────────────────── */

type Side = 'home' | 'pro';

/** The one Base add door both surfaces share; an amount the customer gave is exact.
 * HOME then offers its AUTOMATIC priority (a no-op for a non-Main product). */
function add(side: Side, ingredient: EngineIngredient, grams: number): string {
  const added = store().addIngredient(
    ingredient,
    grams,
    grams > 0 ? { amountIntent: 'user_exact' } : undefined,
  );
  if (added.status !== 'added') throw new Error(`${ingredient.name} was not added`);
  syncAuthority();
  if (side === 'home') store().grantAutomaticPriority(added.lineId);
  return added.lineId;
}

const crown = (side: Side, lineId: string, how: 'auto' | 'manual') => {
  if (side === 'pro') store().setMainIngredient(lineId);
  else if (how === 'auto') store().grantAutomaticPriority(lineId);
  else store().setLockType(lineId, 'main', 'home');
};

const setBatch = (side: Side, grams: number) => {
  if (side === 'home') store().setBatchGrams(grams, undefined, 'USER_OVERRIDE');
  else studio().resizeBatchGrams(grams);
};

const lockAtCurrentGrams = (side: Side, lineId: string) => {
  if (side === 'home') {
    store().setGramLock(lineId, store().items.find((item) => item.id === lineId)!.planned_grams);
  } else studio().toggleLock(lineId);
};

/** The machine door both surfaces call with the same payload
 * (HomeCreatorPage `applyMachineSelection`, ProMachineSelector `selectHome`). */
function selectCreami() {
  const setup = deriveMachineSetup(NINJA_CREAMI_NC302EU, 'gelato');
  store().setMachineSelection({
    kind: 'home',
    servingModeId: setup.resolvedVisibleMode!,
    machineId: NINJA_CREAMI_NC302EU.id,
    label: machineDisplayName(NINJA_CREAMI_NC302EU),
    machineTechnology: NINJA_CREAMI_NC302EU.technology,
    homeFormulationModuleId: NINJA_CREAMI_NC302EU.homeFormulationModuleId,
    temperatureC: setup.engineTemperatureC,
    batchGrams: setup.recommendedBatchGrams,
    hardCapacityGrams: setup.hardMaximumBatchGrams,
    batchSource: 'MACHINE_DEFAULT',
  });
  syncAuthority();
  return setup.recommendedBatchGrams!;
}

type Outcome = 'applied' | 'unchanged' | 'decision';

/** What CORE left for the customer to decide (lock conflict, a Preview that is not
 * clean, a refusal) — named, never collapsed. */
function pendingDecision(): string {
  const state = studio();
  if (state.lockConflict !== null) return `lockConflict:${state.lockConflict.diagnosis.status}`;
  if (state.preview !== null)
    return `preview:${previewCustomerDecisionReason(state.preview) ?? 'clean'}`;
  if (state.directionFallbackReport !== null) return 'directionFallbackReport';
  if (state.directionBestCandidate !== null) return 'directionBestCandidate';
  if (state.previewIssue?.ok === false) return state.previewIssue.code;
  return state.recalculationTerminal?.state ?? 'none';
}

/**
 * Each side's own CORE entry, with ONE customer for both: they accept Gellatti's
 * best Direction candidate when it is offered (HOME's dialog button, PRO's
 * `direction-best-accept`, which PRO hides behind a fallback report) and apply a
 * CLEAN Preview (`previewCustomerDecisionReason === null`). Anything else — a lock
 * conflict, a diagnostic-only Preview, a Suggested Fix, a refusal — stays a decision.
 */
async function recalculate(side: Side): Promise<Outcome> {
  if (side === 'home') {
    const outcome = await recalculateHomeRecipe();
    if (outcome === 'applied' || outcome === 'unchanged') return outcome;
    if (outcome !== 'decision' || studio().directionBestCandidate === null) return 'decision';
    studio().acceptBestDirectionCandidate();
  } else {
    await runPiRecalculationWithTerminal(undefined, beginPiRecalculation());
    if (studio().directionBestCandidate !== null && studio().directionFallbackReport === null) {
      studio().acceptBestDirectionCandidate();
    }
    if (studio().preview === null) {
      return studio().recalculationTerminal?.state === 'NO_CHANGE_NEEDED' &&
        studio().previewIssue?.ok === false
        ? 'unchanged'
        : 'decision';
    }
    const reason = previewCustomerDecisionReason(studio().preview!);
    // A Direction consent the customer just gave is the one accepted non-clean case.
    if (reason !== null && reason !== 'direction_not_reached' && reason !== 'direction_fallback') {
      return 'decision';
    }
  }
  await applyPreviewWithServerAuthority();
  return studio().preview === null && studio().blocked === null ? 'applied' : 'decision';
}

/* ── the scenario harness ───────────────────────────────────────────────────── */

interface Scenario {
  name: string;
  /** Seat the recipe the change starts from, through HOME's own doors. */
  seat: () => Promise<void>;
  /** A human description of the change (Polish, for the owner's table). */
  change: string;
  /** Apply the change through ONE side's own doors. Returns the intended target. */
  apply: (side: Side) => number;
  /** A conflict is expected: CORE must refuse rather than exceed the target. */
  conflict?: boolean;
  /** Scenario-specific CORE invariants, checked on HOME's final recipe. */
  verify?: (observed: Observation) => void;
}

interface Observation {
  target: number;
  sumBefore: number;
  sumChanged: number;
  sumAfter: number;
  outcome: Outcome;
  targetKept: boolean;
  locks: { total: number; kept: boolean };
  priorities: { total: number; kept: boolean };
  finalByIngredient: Record<string, number>;
  wholeGrams: boolean;
  audit: boolean;
  /** CORE wrote nothing: the lines are exactly what the change left. */
  untouchedByCore: boolean;
  /** A Topping line reached a solver request (it never may). */
  toppingInSolve: boolean;
  refusal: string | null;
  /** The typed refusal CORE published (never the carrier share of an unproposed vector). */
  issueCode: string | null;
}

const gramsByIngredient = () =>
  Object.fromEntries(store().items.map((item) => [canonicalOf(item), item.planned_grams]));

async function runHome(scenario: Scenario): Promise<{ observed: Observation; seat: RecipeInput }> {
  resetStores();
  await scenario.seat();
  solver.requests = [];
  const seat = structuredClone(buildRecipeInput(store()));
  const sumBefore = baseSum();
  const target = scenario.apply('home');
  const sumChanged = baseSum();
  const lockedBefore = store().items.filter((item) => item.grams_constraint !== undefined);
  const mainsBefore = store().items.filter((item) => item.lock_type === 'main');
  const modeBefore = store().priority_mode;
  const toppingsBefore = structuredClone(store().toppings);
  const itemsBefore = structuredClone(store().items);
  const outcome = await recalculate('home');
  const after = new Map(store().items.map((item) => [item.id, item]));
  const locksKept = lockedBefore.every((line) => {
    const now = after.get(line.id);
    return (
      now !== undefined &&
      Object.is(now.planned_grams, line.grams_constraint!.grams) &&
      now.lock_type === line.lock_type &&
      Object.is(now.grams_constraint?.grams, line.grams_constraint!.grams)
    );
  });
  const prioritiesKept =
    store().priority_mode === modeBefore &&
    mainsBefore.every((line) => after.get(line.id)?.lock_type === 'main') &&
    (outcome === 'decision' ||
      mainsBefore.every((line) => (after.get(line.id)?.planned_grams ?? 0) > 0));
  // A topping is never touched by the Base recalculation.
  expect(store().toppings).toEqual(toppingsBefore);
  return {
    seat,
    observed: {
      target,
      sumBefore,
      sumChanged,
      sumAfter: baseSum(),
      outcome,
      targetKept:
        outcome !== 'decision' && store().target_batch_grams === target && baseSum() === target,
      locks: { total: lockedBefore.length, kept: locksKept },
      priorities: { total: mainsBefore.length, kept: prioritiesKept },
      finalByIngredient: gramsByIngredient(),
      wholeGrams: store().items.every((item) => Number.isInteger(item.planned_grams)),
      audit: store().practicalRecipeAudit !== null,
      untouchedByCore: isDeepStrictEqual(store().items, itemsBefore),
      toppingInSolve: (solver.requests as SolverRequest[]).some((request) =>
        request.input.items.some((item) =>
          toppingsBefore.some((topping) => topping.id === item.id),
        ),
      ),
      refusal: outcome === 'decision' ? pendingDecision() : null,
      issueCode: studio().previewIssue?.ok === false ? studio().previewIssue!.code : null,
    },
  };
}

/** The same change, from the same recipe, through PRO's doors and PRO's CORE entry. */
async function runPro(scenario: Scenario, seat: RecipeInput) {
  resetStores();
  store().loadRecipeInput(structuredClone(seat));
  syncAuthority();
  scenario.apply('pro');
  const outcome = await recalculate('pro');
  return { outcome, finalByIngredient: gramsByIngredient() };
}

/* ── the owner's table, written by the run ──────────────────────────────────── */

/** Opt-in only: the evidence table is written when HOME_BATCH_TABLE_OUT names a file. */
const EVIDENCE = process.env.HOME_BATCH_TABLE_OUT ?? '';
const WRITE_EVIDENCE = EVIDENCE !== '';
const proRows: string[] = [];

const grams = (value: number) =>
  Number.isInteger(value) ? `${value} g` : `${value.toFixed(2)} g (dokładnie ${value})`;
const yesNo = (value: boolean) => (value ? 'TAK' : 'NIE');

function recordRow(scenario: Scenario, observed: Observation) {
  const changed =
    observed.sumChanged === observed.sumBefore
      ? scenario.change
      : `${scenario.change} → przed przeliczeniem Σ ${grams(observed.sumChanged)}`;
  const targetCell = scenario.conflict
    ? `${yesNo(observed.targetKept)} — CORE: ${observed.refusal ?? observed.outcome}, receptura nie została zmieniona`
    : yesNo(observed.targetKept);
  const locksCell =
    observed.locks.total === 0
      ? 'n/d (brak blokad)'
      : `${yesNo(observed.locks.kept)} (${observed.locks.total})`;
  const prioritiesCell =
    observed.priorities.total === 0
      ? 'n/d (brak priorytetu)'
      : `${yesNo(observed.priorities.kept)} (${observed.priorities.total})`;
  const row = `| ${scenario.name} | ${grams(observed.target)} | ${grams(observed.sumBefore)} | ${changed} | ${grams(observed.sumAfter)} | ${targetCell} | ${locksCell} | ${prioritiesCell} |\n`;
  if (WRITE_EVIDENCE) appendFileSync(EVIDENCE, row);
}

beforeAll(() => {
  if (!WRITE_EVIDENCE) return;
  writeFileSync(
    EVIDENCE,
    [
      '# HOME — scenariusze wsadu (§15)',
      '',
      `Wygenerowane przez \`src/features/home-creator/homeBatchScenarios.runtime.test.ts\` (${new Date().toISOString()}).`,
      'Każdy wiersz to obserwacja z prawdziwego przebiegu: HOME przez własne drzwi i `recalculateHomeRecipe` (zgoda Direction przez ten sam CORE co w oknie), serwer odpowiada tabelą snapshotów, solver i praktykalizacja są prawdziwe.',
      '',
      '| SCENARIUSZ | TARGET | SUMA BASE PRZED | ZMIANA | SUMA BASE PO | TARGET ZACHOWANY | LOCKI ZACHOWANE | PRIORYTETY ZACHOWANE |',
      '|---|---|---|---|---|---|---|---|',
      '',
    ].join('\n'),
  );
});

afterAll(() => {
  if (!WRITE_EVIDENCE) return;
  appendFileSync(
    EVIDENCE,
    [
      '',
      '## Porównanie z PRO (ta sama zmiana, ta sama receptura, drzwi PRO i wejście CORE PRO)',
      '',
      '| SCENARIUSZ | WYNIK HOME | WYNIK PRO | GRAMY IDENTYCZNE |',
      '|---|---|---|---|',
      ...proRows,
      '',
    ].join('\n'),
  );
});

/* ── seats ──────────────────────────────────────────────────────────────────── */

/** HOME's first build: the canonical starter, a draft born in AUTO, the customer's
 * fruit at 0 g — crowned by the scenario's own change. */
function homeStarterWithFruit(visible: 'gelato' | 'sorbet', fruitIds: readonly string[]) {
  store().rebuildNewRecipeStarter({
    visibleProductType: visible,
    servingModeId: 'temp_minus_11',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1000,
  });
  store().setPriorityMode('AUTO');
  syncAuthority();
  return fruitIds.map((canonicalId) => {
    const added = store().addIngredient(sorbetMapperIngredient(canonicalId), 0);
    if (added.status !== 'added') throw new Error(`${canonicalId} was not added`);
    syncAuthority();
    return added.lineId;
  });
}

/** A READY gelato built straight at `batch` through HOME's own batch door — the served
 * Ninja CREAMi Deluxe journey (the customer sets the batch, then the fruit is built). */
async function readyGelatoAt(batch: number) {
  const [strawberry] = homeStarterWithFruit('gelato', [SORBET_MAIN_IDS.strawberry]);
  store().grantAutomaticPriority(strawberry!);
  store().setBatchGrams(batch, undefined, 'USER_OVERRIDE');
  expect(await recalculateHomeRecipe()).toBe('applied');
  expect(baseSum()).toBe(batch);
}

/** The Ninja CREAMi Deluxe batch the machine door proposes (one tub). */
const DELUXE_BATCH = deriveMachineSetup(
  NINJA_CREAMI_DELUXE_NC502EU,
  'gelato',
).recommendedBatchGrams!;

/** CORE's promise for the served berry Main: the published floor and dairy-carrier floor. */
function servedBerryFloorsKept(observed: Observation) {
  const policy = SERVED_DAIRY_POLICY[SORBET_MAIN_IDS.strawberry]!;
  const at = (percent: number) => Math.ceil((percent * observed.target) / 100);
  expect(observed.finalByIngredient[SORBET_MAIN_IDS.strawberry]).toBeGreaterThanOrEqual(
    at(policy.ecoFloorPercent),
  );
  expect(observed.finalByIngredient[OWNER_IDS.milk]).toBeGreaterThanOrEqual(
    at(policy.liquidDairyCarrierFloorPercent!),
  );
}

/** A READY gelato (HOME's first build, strawberry the invisible AUTO Main), optionally
 * re-targeted through HOME's own batch door and recalculated. */
async function readyGelato(batch?: number) {
  const [strawberry] = homeStarterWithFruit('gelato', [SORBET_MAIN_IDS.strawberry]);
  store().grantAutomaticPriority(strawberry!);
  expect(await recalculateHomeRecipe()).toBe('applied');
  if (batch !== undefined) {
    store().setBatchGrams(batch, undefined, 'USER_OVERRIDE');
    expect(await recalculateHomeRecipe()).toBe('applied');
  }
  expect(baseSum()).toBe(store().target_batch_grams);
}

const lineOf = (canonicalId: string) =>
  store().items.find((item) => canonicalOf(item) === canonicalId)!;
const target = () => store().target_batch_grams;

const SCENARIOS: readonly Scenario[] = [
  {
    name: '1. 1000 g + banan 100 g',
    seat: () => readyGelato(),
    change: '+ BANANA 100 g (ilość klienta, user_exact)',
    apply: (side) => {
      add(side, sorbetMapperIngredient(BANANA), 100);
      return target();
    },
  },
  {
    name: '2. konflikt: 1000 g + banan 100 g + kiwi 100 g',
    seat: () => readyGelato(),
    change:
      '+ BANANA 100 g + KIWI 100 g (user_exact) — minimum Main i nośnik mleczny nie mieszczą się w 1000 g',
    apply: (side) => {
      add(side, sorbetMapperIngredient(BANANA), 100);
      add(side, sorbetMapperIngredient(KIWI), 100);
      return target();
    },
    conflict: true,
  },
  {
    name: '2b. 1340 g (Ninja CREAMi Deluxe ×2) + banan 100 g + kiwi 100 g',
    seat: () => readyGelatoAt(DELUXE_BATCH * 2),
    change:
      '+ BANANA 100 g + KIWI 100 g (user_exact) — Direction ustępuje minimum Main, zgoda na najlepszy wynik',
    apply: (side) => {
      add(side, sorbetMapperIngredient(BANANA), 100);
      add(side, sorbetMapperIngredient(KIWI), 100);
      return target();
    },
    verify: servedBerryFloorsKept,
  },
  {
    name: '2c. konflikt: 670 g (Ninja CREAMi Deluxe) + banan 100 g + kiwi 100 g',
    seat: () => readyGelatoAt(DELUXE_BATCH),
    change:
      '+ BANANA 100 g + KIWI 100 g (user_exact) — minimum Main i nośnik mleczny nie mieszczą się',
    apply: (side) => {
      add(side, sorbetMapperIngredient(BANANA), 100);
      add(side, sorbetMapperIngredient(KIWI), 100);
      return target();
    },
    conflict: true,
  },
  {
    name: '3. 1000 → 1500 g',
    seat: () => readyGelato(),
    change: 'wsad 1000 → 1500 g (USER_OVERRIDE)',
    apply: (side) => {
      setBatch(side, 1500);
      return 1500;
    },
  },
  {
    name: '4. 1500 → 1000 g',
    seat: () => readyGelato(1500),
    change: 'wsad 1500 → 1000 g (USER_OVERRIDE)',
    apply: (side) => {
      setBatch(side, 1000);
      return 1000;
    },
  },
  {
    name: '5. ręcznie 1850 g',
    seat: () => readyGelato(),
    change: 'wsad 1000 → 1850 g wpisany ręcznie (USER_OVERRIDE)',
    apply: (side) => {
      setBatch(side, 1850);
      return 1850;
    },
  },
  {
    name: '6. maszyna Ninja CREAMi 450 g',
    seat: () => readyGelato(),
    change: 'wybór maszyny Ninja CREAMi (NC302EU) → jej wsad 450 g (MACHINE_DEFAULT)',
    apply: () => selectCreami(),
  },
  {
    name: '7. zaokrąglenie do pełnych gramów (served sorbet)',
    seat: async () => {
      store().loadRecipeInput(
        servedSorbetRecipe({ mains: [], fruitGrams: 0, directionActive: true }),
      );
      store().setPriorityMode('AUTO');
      syncAuthority();
    },
    change:
      'ułamkowe gramy bazy (144.95 / 77.71 / 124.03 / 49.31) + 3 owoce jako priorytet AUTO z 0 g',
    apply: (side) => {
      for (const lineId of SERVED_FRUIT_IDS) crown(side, lineId, 'auto');
      return target();
    },
  },
  {
    name: '8. blokada gramów (śmietanka) + banan 100 g',
    seat: () => readyGelato(),
    change:
      'kłódka na CREAM w jej bieżących gramach (odczytanych z linii) + BANANA 100 g (user_exact)',
    apply: (side) => {
      lockAtCurrentGrams(side, lineOf(OWNER_IDS.cream).id);
      add(side, sorbetMapperIngredient(BANANA), 100);
      return target();
    },
  },
  {
    name: '8b. konflikt: blokada śmietanki + 1000 → 1500 g',
    seat: () => readyGelato(),
    change: 'kłódka na CREAM w jej bieżących gramach, potem wsad 1000 → 1500 g',
    apply: (side) => {
      lockAtCurrentGrams(side, lineOf(OWNER_IDS.cream).id);
      setBatch(side, 1500);
      return 1500;
    },
    conflict: true,
  },
  {
    name: '9. AUTO Main (gelato, pierwsze zbudowanie)',
    seat: async () => {
      homeStarterWithFruit('gelato', [SORBET_MAIN_IDS.strawberry]);
    },
    change: 'STRAWBERRIES 0 g jako niewidoczny priorytet AUTO',
    apply: (side) => {
      crown(side, lineOf(SORBET_MAIN_IDS.strawberry).id, 'auto');
      return target();
    },
  },
  {
    name: '10. ręczna korona (gelato, pierwsze zbudowanie)',
    seat: async () => {
      homeStarterWithFruit('gelato', [SORBET_MAIN_IDS.strawberry]);
      store().setPriorityMode('MANUAL');
    },
    change: 'STRAWBERRIES 0 g ukoronowane ręcznie (MANUAL)',
    apply: (side) => {
      crown(side, lineOf(SORBET_MAIN_IDS.strawberry).id, 'manual');
      return target();
    },
  },
  {
    name: '11. dwa Main (sorbet, pierwsze zbudowanie)',
    seat: async () => {
      homeStarterWithFruit('sorbet', [SORBET_MAIN_IDS.strawberry, SORBET_MAIN_IDS.lime]);
    },
    change: 'STRAWBERRIES + LIME 0 g jako priorytety AUTO (Multi-Main)',
    apply: (side) => {
      crown(side, lineOf(SORBET_MAIN_IDS.strawberry).id, 'auto');
      crown(side, lineOf(SORBET_MAIN_IDS.lime).id, 'auto');
      return target();
    },
  },
  {
    name: '12. BASE + TOPPING',
    seat: async () => {
      await readyGelato();
      const ingredient = sorbetTopping('fixture', 0).ingredient as EngineIngredient;
      store().addTopping(ingredient, toppingCreationDefaultGrams(store().items));
      syncAuthority();
      expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    },
    change: 'topping MANGO (domyślne 5 % bazy) już jest; + BANANA 100 g (user_exact)',
    apply: (side) => {
      add(side, sorbetMapperIngredient(BANANA), 100);
      return target();
    },
  },
  {
    name: '13. konflikt: banan 400 g + kiwi 400 g',
    seat: () => readyGelato(),
    change:
      '+ BANANA 400 g + KIWI 400 g (user_exact) — Main i nośnik mleczny nie mieszczą się w 1000 g',
    apply: (side) => {
      add(side, sorbetMapperIngredient(BANANA), 400);
      add(side, sorbetMapperIngredient(KIWI), 400);
      return target();
    },
    conflict: true,
  },
];

beforeEach(() => {
  resetStores();
});

describe('HOME batch scenarios — the §15 evidence table', () => {
  for (const scenario of SCENARIOS) {
    it(scenario.name, async () => {
      const { observed, seat } = await runHome(scenario);
      recordRow(scenario, observed);
      const pro = await runPro(scenario, seat);
      const sameAsPro =
        Object.keys(observed.finalByIngredient).length ===
          Object.keys(pro.finalByIngredient).length &&
        Object.entries(observed.finalByIngredient).every(([id, grams]) =>
          Object.is(pro.finalByIngredient[id], grams),
        );
      proRows.push(
        `| ${scenario.name} | ${observed.outcome} | ${pro.outcome} | ${yesNo(sameAsPro)} |`,
      );

      if (scenario.conflict) {
        // The target cannot be met without breaking an explicit amount: CORE says so
        // and writes nothing — the over-target lines stay visible, never hidden.
        expect(observed.outcome).toBe('decision');
        expect(observed.refusal).not.toBeNull();
        expect(observed.refusal).not.toMatch(/^(none|preview:clean|PREVIEW_READY)$/);
        expect(observed.untouchedByCore).toBe(true);
        expect(observed.sumAfter).toBe(observed.sumChanged);
        expect(observed.targetKept).toBe(false);
        expect(observed.locks.kept).toBe(true);
        // A typed conflict — never a refusal about a vector nobody proposed.
        expect(observed.issueCode).not.toBe('product_behavior_invalid');
      } else {
        expect(observed.outcome).toBe('applied');
        expect(observed.targetKept).toBe(true);
        expect(observed.sumAfter).toBe(observed.target);
        expect(observed.locks.kept).toBe(true);
        expect(observed.priorities.kept).toBe(true);
        expect(observed.wholeGrams).toBe(true);
        expect(observed.audit).toBe(true);
        scenario.verify?.(observed);
      }
      // A Topping is never part of the Base solve.
      expect(observed.toppingInSolve).toBe(false);
      // HOME and PRO: one CORE, one answer.
      expect(observed.finalByIngredient).toEqual(pro.finalByIngredient);
      expect(observed.outcome).toBe(pro.outcome);
    });
  }
});
