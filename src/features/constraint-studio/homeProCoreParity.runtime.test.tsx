/** @vitest-environment jsdom */
/**
 * HOME ↔ PRO parity THROUGH EACH SIDE'S OWN ENTRY (owner §18, 2026-09-18).
 *
 * HOME owns no recipe math: the solver, constraints, whole-gram practicalization,
 * target batch, scaling, Crown/Main, locks and preview/apply are the shared CORE.
 * These tests seat the SAME fixture RecipeInput + ProductBehavior map on both sides,
 * let each side express the customer's intent through ITS OWN store doors, run each
 * side's OWN entry (HOME: the real `HomeRecalculate` dialog → `runHomeRecalculation`
 * + the 0 g bootstrap, and `recalculateHomeRecipe`; PRO: the real `ProRecalcPanel` +
 * `runPiRecalculationWithTerminal(undefined, beginPiRecalculation())` exactly as
 * ProWorkspacePage does) and compare what CORE was asked and what it answered.
 *
 * Nothing on the path is stubbed except the server authority (a SERVER-AUTHORITY-
 * TABLE fake: every requested line gets `structuredClone(table[lineId])` from ONE
 * fixture map). The solver and practicalization are PASS-THROUGH spies: they record
 * and then call the real function.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeInput, type RecipeItem } from '@/engine';
import { AUTO_CROWN_SEED } from '@/features/formulation/crownBootstrapProvenance';
import { HomeRecalculate } from '@/features/home-creator/ui/HomeRecalculate';
import { recalculateHomeRecipe } from '@/features/home-creator/homeRecalculation';
import type { PracticalRecipeResult } from '@/features/practical-recipe/practicalRecipe';
import { ProRecalcPanel } from '@/features/pro-core/ProRecalcPanel';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  SORBET_MAIN_IDS,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  OWNER_IDS,
  ownerFruitRecipe,
  ownerFruitSnapshots,
} from './__fixtures__/ownerFruitMainFixture';
import {
  SERVED_FRUIT,
  SERVED_FRUIT_IDS,
  servedSorbetRecipe,
  servedSorbetSnapshots,
} from './__fixtures__/servedSorbetThreeFruitFixture';
import {
  applyPreviewWithServerAuthority,
  beginPiRecalculation,
  openDirectionFallbackPreviewWithServerAuthority,
  runPiRecalculationWithTerminal,
  useConstraintStudioStore,
} from './constraintStudioStore';
import type { OptimizePreviewComputationRequest } from './optimizePreviewComputation';

vi.setConfig({ testTimeout: 180_000 });

/* ── the server authority: ONE fixture table, never an echo ─────────────────── */

const authority = vi.hoisted(() => ({
  table: {} as Record<string, unknown>,
}));

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
  validateRecipeBehaviorOnServer: async () => ({
    ready: true,
    staleLineIds: [],
    lines: [],
  }),
}));

/* ── the solver: a PASS-THROUGH tap ─────────────────────────────────────────── */

type SolverRequest = Omit<OptimizePreviewComputationRequest, 'createdAt'>;

const solver = vi.hoisted(() => ({
  requests: [] as unknown[],
}));

vi.mock('./optimizePreviewRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./optimizePreviewRuntime')>();
  return {
    ...actual,
    runOptimizePreviewOffMainThread: (
      ...args: Parameters<typeof actual.runOptimizePreviewOffMainThread>
    ) => {
      // Recorded without the wall-clock stamp, then the REAL runtime answers.
      const { createdAt, ...request } = args[0];
      void createdAt;
      solver.requests.push(structuredClone(request));
      return actual.runOptimizePreviewOffMainThread(...args);
    },
  };
});

/* ── practicalization: a PASS-THROUGH tap with an optional CORE-side change ──── */

interface PracticalCall {
  exact: Record<string, number>;
  real: Record<string, number> | null;
  returned: Record<string, number> | null;
}

const practical = vi.hoisted(() => ({
  recording: false,
  calls: [] as unknown[],
  change: null as null | ((result: unknown) => unknown),
}));

vi.mock('@/features/practical-recipe/practicalRecipe', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/practical-recipe/practicalRecipe')>();
  const gramsOf = (input: { items: readonly { id: string; planned_grams: number }[] }) =>
    Object.fromEntries(input.items.map((item) => [item.id, item.planned_grams]));
  return {
    ...actual,
    practicalizeRecipeCandidate: (
      ...args: Parameters<typeof actual.practicalizeRecipeCandidate>
    ) => {
      const real = actual.practicalizeRecipeCandidate(...args);
      const returned = (practical.change === null ? real : practical.change(real)) as typeof real;
      if (practical.recording) {
        practical.calls.push({
          exact: gramsOf(args[0]),
          real: real.ok ? gramsOf(real.audit.executableInput) : null,
          returned: returned.ok ? gramsOf(returned.audit.executableInput) : null,
        });
      }
      return returned;
    },
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/* ── fixtures: one RecipeInput + one ProductBehavior map per scenario ───────── */

const FRUIT_LINE = ['fruit-a', 'fruit-b'] as const;

/** HOME's real starter scaffold (the same builder `rebuildNewRecipeStarter` uses)
 * plus the customer's fruit at 0 g, neutral Direction active exactly as a fresh
 * HOME draft is. */
function starterSeat(visible: 'gelato' | 'sorbet', fruitIds: readonly string[]): RecipeInput {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: visible,
    servingModeId: 'temp_minus_11',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1000,
  });
  return {
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
      ...fruitIds.map((ingredientId, index): RecipeItem => ({
        id: FRUIT_LINE[index]!,
        ingredient: sorbetMapperIngredient(ingredientId),
        planned_grams: 0,
        actual_grams: null,
        lock_type: 'unlocked',
      })),
    ],
  };
}

