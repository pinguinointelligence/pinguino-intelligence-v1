/**
 * OWNER §18 (2026-09-18, „najważniejsza zasada") — ONE recipe logic behind HOME
 * and PRO: a fix in CORE reaches both, and the same intent never takes two CORE
 * branches.
 *
 * HOME's automatic Main is mass-neutral (owner OD-1): the recipe keeps its 0 g
 * priority line until „Zastosuj zmiany", and HOME hands that line to the solver
 * as the 1 g Crown bootstrap on the calculation COPY — an interactive run whose
 * instructions are ALL `bootstrap: true`. PRO writes the same 1 g AUTO_CROWN_SEED
 * into its store and runs the plain Przelicz. The solver line is byte-identical,
 * but CORE used to treat the HOME run as a customer edit session and skipped the
 * Direction fallback ladder, the Suggested Fix / lock recovery and the automatic
 * Crown-OFF correction for it. Measured: gelato, 0 g automatic Main, sweetness −1
 * — HOME one solver call, PRO two calls + the „Ustaw 0" report (366/131/58/66).
 *
 * This file pins the repair end to end through the real store runtime (the
 * canonical computation runs in-process; only the ProductBehavior network seam
 * is faked, answering from the server-authority table):
 *  - every {gelato, sorbet} × sweetness {−1, 0, +1} cell: the solver requests,
 *    the staged state and the applied recipe of HOME's bootstrap-only run EQUAL
 *    PRO's seeded plain run, and HOME's run never writes the recipe;
 *  - the Direction fallback, the Suggested Fix and the Crown-OFF correction that
 *    a bootstrap-only run stages all cross the one Apply door, which re-derives
 *    the copy from the session authorization; the Main ends at the solver's
 *    grams (0 g → N g), never at the 1 g bootstrap, and Cofnij restores 0 g;
 *  - a run WITH a customer instruction keeps the interactive semantics exactly,
 *    and the door accepts those plain-run routes only under a bootstrap-only
 *    session authorization.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeDirectionTarget, RecipeInput } from '@/engine';
import { AUTO_CROWN_SEED } from '@/features/formulation/crownBootstrapProvenance';
import { runHomeRecalculation } from '@/features/home-creator/homeRecalculation';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { ownerFruitRecipe, ownerFruitSnapshots } from './__fixtures__/ownerFruitMainFixture';
import {
  SERVED_FRUIT,
  SERVED_FRUIT_IDS,
  servedSorbetRecipe,
  servedSorbetSnapshots,
} from './__fixtures__/servedSorbetThreeFruitFixture';
import { commitPreview, type ConstraintPreview } from './applyPipeline';
import {
  applyPreviewWithServerAuthority,
  openDirectionFallbackPreviewWithServerAuthority,
  runInteractiveRecalculationWithTerminal,
  runPiRecalculationWithTerminal,
  selectCanonicalDraft,
  useConstraintStudioStore,
} from './constraintStudioStore';
import {
  computeOptimizePreviewResult,
  type OptimizePreviewComputation,
  type OptimizePreviewComputationRequest,
} from './optimizePreviewComputation';

vi.setConfig({ testTimeout: 180_000 });

/** Pass-through spy on the canonical Worker boundary, with a one-shot override. */
const solver = vi.hoisted(() => ({
  requests: [] as OptimizePreviewComputationRequest[],
  next: null as null | ((request: OptimizePreviewComputationRequest) => OptimizePreviewComputation),
}));

vi.mock('./optimizePreviewRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./optimizePreviewRuntime')>();
  return {
    ...actual,
    runOptimizePreviewOffMainThread: (
      ...args: Parameters<typeof actual.runOptimizePreviewOffMainThread>
    ) => {
      solver.requests.push(structuredClone(args[0]));
      const override = solver.next;
      if (override === null) return actual.runOptimizePreviewOffMainThread(...args);
      solver.next = null;
      return Promise.resolve(override(args[0]));
    },
  };
});

// The server-authority table: every submitted snapshot resolves as-is, every
// module validates. Only this network seam is faked.
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

type Surface = 'home' | 'pro';
type Profile = 'gelato' | 'sorbet';

const GELATO_MAINS = ['watermelon'] as const;
const mainsOf = (profile: Profile): readonly string[] =>
  profile === 'gelato' ? GELATO_MAINS : SERVED_FRUIT_IDS;

