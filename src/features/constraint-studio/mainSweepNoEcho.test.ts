/** @vitest-environment jsdom */
/**
 * A REFUSED MAIN SWEEP IS NEVER AN ECHO — it is the typed conflict it is
 * (owner 2026-09-18; served staging c36574ea).
 *
 * Served: Gelato, fresh STRAWBERRIES under the published `main-berry-fresh-dairy` v2
 * policy (Main floor 25 %, MILK 3.5 % the approved liquid dairy carrier ≥ 30 %), neutral
 * Direction active. HOME's first build sizes the Main; the customer then adds BANANA 100 g
 * and KIWI 100 g (their exact amounts). At 1340 g (Ninja CREAMi Deluxe ×2), 1000 g and
 * 670 g (one Deluxe tub) no recipe keeps both fruit amounts at that Direction: the
 * certified Main sweep accepts nothing (`crownRefusal`) and the reformulation keeps a
 * diagnostic vector around the untouched Main.
 *
 * The served defect, one CORE, both surfaces: `buildOptimizePreview` skipped the Main
 * safety check for ANY exact Direction, so that vector reached the ProductBehavior binding
 * and the customer was told „Propozycja Gellatti została odrzucona … zatwierdzony płynny
 * nośnik mleczny ma 22.8%” — a REJECTED PROPOSAL, although nobody proposed anything and
 * the real situation is a conflict with their own amounts (GEL-P0-027: an empty sweep is
 * a refusal, never an echo).
 *
 * CORE ends each case in its typed lock conflict (`impossible_under_constraints` on the
 * customer's own lock → LOCK_CHANGE_REQUIRED), the recipe untouched, with the lock-conflict
 * diagnosis's relaxation that keeps the customer's Direction. The conflict's gap is the
 * owner's 2026-09-11 „Przy obecnych ustawieniach…” measurement: the customer's own amounts
 * at this batch (every held line kept, the rest brought to the batch) — a true statement,
 * so it stays. An earlier attempt that dropped it lost that feature after any in-session
 * edit (review 2026-09-18, owner fixture 5).
 *
 * The seat is HOME's own first build, the policy is the published migration row, and the
 * diagnostic vector is the one CORE's own Main safety check measured (a PASS-THROUGH tap on
 * `verifyMainEnvelope`). The only numbers typed here are the served relaxations the owner
 * recorded (BANANA 100 → 96 g at 1340 g; KIWI 100 → 49 / 2 g at 1000 / 670 g).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import {
  recalculateHomeRecipe,
  stagedResultIsClean,
} from '@/features/home-creator/homeRecalculation';
import { HomeRecalculate } from '@/features/home-creator/ui/HomeRecalculate';
import { NINJA_CREAMI_DELUXE_NC502EU, deriveMachineSetup } from '@/features/machine-catalog';
import { ProRecalcPanel } from '@/features/pro-core/ProRecalcPanel';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type {
  MainEnvelopeViolation,
  ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints';
import {
  SORBET_MAIN_IDS,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  OWNER_CREATED_AT,
  OWNER_IDS,
  ownerFruitRecipe,
  ownerPreviewOptions,
  withCustomerGramLocks,
} from './__fixtures__/ownerFruitMainFixture';
import {
  publishedDairyMainPolicy,
  withPublishedDairyMainPolicy,
} from './__fixtures__/servedDairyMainPolicy';
import { buildOptimizePreview, type BuildPreviewResult } from './applyPipeline';
import { constraintStudioCopy, formatPercentPl } from './constraintStudioCopy';
import {
  beginPiRecalculation,
  runPiRecalculationWithTerminal,
  selectCanonicalDraft,
  useConstraintStudioStore,
} from './constraintStudioStore';
import { lockConflictBlockers } from './lockRelaxation';
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

/* ── the Main envelope: a PASS-THROUGH tap (records, then the real verdict) ── */

interface EnvelopeCall {
  recipe: RecipeInput;
  ok: boolean;
  violations: MainEnvelopeViolation[];
}

const envelope = vi.hoisted(() => ({ recording: false, calls: [] as unknown[] }));