const pick = (from: object, fields: readonly string[]) =>
  Object.fromEntries(
    fields.map((field) => [field, structuredClone((from as Record<string, unknown>)[field])]),
  );

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
const MAIN_CAPABLE_FRUIT = new Set<string>([SORBET_MAIN_IDS.strawberry, SORBET_MAIN_IDS.lime]);

const canonicalOf = (item: RecipeItem) =>
  item.ingredient.canonical_ingredient_id ?? item.ingredient.id;

/** The ONE authority map for a starter seat: the shared test snapshots, with the
 * Main-capable fruit carrying a published Main policy (Sorbet: the served exact
 * fruit policy; gelato: the fresh-fruit dairy policy + milk as its carrier). */
function starterAuthority(input: RecipeInput): Record<string, ProductBehaviorSnapshot> {
  const table = productBehaviorTestSnapshots(input);
  const servedInput = servedSorbetRecipe();
  const servedFruit = servedSorbetSnapshots(servedInput)[SERVED_FRUIT.strawberry]!;
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

/* ── scenarios ──────────────────────────────────────────────────────────────── */

interface ParityScenario {
  name: string;
  seat: () => RecipeInput;
  authorityFor: (input: RecipeInput) => Record<string, ProductBehaviorSnapshot>;
  /** Lines the customer gives priority to. */
  mains: readonly string[];
  /** HOME's door: the invisible AUTO priority, or the customer's own crown. */
  crown: 'auto' | 'manual';
  /** A starter line the customer pins at its seated grams (read from the line). */
  gramLockCanonical?: string;
  target?: number;
  sweetness?: -1 | 1;
}

const gelato = () => starterSeat('gelato', [SORBET_MAIN_IDS.strawberry]);
const sorbet = () => starterSeat('sorbet', [SORBET_MAIN_IDS.strawberry]);
const served = () => servedSorbetRecipe({ mains: [], fruitGrams: 0, directionActive: true });

const ORDINARY: readonly ParityScenario[] = [
  {
    name: 'gelato, invisible AUTO Main',
    seat: gelato,
    authorityFor: starterAuthority,
    mains: [FRUIT_LINE[0]],
    crown: 'auto',
  },
  {
    name: 'sorbet, invisible AUTO Main',
    seat: sorbet,
    authorityFor: starterAuthority,
    mains: [FRUIT_LINE[0]],
    crown: 'auto',
  },
  {
    name: 'gelato, explicit MANUAL crown',
    seat: gelato,
    authorityFor: starterAuthority,
    mains: [FRUIT_LINE[0]],
    crown: 'manual',
  },
  {
    name: 'gelato, gram lock on cream',
    seat: gelato,
    authorityFor: starterAuthority,
    mains: [FRUIT_LINE[0]],
    crown: 'auto',
    gramLockCanonical: OWNER_IDS.cream,
  },
  {
    name: 'gelato, manual target 1850 g',
    seat: gelato,
    authorityFor: starterAuthority,
    mains: [FRUIT_LINE[0]],
    crown: 'auto',
    target: 1850,
  },
  {
    name: 'served sorbet three fruit — the Direction best-candidate case',
    seat: served,
    authorityFor: servedSorbetSnapshots,
    mains: SERVED_FRUIT_IDS,
    crown: 'auto',
  },
];

/* ── seating + each side's own doors ────────────────────────────────────────── */

const resetStores = () => {
  useRecipeStore.getState().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetForTests();
  solver.requests = [];
  practical.recording = false;
  practical.calls = [];
  practical.change = null;
};

function seat(scenario: ParityScenario): RecipeInput {
  resetStores();
  const input = scenario.seat();
  useRecipeStore.getState().loadRecipeInput(structuredClone(input));
  authority.table = scenario.authorityFor(input);
  for (const item of useRecipeStore.getState().items) {
    useRecipeStore
      .getState()
      .setProductBehaviorSnapshot(
        item.id,
        structuredClone(authority.table[item.id]) as ProductBehaviorSnapshot,
      );
  }
  return input;
}

const lineByCanonical = (canonicalId: string) =>
  useRecipeStore.getState().items.find((item) => canonicalOf(item) === canonicalId)!;

function expressHomeIntent(scenario: ParityScenario) {
  const store = useRecipeStore.getState;
  if (scenario.sweetness !== undefined) store().setDirectionTarget('sweetness', scenario.sweetness);
  if (scenario.target !== undefined)
    store().setBatchGrams(scenario.target, undefined, 'USER_OVERRIDE');
  if (scenario.gramLockCanonical !== undefined) {
    const line = lineByCanonical(scenario.gramLockCanonical);
    store().setGramLock(line.id, line.planned_grams);
  }
  if (scenario.crown === 'auto') {
    store().setPriorityMode('AUTO');
    for (const lineId of scenario.mains) store().grantAutomaticPriority(lineId);
  } else {
    expect(store().priority_mode).toBe('MANUAL');
    for (const lineId of scenario.mains) store().setLockType(lineId, 'main', 'home');
  }
}

function expressProIntent(scenario: ParityScenario) {
  const store = useRecipeStore.getState;
  const studio = useConstraintStudioStore.getState;
  if (scenario.sweetness !== undefined) store().setDirectionTarget('sweetness', scenario.sweetness);
  if (scenario.target !== undefined) studio().resizeBatchGrams(scenario.target);
  if (scenario.gramLockCanonical !== undefined) {
    studio().toggleLock(lineByCanonical(scenario.gramLockCanonical).id);
  }
  for (const lineId of scenario.mains) store().setMainIngredient(lineId);
}

/* ── observations ───────────────────────────────────────────────────────────── */

interface LineFacts {
  id: string;
  planned_grams: number;
  lock_type: string;
  grams_constraint: unknown;
  amount_provenance: unknown;
  main_ratio_weight: unknown;
}

interface SideRun {
  /** The store's priority lines just before the run. */
  mainsBefore: { planned_grams: number; amount_provenance: unknown }[];
  requests: SolverRequest[];
  terminalAfterRun: unknown;
  offeredBestCandidate: boolean;
  offeredDirectionFallback: boolean;
  /** CORE's Direction fallback report exactly as staged after the run. */
  fallbackReport: unknown;
  /** The customer-visible decision surface the side rendered (null for the automatic path). */
  decisionShown: string | null;
  /** The Preview the Apply button applied (after a Direction consent, if any). */
  staged: { id: string; planned_grams: number; lock_type: string }[] | null;
  stagedInstructions: unknown;
  final: LineFacts[];
  target: number;
  audit: boolean;
  applied: boolean;
}

const facts = (): LineFacts[] =>
  useRecipeStore.getState().items.map((item) => ({
    id: item.id,
    planned_grams: item.planned_grams,
    lock_type: item.lock_type,
    grams_constraint: item.grams_constraint,
    amount_provenance: item.amount_provenance,
    main_ratio_weight: item.main_ratio_weight,
  }));

const mainsBefore = (scenario: ParityScenario) =>
  scenario.mains.map((lineId) => {
    const line = useRecipeStore.getState().items.find((item) => item.id === lineId)!;
    return { planned_grams: line.planned_grams, amount_provenance: line.amount_provenance };
  });

const stagedFacts = () => {
  const preview = useConstraintStudioStore.getState().preview;
  return preview
    ? preview.proposedInput.items.map((item) => ({
        id: item.id,
        planned_grams: item.planned_grams,
        lock_type: item.lock_type,
      }))
    : null;
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const mount = async (element: ReactElement) => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
};

const unmount = async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
};

