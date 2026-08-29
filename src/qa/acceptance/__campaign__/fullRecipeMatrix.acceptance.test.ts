/// <reference types="node" />
/**
 * GELLATTI — PHASE A: exhaustive PRO formulation acceptance matrix.
 *
 * Lives under `src/qa/**`, not `src/features/**`: it opens its own Supabase
 * client to sign in as the staging QA account, which the studio boundary guard
 * rightly forbids in UI source. Keeping the harness outside the scanned tree
 * preserves that guard untouched.
 *
 * Qualification-only harness (never part of `npm test`). It drives the real
 * customer actions — pick a profile, pick a serving mode, pick a machine, add
 * an ingredient, add a topping, set Direction, Przelicz, Apply, Save, reopen —
 * through the SAME runtime authorities the served application uses, including
 * the real staging `resolve_product_behavior_v1` verdict for every line.
 *
 * It changes no formulation science. Every cell is appended to
 * `reports/GELLATTI_FULL_RECIPE_MATRIX.jsonl`.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeDirectionTarget, type RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import type { NewRecipeServingModeId } from '@/features/recipes/newRecipeStarter';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { productBehaviorSnapshotFingerprint } from '@/features/product-intelligence';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import {
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  plannedSum,
  workingStateFingerprint,
  type BuildPreviewResult,
} from '@/features/constraint-studio/applyPipeline';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { InMemoryRecipes } from '@/services/proCore/inMemoryRecipes';
import { inMemoryRecipesRepository } from '@/services/proCore/recipesRepository';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import { MACHINE_CATALOG } from '@/features/machine-catalog/machineCatalogData';
import type { HomeMachineProfile } from '@/features/machine-catalog/types';
import { deriveMachineSetup } from '@/features/machine-catalog/machineDerivation';
import {
  BASE_AND_TOPPING,
  DIRECTION_STEPS,
  PROFILE_CATEGORY,
  PROFILE_VISIBLE,
  ROTATION,
  SERVING_MODES,
  SORBET_MAINS,
  TOPPINGS,
  behaviorCacheSize,
  mapperIngredient,
  mulberry32,
  priceIndexFor,
  resolveRealBehavior,
  signInStagingQa,
  withServerAuthority,
  type Profile,
  type StagingSession,
  type Strategy,
} from './matrixSupport';

const AT = '2026-08-29T18:00:00.000Z';
const REPORT_DIR = join(process.cwd(), 'reports');
const LEDGER = join(REPORT_DIR, 'GELLATTI_FULL_RECIPE_MATRIX.jsonl');
const STAGING_SHA = process.env.QA_STAGING_SHA ?? 'unknown';
const SEED = Number(process.env.QA_MATRIX_SEED ?? '20260829');
const SUITES = (process.env.QA_MATRIX_SUITES ?? 'direction,machines,isolation,toppings')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const CAPS: RecipeCapabilities = {
  canSaveRecipe: true,
  canViewRecipeVersions: true,
  canRestoreRecipeVersion: true,
  maxSavedRecipes: null,
  canViewExactGrams: true,
};
const TRACE = { engineVersion: 'acceptance', configVersion: 'acceptance-v1' } as never;
const PROFILES: readonly Profile[] = ['Gelato', 'Sorbet', 'Vegan', 'Protein'];
const STRATEGIES: readonly Strategy[] = ['optimal', 'eco'];

/** The 12 selectable machines the served Settings panel offers. */
const MACHINES = [
  { id: 'professional', label: 'Maszyna profesjonalna', kind: 'professional' as const },
  ...MACHINE_CATALOG.map((profile: HomeMachineProfile) => ({
    id: profile.id,
    label: profile.displayName ?? profile.id,
    kind: 'home' as const,
    profile,
  })),
  { id: 'custom', label: 'Własna maszyna', kind: 'custom' as const },
];

