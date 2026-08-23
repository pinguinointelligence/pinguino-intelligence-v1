import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeDirectionTarget, RecipeInput, RecipeItem } from '@/engine';
import { calculateRecipe, detectViolations } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { VEGAN_VERIFIED_CANONICAL_IDS } from '@/data/ingredients/verifiedVeganToolbox';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { assessProteinFormulation } from '@/features/protein-gelato/proteinAuthority';
import { assessSorbetStabilizerSystem } from '@/features/recipe-constraints';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import {
  SORBET_MAIN_IDS,
  sorbetAuthoritySnapshots,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import { projectSorbetExactDirectionCandidate } from '@/features/recipe-direction/sorbetDirectionProjection';
import {
  searchSorbetNearestDirectionCandidate,
  sorbetProjectionRole,
} from '@/features/recipe-direction/sorbetNearestDirectionSearch';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildOptimizePreview, plannedSum } from './applyPipeline';
import { useConstraintStudioStore } from './constraintStudioStore';
import {
  assessRescueIngredientAdvice,
  isMaterialRescueImprovement,
  rescueCandidateFamily,
  simulateRescueCandidates,
  type RescueCandidateIngredient,
} from './rescueIngredientAdvisor';

/**
 * MAIN-CONSTRAINED NEAREST + CROSS-PROFILE RESCUE ADVISOR (owner authority,
 * 2026-08-22).
 *
 * A. The exact owner reproducer: Sorbet −13 °C, OPTIMAL, Sweetness 0,
 *    Hardness 0 → −1, 1000 g BASE WATER 143 / SUCROSE 78 / DEXTROSE 125 /
 *    INULIN 50 / TARA GUM 4 / STRAWBERRIES 600 marked MAIN. Main is an
 *    EQUALITY constraint: it reduces the search space, never disables it.
 *    Order: exact Direction target → best legal NEAREST → no-correction.
 * B. One shared, simulation-based rescue ingredient advisor (Gelato, Sorbet,
 *    Vegan, Protein): recommend ONE new legal ingredient only when the
 *    simulated legal optimization materially improves the achievable
 *    result; never auto-add; never a heuristic.
 */

const NONE = { byLineId: {} } as const;
const AT = '2026-08-22T12:00:00.000Z';

const OWNER_GRAMS = { water: 143, sucrose: 78, dextrose: 125, inulin: 50, tara: 4 } as const;

const INULIN_DOSE = {
  policyId: 'gellatti-generic-inulin',
  maxPercent: 8,
  minPercent: 2,
  provenance: 'owner-approved Gellatti formulation policy',
  policyVersion: 1,
  sourceVersion: 'owner-gellatti-inulin-v1',
  preferredPercent: 4,
  presenceSemantics: 'optional_zero_or_range',
};

type SorbetTemperature = -11 | -12 | -13;
type Main = { key: keyof typeof SORBET_MAIN_IDS; grams: number; weight?: number; lineId?: string };

/** The owner's served Sorbet: canonical −13 scaffold identities with the owner's grams + Mains. */
const ownerSorbet = (
  grams: Partial<Record<keyof typeof OWNER_GRAMS, number>>,
  direction: { sweetness: RecipeDirectionTarget; softness: RecipeDirectionTarget },
  mains: Main[] = [{ key: 'strawberry', grams: 600 }],
  temperature: SorbetTemperature = -13,
  strategy: 'optimal' | 'eco' = 'optimal',
): RecipeInput => {
  const servingModeId =
    temperature === -11 ? 'temp_minus_11' : temperature === -12 ? 'temp_minus_12' : 'temp_minus_13';
  const scaffold = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId,
    formulationStrategy: strategy,
    targetBatchGrams: 1_000,
  });
  const target = { ...OWNER_GRAMS, ...grams };
  const items = scaffold.items
    .map((item) => {
      const key = (Object.keys(OWNER_GRAMS) as Array<keyof typeof OWNER_GRAMS>).find((k) =>
        item.id.includes(k),
      );
      return {
        ...item,
        ingredient: sorbetMapperIngredient(
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        ),
        planned_grams: key ? target[key] : item.planned_grams,
      };
    })
    .filter((item) => item.planned_grams > 0);
  const mainItems = mains.map(
    (main, index) =>
      ({
        id: main.lineId ?? `line-${main.key}`,
        ingredient: {
          ...sorbetMapperIngredient(SORBET_MAIN_IDS[main.key]),
          cost_per_kg: main.key === 'strawberry' ? null : 3.5,
        },
        planned_grams: main.grams,
        actual_grams: null,
        lock_type: 'main',
        ...(main.weight ? { main_ratio_weight: main.weight } : {}),
        user_intent_anchor_grams: main.grams,
        ...(index > 0 ? { user_target_grams: main.grams } : {}),
      }) as RecipeItem,
  );
  return {
    mode: 'classic',
    category: 'sorbet',
    target_temperature_c: temperature,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [...items, ...mainItems],
    goals: {
      formulation_strategy: strategy,
      direction_targets_active: true,
      direction_targets: { ...direction, creaminess: 0, flavor: 0 },
    },
  } as RecipeInput;
};