const withSweetness = (input: RecipeInput, sweetness: RecipeDirectionTarget): RecipeInput => ({
  ...input,
  goals: {
    ...input.goals,
    direction_targets: { flavor: 0, softness: 0, sweetness, creaminess: 0 },
    direction_targets_active: true,
  },
});

/**
 * The same draft on both surfaces. HOME: the automatic Main at 0 g (OD-1, the
 * Crown is mass-neutral). PRO: the same line crowned from 0 g at the 1 g
 * AUTO_CROWN_SEED, without re-budgeting the other lines — exactly what PRO's
 * Crown writes into its store.
 */
function recipeFor(
  surface: Surface,
  profile: Profile,
  sweetness: RecipeDirectionTarget,
): RecipeInput {
  if (profile === 'sorbet') {
    return withSweetness(
      surface === 'home'
        ? servedSorbetRecipe({ fruitGrams: 0, seeded: [] })
        : servedSorbetRecipe({ seeded: SERVED_FRUIT_IDS }),
      sweetness,
    );
  }
  const base = withSweetness(ownerFruitRecipe({ batch: 1000, watermelon: 0 }), sweetness);
  return {
    ...base,
    items: base.items.map((item) =>
      item.id !== 'watermelon'
        ? item
        : surface === 'home'
          ? { ...item, planned_grams: 0, main_ratio_weight: 1 }
          : { ...item, planned_grams: 1, main_ratio_weight: 1, amount_provenance: AUTO_CROWN_SEED },
    ),
  };
}

const snapshotsFor = (profile: Profile, input: RecipeInput) =>
  profile === 'gelato' ? ownerFruitSnapshots(input) : servedSorbetSnapshots(input);

function load(surface: Surface, profile: Profile, sweetness: RecipeDirectionTarget) {
  useRecipeStore.getState().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetForTests();
  const input = recipeFor(surface, profile, sweetness);
  useRecipeStore.getState().loadRecipeInput(input);
  const snapshots = snapshotsFor(profile, input);
  for (const item of useRecipeStore.getState().items) {
    const snapshot = snapshots[item.id];
    if (snapshot) useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshot);
  }
  solver.requests = [];
  solver.next = null;
}

/** HOME's ONE orchestration (its own bootstrap builder) vs PRO's plain Przelicz. */
const recalculate = (surface: Surface) =>
  surface === 'home' ? runHomeRecalculation() : runPiRecalculationWithTerminal();

/** Wall-clock stamps, timings and revision counters are not recipe content. */
const VOLATILE_KEYS = new Set([
  'createdAt',
  'runtimeMs',
  'totalRuntimeMs',
  'at',
  // A monotonic session counter: each surface loads its recipe in its own turn.
  'baseDraftRevision',
]);
const stable = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (key, nested: unknown) => (VOLATILE_KEYS.has(key) ? undefined : nested)),
  ) as T;

/**
 * The part of a Preview that is the SOLVER's answer. HOME additionally carries
 * the instruction proof and presents its diff against the recipe ON SCREEN
 * (0 g, not PRO's 1 g), so only the proposed side of the diff is compared.
 */
const solverAnswer = (preview: ConstraintPreview | null | undefined) => {
  if (!preview) return null;
  const rest: Partial<ConstraintPreview> = { ...preview };
  delete rest.previewInstructions;
  delete rest.lines;
  return stable({
    ...rest,
    proposedLines: preview.lines.map((line) => [line.lineId, line.afterGrams, line.locked]),
  });
};

function stagedState() {
  const studio = useConstraintStudioStore.getState();
  return {
    terminal: studio.recalculationTerminal,
    previewIssue: stable(studio.previewIssue),
    blocked: stable(studio.blocked),
    preview: solverAnswer(studio.preview),
    directionBestCandidate: solverAnswer(studio.directionBestCandidate),
    directionFallbackReport: stable(
      studio.directionFallbackReport && {
        ...studio.directionFallbackReport,
        attempts: studio.directionFallbackReport.attempts.map((attempt) => ({
          ...attempt,
          preview: solverAnswer(attempt.preview),
        })),
        best: studio.directionFallbackReport.best && {
          ...studio.directionFallbackReport.best,
          preview: solverAnswer(studio.directionFallbackReport.best.preview),
        },
      },
    ),
    // The diagnosis is the solver's; its base names the recipe on screen.
    lockConflict: stable(studio.lockConflict?.diagnosis ?? null),
    pendingInstructionCommit: studio.pendingInstructionCommit,
    rescueAdvice: stable(studio.rescueAdvice),
    suggestedFix: studio.suggestedFixAuthorization && {
      type: studio.suggestedFixAuthorization.type,
      lineId: studio.suggestedFixAuthorization.lineId,
      grams: studio.suggestedFixAuthorization.grams,
    },
  };
}