afterEach(async () => {
  await unmount();
});

const inDocument = (selector: string) => document.querySelector<HTMLElement>(selector);

const settled = async () => {
  await vi.waitFor(
    () => {
      const terminal = useConstraintStudioStore.getState().recalculationTerminal;
      expect(terminal?.state === 'WORKING' || terminal === null).toBe(false);
    },
    { timeout: 120_000, interval: 20 },
  );
  await act(async () => undefined);
};

const applySettled = async () => {
  await vi.waitFor(
    () => {
      const studio = useConstraintStudioStore.getState();
      expect(studio.applyPending).toBe(false);
      expect(studio.preview === null || studio.blocked !== null).toBe(true);
    },
    { timeout: 120_000, interval: 20 },
  );
  await act(async () => undefined);
};

interface RunHooks {
  /** Replaces the side's own intent doors (negative controls only). */
  intent?: (scenario: ParityScenario) => void;
  /** Runs after the intent, right before the side's entry is started. */
  beforeRun?: () => void;
}

/** The customer's „Ustaw …” inside CORE's Direction fallback decision — the SAME
 * `DirectionFallbackDecision` surface on both sides (PRO panel, HOME dialog). */
function fallbackUseButton(root: string): HTMLButtonElement | null {
  const container = document.querySelector(root);
  if (!container) return null;
  return (
    [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      (button.textContent ?? '').trim().startsWith('Ustaw'),
    ) ?? null
  );
}