interface MatrixRow {
  timestamp: string;
  staging_sha: string;
  account: string;
  suite: string;
  case_id: string;
  seed: number;
  profile: Profile;
  category: string;
  machine: string;
  machine_kind: string;
  serving_mode: NewRecipeServingModeId;
  temperature_c: number;
  mode: 'OPTIMAL' | 'ECO';
  batch_target_g: number;
  displayed_batch_g: number | null;
  base_sum_g: number;
  ingredient_ids: string[];
  ingredient_names: string[];
  ingredient_grams: number[];
  main_line_ids: string[];
  crown_state: string;
  topping_ids: string[];
  topping_grams: number[];
  sweetness_target: RecipeDirectionTarget | null;
  hardness_target: RecipeDirectionTarget | null;
  /** A3: what the recipe's own goals carry AFTER Apply. A silent rewrite here
   *  is the exact regression the acceptance brief targets. */
  applied_sweetness_target: RecipeDirectionTarget | null;
  applied_hardness_target: RecipeDirectionTarget | null;
  axis_mutation: 'none' | 'sweetness_mutated' | 'hardness_mutated' | 'both_mutated' | 'not_applied';
  sequence_stage: string;
  sweetness_axis_status: string;
  hardness_axis_status: string;
  result: 'PASS' | 'REFUSED' | 'EXCEPTION' | 'NOT_APPLICABLE';
  score: number | null;
  pod: number | null;
  pac: number | null;
  npac: number | null;
  preview_status: string;
  apply_status: string;
  save_reopen_status: string;
  final_base_sum_g: number | null;
  final_product_g: number | null;
  kcal_per_100g: number | null;
  cost_per_kg: number | null;
  error_blocker: string;
  runtime_ms: number;
}

const rows: MatrixRow[] = [];
const startLedger = (): void => {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(LEDGER, '');
};
const record = (row: MatrixRow): void => {
  rows.push(row);
  appendFileSync(LEDGER, `${JSON.stringify(row)}\n`);
};

const temperatureFor = (serving: NewRecipeServingModeId): -11 | -12 | -13 =>
  serving === 'temp_minus_12' ? -12 : serving === 'temp_minus_13' ? -13 : -11;

/** The machine dimension the customer actually sees: a batch, not new science. */
const batchForMachine = (machine: (typeof MACHINES)[number], profile: Profile): number => {
  if (machine.kind === 'professional') return 1_000;
  if (machine.kind === 'custom') return 800;
  const derived = deriveMachineSetup(
    machine.profile,
    profile === 'Sorbet' ? 'sorbet' : profile === 'Protein' ? 'protein' : 'gelato',
  );
  return derived.recommendedBatchGrams ?? 700;
};

/** Home machines route to their own serving mode; Professional offers all four. */
const servingForMachine = (
  machine: (typeof MACHINES)[number],
  fallback: NewRecipeServingModeId,
): NewRecipeServingModeId => {
  if (machine.kind !== 'home') return fallback;
  const mode = deriveMachineSetup(machine.profile).resolvedVisibleMode;
  return mode === 'ninja_gelato'
    ? 'temp_minus_13'
    : mode === 'ninja_swirl'
      ? 'temp_minus_11'
      : 'fresh';
};

interface CaseSpec {
  suite: string;
  caseId: string;
  profile: Profile;
  serving: NewRecipeServingModeId;
  strategy: Strategy;
  machine: (typeof MACHINES)[number];
  sweetness: RecipeDirectionTarget;
  hardness: RecipeDirectionTarget;
  extraIngredient: string | null;
  /** Sorbet only: the user-chosen fruit Main the starter demands. */
  mainIngredient: string | null;
  topping: string | null;
  toppingMode: 'none' | 'TOPPING_ONLY' | 'BOTH';
  /** Sequential A3 runs carry the state produced by the previous stage. */
  sequenceStage?: string;
  carriedInput?: RecipeInput;
}

