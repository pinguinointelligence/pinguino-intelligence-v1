/**
 * CRITICAL ACCEPTANCE ADDENDUM (owner, 2026-07-24) — the four exact closures,
 * each re-run through the REAL pipeline (`buildOptimizePreview` →
 * `commitPreview` — the only preview builder and the only Apply door):
 *
 *  addendum1 — T9 APPLICABILITY GATE: a formulation result with stop reason
 *    `iteration_cap` is NEVER an applicable recipe (`iteration_cap` can NEVER
 *    be labelled best-achievable proof). Strawberry EXACT 900 g / Gelato
 *    1000 g returns the honest impossible with the Polish conflict message,
 *    the deterministic engine-verified nearest-feasible lock (A3 bisection)
 *    and the switch-to-Sorbet alternative. Door-enforced, not UI-only.
 *    Genuinely feasible constrained results (fixed-point proofs WITHOUT the
 *    cap) stay applicable as before.
 *
 *  addendum2 — SCORE SPLIT (public contract only, NO engine change): the
 *    public headline is „Dopasowanie techniczne" derived from the technical/
 *    band dimension (all native bands in range ⇒ 10/10); flavor/cost are
 *    separate labeled dimensions, never blended into the headline.
 *
 *  addendum3 — HARD RESIDUALS: `hardSafe=false` (residual violations HARD by
 *    native band provenance via violationBands) ⇒ DIAGNOSTIC PREVIEW ONLY —
 *    Apply blocked at the commitPreview door with the honest Polish message
 *    listing the hard metrics (T14/T19). SUPERSEDES the earlier
 *    accept-with-explanation freeze for hard-native residuals; soft/
 *    provisional residuals stay applicable with explanation.
 *
 *  addendum4 — MAX/RANGE SEMANTICS: T12's canonical constraint IS
 *    `{mode:'range', minGrams:0, maxGrams:500}` (never a lock_type='grams'/
 *    exact encoding in the §17 set); a max bound leaves the solver free to
 *    land BELOW it; exact-500 vs max-500 are different representations with
 *    different solver freedom; range bounds round-trip through preview+apply.
 */
import { describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { DEFAULT_CORRECTION_CANDIDATES, calculateRecipe, detectViolations } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  buildOptimizePreview,
  commitPreview,
  plannedSum,
  type BuildPreviewResult,
  type ConstraintPreview,
} from '@/features/constraint-studio/applyPipeline';
import { previewIssueMessagePl } from '@/features/constraint-studio/previewIssueMessage';
import {
  selectCanonicalDraft,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { verifyConstraintsPreserved, type ConstraintSet } from '@/features/recipe-constraints';
import { recipeTechnicalFit, recipeMatchScore, commercialDimensions } from '@/features/recipe-score';
import { classifyViolationBands } from './violationBands';

/* ── the owner's EXACT T-case fixtures (mirrors qa/engine-authenticity) ───── */

const WATER = DEFAULT_CORRECTION_CANDIDATES.find((c) => c.id === 'water')!.ingredient;
const STRAWBERRIES = (): EngineIngredient => ({
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
});

const line = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  lock: 'unlocked' | 'grams' = 'unlocked',
) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null as number | null,
  lock_type: lock as 'unlocked',
});

const input = (
  items: ReturnType<typeof line>[],
  category: RecipeInput['category'],
  temp = -11,
  batch = 1000,
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: temp,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items,
});

/** T9 — Strawberry EXACT 900 g, Milk 0 g unlocked, Fruit Gelato −11 / 1000 g. */
const t9 = () => ({
  input: input(
    [line('l-straw', STRAWBERRIES(), 900, 'grams'), line('l-milk', findDemoIngredient('milk_3_5')!, 0)],
    'fruit_gelato',
  ),
  set: { byLineId: { 'l-straw': { mode: 'locked' as const, grams: 900 } } } satisfies ConstraintSet,
});