/** HOME through its real review dialog: `runHomeRecalculation` + the bootstrap. */
async function runHomeDialog(scenario: ParityScenario, hooks: RunHooks = {}): Promise<SideRun> {
  seat(scenario);
  (hooks.intent ?? expressHomeIntent)(scenario);
  const before = mainsBefore(scenario);
  hooks.beforeRun?.();
  const onApplied = vi.fn();
  await mount(
    <HomeRecalculate open context="make" onApplied={onApplied} onClose={() => undefined} />,
  );
  await settled();
  const afterRun = useConstraintStudioStore.getState();
  const run = {
    requests: [...solver.requests] as SolverRequest[],
    terminalAfterRun: structuredClone(afterRun.recalculationTerminal),
    offeredBestCandidate: afterRun.directionBestCandidate !== null,
    offeredDirectionFallback: afterRun.directionFallbackReport !== null,
    fallbackReport: structuredClone(afterRun.directionFallbackReport),
  };
  const decisionShown = inDocument('[data-testid="home-recalc-direction-fallback"]')
    ? 'direction-fallback'
    : inDocument('[data-testid="home-recalc-direction-best"]')
      ? 'direction-best'
      : null;
  const useFallback = fallbackUseButton('[data-testid="home-recalc-direction-fallback"]');
  const best = inDocument('[data-testid="home-recalc-direction-best"] button');
  if (useFallback) {
    await act(async () => useFallback.click());
    await settled();
  } else if (best) await act(async () => best.click());
  const staged = stagedFacts();
  const stagedInstructions = structuredClone(
    useConstraintStudioStore.getState().preview?.previewInstructions?.lines ?? null,
  );
  const apply = inDocument('[data-testid="preview-apply"]');
  if (apply) {
    await act(async () => apply.click());
    await applySettled();
    await vi.waitFor(() => expect(onApplied).toHaveBeenCalled(), { timeout: 120_000 });
  }
  await unmount();
  return {
    mainsBefore: before,
    ...run,
    decisionShown,
    requests: [...solver.requests] as SolverRequest[],
    staged,
    stagedInstructions,
    final: facts(),
    target: useRecipeStore.getState().target_batch_grams,
    audit: useRecipeStore.getState().practicalRecipeAudit !== null,
    applied: onApplied.mock.calls.length > 0,
  };
}

/** HOME through its first-build / automatic path, answering a Direction consent
 * through the SAME CORE the dialog's button calls. */
async function runHomeAutomatic(scenario: ParityScenario, hooks: RunHooks = {}): Promise<SideRun> {
  seat(scenario);
  (hooks.intent ?? expressHomeIntent)(scenario);
  const before = mainsBefore(scenario);
  hooks.beforeRun?.();
  const outcome = await recalculateHomeRecipe();
  const afterRun = useConstraintStudioStore.getState();
  const run = {
    requests: [...solver.requests] as SolverRequest[],
    terminalAfterRun: structuredClone(afterRun.recalculationTerminal),
    offeredBestCandidate: afterRun.directionBestCandidate !== null,
    offeredDirectionFallback: afterRun.directionFallbackReport !== null,
    fallbackReport: structuredClone(afterRun.directionFallbackReport),
  };
  let staged: SideRun['staged'] = null;
  let stagedInstructions: unknown = null;
  if (outcome === 'decision' && afterRun.directionFallbackReport?.best) {
    await openDirectionFallbackPreviewWithServerAuthority();
    staged = stagedFacts();
    stagedInstructions = structuredClone(
      useConstraintStudioStore.getState().preview?.previewInstructions?.lines ?? null,
    );
    await applyPreviewWithServerAuthority();
  } else if (
    outcome === 'decision' &&
    afterRun.directionFallbackReport === null &&
    afterRun.directionBestCandidate !== null
  ) {
    useConstraintStudioStore.getState().acceptBestDirectionCandidate();
    staged = stagedFacts();
    stagedInstructions = structuredClone(
      useConstraintStudioStore.getState().preview?.previewInstructions?.lines ?? null,
    );
    await applyPreviewWithServerAuthority();
  }
  const applied =
    outcome === 'applied' ||
    (staged !== null &&
      useConstraintStudioStore.getState().preview === null &&
      useConstraintStudioStore.getState().blocked === null);
  if (outcome === 'applied') {
    // The clean Preview was applied inside `recalculateHomeRecipe`; the history
    // record keeps the exact Preview the door applied.
    const appliedPreview = useConstraintStudioStore.getState().history.at(-1)?.before
      .presentation?.preview;
    staged =
      appliedPreview?.proposedInput.items.map((item) => ({
        id: item.id,
        planned_grams: item.planned_grams,
        lock_type: item.lock_type,
      })) ?? null;
    stagedInstructions = structuredClone(appliedPreview?.previewInstructions?.lines ?? null);
  }
  return {
    mainsBefore: before,
    ...run,
    decisionShown: null,
    requests: [...solver.requests] as SolverRequest[],
    staged,
    stagedInstructions,
    final: facts(),
    target: useRecipeStore.getState().target_batch_grams,
    audit: useRecipeStore.getState().practicalRecipeAudit !== null,
    applied,
  };
}