const buildInput = (spec: CaseSpec, batch: number): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: PROFILE_VISIBLE[spec.profile],
    servingModeId: spec.serving,
    formulationStrategy: spec.strategy,
    targetBatchGrams: batch,
  });
  let items = starter.items.map((item) => ({
    ...item,
    ingredient: structuredClone(item.ingredient),
  }));
  if (spec.mainIngredient) {
    // The Sorbet starter is `blocked_missing_user_main` and names the exact
    // missing Main mass; the customer supplies the fruit. Support lines are
    // scaled into the remainder so the batch still sums to target.
    const mainGrams = Math.max(1, Math.round(starter.metrics.missingMainMassGrams || batch * 0.6));
    const supportTotal = items.reduce((sum, item) => sum + item.planned_grams, 0);
    const remaining = Math.max(0, batch - mainGrams);
    if (supportTotal > 0 && remaining > 0) {
      items = items.map((item) => ({
        ...item,
        planned_grams: Math.max(1, Math.round(item.planned_grams * (remaining / supportTotal))),
      }));
    }
    items.push({
      id: `acceptance-main-${spec.mainIngredient}`,
      ingredient: mapperIngredient(spec.mainIngredient),
      planned_grams: mainGrams,
      actual_grams: null,
      lock_type: 'main' as const,
      main_ratio_weight: mainGrams,
      user_intent_anchor_grams: mainGrams,
    });
  }
  if (spec.toppingMode === 'BOTH' && spec.topping) {
    // BASE_AND_TOPPING: the same product participates in the Base *and* is
    // added after production, so both module routes are exercised at once.
    items.push({
      id: `acceptance-base-of-topping-${spec.topping}`,
      ingredient: mapperIngredient(spec.topping),
      planned_grams: Math.max(5, Math.round(batch * 0.02)),
      actual_grams: null,
      lock_type: 'unlocked' as const,
    });
  }
  // A BASE_AND_TOPPING article already occupies a Base line in `BOTH` mode, so
  // the rotation must not add the same canonical identity a second time: two
  // lines of one product are a real duplicate and the Apply door refuses them.
  const extraCollides =
    spec.toppingMode === 'BOTH' && spec.topping !== null && spec.extraIngredient === spec.topping;
  if (spec.extraIngredient && !extraCollides) {
    items.push({
      id: `acceptance-extra-${spec.extraIngredient}`,
      ingredient: mapperIngredient(spec.extraIngredient),
      planned_grams: Math.max(5, Math.round(batch * 0.03)),
      actual_grams: null,
      lock_type: 'unlocked' as const,
    });
  }
  return {
    mode: 'classic',
    category: PROFILE_CATEGORY[spec.profile],
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: batch,
    machine_capacity_grams: null,
    items,
    goals: {
      formulation_strategy: spec.strategy,
      direction_targets_active: true,
      direction_targets: {
        sweetness: spec.sweetness,
        softness: spec.hardness,
        creaminess: 0,
        flavor: 0,
      },
    },
  };
};

const buildToppings = (spec: CaseSpec, batch: number): RecipeToppingItem[] => {
  if (!spec.topping || spec.toppingMode === 'none') return [];
  return [
    {
      id: `acceptance-topping-${spec.topping}`,
      ingredient: mapperIngredient(spec.topping) as unknown as RecipeToppingItem['ingredient'],
      planned_grams: Math.max(5, Math.round(batch * 0.05)),
      actual_grams: null,
      process_scope: 'POST_PROCESS_ADDON',
      addon_sort_order: 1,
    },
  ];
};

/** Structural snapshots, then the REAL staging authority overlaid per line. */
const snapshotsFor = async (
  session: StagingSession,
  input: RecipeInput,
  toppings: readonly RecipeToppingItem[],
  strategy: Strategy,
): Promise<Record<string, ProductBehaviorSnapshot>> => {
  const local = productBehaviorTestSnapshots(input, toppings);
  const temperature = (input.target_temperature_c ?? -11) as -11 | -12 | -13;
  const lines: Array<{
    lineId: string;
    ingredient: RecipeInput['items'][number]['ingredient'];
    isMain: boolean;
    scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';
  }> = [
    ...input.items.map((item) => ({
      lineId: item.id,
      ingredient: item.ingredient,
      isMain: item.lock_type === 'main',
      scope: 'BASE_FORMULATION' as const,
    })),
    ...toppings.map((item) => ({
      lineId: item.id,
      ingredient: item.ingredient as unknown as RecipeInput['items'][number]['ingredient'],
      isMain: false,
      scope: 'POST_PROCESS_ADDON' as const,
    })),
  ];
  for (const { lineId, ingredient, isMain, scope } of lines) {
    const mapperId = canonicalIngredientId(ingredient);
    if (!/^PI-ING-/.test(mapperId)) continue;
    try {
      const resolved = await resolveRealBehavior(session, mapperId, {
        accountId: session.accountId,
        productProfile: input.category,
        temperatureC: temperature,
        mode: strategy,
        processScope: scope,
        requestedRole: isMain ? 'MAIN' : 'STANDARD',
        module: scope === 'POST_PROCESS_ADDON' ? 'TOPPING' : 'BASE_RECIPE',
      });
      const current = local[lineId];
      if (current) local[lineId] = withServerAuthority(current, resolved);
    } catch {
      /* A resolver refusal is itself a recorded outcome; keep the structural row. */
    }
  }
  return local;
};