/** The owner's 1120 g milk-500 draft (T11 exact / T12 max fixtures). */
const milk500Items = () => [
  line('l-straw', STRAWBERRIES(), 350),
  line('l-milk', findDemoIngredient('milk_3_5')!, 500, 'grams'),
  line('l-cream', findDemoIngredient('cream_30')!, 80),
  line('l-smp', findDemoIngredient('smp')!, 40),
  line('l-suc', findDemoIngredient('sucrose')!, 110),
  line('l-dex', findDemoIngredient('dextrose')!, 35),
  line('l-tara', findDemoIngredient('tara_gum')!, 5),
  line('l-water', WATER, 0),
];
const T11_SET: ConstraintSet = { byLineId: { 'l-milk': { mode: 'locked', grams: 500 } } };
const T12_SET: ConstraintSet = { byLineId: { 'l-milk': { mode: 'range', minGrams: 0, maxGrams: 500 } } };

/** T14 — the owner sorbet fixture, inulin locked at 0 (944.6 g draft). */
const t14 = () => ({
  input: input(
    [
      line('l-straw', STRAWBERRIES(), 600),
      line('l-water', WATER, 181),
      line('l-suc', findDemoIngredient('sucrose')!, 103.8),
      line('l-dex', findDemoIngredient('dextrose')!, 59),
      line('l-inulin', findDemoIngredient('inulin')!, 0, 'grams'),
      line('l-tara', findDemoIngredient('tara_gum')!, 0.8),
    ],
    'sorbet',
  ),
  set: { byLineId: { 'l-inulin': { mode: 'locked' as const, grams: 0 } } } satisfies ConstraintSet,
});

/** T17 — Gelato −12 unconstrained (native milk_gelato profile). */
const t17 = () => ({
  input: input([line('l-milk', findDemoIngredient('milk_3_5')!, 0)], 'milk_gelato', -12),
  set: { byLineId: {} } satisfies ConstraintSet,
});

/** T19 — Sorbet from Strawberry 0 g unlocked, no constraints. */
const t19 = () => ({
  input: input([line('l-straw', STRAWBERRIES(), 0)], 'sorbet'),
  set: { byLineId: {} } satisfies ConstraintSet,
});

const buildOk = (result: BuildPreviewResult): ConstraintPreview => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected a preview');
  return result.preview;
};

/* ═══ addendum1 — T9 APPLICABILITY GATE ═══════════════════════════════════ */