/** PRO through its real recalculation panel, started exactly as ProWorkspacePage does. */
async function runPro(scenario: ParityScenario, hooks: RunHooks = {}): Promise<SideRun> {
  seat(scenario);
  (hooks.intent ?? expressProIntent)(scenario);
  const before = mainsBefore(scenario);
  hooks.beforeRun?.();
  await mount(<ProRecalcPanel open onClose={() => undefined} />);
  await act(async () => {
    await runPiRecalculationWithTerminal(undefined, beginPiRecalculation());
  });
  await settled();
  const afterRun = useConstraintStudioStore.getState();
  const run = {
    requests: [...solver.requests] as SolverRequest[],
    terminalAfterRun: structuredClone(afterRun.recalculationTerminal),
    offeredBestCandidate: afterRun.directionBestCandidate !== null,
    offeredDirectionFallback: afterRun.directionFallbackReport !== null,
    fallbackReport: structuredClone(afterRun.directionFallbackReport),
  };
  const decisionShown = inDocument(
    '[data-testid="direction-fallback-decision"], [data-testid="direction-fallback-final"], [data-testid="direction-fallback-alternative"]',
  )
    ? 'direction-fallback'
    : inDocument('[data-testid="direction-best-accept"]')
      ? 'direction-best'
      : null;
  const useFallback =
    fallbackUseButton('[data-testid="direction-fallback-decision"]') ??
    fallbackUseButton('[data-testid="direction-fallback-final"]');
  const best = inDocument('[data-testid="direction-best-accept"]');
  if (useFallback) {
    await act(async () => useFallback.click());
    await settled();
  } else if (best) await act(async () => best.click());
  const staged = stagedFacts();
  const stagedInstructions = structuredClone(
    useConstraintStudioStore.getState().preview?.previewInstructions?.lines ?? null,
  );
  const apply = inDocument('[data-testid="preview-apply"]');
  let applied = false;
  if (apply) {
    await act(async () => apply.click());
    await applySettled();
    const studio = useConstraintStudioStore.getState();
    applied = studio.preview === null && studio.blocked === null;
  }
  await unmount();
  return {
    mainsBefore: before,
    ...run,
    decisionShown,
    requests: [...solver.requests] as SolverRequest[],
    staged,
    stagedInstructions,
    final: facts(),
    target: useRecipeStore.getState().target_batch_grams,
    audit: useRecipeStore.getState().practicalRecipeAudit !== null,
    applied,
  };
}

/* ── the comparison ─────────────────────────────────────────────────────────── */

const gramsById = (lines: readonly { id: string; planned_grams: number }[]) =>
  Object.fromEntries(lines.map((line) => [line.id, line.planned_grams]));

/** (a)–(e). Every comparison is structural (`toEqual`), never a serialization. */
function expectParity(scenario: ParityScenario, seated: RecipeInput, home: SideRun, pro: SideRun) {
  // (a) CORE was asked the same question.
  expect(home.requests.length).toBeGreaterThan(0);
  expect(home.requests).toEqual(pro.requests);
  // (b) CORE staged the same proposal.
  expect(home.staged).not.toBeNull();
  expect(home.staged).toEqual(pro.staged);
  // (c) The applied recipe is the same recipe.
  expect(home.applied).toBe(true);
  expect(pro.applied).toBe(true);
  expect(home.final).toEqual(pro.final);
  expect(home.target).toBe(pro.target);
  expect(home.target).toBe(scenario.target ?? seated.target_batch_grams);
  const finalSum = home.final.reduce((sum, line) => sum + line.planned_grams, 0);
  expect(finalSum).toBe(home.target);
  for (const line of home.final) expect(Number.isInteger(line.planned_grams)).toBe(true);
  expect(home.audit).toBe(true);
  expect(pro.audit).toBe(true);
  for (const lineId of scenario.mains) {
    expect(home.final.find((line) => line.id === lineId)?.lock_type).toBe('main');
  }
  // (d) Branch evidence: the two sides really took their own doors.
  for (const main of home.mainsBefore) {
    expect(main).toEqual({ planned_grams: 0, amount_provenance: undefined });
  }
  for (const main of pro.mainsBefore) {
    expect(main).toEqual({ planned_grams: 1, amount_provenance: AUTO_CROWN_SEED });
  }
  expect(home.stagedInstructions).toEqual(
    scenario.mains.map((lineId) => ({ lineId, grams: 1, locked: false, bootstrap: true })),
  );
  expect(pro.stagedInstructions).toBeNull();
  // (e) The solver really moved grams.
  expect(gramsById(home.final)).not.toEqual(gramsById(seated.items));
}

/**
 * CORE answered with a Direction decision that offers NO applicable fallback
 * (`directionFallbackReport.best === null` — e.g. a Sorbet whose ±1 sweetness has no
 * safe neighbour). Then the customer's only options write nothing, on either surface.
 * Parity here is stricter than „both applied”: the SAME question to CORE, the SAME
 * report, the SAME decision surface, and NO write anywhere — each side keeps exactly its
 * own untouched recipe (HOME's Main at 0 g per OD-1, PRO's at its 1 g seed).
 */