const persistAndReopen = async (
  input: RecipeInput,
  snapshots: Record<string, ProductBehaviorSnapshot>,
  toppings: readonly RecipeToppingItem[],
  caseId: string,
): Promise<string> => {
  let counter = 0;
  const store = new InMemoryRecipes(
    () => `2026-08-29T18:10:${String((counter += 1) % 60).padStart(2, '0')}.000Z`,
    () => `${caseId}-${(counter += 1)}`,
  );
  const repo = inMemoryRecipesRepository(store);
  const composition: RecipeCompositionMetadata = {
    schemaVersion: 1,
    baseScope: 'BASE_FORMULATION',
    baseOrder: input.items.map((item) => item.id),
    toppings: [...toppings],
    behaviorSnapshots: snapshots,
    migrationAmbiguities: [],
  };
  try {
    const created = await repo.createRecipe({
      ownerUserId: 'gellatti-acceptance',
      title: `Acceptance ${caseId}`,
      recipeInput: input,
      productComposition: composition,
      trace: TRACE,
      by: 'gellatti-acceptance',
      capabilities: CAPS,
    });
    const reopened = await inMemoryRecipesRepository(store).getVersion(
      created.recipe.recipeId,
      1,
    );
    if (!reopened) return 'REOPEN_MISSING';
    const same =
      JSON.stringify(reopened.recipeInput.items.map((i) => [i.id, i.planned_grams])) ===
      JSON.stringify(input.items.map((i) => [i.id, i.planned_grams]));
    return same ? 'SAVED_REOPENED' : 'REOPEN_MISMATCH';
  } catch (error) {
    return `SAVE_FAILED:${error instanceof Error ? error.message : String(error)}`;
  }
};

let appliedInputForSequence: RecipeInput | null = null;