describe('addendum1 — iteration_cap is NEVER an applicable recipe (T9)', () => {
  it('T9 (strawberry EXACT 900 g) returns the honest impossible, never a Preview', () => {
    const { input: rec, set } = t9();
    const result = buildOptimizePreview(rec, set, 'now');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('impossible_under_constraints');
    if (result.code !== 'impossible_under_constraints') return;
    // The cap really fired — and is named, never laundered into a proof.
    expect(result.capReached).toBe(true);
    expect(result.iteration.stopReason).toBe('iteration_cap');
    expect(result.iteration.capped).toBe(true);
    // The exact conflict: the 900 g strawberry lock.
    expect(result.conflict).toMatchObject({
      lineId: 'l-straw',
      ingredientName: 'STRAWBERRIES · Fresh Fruit',
      kind: 'locked',
      grams: 900,
    });
    // Deterministic engine-verified nearest-feasible lock (A3 bisection).
    expect(result.nearestFeasibleGrams).not.toBeNull();
    expect(result.nearestFeasibleGrams!).toBeLessThan(900);
    expect(result.nearestFeasibleGrams!).toBeGreaterThan(0);
    // Deterministic product-type alternative for the fruit-lock conflict.
    expect(result.alternativeProductType).toBe('sorbet');
    // Degenerate outcome evidence: many residual violations, honestly listed.
    expect(result.residualViolatedMetrics.length).toBeGreaterThanOrEqual(5);
    // PRESERVED pink context: the fruit_gelato template is reference-derived —
    // a reference/demo/surrogate source can never produce a production claim.
    expect(result.templateStatus).toBe('reference_derived');
  });

  it('the Polish message names the conflict and BOTH suggestions (reduce fruit / switch to Sorbet)', () => {
    const { input: rec, set } = t9();
    const result = buildOptimizePreview(rec, set, 'now');
    expect(result.ok).toBe(false);
    if (result.ok || result.code !== 'impossible_under_constraints') return;
    const message = previewIssueMessagePl(result);
    expect(message).toContain('STRAWBERRIES · Fresh Fruit');
    expect(message).toContain('900 g');
    expect(message).toContain('nie istnieje receptura');
    expect(message).toContain('zmniejsz ten składnik');
    expect(message).toContain('Możesz też zmienić typ produktu na Sorbet.');
    expect(message).toContain('Receptura nie została zmieniona.');
    // Honest account of the search: exhausted budget, never "full search proof".
    expect(message).toContain('wyczerpało deterministyczny budżet');
  });

  it('nearest-feasible is deterministic AND engine-verified (locking there is not impossible)', () => {
    const { input: rec, set } = t9();
    const first = buildOptimizePreview(structuredClone(rec), structuredClone(set), 'now');
    const second = buildOptimizePreview(structuredClone(rec), structuredClone(set), 'now');
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (first.ok || second.ok) return;
    if (first.code !== 'impossible_under_constraints') return;
    if (second.code !== 'impossible_under_constraints') return;
    expect(second.nearestFeasibleGrams).toBe(first.nearestFeasibleGrams);
    const grams = first.nearestFeasibleGrams!;
    const verified = buildOptimizePreview(
      input(
        [line('l-straw', STRAWBERRIES(), grams, 'grams'), line('l-milk', findDemoIngredient('milk_3_5')!, 0)],
        'fruit_gelato',
      ),
      { byLineId: { 'l-straw': { mode: 'locked', grams } } },
      'now',
    );
    if (!verified.ok) expect(verified.code).not.toBe('impossible_under_constraints');
    else expect(verified.preview.iteration?.capped).not.toBe(true);
  });

  it('DOOR-ENFORCED: a capped optimize preview can never commit (not UI-only)', () => {
    // A genuinely feasible constrained preview…
    const rec = input([line('l-straw', STRAWBERRIES(), 600, 'grams')], 'fruit_gelato');
    const set: ConstraintSet = { byLineId: { 'l-straw': { mode: 'locked', grams: 600 } } };
    const result = buildOptimizePreview(rec, set, 'now');
    const preview = buildOk(result);
    expect(preview.iteration?.capped).toBe(false);
    // …forged into a capped one (same fingerprint): the DOOR itself refuses.
    const forged = structuredClone(preview);
    forged.iteration!.capped = true;
    forged.iteration!.stopReason = 'iteration_cap';
    const outcome = commitPreview(rec, set, forged, 'now', 'apply-test-cap');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('iteration_cap_diagnostic');
    expect(outcome.messagePl).toContain('limicie iteracji');
    expect(outcome.messagePl).toContain('Receptura nie została zmieniona.');
  });

  it('genuinely feasible constrained results stay applicable (engine_improved without cap)', () => {
    const rec = input([line('l-straw', STRAWBERRIES(), 600, 'grams')], 'fruit_gelato');
    const set: ConstraintSet = { byLineId: { 'l-straw': { mode: 'locked', grams: 600 } } };
    const result = buildOptimizePreview(rec, set, 'now');
    const preview = buildOk(result);
    expect(preview.formulation?.proof?.verdict).toBe('engine_improved');
    expect(preview.iteration?.capped).toBe(false);
    const outcome = commitPreview(rec, set, preview, 'now', 'apply-test-600');
    expect(outcome.ok).toBe(true);
  });

  it('a verified fixed point (no_feasible_improvement WITHOUT cap) stays applicable', () => {
    const rec = input([line('l-straw', STRAWBERRIES(), 350, 'grams')], 'fruit_gelato');
    const set: ConstraintSet = { byLineId: { 'l-straw': { mode: 'locked', grams: 350 } } };
    const result = buildOptimizePreview(rec, set, 'now');
    const preview = buildOk(result);
    expect(preview.formulation?.proof?.verdict).toBe('no_feasible_improvement');
    expect(preview.iteration?.capped).toBe(false);
    const outcome = commitPreview(rec, set, preview, 'now', 'apply-test-350');
    expect(outcome.ok).toBe(true);
  });
});