function expectSameDecision(scenario: ParityScenario, seated: RecipeInput, home: SideRun, pro: SideRun) {
  // (a) CORE was asked the same question.
  expect(home.requests.length).toBeGreaterThan(0);
  expect(home.requests).toEqual(pro.requests);
  // CORE gave the same answer: the same terminal, the same fallback report.
  expect(home.terminalAfterRun).toEqual(pro.terminalAfterRun);
  expect(pro.fallbackReport).not.toBeNull();
  expect(withoutTiming(home.fallbackReport)).toEqual(withoutTiming(pro.fallbackReport));
  expect(home.offeredBestCandidate).toBe(pro.offeredBestCandidate);
  // The customer sees the same decision surface (the automatic path hands the
  // staged state to that same dialog, so it renders nothing itself).
  expect(pro.decisionShown).toBe('direction-fallback');
  if (home.decisionShown !== null) expect(home.decisionShown).toBe(pro.decisionShown);
  // Nothing was written on either side.
  expect(home.applied).toBe(false);
  expect(pro.applied).toBe(false);
  expect(home.staged).toBeNull();
  expect(pro.staged).toBeNull();
  expect(home.audit).toBe(pro.audit);
  expect(home.target).toBe(pro.target);
  const mains = new Set(scenario.mains);
  const seatedGrams = gramsById(seated.items);
  for (const line of home.final) {
    expect(line.planned_grams).toBe(mains.has(line.id) ? 0 : seatedGrams[line.id]);
  }
  for (const line of pro.final) {
    expect(line.planned_grams).toBe(mains.has(line.id) ? 1 : seatedGrams[line.id]);
  }
  // (d) Branch evidence: the two sides really took their own doors.
  for (const main of home.mainsBefore) {
    expect(main).toEqual({ planned_grams: 0, amount_provenance: undefined });
  }
  for (const main of pro.mainsBefore) {
    expect(main).toEqual({ planned_grams: 1, amount_provenance: AUTO_CROWN_SEED });
  }
}

/** CORE's report with ONLY its wall-clock measurements removed (runtimeMs,
 * totalRuntimeMs): timing is how long this machine took, not what CORE answered. */
function withoutTiming(report: unknown): unknown {
  return JSON.parse(
    JSON.stringify(report, (key, value) =>
      key === 'runtimeMs' || key === 'totalRuntimeMs' ? undefined : value,
    ),
  );
}

/** Decide from CORE's (identical) answer which parity applies — never from the result. */
function expectSameOutcome(scenario: ParityScenario, seated: RecipeInput, home: SideRun, pro: SideRun) {
  expect(withoutTiming(home.fallbackReport)).toEqual(withoutTiming(pro.fallbackReport));
  const report = pro.fallbackReport as { best?: unknown } | null;
  if (report !== null && (report.best ?? null) === null) {
    expectSameDecision(scenario, seated, home, pro);
  } else {
    expectParity(scenario, seated, home, pro);
  }
}

beforeEach(() => {
  resetStores();
});

describe('HOME ↔ PRO parity through each side’s own entry', () => {
  for (const scenario of ORDINARY) {
    it(`${scenario.name}: HOME dialog ≡ PRO panel`, async () => {
      const seated = scenario.seat();
      const home = await runHomeDialog(scenario);
      const pro = await runPro(scenario);
      expectParity(scenario, seated, home, pro);
    });

    it(`${scenario.name}: HOME first-build/automatic path ≡ PRO panel`, async () => {
      const seated = scenario.seat();
      const home = await runHomeAutomatic(scenario);
      const pro = await runPro(scenario);
      expectParity(scenario, seated, home, pro);
    });
  }
});

const RISK_CELLS: readonly ParityScenario[] = (['gelato', 'sorbet'] as const).flatMap((visible) =>
  (['auto', 'manual'] as const).flatMap((crown) =>
    ([-1, 1] as const).map((sweetness): ParityScenario => ({
      name: `${visible}, 0 g ${crown === 'auto' ? 'AUTO Main' : 'manual crown'}, sweetness ${sweetness > 0 ? '+1' : '−1'}`,
      seat: visible === 'gelato' ? gelato : sorbet,
      authorityFor: starterAuthority,
      mains: [FRUIT_LINE[0]],
      crown,
      sweetness,
    })),
  ),
);

/**
 * KNOWN DIVERGENCE (observed 2026-09-18 on 1915c5d2) — the four Sorbet cells.
 *
 * HOME's 0 g bootstrap rides the INTERACTIVE CORE entry
 * (`createOptimizePreviewWithServerAuthority(…, { instructions })`), and that entry
 * skips the Direction fallback ladder: constraintStudioStore.ts:3401
 * `const fallbackReport = interactive ? null : await computeDirectionFallbackWithServerAuthority(…)`.
 * PRO's ordinary entry runs it, so on a Sorbet whose ±1 sweetness is not reachable:
 *  - the FIRST solver request is identical on both sides; PRO's second request is the
 *    ladder's trial at `direction_targets.sweetness: 0`, HOME's second is the Apply
 *    door's rebuild at the customer's ±1 → (a) differs;
 *  - PRO publishes `directionFallbackReport` (constraintStudioStore.ts:3595), so
 *    ProRecalcPanel.tsx:1329 shows the fallback decision and hides the best-candidate
 *    consent (ProRecalcPanel.tsx:1428 `!directionFallbackReport && …`): PRO never reaches
 *    Apply (Main stays at its 1 g seed, Σ 401 g), HOME applies the best candidate
 *    (Main 600 g, Σ 1000 g) → (c) differs.
 * The same entry split also skips lock recovery (:3432 and :1380), the Crown-OFF
 * automatic correction (:3560) and the NO_CHANGE seam (:3606, :1399); the gelato cells
 * below do not reach those branches and match.
 *
 * FIXED 2026-09-18 in CORE (`fix(core): a bootstrap-only recalculation is PRO's plain
 * run`): a run whose instructions are all bootstrap takes PRO's plain-run semantics,
 * and every Preview it stages is bound to the bootstrap authorization so the Apply door
 * rebuilds the same draft. HOME's review dialog shows CORE's fallback with PRO's own
 * `DirectionFallbackDecision`. These cells are ordinary tests now.
 */