const recipeContent = () => {
  const recipe = useRecipeStore.getState();
  return stable({
    items: recipe.items,
    batch: recipe.target_batch_grams,
    directionTargets: recipe.direction_targets,
    constraints: selectCanonicalDraft().constraints,
  });
};

const gramsOf = (lineId: string) =>
  useRecipeStore.getState().items.find((item) => item.id === lineId)!.planned_grams;

/** The customer's Zastosuj on what the run staged (consent first when asked). */
async function applyStaged() {
  const studio = useConstraintStudioStore.getState();
  if (studio.preview === null && studio.directionBestCandidate !== null) {
    studio.acceptBestDirectionCandidate();
  }
  const staged = useConstraintStudioStore.getState().preview;
  if (staged === null) return null;
  await applyPreviewWithServerAuthority();
  const after = useConstraintStudioStore.getState();
  expect(after.blocked, JSON.stringify(after.blocked)).toBeNull();
  expect(after.preview).toBeNull();
  expect(after.history).toHaveLength(1);
  return staged;
}

async function runCell(surface: Surface, profile: Profile, sweetness: RecipeDirectionTarget) {
  load(surface, profile, sweetness);
  const before = structuredClone(useRecipeStore.getState().items);
  await recalculate(surface);
  // Owner OD-1: the run itself never writes the recipe.
  expect(useRecipeStore.getState().items).toEqual(before);
  const requests = stable(solver.requests);
  const staged = stagedState();
  const session = useConstraintStudioStore.getState();
  const proof = (session.preview ?? session.directionBestCandidate)?.previewInstructions;
  const authorization = session.previewInstructionAuthorization;
  const applied = await applyStaged();
  return {
    requests,
    staged,
    proof,
    authorization,
    // The Apply door's own canonical rebuild: it must solve the SAME draft.
    applyRequests: stable(solver.requests.slice(requests.length)),
    applied: applied && recipeContent(),
    appliedPreview: applied,
  };
}

const bootstrapLines = (profile: Profile) =>
  mainsOf(profile).map((lineId) => ({ lineId, grams: 1, locked: false, bootstrap: true }));

beforeEach(() => {
  solver.requests = [];
  solver.next = null;
  useRecipeStore.getState().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetForTests();
});

describe('owner §18 — a bootstrap-only HOME run IS the PRO seeded plain run', () => {
  for (const profile of ['gelato', 'sorbet'] as const) {
    for (const sweetness of [-1, 0, 1] as const) {
      it(`${profile}, sweetness ${sweetness}: same solver requests, same staged state, same applied recipe`, async () => {
        const pro = await runCell('pro', profile, sweetness);
        const home = await runCell('home', profile, sweetness);

        expect(home.requests.length).toBeGreaterThan(0);
        expect(home.requests).toEqual(pro.requests);
        expect(home.staged).toEqual(pro.staged);
        // The one session artefact PRO does not need: the copy's instruction
        // proof, bound to the recipe on screen, so Apply rebuilds the same copy.
        expect(pro.authorization).toBeNull();
        expect(home.authorization?.lines).toEqual(bootstrapLines(profile));
        expect(home.proof?.lines).toEqual(bootstrapLines(profile));

        expect(home.applied).not.toBeNull();
        expect(home.applyRequests).toEqual(pro.applyRequests);
        expect(home.applied).toEqual(pro.applied);
        // 0 g → the solver's grams, never the 1 g bootstrap.
        for (const lineId of mainsOf(profile)) {
          const sized = home.appliedPreview!.proposedInput.items.find(
            (item) => item.id === lineId,
          )!.planned_grams;
          expect(sized).toBeGreaterThan(1);
          expect(gramsOf(lineId)).toBe(sized);
        }
      });
    }
  }

  it('the measured defect: gelato sweetness −1 now runs the fallback ladder in HOME exactly as in PRO', async () => {
    const pro = await runCell('pro', 'gelato', -1);
    const home = await runCell('home', 'gelato', -1);
    expect(pro.requests).toHaveLength(2);
    expect(home.requests).toHaveLength(2);
    expect(home.staged.directionFallbackReport).not.toBeNull();
    expect(home.staged.directionFallbackReport).toEqual(pro.staged.directionFallbackReport);
  });

  it('the served sorbet shape: three 0 g Mains, sweetness ±1 — HOME gets PRO’s fallback report too', async () => {
    for (const sweetness of [-1, 1] as const) {
      const pro = await runCell('pro', 'sorbet', sweetness);
      const home = await runCell('home', 'sorbet', sweetness);
      expect(pro.staged.directionFallbackReport).not.toBeNull();
      expect(home.staged.directionFallbackReport).toEqual(pro.staged.directionFallbackReport);
    }
  });
});