/* ═══ addendum2 — SCORE SPLIT (technical headline; flavor/cost separate) ══ */

describe('addendum2 — technical fit is the headline; flavor/cost are separate dimensions (T17)', () => {
  it('T17 through the REAL pipeline: all native bands in range ⇒ Dopasowanie techniczne 10/10', () => {
    const { input: rec, set } = t17();
    const preview = buildOk(buildOptimizePreview(rec, set, 'now'));
    const result = calculateRecipe(preview.proposedInput);
    expect(detectViolations(result)).toHaveLength(0);
    expect(result.indicators.some((i) => i.category_fallback === true)).toBe(false);
    const fit = recipeTechnicalFit(result);
    expect(fit.score).toBe(10);
    expect(fit.validatedNative).toBe(true);
    // The engine `overall` STILL blends flavor/cost (~88 ⇒ 9) — the defect the
    // split fixes: the blend no longer leaks into the public technical integer.
    expect(recipeMatchScore(result.scores).score).toBeLessThan(10);
    // Flavor/cost remain visible as their OWN labeled dimensions.
    const dims = commercialDimensions(result.scores);
    expect(dims.flavor.name).toBe('Profil smakowy');
    expect(dims.cost.name).toBe('Koszt');
  });

  it('provisional/fallback profiles can never show a validated native 10/10 (T12 state)', () => {
    const preview = buildOk(buildOptimizePreview(input(milk500Items(), 'fruit_gelato'), T12_SET, 'now'));
    const result = calculateRecipe(preview.proposedInput);
    expect(result.indicators.some((i) => i.category_fallback === true)).toBe(true);
    const fit = recipeTechnicalFit(result);
    expect(fit.provisional).toBe(true);
    expect(fit.validatedNative).toBe(false);
    expect(fit.score === null || fit.score <= 9).toBe(true);
  });

  it('native profile with residual violations degrades honestly below 10 (T14 state)', () => {
    const { input: rec, set } = t14();
    const preview = buildOk(buildOptimizePreview(rec, set, 'now'));
    const result = calculateRecipe(preview.proposedInput);
    expect(detectViolations(result).length).toBeGreaterThan(0);
    const fit = recipeTechnicalFit(result);
    expect(fit.score).not.toBeNull();
    expect(fit.score!).toBeLessThanOrEqual(9);
    expect(fit.validatedNative).toBe(false);
  });
});

/* ═══ addendum3 — HARD RESIDUALS ⇒ DIAGNOSTIC PREVIEW ONLY (T14/T19) ═════ */