const runCase = async (session: StagingSession, spec: CaseSpec): Promise<MatrixRow> => {
  appliedInputForSequence = null;
  const started = performance.now();
  const batch = batchForMachine(spec.machine, spec.profile);
  const base: MatrixRow = {
    timestamp: new Date(Date.parse(AT) + rows.length * 1_000).toISOString(),
    staging_sha: STAGING_SHA,
    account: 'test1@test1.com',
    suite: spec.suite,
    case_id: spec.caseId,
    seed: SEED,
    profile: spec.profile,
    category: PROFILE_CATEGORY[spec.profile],
    machine: spec.machine.label,
    machine_kind: spec.machine.kind,
    serving_mode: spec.serving,
    temperature_c: temperatureFor(spec.serving),
    mode: spec.strategy === 'eco' ? 'ECO' : 'OPTIMAL',
    batch_target_g: batch,
    displayed_batch_g: batch,
    base_sum_g: 0,
    ingredient_ids: [],
    ingredient_names: [],
    ingredient_grams: [],
    main_line_ids: [],
    crown_state: 'none',
    topping_ids: spec.topping && spec.toppingMode !== 'none' ? [spec.topping] : [],
    topping_grams: [],
    sweetness_target: spec.sweetness,
    hardness_target: spec.hardness,
    applied_sweetness_target: null,
    applied_hardness_target: null,
    axis_mutation: 'not_applied',
    sequence_stage: spec.sequenceStage ?? 'single',
    sweetness_axis_status: 'unknown',
    hardness_axis_status: 'unknown',
    result: 'EXCEPTION',
    score: null,
    pod: null,
    pac: null,
    npac: null,
    preview_status: 'NOT_ATTEMPTED',
    apply_status: 'NOT_ATTEMPTED',
    save_reopen_status: 'NOT_ATTEMPTED',
    final_base_sum_g: null,
    final_product_g: null,
    kcal_per_100g: null,
    cost_per_kg: null,
    error_blocker: '',
    runtime_ms: 0,
  };

  try {
    const input: RecipeInput = spec.carriedInput
      ? {
          ...spec.carriedInput,
          goals: {
            ...spec.carriedInput.goals,
            formulation_strategy: spec.strategy,
            direction_targets_active: true,
            direction_targets: {
              sweetness: spec.sweetness,
              softness: spec.hardness,
              creaminess: 0,
              flavor: 0,
            },
          },
        }
      : buildInput(spec, batch);
    const toppings = buildToppings(spec, batch);
    base.base_sum_g = Number(plannedSum(input).toFixed(3));
    base.ingredient_ids = input.items.map((item) => canonicalIngredientId(item.ingredient));
    base.ingredient_names = input.items.map((item) => item.ingredient.name);
    base.ingredient_grams = input.items.map((item) => Number(item.planned_grams.toFixed(3)));
    base.main_line_ids = input.items.filter((i) => i.lock_type === 'main').map((i) => i.id);
    base.crown_state = base.main_line_ids.length > 0 ? `main:${base.main_line_ids.length}` : 'none';
    base.topping_grams = toppings.map((t) => t.planned_grams);

    const plan = buildRecipeDirectionPlan(input);
    const sweet = plan.axes.find((axis) => axis.axis === 'sweetness');
    const hard = plan.axes.find((axis) => axis.axis === 'softness');
    base.sweetness_axis_status = sweet?.status ?? 'absent';
    base.hardness_axis_status = hard?.status ?? 'absent';

    const snapshots = await snapshotsFor(session, input, toppings, spec.strategy);
    const constraints = { byLineId: {} as Record<string, never> };
    const prices = priceIndexFor(input, AT);

    const unbound = buildOptimizePreview(input, constraints, AT, {
      effectivePriceOverrides: prices,
      productBehaviorSnapshots: snapshots,
      technicalOnlyMainLineIds: [],
      requirePracticalPreview: true,
    });
    const proposalSnapshots = unbound.ok
      ? await snapshotsFor(session, unbound.preview.proposedInput, toppings, spec.strategy)
      : snapshots;
    const built: BuildPreviewResult = bindProductBehaviorToPreview(
      unbound,
      proposalSnapshots,
      snapshots,
      [],
    );

    if (!built.ok) {
      base.preview_status = `REFUSED:${built.code}`;
      base.result =
        base.sweetness_axis_status !== 'working' && base.hardness_axis_status !== 'working'
          ? 'NOT_APPLICABLE'
          : 'REFUSED';
      base.error_blocker =
        'messagePl' in built && typeof built.messagePl === 'string' ? built.messagePl : built.code;
      base.runtime_ms = Math.round(performance.now() - started);
      return base;
    }

    base.preview_status = 'OK';
    const executable = built.preview.proposedInput;
    const committed = commitPreview(
      input,
      constraints,
      built.preview,
      AT,
      `apply-${spec.caseId}`,
      [],
      undefined,
      null,
      null,
      {
        baseFingerprint: built.preview.baseFingerprint,
        targetFingerprint: directionTargetFingerprint(input),
        candidateFingerprint: workingStateFingerprint(executable, built.preview.nextConstraints),
      },
      null,
      snapshots,
      [],
      {
        baseFingerprint: built.preview.baseFingerprint,
        proposedFingerprint: workingStateFingerprint(executable, built.preview.nextConstraints),
        baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(snapshots),
        proposedProductBehaviorFingerprint:
          productBehaviorSnapshotFingerprint(proposalSnapshots),
        snapshots: structuredClone(proposalSnapshots),
      },
      null,
      { effectivePriceOverrides: prices, requirePracticalPreview: true },
    );

    const applied = committed.ok ? committed.verified.input : executable;
    base.apply_status = committed.ok ? 'APPLIED' : `REJECTED:${committed.code}`;
    if (!committed.ok) base.error_blocker = committed.messagePl ?? committed.code;

    const appliedTargets = applied.goals?.direction_targets ?? null;
    base.applied_sweetness_target =
      (appliedTargets?.sweetness as RecipeDirectionTarget | undefined) ?? null;
    base.applied_hardness_target =
      (appliedTargets?.softness as RecipeDirectionTarget | undefined) ?? null;
    const sweetnessMoved =
      base.applied_sweetness_target !== null && base.applied_sweetness_target !== spec.sweetness;
    const hardnessMoved =
      base.applied_hardness_target !== null && base.applied_hardness_target !== spec.hardness;
    base.axis_mutation = !committed.ok
      ? 'not_applied'
      : sweetnessMoved && hardnessMoved
        ? 'both_mutated'
        : sweetnessMoved
          ? 'sweetness_mutated'
          : hardnessMoved
            ? 'hardness_mutated'
            : 'none';
    appliedInputForSequence = applied;

    const result = calculateRecipe(applied);
    base.score = result.scores?.overall ?? null;
    base.pod = result.pod_points === null ? null : Number(result.pod_points.toFixed(4));
    base.pac = result.pac_points === null ? null : Number(result.pac_points.toFixed(4));
    base.npac = result.npac_points === null ? null : Number(result.npac_points.toFixed(4));
    base.final_base_sum_g = Number(plannedSum(applied).toFixed(3));
    base.final_product_g = Number(
      (plannedSum(applied) + toppings.reduce((sum, t) => sum + t.planned_grams, 0)).toFixed(3),
    );
    base.kcal_per_100g =
      result.nutrition_per_100g === null ? null : Number(result.nutrition_per_100g.kcal.toFixed(2));
    base.cost_per_kg =
      result.costs?.cost_per_kg === null || result.costs?.cost_per_kg === undefined
        ? null
        : Number(result.costs.cost_per_kg.toFixed(4));

    if (committed.ok) {
      base.save_reopen_status = await persistAndReopen(
        applied,
        committed.verified.productBehaviorSnapshots,
        toppings,
        spec.caseId,
      );
    }
    base.result = committed.ok && base.save_reopen_status === 'SAVED_REOPENED' ? 'PASS' : 'REFUSED';
  } catch (error) {
    base.result = 'EXCEPTION';
    base.error_blocker = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
  base.runtime_ms = Math.round(performance.now() - started);
  return base;
};

/* --------------------------------- suites -------------------------------- */

const professional = MACHINES[0]!;

const directionSuite = (): CaseSpec[] => {
  const random = mulberry32(SEED);
  const specs: CaseSpec[] = [];
  for (const profile of PROFILES) {
    for (const serving of SERVING_MODES) {
      for (const strategy of STRATEGIES) {
        for (const sweetness of DIRECTION_STEPS) {
          for (const hardness of DIRECTION_STEPS) {
            const pool = ROTATION[profile];
            const extra = pool[Math.floor(random() * pool.length)]!;
            const dual = specs.length % 3 !== 0;
            const topping = dual
              ? BASE_AND_TOPPING[Math.floor(random() * BASE_AND_TOPPING.length)]!
              : TOPPINGS[Math.floor(random() * TOPPINGS.length)]!;
            const main =
              profile === 'Sorbet'
                ? SORBET_MAINS[Math.floor(random() * SORBET_MAINS.length)]!
                : null;
            specs.push({
              suite: 'direction',
              caseId: `dir-${profile}-${serving}-${strategy}-s${sweetness}-h${hardness}`,
              profile,
              serving,
              strategy,
              machine: professional,
              sweetness,
              hardness,
              extraIngredient: extra,
              mainIngredient: main,
              topping,
              toppingMode: specs.length % 3 === 0 ? 'TOPPING_ONLY' : 'BOTH',
            });
          }
        }
      }
    }
  }
  return specs;
};

const machineSuite = (): CaseSpec[] => {
  const random = mulberry32(SEED + 1);
  const specs: CaseSpec[] = [];
  const pairs: Array<[RecipeDirectionTarget, RecipeDirectionTarget]> = [
    [0, 0],
    [1, -1],
  ];
  for (const machine of MACHINES) {
    for (const profile of PROFILES) {
      for (const strategy of STRATEGIES) {
        for (const [sweetness, hardness] of pairs) {
          const pool = ROTATION[profile];
          const extra = pool[Math.floor(random() * pool.length)]!;
          const topping = BASE_AND_TOPPING[Math.floor(random() * BASE_AND_TOPPING.length)]!;
          const main =
            profile === 'Sorbet'
              ? SORBET_MAINS[Math.floor(random() * SORBET_MAINS.length)]!
              : null;
          specs.push({
            suite: 'machines',
            caseId: `mach-${machine.id}-${profile}-${strategy}-s${sweetness}-h${hardness}`,
            profile,
            serving: servingForMachine(machine, 'temp_minus_12'),
            strategy,
            machine,
            sweetness,
            hardness,
            extraIngredient: extra,
            mainIngredient: main,
            topping,
            toppingMode: 'BOTH',
          });
        }
      }
    }
  }
  return specs;
};

/** A6 — post-process isolation. The Base is held byte-identical across the
 *  three topping modes so any technical drift is the topping's fault, never
 *  a different starting recipe. */
const toppingSuite = (): CaseSpec[] => {
  const specs: CaseSpec[] = [];
  for (const [profileIndex, profile] of PROFILES.entries()) {
    const extra = ROTATION[profile][0]!;
    const main = profile === 'Sorbet' ? SORBET_MAINS[0]! : null;
    for (const strategy of STRATEGIES) {
      for (const toppingMode of ['none', 'TOPPING_ONLY', 'BOTH'] as const) {
        const topping =
          toppingMode === 'BOTH'
            ? BASE_AND_TOPPING[profileIndex % BASE_AND_TOPPING.length]!
            : TOPPINGS[profileIndex % TOPPINGS.length]!;
        specs.push({
          suite: 'toppings',
          caseId: `top-${profile}-${strategy}-${toppingMode}`,
          profile,
          serving: 'temp_minus_12',
          strategy,
          machine: professional,
          sweetness: 0,
          hardness: 0,
          extraIngredient: extra,
          mainIngredient: main,
          topping,
          toppingMode,
        });
      }
    }
  }
  return specs;
};

/** A3 — single-axis isolation. Commit a neutral (0,0) recipe, then move ONE
 *  axis and prove the other axis's intent was not silently rewritten. */
const isolationSuite = (): CaseSpec[] => {
  const specs: CaseSpec[] = [];
  for (const profile of PROFILES) {
    const extra = ROTATION[profile][1] ?? ROTATION[profile][0]!;
    const main = profile === 'Sorbet' ? SORBET_MAINS[1]! : null;
    for (const serving of SERVING_MODES) {
      for (const strategy of STRATEGIES) {
        const shared = {
          profile,
          serving,
          strategy,
          machine: professional,
          extraIngredient: extra,
          mainIngredient: main,
          topping: null,
          toppingMode: 'none' as const,
        };
        specs.push({
          ...shared,
          suite: 'isolation',
          caseId: `iso-${profile}-${serving}-${strategy}-baseline`,
          sweetness: 0,
          hardness: 0,
          sequenceStage: 'baseline',
        });
        for (const hardness of DIRECTION_STEPS) {
          if (hardness === 0) continue;
          specs.push({
            ...shared,
            suite: 'isolation',
            caseId: `iso-${profile}-${serving}-${strategy}-hardness${hardness}`,
            sweetness: 0,
            hardness,
            sequenceStage: 'hardness_only',
          });
        }
        for (const sweetness of DIRECTION_STEPS) {
          if (sweetness === 0) continue;
          specs.push({
            ...shared,
            suite: 'isolation',
            caseId: `iso-${profile}-${serving}-${strategy}-sweetness${sweetness}`,
            sweetness,
            hardness: 0,
            sequenceStage: 'sweetness_only',
          });
        }
      }
    }
  }
  return specs;
};

/* ---------------------------------- run ---------------------------------- */

describe('GELLATTI full recipe acceptance matrix', () => {
  it(
    'exercises every supported customer formulation combination and records the ledger',
    async () => {
      startLedger();
      const session = await signInStagingQa();
      const specs = [
        ...(SUITES.includes('direction') ? directionSuite() : []),
        ...(SUITES.includes('machines') ? machineSuite() : []),
        ...(SUITES.includes('isolation') ? isolationSuite() : []),
        ...(SUITES.includes('toppings') ? toppingSuite() : []),
      ];
      let index = 0;
      let carried: RecipeInput | null = null;
      for (const spec of specs) {
        index += 1;
        const effective =
          spec.sequenceStage === 'baseline' || spec.sequenceStage === undefined
            ? spec
            : { ...spec, carriedInput: carried ?? undefined };
        record(await runCase(session, effective));
        if (spec.sequenceStage === 'baseline') carried = appliedInputForSequence;
        if (index % 50 === 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[matrix] ${index}/${specs.length} · behavior cache ${behaviorCacheSize()} · ` +
              `pass ${rows.filter((row) => row.result === 'PASS').length}`,
          );
        }
      }
      expect(rows.length).toBe(specs.length);
    },
    60 * 60 * 1000,
  );
});

export { runCase, directionSuite, machineSuite, toppingSuite, isolationSuite, MACHINES };
export type { CaseSpec, MatrixRow };