describe('owner §18 — every route a bootstrap-only run stages crosses the one Apply door', () => {
  async function fallbackPath(surface: Surface) {
    load(surface, 'gelato', -1);
    const untouched = recipeContent();
    await recalculate(surface);
    expect(useConstraintStudioStore.getState().directionFallbackReport?.best).not.toBeNull();
    // „Ustaw 0" only prepares the Preview; it never writes Direction or grams.
    await openDirectionFallbackPreviewWithServerAuthority();
    const staged = useConstraintStudioStore.getState();
    expect(staged.preview?.directionFallback).toBeDefined();
    expect(recipeContent()).toEqual(untouched);
    const stagedAnswer = solverAnswer(staged.preview);
    const proof = staged.preview?.previewInstructions;
    const beforeApply = solver.requests.length;
    await applyPreviewWithServerAuthority();
    const applied = useConstraintStudioStore.getState();
    expect(applied.blocked, JSON.stringify(applied.blocked)).toBeNull();
    expect(applied.history).toHaveLength(1);
    // The door rebuilt the fallback candidate from the copy, as PRO's from its store.
    const applyRequests = stable(solver.requests.slice(beforeApply));
    expect(applyRequests).toHaveLength(1);
    return { stagedAnswer, proof, untouched, applyRequests, applied: recipeContent() };
  }

  it('Direction fallback „Ustaw 0": HOME applies 366/131/58/66 at sweetness 0, exactly as PRO', async () => {
    const pro = await fallbackPath('pro');
    const home = await fallbackPath('home');
    expect(pro.proof).toBeUndefined();
    expect(home.proof?.lines).toEqual(bootstrapLines('gelato'));
    expect(home.stagedAnswer).toEqual(pro.stagedAnswer);
    expect(home.applyRequests).toEqual(pro.applyRequests);
    expect(home.applied).toEqual(pro.applied);
    expect({
      watermelon: gramsOf('watermelon'),
      cream: gramsOf('cream'),
      sucrose: gramsOf('sucrose'),
      dextrose: gramsOf('dextrose'),
    }).toEqual({ watermelon: 366, cream: 131, sucrose: 58, dextrose: 66 });
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(0);
    expect(
      useRecipeStore.getState().items.find((item) => item.id === 'watermelon'),
    ).not.toHaveProperty('amount_provenance');

    // Cofnij restores the recipe as it was on screen: the Main back at 0 g.
    useConstraintStudioStore.getState().undoLastApply();
    await vi.waitFor(() => {
      expect(useConstraintStudioStore.getState().recalculationTerminal?.state).not.toBe('WORKING');
    });
    expect(gramsOf('watermelon')).toBe(0);
    expect(recipeContent()).toEqual(home.untouched);
  });

  it('Suggested Fix / lock recovery: staged on the copy, applied through the door, Main 0 g → solver grams', async () => {
    // A Sorbet whose only Main (WATERMELON, Main-capable, user-held) is the
    // priority line at 0 g, and the customer's own padlock on STRAWBERRIES at
    // 300 g. The canonical solve reports that padlock as the one impossible lock
    // with an Engine nearest amount of 150 g; everything after it — the fix
    // proposal, its server authority, the staging and the door — is the real one.
    // (On the gelato fixture the same fix is refused identically on BOTH surfaces:
    // the fix's own solve lifts WATERMELON above its 45 % hard limit.)
    const { strawberry, watermelon } = SERVED_FRUIT;
    const loadLockedSorbet = (surface: Surface) => {
      useRecipeStore.getState().resetToDemo();
      useRecipeProfileStore.getState().resetForTests();
      useConstraintStudioStore.getState().resetForTests();
      // Direction off: a Suggested Fix carries no Direction consent on either
      // surface, so an unreached neutral Direction would refuse it on both.
      const base = servedSorbetRecipe({
        mains: [watermelon],
        seeded: surface === 'pro' ? [watermelon] : [],
        directionActive: false,
      });
      const input: RecipeInput = {
        ...base,
        items: base.items.map((item) =>
          item.id === strawberry
            ? { ...item, planned_grams: 300 }
            : item.id === watermelon
              ? { ...item, planned_grams: surface === 'pro' ? 1 : 0 }
              : item,
        ),
      };
      useRecipeStore.getState().loadRecipeInput(input);
      const snapshots = servedSorbetSnapshots(input);
      for (const item of useRecipeStore.getState().items) {
        const snapshot = snapshots[item.id];
        if (snapshot) useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshot);
      }
      useConstraintStudioStore.getState().toggleLock(strawberry);
      solver.requests = [];
    };
    const impossible = (request: OptimizePreviewComputationRequest): OptimizePreviewComputation => {
      const locked = request.input.items.find((item) => item.id === strawberry)!;
      return {
        result: {
          ok: false,
          code: 'impossible_under_constraints',
          conflict: {
            lineId: strawberry,
            ingredientName: locked.ingredient.name,
            kind: 'locked',
            grams: locked.planned_grams,
          },
          hardViolatedMetrics: [],
          residualViolatedMetrics: [],
          capReached: false,
          nearestFeasibleGrams: 150,
          alternativeProductType: null,
          solverInvocations: 1,
        } as unknown as OptimizePreviewComputation['result'],
        rescueAdvice: null,
      };
    };
    const lockRecovery = async (surface: Surface) => {
      loadLockedSorbet(surface);
      const untouched = recipeContent();
      solver.next = impossible;
      await recalculate(surface);
      const staged = useConstraintStudioStore.getState();
      expect(staged.recalculationTerminal, JSON.stringify(staged.previewIssue)).toEqual({
        state: 'PREVIEW_READY',
      });
      expect(staged.preview?.kind).toBe('suggested_fix');
      expect(staged.preview?.safetyLockConflict).toMatchObject({
        lineId: strawberry,
        requiredGrams: 150,
        reason: 'constraint_feasibility',
      });
      expect(staged.suggestedFixAuthorization).toMatchObject({
        type: 'set_max',
        lineId: strawberry,
        grams: 150,
      });
      expect(recipeContent()).toEqual(untouched);
      const answer = solverAnswer(staged.preview);
      const proof = staged.preview?.previewInstructions;
      const sized = staged.preview!.proposedInput.items.find(
        (item) => item.id === watermelon,
      )!.planned_grams;
      await applyPreviewWithServerAuthority();
      const applied = useConstraintStudioStore.getState();
      expect(applied.blocked, JSON.stringify(applied.blocked)).toBeNull();
      expect(applied.history).toHaveLength(1);
      return { answer, proof, sized, applied: recipeContent() };
    };
    const pro = await lockRecovery('pro');
    const home = await lockRecovery('home');
    expect(pro.proof).toBeUndefined();
    expect(home.proof?.lines).toEqual([
      { lineId: watermelon, grams: 1, locked: false, bootstrap: true },
    ]);
    expect(home.answer).toEqual(pro.answer);
    expect(home.applied).toEqual(pro.applied);
    expect(gramsOf(strawberry)).toBe(150);
    expect(selectCanonicalDraft().constraints.byLineId[strawberry]).toEqual({
      mode: 'locked',
      grams: 150,
    });
    expect(home.sized).toBeGreaterThan(1);
    expect(gramsOf(watermelon)).toBe(home.sized);
  });

  it('automatic Crown-OFF correction: committed through the door on the copy, exactly as PRO', async () => {
    // A real Crown-OFF correction needs a draft with NO Main role
    // (`projectCrownOffMainTarget` leaves every crowned draft to the Crown
    // authority), and a bootstrap line is crowned by definition. So the genuine
    // canonical answer is stamped with the correction marker — the door does
    // not trust that marker, it re-derives and verifies everything else.
    const correction = (request: OptimizePreviewComputationRequest) => {
      const genuine = computeOptimizePreviewResult(request);
      if (!genuine.ok) throw new Error(`expected a genuine proposal, got ${genuine.code}`);
      const sized = genuine.preview.proposedInput.items.find((item) => item.id === 'watermelon')!;
      return {
        result: {
          ...genuine,
          preview: {
            ...genuine.preview,
            crownOffMainCorrection: {
              lineId: 'watermelon',
              ingredientName: sized.ingredient.name,
              requestedGrams: 900,
              selectedGrams: Math.round(sized.planned_grams),
              requestPreserved: false,
              limitingTechnicalRules: ['main_above_hard_limit'],
            },
          },
        },
        rescueAdvice: null,
      } satisfies OptimizePreviewComputation;
    };
    const corrected = async (surface: Surface) => {
      load(surface, 'gelato', 0);
      solver.next = correction;
      await recalculate(surface);
      const studio = useConstraintStudioStore.getState();
      expect(studio.blocked, JSON.stringify(studio.blocked)).toBeNull();
      expect(studio.preview).toBeNull();
      expect(studio.history).toHaveLength(1);
      expect(studio.correctionInFlight).toBe(false);
      return { notice: studio.crownOffCorrectionNotice, applied: recipeContent() };
    };
    const pro = await corrected('pro');
    const home = await corrected('home');
    expect(home.notice).not.toBeNull();
    expect(home.notice).toEqual(pro.notice);
    expect(home.applied).toEqual(pro.applied);
    expect(gramsOf('watermelon')).toBe(home.notice!.safeMaximumGrams);
    expect(gramsOf('watermelon')).toBeGreaterThan(1);
  });
});