describe('addendum3 — hard-native residuals block Apply at the door (T14/T19)', () => {
  it('T14 (sorbet inulin-0, native ice 50.67 < 51): diagnostic preview, Apply blocked', () => {
    const { input: rec, set } = t14();
    const preview = buildOk(buildOptimizePreview(rec, set, 'now'));
    // The preview itself is honestly marked diagnostic (hard ice residual).
    expect(preview.hardResidualMetrics).toContain('ice_fraction');
    expect(preview.diagnosticOnly).toBe(true);
    // hardSafe=false by the SAME provenance classifier the door uses.
    expect(classifyViolationBands(preview.proposedInput).hardMetrics).toContain('ice_fraction');
    // THE DOOR: Apply structurally blocked with the honest metric list.
    const outcome = commitPreview(rec, set, preview, 'now', 'apply-test-t14');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('hard_residual_violations');
    if (outcome.code !== 'hard_residual_violations') return;
    expect(outcome.hardMetrics).toContain('ice_fraction');
    expect(outcome.messagePl).toContain('udział lodu');
    expect(outcome.messagePl).toContain('diagnostyczny');
    expect(outcome.messagePl).toContain('Receptura nie została zmieniona.');
  });

  it('T19 (sorbet from strawberry, native ice 50.82 < 51): same door block', () => {
    const { input: rec, set } = t19();
    const preview = buildOk(buildOptimizePreview(rec, set, 'now'));
    expect(preview.hardResidualMetrics).toContain('ice_fraction');
    expect(preview.diagnosticOnly).toBe(true);
    const outcome = commitPreview(rec, set, preview, 'now', 'apply-test-t19');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('hard_residual_violations');
  });

  it('the door is TRUSTLESS: stripping the preview flags does not open it', () => {
    const { input: rec, set } = t14();
    const preview = buildOk(buildOptimizePreview(rec, set, 'now'));
    const stripped = structuredClone(preview);
    delete stripped.hardResidualMetrics;
    delete stripped.diagnosticOnly;
    const outcome = commitPreview(rec, set, stripped, 'now', 'apply-test-stripped');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('hard_residual_violations');
  });

  it('soft/provisional residuals STAY applicable with explanation (T12 state)', () => {
    const rec = input(milk500Items(), 'fruit_gelato');
    const preview = buildOk(buildOptimizePreview(rec, T12_SET, 'now'));
    // Residuals exist but ALL sit on provisional fallback bands — soft.
    expect(preview.violationsAfter).toBeGreaterThan(0);
    expect(preview.hardResidualMetrics).toEqual([]);
    expect(preview.diagnosticOnly).toBe(false);
    const outcome = commitPreview(rec, T12_SET, preview, 'now', 'apply-test-soft');
    expect(outcome.ok).toBe(true);
  });

  it('apply-through-store: T14 is blocked at the door and the recipe stays untouched', () => {
    const { input: rec } = t14();
    useRecipeStore.setState({
      mode: 'classic',
      category: 'sorbet',
      visibleProductType: 'sorbet',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      items: rec.items,
      excludedIngredientIds: [],
    });
    useConstraintStudioStore.getState().resetForTests();
    useConstraintStudioStore.setState({ constraints: t14().set });
    const before = JSON.stringify(useRecipeStore.getState().items.map((i) => [i.id, i.planned_grams]));
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    expect(useConstraintStudioStore.getState().preview!.diagnosticOnly).toBe(true);
    useConstraintStudioStore.getState().applyPreview();
    const blocked = useConstraintStudioStore.getState().blocked;
    expect(blocked).not.toBeNull();
    expect(blocked!.code).toBe('hard_residual_violations');
    expect(
      JSON.stringify(useRecipeStore.getState().items.map((i) => [i.id, i.planned_grams])),
    ).toBe(before);
  });
});

/* ═══ Agent R handoff — LOCAL route honors canonical exclusions ══════════ */