describe('HOME ↔ PRO parity — the known-risk Direction cells', () => {
  for (const scenario of RISK_CELLS) {
    const test = it;
    test(`${scenario.name}: HOME dialog ≡ PRO panel`, async () => {
      const seated = scenario.seat();
      const home = await runHomeDialog(scenario);
      const pro = await runPro(scenario);
      expectSameOutcome(scenario, seated, home, pro);
    });

    test(`${scenario.name}: HOME first-build/automatic path ≡ PRO panel`, async () => {
      const seated = scenario.seat();
      const home = await runHomeAutomatic(scenario);
      const pro = await runPro(scenario);
      expectSameOutcome(scenario, seated, home, pro);
    });
  }
});

/* ── negative controls: the comparator can see a divergence ─────────────────── */

const GELATO_AUTO = ORDINARY[0]!;
const GELATO_1850 = ORDINARY.find((scenario) => scenario.target === 1850)!;

/** A MUTANT HOME that owns batch math: it pre-scales the recipe itself —
 * proportionally, in whole grams, the rounding remainder on milk — and writes the
 * new header, instead of asking CORE's batch door. */
function homeMutantPreScale(scenario: ParityScenario) {
  const target = scenario.target!;
  const state = useRecipeStore.getState();
  const factor = target / state.target_batch_grams;
  const scaled = Object.fromEntries(
    state.items.map((item) => [item.id, Math.round(item.planned_grams * factor)]),
  );
  const milk = lineByCanonical(OWNER_IDS.milk);
  scaled[milk.id] =
    scaled[milk.id]! + target - Object.values(scaled).reduce((sum, grams) => sum + grams, 0);
  useRecipeStore.setState({ target_batch_grams: target });
  useRecipeStore.getState().setPlannedGramsVector(scaled);
  useRecipeStore.getState().setPriorityMode('AUTO');
  for (const lineId of scenario.mains) useRecipeStore.getState().grantAutomaticPriority(lineId);
}

describe('negative controls — the comparison is able to fail', () => {
  it('(i) a HOME run that skips homeRecalculationInstructions is PRODUCT_GRAMS_REQUIRED with 0 solver calls; PRO is PREVIEW_READY', async () => {
    seat(GELATO_AUTO);
    expressHomeIntent(GELATO_AUTO);
    // HOME's runner WITHOUT its first step: the plain PRZELICZ on a 0 g priority.
    await runPiRecalculationWithTerminal();
    const homeTerminal = structuredClone(useConstraintStudioStore.getState().recalculationTerminal);
    const homeRequests = [...solver.requests];
    const pro = await runPro(GELATO_AUTO);

    expect(homeTerminal?.state).toBe('PRODUCT_GRAMS_REQUIRED');
    expect(homeRequests).toHaveLength(0);
    expect(pro.terminalAfterRun).toEqual({ state: 'PREVIEW_READY' });
    expect(pro.requests.length).toBeGreaterThan(0);
    // The comparator used by every parity test sees it.
    expect(() => expect(homeRequests).toEqual(pro.requests)).toThrow();
  });

  it('(ii) a HOME that pre-scales the recipe itself is caught by (a), whatever (c) says', async () => {
    const mutant = await runHomeDialog(GELATO_1850, { intent: homeMutantPreScale });
    const pro = await runPro(GELATO_1850);
    // The mutant really reached a result (so a final-grams-only check could be fooled)…
    expect(mutant.applied).toBe(true);
    expect(mutant.target).toBe(pro.target);
    // …but the question CORE was asked is not PRO's question.
    expect(mutant.requests.length).toBeGreaterThan(0);
    expect(() => expect(mutant.requests).toEqual(pro.requests)).toThrow();
    expect(mutant.requests[0]!.input.items.map((item) => item.planned_grams)).not.toEqual(
      pro.requests[0]!.input.items.map((item) => item.planned_grams),
    );
  });
});

/* ── propagation: one change in CORE reaches HOME and PRO, no second copy ───── */

const SUCROSE = OWNER_IDS.sucrose;
const DEXTROSE = OWNER_IDS.dextrose;

/** A changed CORE practicalization answer: every whole-gram answer CORE gives moves
 * 1 g from sucrose to dextrose (two unlocked lines), Σ kept. Deterministic in its
 * input, so the Apply door's re-derivation reproduces it exactly. */