describe('owner §18 — a customer instruction keeps the interactive session exactly', () => {
  it('HOME with a customer edit: one solve on the copy, no fallback ladder, both instructions authorized', async () => {
    load('home', 'gelato', -1);
    const before = recipeContent();
    await runHomeRecalculation([{ lineId: 'cranberry', grams: 20, locked: true }]);
    const studio = useConstraintStudioStore.getState();
    expect(solver.requests).toHaveLength(1);
    expect(studio.directionFallbackReport).toBeNull();
    expect(studio.recalculationTerminal?.state).toBe('PREVIEW_READY');
    expect(studio.previewInstructionAuthorization?.lines).toEqual([
      ...bootstrapLines('gelato'),
      { lineId: 'cranberry', grams: 20, locked: true },
    ]);
    expect(recipeContent()).toEqual(before);
  });

  it('PRO with a customer edit: the same interactive semantics as before', async () => {
    load('pro', 'gelato', -1);
    await runInteractiveRecalculationWithTerminal([
      { lineId: 'cranberry', grams: 20, locked: true },
    ]);
    const studio = useConstraintStudioStore.getState();
    expect(solver.requests).toHaveLength(1);
    expect(studio.directionFallbackReport).toBeNull();
    expect(studio.previewInstructionAuthorization?.lines).toEqual([
      { lineId: 'cranberry', grams: 20, locked: true },
    ]);
  });

  it('the door accepts a plain-run route only under a bootstrap-only session authorization', async () => {
    load('home', 'gelato', -1);
    await runHomeRecalculation();
    await openDirectionFallbackPreviewWithServerAuthority();
    const session = useConstraintStudioStore.getState();
    const preview = session.preview!;
    const authorization = session.previewInstructionAuthorization!;
    expect(preview.directionFallback).toBeDefined();
    const draft = selectCanonicalDraft();
    const attempt = (lines: typeof authorization.lines) =>
      commitPreview(
        draft.input,
        draft.constraints,
        preview,
        '2026-09-18T10:00:00.000Z',
        'door-check',
        draft.excludedIngredientIds,
        draft.revision,
        null,
        null,
        null,
        null,
        useRecipeStore.getState().productBehaviorSnapshots,
        [],
        session.proposalProductBehaviorAuthorization,
        null,
        { requirePracticalPreview: true },
        { ...authorization, lines },
      );
    // The same line, grams and padlock as a CUSTOMER instruction: the fingerprint
    // matches, but a customer session never carries a Direction fallback.
    expect(
      attempt(authorization.lines.map(({ lineId, grams, locked }) => ({ lineId, grams, locked }))),
    ).toMatchObject({ ok: false, code: 'stale_preview' });
    expect(attempt([])).toMatchObject({ ok: false, code: 'stale_preview' });
  });
});