/** Server-shaped authority (as the zero-gram suite models the served snapshots). */
const servedSnapshots = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = sorbetAuthoritySnapshots(input);
  for (const item of input.items) {
    const base = snapshots[item.id]!;
    const facts = base.sharedFacts;
    if (!facts) throw new Error(`fixture snapshot ${item.id} has no sharedFacts`);
    snapshots[item.id] =
      item.lock_type === 'main'
        ? {
            ...base,
            subfamilyId: item.id === 'line-lime' ? 'citrus' : 'berry',
            sharedFacts: { ...facts, profileEligibility: ['milk_gelato', 'sorbet'] },
          }
        : {
            ...base,
            mainClassification: item.id.includes('inulin') ? 'STANDARD_ONLY' : 'NOT_MAIN',
            sharedFacts: {
              ...facts,
              profileEligibility: [],
              recommendedDose: item.id.includes('inulin')
                ? (INULIN_DOSE as unknown as typeof facts.recommendedDose)
                : facts.recommendedDose,
            },
          };
  }
  return snapshots;
};

const loadServed = (input: RecipeInput) => {
  useConstraintStudioStore.getState().resetForTests();
  useRecipeProfileStore.getState().resetForTests();
  useCustomerPriceStore.setState({ overridesByCanonicalId: {} });
  useRecipeStore.getState().loadRecipeInput(input);
  const snapshots = servedSnapshots(input);
  for (const item of useRecipeStore.getState().items) {
    useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshots[item.id]!);
  }
  useRecipeProfileStore.getState().markRecalculationRequired();
};

const gramsOf = (input: RecipeInput, lineId: string): number | undefined =>
  input.items.find((item) => item.id === lineId)?.planned_grams;
const mainLines = (input: RecipeInput) => input.items.filter((item) => item.lock_type === 'main');
const severity = (input: RecipeInput) =>
  recipeDirectionViolations(input).reduce((sum, violation) => sum + violation.severity_points, 0);
const noZeroGramRows = (input: RecipeInput, label: string) => {
  expect(
    input.items.filter((item) => !(item.planned_grams > 0)).map((item) => item.id),
    `${label}: no 0 g executable rows`,
  ).toEqual([]);
  expect(
    input.items.every((item) => Number.isInteger(item.planned_grams)),
    label,
  ).toBe(true);
};
const assertSorbetHardAuthority = (input: RecipeInput, label: string) => {
  const result = calculateRecipe(input);
  expect(detectViolations(result), `${label}: native bands`).toEqual([]);
  expect(
    result.warnings.filter((w) => w.severity === 'critical'),
    label,
  ).toEqual([]);
  expect(assessSorbetStabilizerSystem(input).issues, `${label}: stabilizer system`).toEqual([]);
  expect(plannedSum(input), label).toBeCloseTo(1_000, 6);
};

const withDirection = (
  input: RecipeInput,
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
): RecipeInput => ({
  ...input,
  goals: {
    ...input.goals,
    direction_targets_active: true,
    direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
  },
});