describe('handoff (Agent R) — an explicitly excluded ingredient never returns through local correction', () => {
  /** Over-sweet starter with the milk line REMOVED (the user removed it) and
   * the batch at the remaining sum — routes to LOCAL correction. */
  const milkRemovedDraft = (): RecipeInput => {
    const base = input(
      [
        line('l-cream', findDemoIngredient('cream_30')!, 130),
        line('l-smp', findDemoIngredient('smp')!, 35),
        line('l-suc', findDemoIngredient('sucrose')!, 220),
        line('l-dex', findDemoIngredient('dextrose')!, 30),
        line('l-tara', findDemoIngredient('tara_gum')!, 5),
      ],
      'milk_gelato',
    );
    return { ...base, target_batch_grams: plannedSum(base) };
  };
  const NO_SET: ConstraintSet = { byLineId: {} };

  it('CONTROL (no exclusions): the pipeline may legitimately reintroduce milk', () => {
    const result = buildOptimizePreview(milkRemovedDraft(), NO_SET, 'now');
    // Nothing excluded → the template fallback completes the gelato with milk.
    if (result.ok) {
      expect(result.preview.proposedInput.items.some((i) => i.ingredient.id === 'milk_3_5')).toBe(true);
    }
  });

  it.each([
    ['engine id', 'milk_3_5'],
    ['canonical Mapper id', 'PI-ING-000236'],
  ])('excluded under the %s: milk NEVER returns — solver ADDs are filtered', (_label, excludedId) => {
    const result = buildOptimizePreview(milkRemovedDraft(), NO_SET, 'now', {
      excludedIngredientIds: [excludedId],
    });
    if (result.ok) {
      // If anything is proposed at all, it must not contain the excluded milk.
      expect(result.preview.proposedInput.items.some((i) => i.ingredient.id === 'milk_3_5')).toBe(false);
    } else {
      // The honest refusal path: neither the local solver nor the template
      // fallback fabricated the excluded ingredient — there is NO proposed
      // state at all (contrast with the CONTROL run above, which reintroduces
      // milk through the fallback when nothing is excluded). The move-level
      // `excluded_add_blocked` evidence is pinned in the preview-path test
      // below, where the engine's chosen move IS the milk add.
      expect(result.code).not.toBe('impossible_under_constraints');
    }
  });

  it('inside a successful LOCAL preview the excluded add is logged as excluded_add_blocked and no line is fabricated', () => {
    // Sucrose locked over-sweet: the engine's preferred fix is the milk-dilution
    // ADD; with milk excluded the preview still builds from other moves, the
    // rejection is logged, and no new milk row exists.
    const base = input(
      [
        line('l-milk', findDemoIngredient('milk_3_5')!, 600),
        line('l-cream', findDemoIngredient('cream_30')!, 130),
        line('l-smp', findDemoIngredient('smp')!, 35),
        line('l-suc', findDemoIngredient('sucrose')!, 220),
        line('l-dex', findDemoIngredient('dextrose')!, 30),
        line('l-tara', findDemoIngredient('tara_gum')!, 5),
      ],
      'milk_gelato',
    );
    const rec = { ...base, target_batch_grams: plannedSum(base) };
    const set: ConstraintSet = { byLineId: { 'l-suc': { mode: 'locked', grams: 220 } } };
    const result = buildOptimizePreview(rec, set, 'now', { excludedIngredientIds: ['milk_3_5'] });
    if (!result.ok) return; // honest refusal also contains no fabricated milk
    const baseIds = new Set(rec.items.map((i) => i.id));
    // No NEW milk row was created (the user's own line may only be rescaled).
    expect(
      result.preview.proposedInput.items.filter(
        (i) => !baseIds.has(i.id) && i.ingredient.id === 'milk_3_5',
      ),
    ).toEqual([]);
    // The filter demonstrably fired (move-level QA evidence).
    const rejected = result.preview.iteration?.attemptedMoves.filter(
      (move) => move.rejectionReason === 'excluded_add_blocked',
    );
    expect(rejected !== undefined && rejected.length > 0).toBe(true);
  });
});

/* ═══ addendum4 — MAX/RANGE SEMANTICS (T12) ══════════════════════════════ */