function moveOneGramSucroseToDextrose(value: unknown): unknown {
  const result = value as PracticalRecipeResult;
  if (!result.ok) return result;
  const { executableInput } = result.audit;
  const movable = (item: RecipeItem) =>
    item.lock_type === 'unlocked' &&
    item.grams_constraint === undefined &&
    item.percent_constraint === undefined &&
    item.range_constraint === undefined;
  const from = executableInput.items.find((item) => canonicalOf(item) === SUCROSE && movable(item));
  const to = executableInput.items.find((item) => canonicalOf(item) === DEXTROSE && movable(item));
  if (!from || !to || from.planned_grams < 2) return result;
  const items = executableInput.items.map((item) =>
    item.id === from.id
      ? { ...item, planned_grams: item.planned_grams - 1 }
      : item.id === to.id
        ? { ...item, planned_grams: item.planned_grams + 1 }
        : item,
  );
  const changed = { ...executableInput, items };
  return {
    ok: true,
    audit: {
      ...result.audit,
      executableInput: changed,
      executableResult: calculateRecipe(changed),
      lines: result.audit.lines.map((line) =>
        line.lineId === from.id
          ? { ...line, practicalGrams: line.practicalGrams - 1, deltaGrams: line.deltaGrams - 1 }
          : line.lineId === to.id
            ? { ...line, practicalGrams: line.practicalGrams + 1, deltaGrams: line.deltaGrams + 1 }
            : line,
      ),
    },
  } satisfies PracticalRecipeResult;
}

const sameGrams = (left: Record<string, number>, right: Readonly<Record<string, number>>) =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(([lineId, grams]) => Object.is(right[lineId], grams));

const fractional = (grams: Record<string, number>) =>
  Object.values(grams).some((value) => !Number.isInteger(value));

const SIDES = [
  { side: 'HOME', run: runHomeDialog },
  { side: 'PRO', run: runPro },
] as const;

describe('PROPAGATION — the recipe that lands is CORE’s practicalization, on both sides', () => {
  for (const { side, run } of SIDES) {
    it(`${side}: recalculate-and-apply lands exactly CORE's whole-gram answer`, async () => {
      const result = await run(GELATO_AUTO, {
        beforeRun: () => {
          practical.recording = true;
        },
      });
      expect(result.applied).toBe(true);
      const calls = practical.calls as PracticalCall[];
      const final = gramsById(result.final);
      // Pass-through: CORE's answer is returned untouched.
      for (const call of calls) expect(call.returned).toEqual(call.real);
      // CORE practicalized fractional solver candidates on the way…
      expect(calls.some((call) => fractional(call.exact))).toBe(true);
      // …and the applied recipe is — byte for byte — CORE's whole-gram answer for the
      // exact candidate the applied audit names.
      const audit = useRecipeStore.getState().practicalRecipeAudit!;
      const source = [...calls]
        .reverse()
        .find((call) => sameGrams(call.exact, audit.exactGramsByLineId));
      expect(
        source,
        'the applied exact candidate went through CORE practicalization',
      ).toBeDefined();
      expect(source!.returned).toEqual(final);
      expect(useRecipeStore.getState().practicalRecipeAudit!.executableGramsByLineId).toEqual(
        final,
      );
    });

    it(`${side}: a changed CORE answer is exactly what lands — no own rounding overwrites it`, async () => {
      const result = await run(GELATO_AUTO, {
        beforeRun: () => {
          practical.recording = true;
          practical.change = moveOneGramSucroseToDextrose;
        },
      });
      expect(result.applied).toBe(true);
      const calls = practical.calls as PracticalCall[];
      const final = gramsById(result.final);
      const sucrose = lineByCanonical(SUCROSE).id;
      const dextrose = lineByCanonical(DEXTROSE).id;
      // The change was live…
      const changed = calls.filter(
        (call) =>
          call.real !== null && call.returned !== null && !sameGrams(call.real, call.returned),
      );
      expect(changed.length).toBeGreaterThan(0);
      // …and the recipe is exactly the CHANGED answer CORE gave for the exact
      // candidate the applied audit names — not the unchanged one: nothing downstream
      // re-rounded it back.
      const audit = useRecipeStore.getState().practicalRecipeAudit!;
      const source = [...changed]
        .reverse()
        .find((call) => sameGrams(call.exact, audit.exactGramsByLineId));
      expect(source, 'the applied exact candidate went through the changed CORE').toBeDefined();
      expect(source!.returned).toEqual(final);
      expect(final).not.toEqual(source!.real);
      expect(final[sucrose]).toBe(source!.real![sucrose]! - 1);
      expect(final[dextrose]).toBe(source!.real![dextrose]! + 1);
      for (const [lineId, grams] of Object.entries(source!.real!)) {
        if (lineId !== sucrose && lineId !== dextrose) expect(final[lineId]).toBe(grams);
      }
      expect(Object.values(final).reduce((sum, grams) => sum + grams, 0)).toBe(result.target);
      expect(useRecipeStore.getState().practicalRecipeAudit!.executableGramsByLineId).toEqual(
        final,
      );
    });
  }
});