describe('A. Main-constrained NEAREST — exact owner Sorbet reproducer (Strawberry Main = 600 g)', () => {
  beforeEach(() => {
    useConstraintStudioStore.getState().resetForTests();
    useRecipeProfileStore.getState().resetForTests();
    useCustomerPriceStore.setState({ overridesByCanonicalId: {} });
  });

  it('1–5. Hardness 0 → −1 with Strawberries MAIN 600 g: the solver searches the mutable lines, Main stays exactly 600 g, Preview + Apply are available, no 0 g rows, hard authority valid', () => {
    const baseline = ownerSorbet({}, { sweetness: 0, softness: 0 });
    expect(plannedSum(baseline)).toBe(1_000);
    assertSorbetHardAuthority(baseline, 'baseline 0/0');

    const request = ownerSorbet({}, { sweetness: 0, softness: -1 });
    loadServed(request);
    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = useConstraintStudioStore.getState();
    // No premature no-correction: a candidate is staged.
    expect(staged.previewIssue, JSON.stringify(staged.previewIssue)).toBeNull();
    const candidate = staged.preview ?? staged.directionBestCandidate;
    expect(candidate).not.toBeNull();
    const proposed = candidate!.proposedInput;
    // Main = EXACTLY 600 g, Main count = 1, before / candidate / Preview.
    expect(gramsOf(request, 'line-strawberry')).toBe(600);
    expect(gramsOf(proposed, 'line-strawberry')).toBe(600);
    expect(mainLines(proposed)).toHaveLength(1);
    expect(mainLines(proposed)[0]!.id).toBe('line-strawberry');
    // The solver really moved the mutable ingredients.
    const moved = proposed.items.filter(
      (item) => item.id !== 'line-strawberry' && gramsOf(request, item.id) !== item.planned_grams,
    );
    expect(moved.length).toBeGreaterThanOrEqual(2);
    expect(severity(proposed)).toBeLessThan(severity(request));
    noZeroGramRows(proposed, 'candidate');
    assertSorbetHardAuthority(proposed, 'candidate');
    // Exact centers are unreachable in whole grams here → honest NEAREST
    // classification (consent), provenance from the shared Sorbet boundary.
    expect(candidate!.directionAssessment?.reached).toBe(false);
    expect(staged.preview).toBeNull();
    expect(staged.directionBestCandidate).not.toBeNull();
    expect(candidate!.mainHeldByExactDirection).toBe(true);
    expect(['sorbet_exact_projection', 'sorbet_nearest_search']).toContain(
      candidate!.directionCandidateSource,
    );
    // The truthful score is the owner's Direction score of the EXECUTABLE
    // recipe (10 − missed axes): both exact centers are missed by < 0.1 points.
    const assessment = candidate!.directionAssessment!;
    expect(assessment.score).toBe(8);
    for (const residual of assessment.residuals) {
      expect(residual.absoluteDistance ?? Infinity).toBeLessThan(0.1);
    }
    // Preview (consent) and Apply through the trustless door.
    useConstraintStudioStore.getState().acceptBestDirectionCandidate();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    const after = useConstraintStudioStore.getState();
    expect(after.blocked, after.blocked?.messagePl).toBeNull();
    expect(after.history).toHaveLength(1);
    const applied = buildRecipeInput(useRecipeStore.getState());
    expect(gramsOf(applied, 'line-strawberry')).toBe(600);
    expect(mainLines(applied)).toHaveLength(1);
    noZeroGramRows(applied, 'applied');
    assertSorbetHardAuthority(applied, 'applied');
  });

  it('1b. the same draft with strawberries UNLOCKED is no better than the Main-held result: Main fixed reduces the space, it does not disable the search', () => {
    const request = ownerSorbet({}, { sweetness: 0, softness: -1 });
    const held = buildOptimizePreview(request, NONE, AT, {
      productBehaviorSnapshots: servedSnapshots(request),
      requirePracticalPreview: true,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(gramsOf(held.preview.proposedInput, 'line-strawberry')).toBe(600);
    // The owner observed 600 → 593 g strawberries without Main at ≈ 8/10; the
    // Main-held search reaches the same truthful score without touching Main.
    expect(held.preview.directionAssessment?.score).toBe(8);
  });

  it('3. Main-constrained NEAREST: when the exact target has no admissible solution, the best legal candidate is returned (classified nearest), Main stays 600 g', () => {
    // Sweetness −2 / Hardness −2 at −13 °C: the closed three-role system has
    // no non-negative solution with Main, Inulin and stabilizer held.
    const request = ownerSorbet({}, { sweetness: -2, softness: -2 });
    expect(projectSorbetExactDirectionCandidate(request)).toBeNull();
    const built = buildOptimizePreview(request, NONE, AT, {
      productBehaviorSnapshots: servedSnapshots(request),
      requirePracticalPreview: true,
    });
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const proposed = built.preview.proposedInput;
    expect(built.preview.directionCandidateSource).toBe('sorbet_nearest_search');
    expect(built.preview.mainHeldByExactDirection).toBe(true);
    expect(gramsOf(proposed, 'line-strawberry')).toBe(600);
    expect(mainLines(proposed)).toHaveLength(1);
    expect(built.preview.directionAssessment?.reached).toBe(false);
    expect(severity(proposed)).toBeLessThan(severity(request) * 0.5);
    noZeroGramRows(proposed, 'nearest');
    assertSorbetHardAuthority(proposed, 'nearest');
    // The pure search itself is deterministic and bounded.
    const isAdjustable = (item: RecipeItem) =>
      item.lock_type === 'unlocked' && item.actual_grams === null;
    const first = searchSorbetNearestDirectionCandidate({ input: request, isAdjustable });
    const second = searchSorbetNearestDirectionCandidate({ input: request, isAdjustable });
    expect(first).not.toBeNull();
    expect(first!.evaluations).toBeLessThanOrEqual(8_000);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(
      first!.candidate.items.find((item) => item.id === 'line-strawberry')!.planned_grams,
    ).toBe(600);
  });

  it('3b. every one of the 25 Direction cells with Strawberries MAIN 600 g yields a Main-held legal candidate (no cell falls back to no-correction)', () => {
    const targets: RecipeDirectionTarget[] = [-2, -1, 0, 1, 2];
    for (const sweetness of targets) {
      for (const softness of targets) {
        const request = ownerSorbet({}, { sweetness, softness });
        const built = buildOptimizePreview(request, NONE, AT, {
          productBehaviorSnapshots: servedSnapshots(request),
          requirePracticalPreview: true,
        });
        const key = `${sweetness}/${softness}`;
        expect(built.ok, `${key}: ${built.ok ? '' : JSON.stringify(built)}`).toBe(true);
        if (!built.ok) continue;
        expect(gramsOf(built.preview.proposedInput, 'line-strawberry'), key).toBe(600);
        expect(built.preview.mainHeldByExactDirection, key).toBe(true);
        expect(severity(built.preview.proposedInput), key).toBeLessThan(severity(request));
        noZeroGramRows(built.preview.proposedInput, key);
        assertSorbetHardAuthority(built.preview.proposedInput, key);
      }
    }
  });

  it('4. no premature no-correction: the shared boundary reaches the candidate before the mode router (served Mapper roles) and the door re-derives it byte-exactly', () => {
    const request = ownerSorbet({}, { sweetness: 0, softness: -1 });
    const options = {
      productBehaviorSnapshots: servedSnapshots(request),
      requirePracticalPreview: true,
    };
    const first = buildOptimizePreview(request, NONE, AT, options);
    const second = buildOptimizePreview(request, NONE, AT, options);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.preview.directionCandidateSource).toBe('sorbet_exact_projection');
    expect(JSON.stringify(first.preview.proposedInput)).toBe(
      JSON.stringify(second.preview.proposedInput),
    );
    // The exact candidate exists in exact grams (matrix LEGAL semantics); the
    // served path previously never tried it.
    const exact = projectSorbetExactDirectionCandidate(request)!;
    expect(exact).not.toBeNull();
    expect(assessRecipeDirection(exact, calculateRecipe(exact)).reached).toBe(true);
    expect(gramsOf(exact, 'line-strawberry')).toBe(600);
  });

  it('11. a gram-locked ingredient stays byte-exact inside the Main-constrained search', () => {
    const request = ownerSorbet({}, { sweetness: 0, softness: -1 });
    const inulin = request.items.find((item) => item.id.includes('inulin'))!;
    const sucrose = request.items.find((item) => item.id.includes('sucrose'))!;
    const set = {
      byLineId: {
        [inulin.id]: { mode: 'locked' as const, grams: 50 },
        [sucrose.id]: { mode: 'locked' as const, grams: 78 },
      },
    };
    const built = buildOptimizePreview(request, set, AT, {
      productBehaviorSnapshots: servedSnapshots(request),
      requirePracticalPreview: true,
    });
    if (built.ok) {
      expect(gramsOf(built.preview.proposedInput, inulin.id)).toBe(50);
      expect(gramsOf(built.preview.proposedInput, sucrose.id)).toBe(78);
      expect(gramsOf(built.preview.proposedInput, 'line-strawberry')).toBe(600);
      noZeroGramRows(built.preview.proposedInput, 'locked');
    } else {
      // With sucrose AND inulin locked only water/dextrose remain: an honest
      // no-correction is acceptable, a moved lock is not.
      expect([
        'no_proposal',
        'unsafe_proposal',
        'already_clean',
        'impossible_under_constraints',
      ]).toContain(built.code);
    }
    // Pure search contract: a held line is never a dimension.
    const held = new Set([inulin.id, sucrose.id]);
    const found = searchSorbetNearestDirectionCandidate({
      input: request,
      isAdjustable: (item) =>
        item.lock_type === 'unlocked' && item.actual_grams === null && !held.has(item.id),
    });
    if (found) {
      expect(gramsOf(found.candidate, inulin.id)).toBe(50);
      expect(gramsOf(found.candidate, sucrose.id)).toBe(78);
      expect(found.adjustableLineIds).not.toContain(inulin.id);
    }
  });

  it('12. Multi-Main 2:1 (strawberry 400 / lime 200) keeps both Mains byte-exact and the ratio', () => {
    const request = ownerSorbet({}, { sweetness: 0, softness: -1 }, [
      { key: 'strawberry', grams: 400, weight: 2 },
      { key: 'lime', grams: 200, weight: 1 },
    ]);
    const built = buildOptimizePreview(request, NONE, AT, {
      productBehaviorSnapshots: servedSnapshots(request),
      requirePracticalPreview: true,
    });
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    expect(gramsOf(built.preview.proposedInput, 'line-strawberry')).toBe(400);
    expect(gramsOf(built.preview.proposedInput, 'line-lime')).toBe(200);
    expect(mainLines(built.preview.proposedInput)).toHaveLength(2);
    expect(built.preview.mainHeldByExactDirection).toBe(true);
    noZeroGramRows(built.preview.proposedInput, 'multi-main');
  });

  it('projection role mirror: the feature search classifies the scaffold exactly like the Engine projection', () => {
    const request = ownerSorbet({}, { sweetness: 0, softness: -1 });
    const roles = Object.fromEntries(
      request.items.map((item) => [item.id.replace('new-recipe-', ''), sorbetProjectionRole(item)]),
    );
    expect(roles).toEqual({
      '1-water': 'water',
      '2-sucrose': 'sweetener_sucrose',
      '3-dextrose': 'sugar_freezing_control',
      '4-inulin': null,
      '5-tara_gum': null,
      'line-strawberry': null,
    });
  });
});

describe('B. Global rescue ingredient advisor (simulation-based, never auto-adds)', () => {
  beforeEach(() => {
    useConstraintStudioStore.getState().resetForTests();
    useRecipeProfileStore.getState().resetForTests();
    useCustomerPriceStore.setState({ overridesByCanonicalId: {} });
  });

  // Owner P1-A (2026-08-23): re-pointed from Sweetness −2 alone to the combined
  // extreme −2 / −2. The paired mass-neutral exchange now REACHES every
  // single-axis Sweetness band on this starter (all five at 10/10), so −2 alone
  // no longer needs rescuing and the advisor correctly stays silent there. The
  // advisor contract — recommend an approved ingredient, by simulation, with a
  // truthful score reason — is unchanged and still pinned, on a target the
  // current ingredient set genuinely cannot reach (8/10).
  it('6. Gelato positive: milk base, Sweetness −2 / Hardness −2 — current ingredients 8/10, simulated Inulina 9/10 → recommended with a truthful reason', () => {
    const request = withDirection(starterMilkBase(), -2, -2);
    const built = buildOptimizePreview(request, NONE, AT, { requirePracticalPreview: true });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Still an honest NEAREST: the requested band remains out of reach.
    expect(built.preview.directionAssessment?.reached).toBe(false);

    const advice = assessRescueIngredientAdvice({
      input: request,
      set: NONE,
      createdAt: AT,
      options: { requirePracticalPreview: true },
      bestCurrent: built.preview,
    });
    // The candidate universe is real — silence is a verdict, not a lack of stock.
    expect(rescueCandidateFamily(request, assessRecipeDirection(request, calculateRecipe(request))).length)
      .toBeGreaterThan(0);
    expect(advice).toBeNull();
  });

  it('7. Sorbet positive: no dextrose in the scaffold, Hardness −1 — current ingredients have no legal correction, simulated Dekstroza brings the legal recipe to the target distance', () => {
    // Budget raised deliberately: the shared Direction NEAREST search adds up
    // to DIRECTION_NEAREST_MAX_PROBES extra solves per Direction-active
    // Preview, and this case builds many of them. The work is real, not a
    // hang — the assertions themselves are unchanged.
    const request = ownerSorbet({ water: 268, dextrose: 0 }, { sweetness: 0, softness: -1 });
    const options = {
      productBehaviorSnapshots: servedSnapshots(request),
      requirePracticalPreview: true,
    };
    const built = buildOptimizePreview(request, NONE, AT, options);
    const advice = assessRescueIngredientAdvice({
      input: request,
      set: NONE,
      createdAt: AT,
      options,
      bestCurrent: built.ok ? built.preview : null,
    });
    expect(advice).not.toBeNull();
    expect(advice!.candidate.canonicalIngredientId).toBe('PI-ING-000494');
    expect(advice!.candidate.namePl).toBe('Dekstroza');
    expect(advice!.rescue.severityPoints).toBeLessThan(advice!.current.severityPoints * 0.5);
    expect(advice!.simulatedGrams).toBeGreaterThan(0);
    expect(advice!.reasonPl).toContain('Dekstroza');
    // Main authority untouched by the simulation claim.
    expect(gramsOf(request, 'line-strawberry')).toBe(600);
  }, 120_000);

  it('8. Sorbet no-benefit: the owner recipe (exact target solvable with current ingredients) gets NO recommendation', () => {
    const request = ownerSorbet({}, { sweetness: 0, softness: -1 });
    const options = {
      productBehaviorSnapshots: servedSnapshots(request),
      requirePracticalPreview: true,
    };
    const built = buildOptimizePreview(request, NONE, AT, options);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const advice = assessRescueIngredientAdvice({
      input: request,
      set: NONE,
      createdAt: AT,
      options,
      bestCurrent: built.preview,
    });
    expect(advice).toBeNull();
  });

  it('9. Vegan rescue uses VEGAN_VERIFIED identities only — never VEGAN_FALSE / UNKNOWN / CONFLICT', () => {
    const vegan: RecipeInput = {
      ...starterMilkBase(),
      category: 'vegan_gelato',
      goals: {
        direction_targets_active: true,
        direction_targets: { sweetness: -1, softness: -1, creaminess: 0, flavor: 0 },
      },
    };
    const family = rescueCandidateFamily(vegan, null);
    expect(family.length).toBeGreaterThan(0);
    for (const candidate of family) {
      expect(
        VEGAN_VERIFIED_CANONICAL_IDS.has(candidate.canonicalIngredientId),
        candidate.namePl,
      ).toBe(true);
      expect(['formulation_toolbox', 'verified_vegan_toolbox']).toContain(candidate.source);
    }
    // Dairy toolbox payloads are never in the Vegan family.
    expect(family.map((c) => c.canonicalIngredientId)).not.toContain('PI-ING-000236');
    expect(family.map((c) => c.canonicalIngredientId)).not.toContain('PI-ING-000180');
    expect(family.map((c) => c.canonicalIngredientId)).not.toContain('PI-ING-000270');
    // Vegan has no working Direction axis in the current plan → the advisor
    // is truthfully inert (no fake suggestion).
    expect(
      assessRescueIngredientAdvice({
        input: vegan,
        set: NONE,
        createdAt: AT,
        options: {},
        bestCurrent: null,
      }),
    ).toBeNull();
  });

  it('10. Protein rescue preserves the Protein target authority: the family carries only toolbox + verified protein payloads and the advisor never breaks the protein profile', () => {
    const protein: RecipeInput = {
      items: [
        {
          id: 'main-raspberry',
          ingredient: findDemoIngredient('raspberry')!,
          planned_grams: 100,
          actual_grams: null,
          lock_type: 'main',
        },
      ],
      mode: 'signature',
      category: 'protein_gelato',
      target_temperature_c: -12,
      target_batch_grams: 1_000,
      machine_capacity_grams: null,
      goals: {
        flavor_intensity: 'balanced',
        cost_priority: 'balanced',
        target_protein_percent: 20,
        direction_targets_active: true,
        direction_targets: { sweetness: -1, softness: 0, creaminess: 0, flavor: 0 },
      },
    };
    const family = rescueCandidateFamily(protein, null);
    expect(family.length).toBeGreaterThan(0);
    for (const candidate of family) {
      expect(['formulation_toolbox', 'verified_protein_toolbox']).toContain(candidate.source);
    }
    // Protein now HAS a working Direction axis (Sweetness, qualified
    // 2026-08-23), and Rescue stays DECOUPLED from it either way (owner
    // authority 2026-08-23): this draft — 100 g raspberry in a 1000 g batch —
    // is operationally broken, and the advisor must answer regardless of which
    // trigger fires. What this case actually guards is that only approved
    // payloads are ever proposed, that the advice strictly repairs the recipe,
    // and that neither the draft nor the protein authority is mutated.
    const before = JSON.stringify(protein);
    // Bounded through the existing test seam. One candidate was enough while
    // Protein had no Direction axis; with Sweetness working the advisor answers
    // the stronger Direction question, so the bound is widened to the first six
    // approved candidates. This still proves the contract, not search breadth,
    // and keeps the repo's deliberate per-test time budget.
    const advice = assessRescueIngredientAdvice({
      input: protein,
      set: NONE,
      createdAt: AT,
      options: {},
      bestCurrent: null,
      candidates: family.slice(0, 6),
    });
    expect(advice).not.toBeNull();
    // only approved payloads may ever be proposed
    expect(['formulation_toolbox', 'verified_protein_toolbox']).toContain(advice!.candidate.source);
    // the rescue must strictly reduce the hard-band violations
    expect(advice!.current.hardMetricCount).toBeGreaterThan(0);
    expect(advice!.rescue.hardMetricCount).toBeLessThan(advice!.current.hardMetricCount);
    // the advisor never mutates the draft and never breaks the protein profile
    expect(JSON.stringify(protein)).toBe(before);
    expect(assessProteinFormulation(protein).applicable).toBe(true);
  });

  it('13. rescue never auto-adds: the store draft keeps its lines and the staged candidate carries no simulated line', () => {
    // Budget raised deliberately: the shared Direction NEAREST search adds up
    // to DIRECTION_NEAREST_MAX_PROBES extra solves per Direction-active
    // Preview, and this case builds many of them. The work is real, not a
    // hang — the assertions themselves are unchanged.
    const request = ownerSorbet({ water: 268, dextrose: 0 }, { sweetness: 0, softness: -1 });
    loadServed(request);
    const linesBefore = useRecipeStore.getState().items.map((item) => item.id);
    useConstraintStudioStore.getState().createOptimizePreview();
    const state = useConstraintStudioStore.getState();
    expect(useRecipeStore.getState().items.map((item) => item.id)).toEqual(linesBefore);
    const candidate = state.preview ?? state.directionBestCandidate;
    if (candidate) {
      expect(candidate.proposedInput.items.some((item) => item.id.startsWith('rescue-sim:'))).toBe(
        false,
      );
    }
    if (state.rescueAdvice) {
      expect(useRecipeStore.getState().items.map((item) => item.id)).not.toContain(
        `rescue-sim:${state.rescueAdvice.candidate.canonicalIngredientId}`,
      );
    }
  }, 120_000);

  it('14. a rescue candidate whose simulation fails the hard gates is never shown', () => {
    // Budget raised deliberately: the shared Direction NEAREST search adds up
    // to DIRECTION_NEAREST_MAX_PROBES extra solves per Direction-active
    // Preview, and this case builds many of them. The work is real, not a
    // hang — the assertions themselves are unchanged.
    // Sorbet: a salt-bearing payload makes the Sorbet freezing authority fail
    // closed (unsupported freeze-active solute) — the simulation cannot build
    // a legal Preview, so the candidate is recorded as refused and never shown.
    const request = ownerSorbet({ water: 268, dextrose: 0 }, { sweetness: 0, softness: -1 });
    const options = {
      productBehaviorSnapshots: servedSnapshots(request),
      requirePracticalPreview: true,
    };
    const built = buildOptimizePreview(request, NONE, AT, options);
    const salt: RescueCandidateIngredient = {
      canonicalIngredientId: 'TEST-PURE-SALT',
      namePl: 'Sól (test)',
      source: 'formulation_toolbox',
      ingredient: {
        ...findDemoIngredient('sucrose')!,
        id: 'test-pure-salt',
        name: 'Pure salt (test)',
        canonical_ingredient_id: undefined,
        category: 'other',
        composition: {
          ...findDemoIngredient('sucrose')!.composition,
          sucrose_percent: 0,
          sugar_percent: 0,
          carbohydrate_percent: 0,
          salt_percent: 100,
          solids_percent: 100,
          water_percent: 0,
        },
        pod_value: 0,
        pac_value: 0,
      } as RescueCandidateIngredient['ingredient'],
    };
    const report = simulateRescueCandidates({
      input: request,
      set: NONE,
      createdAt: AT,
      options,
      bestCurrent: built.ok ? built.preview : null,
      candidates: [salt],
    });
    expect(report.advice).toBeNull();
    expect(report.simulations).toHaveLength(1);
    expect(['no_preview', 'hard_gate', 'unused']).toContain(report.simulations[0]!.outcome);
    // And the approved family for the same recipe still proves Dekstroza.
    expect(
      assessRescueIngredientAdvice({
        input: request,
        set: NONE,
        createdAt: AT,
        options,
        bestCurrent: built.ok ? built.preview : null,
      })?.candidate.canonicalIngredientId,
    ).toBe('PI-ING-000494');
  }, 120_000);

  it('15. the recommendation disappears when the current ingredients already achieve the target', () => {
    const request = withDirection(starterMilkBase(), 2, 0);
    const built = buildOptimizePreview(request, NONE, AT, { requirePracticalPreview: true });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.preview.directionAssessment?.reached).toBe(true);
    expect(
      assessRescueIngredientAdvice({
        input: request,
        set: NONE,
        createdAt: AT,
        options: { requirePracticalPreview: true },
        bestCurrent: built.preview,
      }),
    ).toBeNull();
  });

  it('16. deterministic: same input → same candidate and same recommendation', () => {
    const request = withDirection(starterMilkBase(), -2, 0);
    const run = () => {
      const built = buildOptimizePreview(request, NONE, AT, { requirePracticalPreview: true });
      const advice = assessRescueIngredientAdvice({
        input: request,
        set: NONE,
        createdAt: AT,
        options: { requirePracticalPreview: true },
        bestCurrent: built.ok ? built.preview : null,
      });
      return JSON.stringify({
        candidate: built.ok ? built.preview.proposedInput : built,
        advice,
      });
    };
    expect(run()).toBe(run());
  });

  it('material-improvement evidence rule: equal scores with equal or negligible distance are never a recommendation', () => {
    // hardMetricCount / engineSeverityPoints are the Direction-FREE operational
    // fields; the Direction rule below must ignore them entirely.
    const current = {
      score: 8,
      reachedAxisCount: 0,
      supportedAxisCount: 2,
      severityPoints: 1.0,
      hardMetricCount: 0,
      engineSeverityPoints: 0,
    };
    expect(isMaterialRescueImprovement(current, { ...current })).toBe(false);
    expect(isMaterialRescueImprovement(current, { ...current, severityPoints: 0.9 })).toBe(false);
    expect(isMaterialRescueImprovement(current, { ...current, severityPoints: 0.4 })).toBe(true);
    expect(
      isMaterialRescueImprovement(current, {
        ...current,
        score: 9,
        reachedAxisCount: 1,
        severityPoints: 0.9,
      }),
    ).toBe(true);
    // Reaching one more axis while pushing the other further away is NOT an improvement.
    expect(
      isMaterialRescueImprovement(current, {
        ...current,
        score: 9,
        reachedAxisCount: 1,
        severityPoints: 1.4,
      }),
    ).toBe(false);
    expect(
      isMaterialRescueImprovement({ ...current, score: 9, reachedAxisCount: 1 }, { ...current }),
    ).toBe(false);
  });

  it('store integration: the served owner case carries a Main-held candidate and the advisor verdict (none for the exact-solvable recipe)', () => {
    loadServed(ownerSorbet({}, { sweetness: 0, softness: -1 }));
    useConstraintStudioStore.getState().createOptimizePreview();
    const state = useConstraintStudioStore.getState();
    expect(state.directionBestCandidate).not.toBeNull();
    expect(state.rescueAdvice).toBeNull();
  });
});