describe('addendum4 — max/range is a RANGE constraint, never an exact-lock encoding (T12)', () => {
  it('the runtime UI staging path builds {mode:"range",minGrams:0,maxGrams:500} — proven', () => {
    useRecipeStore.setState({
      mode: 'classic',
      category: 'fruit_gelato',
      visibleProductType: 'gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      items: milk500Items().map((item) => ({ ...item, lock_type: 'unlocked' as const })),
      excludedIngredientIds: [],
    });
    useConstraintStudioStore.getState().resetForTests();
    const staged = useConstraintStudioStore.getState().setRangeConstraint('l-milk', 0, 500);
    expect(staged.ok).toBe(true);
    // THE canonical constraint: a RANGE object — not lock_type='grams'/exact.
    const constraint = useConstraintStudioStore.getState().constraints.byLineId['l-milk'];
    expect(constraint).toEqual({ mode: 'range', minGrams: 0, maxGrams: 500 });
    expect(constraint!.mode).not.toBe('locked');
    // The engine line lock_type 'grams' is only the HOLD-AT-CURRENT staging for
    // solver paths; the §17 SET (what the pipeline reads) stays the range.
    const milkLine = useRecipeStore.getState().items.find((i) => i.id === 'l-milk')!;
    expect(milkLine.lock_type).toBe('grams');
    const draft = selectCanonicalDraft();
    expect(draft.constraints.byLineId['l-milk']).toEqual({ mode: 'range', minGrams: 0, maxGrams: 500 });
  });

  it('(a) the optimum may use LESS than the max: milk max 800 on native milk_gelato lands strictly below', () => {
    const rec = input([line('l-milk', findDemoIngredient('milk_3_5')!, 700, 'grams')], 'milk_gelato');
    const set: ConstraintSet = { byLineId: { 'l-milk': { mode: 'range', minGrams: 0, maxGrams: 800 } } };
    const result = buildOptimizePreview(rec, set, 'now');
    const preview = buildOk(result);
    const milk = preview.proposedInput.items.find((i) => i.id === 'l-milk')!;
    // Within bounds AND strictly below the max: the max bound gives the solver
    // REAL freedom — the formulation landed at the approved template
    // proportion (milk_base_v1: 670 g at −11 / 1000 g), NOT at the draft's
    // 700 g hold and NOT riding the 800 g bound (the pre-addendum defect held
    // the current grams byte-exact, making the range an exact lock in effect).
    expect(milk.planned_grams).toBeGreaterThan(0);
    expect(milk.planned_grams).toBeLessThan(800 - 20); // strictly below the max
    expect(milk.planned_grams).not.toBe(700); // not the degraded exact hold
    expect(Math.abs(milk.planned_grams - 670)).toBeLessThanOrEqual(60); // near the template proportion
    expect(Math.abs(plannedSum(preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
  });

  it('(b) exact-500 vs max-500: different representations, different solver freedom', () => {
    // Different canonical representations…
    expect(T11_SET.byLineId['l-milk']).toEqual({ mode: 'locked', grams: 500 });
    expect(T12_SET.byLineId['l-milk']).toEqual({ mode: 'range', minGrams: 0, maxGrams: 500 });
    // …and different structural freedom: milk at 450 g satisfies the RANGE but
    // violates the EXACT lock (max may move below; exact may not).
    const state450 = input(
      milk500Items().map((item) =>
        item.id === 'l-milk' ? { ...item, planned_grams: 450 } : item,
      ),
      'fruit_gelato',
    );
    expect(verifyConstraintsPreserved(T12_SET, state450).ok).toBe(true);
    expect(verifyConstraintsPreserved(T11_SET, state450).ok).toBe(false);
    // …and the freedom is REAL through the pipeline: the exact lock is
    // byte-held at 500 g while the max-500 solver lands BELOW the bound at the
    // template proportion (grams may only coincide when the optimum happens to
    // sit at the bound — here it does not).
    const exact = buildOk(buildOptimizePreview(input(milk500Items(), 'fruit_gelato'), T11_SET, 'now'));
    const ranged = buildOk(buildOptimizePreview(input(milk500Items(), 'fruit_gelato'), T12_SET, 'now'));
    const milkExact = exact.proposedInput.items.find((i) => i.id === 'l-milk')!.planned_grams;
    const milkRanged = ranged.proposedInput.items.find((i) => i.id === 'l-milk')!.planned_grams;
    expect(Object.is(milkExact, 500)).toBe(true); // exact: byte-held
    expect(milkRanged).toBeLessThanOrEqual(500); // max: never above the bound
    expect(milkRanged).toBeLessThan(milkExact); // max moved below; exact could not
    expect(exact.nextConstraints.byLineId['l-milk']!.mode).toBe('locked');
    expect(ranged.nextConstraints.byLineId['l-milk']!.mode).toBe('range');
  });

  it('(c) range bounds are respected round-trip through preview + apply', () => {
    const rec = input(milk500Items(), 'fruit_gelato');
    const preview = buildOk(buildOptimizePreview(rec, T12_SET, 'now'));
    const outcome = commitPreview(rec, T12_SET, preview, 'now', 'apply-test-range');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const milk = outcome.verified.input.items.find((i) => i.id === 'l-milk')!;
    expect(milk.planned_grams).toBeGreaterThanOrEqual(0);
    expect(milk.planned_grams).toBeLessThanOrEqual(500);
    // The applied constraint set STILL carries the range (never mutated to a lock).
    expect(outcome.verified.constraints.byLineId['l-milk']).toEqual({
      mode: 'range',
      minGrams: 0,
      maxGrams: 500,
    });
    // And the verified state passes its own range verification round-trip.
    expect(verifyConstraintsPreserved(outcome.verified.constraints, outcome.verified.input).ok).toBe(true);
  });
});