vi.mock('@/features/product-intelligence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/product-intelligence')>();
  return {
    ...actual,
    verifyMainEnvelope: (...args: Parameters<typeof actual.verifyMainEnvelope>) => {
      const verdict = actual.verifyMainEnvelope(...args);
      if (envelope.recording) {
        envelope.calls.push(
          structuredClone({
            recipe: args[0].recipe,
            ok: verdict.ok,
            violations: verdict.ok ? [] : verdict.violations,
          }),
        );
      }
      return verdict;
    },
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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

/** The served cases and the relaxation CORE's lock-conflict diagnosis offers for each. */
const SERVED_CASES = [
  { label: '1340 g (Ninja CREAMi Deluxe ×2)', batch: DELUXE * 2, moves: { [BANANA]: 96 } },
  { label: '1000 g', batch: 1000, moves: { [KIWI]: 49 } },
  { label: '670 g (Ninja CREAMi Deluxe)', batch: DELUXE, moves: { [KIWI]: 2 } },
] as const;

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
  envelope.recording = false;
  envelope.calls = [];
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
  const seat = structuredClone(buildRecipeInput(store()));
  // The served policy really is the strawberry's authority, and the seat honours it.
  const strawberry = seat.items.find((item) => canonicalOf(item) === SORBET_MAIN_IDS.strawberry)!;
  expect(store().productBehaviorSnapshots[strawberry.id]?.mainPolicyId).toBe(
    'main-berry-fresh-dairy',
  );
  expect(strawberry.lock_type).toBe('main');
  expect(gramsOf(seat, SORBET_MAIN_IDS.strawberry)).toBeGreaterThanOrEqual(
    floorGrams(BERRY.ecoFloorPercent, batch),
  );
  return seat;
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

/** Every share the Main envelope MEASURED on a vector (the percentages its verdict states). */
function measuredPercents(violations: readonly MainEnvelopeViolation[]): number[] {
  return lockConflictBlockers({
    ok: false,
    code: 'no_proposal',
    blockingViolations: [...violations],
  })
    .map((blocker) => blocker.actualPercent)
    .filter((percent): percent is number => percent !== null);
}

/** The conflict is presented as the conflict it is — never as a rejected proposal. */
function expectNotARejectedProposal() {
  expect(studio().recalculationTerminal?.state).toBe('LOCK_CHANGE_REQUIRED');
  expect(JSON.stringify(studio().previewIssue ?? {})).not.toContain('product_behavior_invalid');
}

/* ── rendering ──────────────────────────────────────────────────────────────── */

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

const settled = async () => {
  await vi.waitFor(
    () => {
      const terminal = studio().recalculationTerminal;
      expect(terminal?.state === 'WORKING' || terminal === null).toBe(false);
    },
    { timeout: 120_000, interval: 20 },
  );
  await act(async () => undefined);
};

const panel = (surface: 'pro' | 'home') =>
  document.querySelector<HTMLElement>(
    `[data-testid="lock-conflict-panel"][data-surface="${surface}"]`,
  );

beforeEach(() => {
  resetStores();
});

afterEach(async () => {
  await unmount();
});

/* ── the shared answer for one side ─────────────────────────────────────────── */

type Moves = Readonly<Record<string, number>>;

/** CORE's typed conflict, as the side's store holds it after its own recalculation. */
function expectTypedLockConflict(moves: Moves, before: unknown) {
  const state = studio();
  // The recipe is untouched and nothing is offered for Apply.
  expect(store().items).toEqual(before);
  expect(state.preview).toBeNull();
  expect(state.directionBestCandidate).toBeNull();
  expect(state.directionFallbackReport).toBeNull();
  // CORE's typed conflict on the customer's own amount — never the carrier verdict of an
  // unproposed vector (product_behavior_invalid).
  const issue = state.previewIssue;
  expect(issue?.ok === false && issue.code).toBe('impossible_under_constraints');
  expect(issue?.ok === false && issue.code).not.toBe('product_behavior_invalid');
  expect(state.recalculationTerminal).toMatchObject({
    state: 'LOCK_CHANGE_REQUIRED',
    code: 'impossible_under_constraints',
  });
  if (issue?.ok !== false || issue.code !== 'impossible_under_constraints') return null;
  const conflictLine = store().items.find((item) => item.id === issue.conflict?.lineId);
  expect([BANANA, KIWI]).toContain(conflictLine && canonicalOf(conflictLine));
  expect(issue.conflict).toMatchObject({ kind: 'locked', grams: 100 });
  // The lock-conflict diagnosis offers the recorded relaxation of the customer's locks.
  const conflict = state.lockConflict;
  expect(conflict?.diagnosis.status).toBe('relaxation_found');
  if (conflict?.diagnosis.status !== 'relaxation_found') return null;
  const byCanonical = (lineId: string) =>
    canonicalOf(store().items.find((item) => item.id === lineId)!);
  expect(conflict.diagnosis.locks.map((lock) => [byCanonical(lock.lineId), lock.grams])).toEqual([
    [BANANA, 100],
    [KIWI, 100],
  ]);
  expect(
    Object.fromEntries(
      conflict.diagnosis.changes.map((change) => [byCanonical(change.lineId), change.toGrams]),
    ),
  ).toEqual(moves);
  return { issue, conflict };
}

/** „Użyj propozycji": the Preview it stages is clean — the customer's Direction is kept,
 * every rule holds — and the recipe is still untouched until „Zastosuj zmiany". */
function expectRelaxationKeepsDirection(batch: number, moves: Moves, before: unknown) {
  const state = studio();
  expect(state.recalculationTerminal).toEqual({ state: 'PREVIEW_READY' });
  expect(state.lockConflict).toBeNull();
  expect(stagedResultIsClean()).toBe(true);
  const preview = state.preview!;
  expect(previewCustomerDecisionReason(preview)).toBeNull();
  expect(preview.directionTargetUnreached).not.toBe(true);
  const recipe = preview.proposedInput;
  expect(recipe.goals?.direction_targets_active).toBe(true);
  expect(assessRecipeDirection(recipe, calculateRecipe(recipe)).reached).toBe(true);
  expect(recipe.items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
  expect(recipe.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(batch);
  expect(gramsOf(recipe, BANANA)).toBe(moves[BANANA] ?? 100);
  expect(gramsOf(recipe, KIWI)).toBe(moves[KIWI] ?? 100);
  expect(gramsOf(recipe, SORBET_MAIN_IDS.strawberry)).toBeGreaterThanOrEqual(
    floorGrams(BERRY.ecoFloorPercent, batch),
  );
  expect(gramsOf(recipe, OWNER_IDS.milk)).toBeGreaterThanOrEqual(
    floorGrams(BERRY.liquidDairyCarrierFloorPercent!, batch),
  );
  expect(
    evaluateRecipeConstraintAuthority({
      recipe,
      snapshots: store().productBehaviorSnapshots as Record<string, ProductBehaviorSnapshot>,
      module: 'OPTIMAL',
      technicalOnlyMainLineIds: [],
    }).issues,
  ).toEqual([]);
  expect(store().items).toEqual(before);
  return Object.fromEntries(recipe.items.map((item) => [canonicalOf(item), item.planned_grams]));
}

/* ── CORE ───────────────────────────────────────────────────────────────────── */

describe('a refused Main sweep ends in the typed lock conflict — CORE', () => {
  for (const { label, batch } of SERVED_CASES) {
    it(`${label}: impossible_under_constraints on the customer's lock, never a rejected proposal`, async () => {
      const seat = await homeFirstBuild(batch);
      addBananaAndKiwi();
      const { input, constraints, options } = coreRequest();
      expect(input.target_batch_grams).toBe(batch);
      expect(input.goals?.direction_targets_active).toBe(true);

      envelope.recording = true;
      const result: BuildPreviewResult = buildOptimizePreview(
        input,
        constraints,
        CREATED_AT,
        options,
      );
      envelope.recording = false;

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('impossible_under_constraints');
      if (result.code !== 'impossible_under_constraints') return;
      expect([BANANA, KIWI]).toContain(
        canonicalOf(input.items.find((item) => item.id === result.conflict?.lineId)!),
      );

      // The vector CORE's Main safety check measured last: the customer's amounts at this
      // batch — the seat Main as it stands, the customer's locks, the rest brought to size.
      const diagnostic = envelope.calls.at(-1) as EnvelopeCall;
      expect(diagnostic.ok).toBe(false);
      expect(gramsOf(diagnostic.recipe, SORBET_MAIN_IDS.strawberry)).toBe(
        gramsOf(seat, SORBET_MAIN_IDS.strawberry),
      );
      const diagnosticPercents = measuredPercents(diagnostic.violations);
      expect(diagnosticPercents.length).toBeGreaterThan(0);

      // Its measurements ARE the conflict's gap („Przy obecnych ustawieniach…”) — published
      // as the typed lock conflict, never as a rejected proposal.
      expect(result.blockingViolations).toEqual(diagnostic.violations);
      expect(lockConflictBlockers(result).length).toBeGreaterThan(0);
      expect(JSON.stringify(result)).not.toContain('product_behavior_invalid');
    });
  }

  it('control: a refusal measured on the customer’s OWN recipe keeps its exact gap (owner 2026-09-11, 600 g)', () => {
    // No Direction; the refused sweep hands back the customer's recipe itself, so its
    // shares ARE „Przy obecnych ustawieniach…": the owner's exact remaining gap stays.
    const draft = withCustomerGramLocks(ownerFruitRecipe({ batch: 600 }), {
      strawberry: 100,
      cranberry: 130,
    });
    envelope.recording = true;
    const result = buildOptimizePreview(
      draft.input,
      draft.constraints,
      OWNER_CREATED_AT,
      ownerPreviewOptions(draft.input),
    );
    envelope.recording = false;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const measured = envelope.calls.at(-1) as EnvelopeCall;
    expect(measured.recipe.items.map((item) => [item.id, item.planned_grams])).toEqual(
      draft.input.items.map((item) => [item.id, item.planned_grams]),
    );
    expect(result.code === 'impossible_under_constraints' && result.blockingViolations).toEqual(
      measured.violations,
    );
    expect(lockConflictBlockers(result)).toContainEqual({
      code: 'liquid_dairy_carrier_below_floor',
      actualPercent: 22.7,
      limitPercent: 30,
    });
  });
});

/* ── HOME and PRO ───────────────────────────────────────────────────────────── */

describe('HOME and PRO present the same typed conflict and the same Direction-keeping relaxation', () => {
  for (const { label, batch, moves } of SERVED_CASES) {
    it(`${label}: HOME recalculateHomeRecipe → decision → „Użyj propozycji"; PRO the same`, async () => {
      const seat = await homeFirstBuild(batch);

      // The gap's measurements, taken where CORE's Main safety check takes them (the same
      // request HOME's PRZELICZ is about to send).
      addBananaAndKiwi();
      const { input, constraints, options } = coreRequest();
      envelope.recording = true;
      buildOptimizePreview(input, constraints, CREATED_AT, options);
      envelope.recording = false;
      const diagnostic = envelope.calls.at(-1) as EnvelopeCall | undefined;
      const diagnosticPercents = measuredPercents(diagnostic?.violations ?? []);

      /* HOME: the shared PRZELICZ leaves a decision, never an Apply. */
      const homeBefore = structuredClone(store().items);
      expect(await recalculateHomeRecipe()).toBe('decision');
      const home = expectTypedLockConflict(moves, homeBefore);
      expect(home).not.toBeNull();
      expect(diagnosticPercents.length).toBeGreaterThan(0);
      expectNotARejectedProposal();

      // HOME's review dialog presents exactly that conflict (surface="home").
      await mount(
        createElement(HomeRecalculate, {
          open: true,
          context: 'initial',
          presentCurrent: true,
          onClose: () => undefined,
          onApplied: () => undefined,
        }),
      );
      const homePanel = panel('home');
      expect(homePanel).not.toBeNull();
      expect(homePanel!.dataset.status).toBe('relaxation_found');
      expect(homePanel!.querySelector('[data-testid="lock-conflict-gap"]')).toBeNull();
      expect(homePanel!.querySelector('[data-testid="lock-conflict-measures"]')).toBeNull();
      expect(document.body.textContent ?? '').not.toContain('Propozycja Gellatti została odrzucona');
      await act(async () =>
        homePanel!
          .querySelector<HTMLElement>('[data-testid="lock-conflict-use-proposal"]')!
          .click(),
      );
      await settled();
      const homeRelaxed = expectRelaxationKeepsDirection(batch, moves, homeBefore);
      await unmount();

      /* PRO: the same recipe, PRO's own doors and its own entry. */
      resetStores();
      store().loadRecipeInput(structuredClone(seat));
      syncAuthority();
      addBananaAndKiwi();
      const proBefore = structuredClone(store().items);
      await mount(createElement(ProRecalcPanel, { open: true, onClose: () => undefined }));
      await act(async () => {
        await runPiRecalculationWithTerminal(undefined, beginPiRecalculation());
      });
      await settled();
      const pro = expectTypedLockConflict(moves, proBefore);
      expect(pro).not.toBeNull();
      expectNotARejectedProposal();

      // PRO's panel (LockConflictPanel, surface="pro"): the owner's exact gap for the
      // customer's current amounts, next to the relaxation — never „odrzucona”.
      const proPanel = panel('pro');
      expect(proPanel).not.toBeNull();
      expect(proPanel!.dataset.status).toBe('relaxation_found');
      const gap = proPanel!.querySelector('[data-testid="lock-conflict-gap"]')?.textContent ?? '';
      expect(gap).not.toBe(constraintStudioCopy.lockConflict.genericGap);
      expect(diagnosticPercents.some((percent) => gap.includes(formatPercentPl(percent)))).toBe(true);
      expect(document.body.textContent ?? '').not.toContain('Propozycja Gellatti została odrzucona');
      await act(async () =>
        proPanel!.querySelector<HTMLElement>('[data-testid="lock-conflict-use-proposal"]')!.click(),
      );
      await settled();
      const proRelaxed = expectRelaxationKeepsDirection(batch, moves, proBefore);

      // One CORE, one answer.
      expect(proRelaxed).toEqual(homeRelaxed);
      expect(pro!.issue.conflict?.ingredientName).toBe(home!.issue.conflict?.ingredientName);
    });
  }
});
