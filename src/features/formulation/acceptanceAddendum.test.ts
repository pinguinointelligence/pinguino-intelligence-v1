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
import { canonicalInternalCategory } from '@/features/studio/productType';
import { isApprovedTemplateId, listFormulationTemplates } from './templateRegistry';
import { useRecipeStore } from '@/stores/recipeStore';
import { verifyConstraintsPreserved, type ConstraintSet } from '@/features/recipe-constraints';
import {
  recipeTechnicalFit,
  recipeMatchScore,
  commercialDimensions,
} from '@/features/recipe-score';
import { classifyViolationBands } from './violationBands';
import { isTemplateControlledStabilizer } from './stabilizerDosage';
import { practicalizeRecipeCandidate } from '@/features/practical-recipe/practicalRecipe';

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

/**
 * OWNER FINAL INTEGRATION ADDENDUM item 1 (2026-07-25) — every fixture in this
 * file previously declared `category: 'fruit_gelato'`. That cell has NO native
 * seeded bands, so `selectTargetBand` substituted the milk_gelato bands and
 * flagged `category_fallback`. All these fixtures select milk, so their
 * canonical family is `milk_gelato` — the SAME band values, now NATIVE. The
 * addendum guarantees pinned here (1: iteration_cap is never applicable; 2:
 * technical fit is the headline; 3: hard-native residuals block Apply; 4:
 * max/range ≠ exact lock) are unchanged; where a residual now classifies HARD
 * instead of SOFT the individual test says so explicitly.
 */

/** T9 — Strawberry EXACT 900 g, Milk 0 g unlocked, Gelato −11 / 1000 g. */
const t9 = () => ({
  input: input(
    [
      line('l-straw', STRAWBERRIES(), 900, 'grams'),
      line('l-milk', findDemoIngredient('milk_3_5')!, 0),
    ],
    'milk_gelato',
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
const T12_SET: ConstraintSet = {
  byLineId: { 'l-milk': { mode: 'range', minGrams: 0, maxGrams: 500 } },
};

/** T14 — the owner sorbet fixture, optional Inulin absent (944.6 g draft). */
const t14 = () => ({
  input: input(
    [
      line('l-straw', STRAWBERRIES(), 600),
      line('l-water', WATER, 179.8),
      line('l-suc', findDemoIngredient('sucrose')!, 103.8),
      line('l-dex', findDemoIngredient('dextrose')!, 59),
      line('l-tara', findDemoIngredient('tara_gum')!, 2),
    ],
    'sorbet',
  ),
  set: { byLineId: {} } satisfies ConstraintSet,
});

/**
 * Deliberate native hard-residual fixture for the trustless Apply door. The
 * composition-sensitive model makes the owner T14 draft valid, so the old
 * accidental 50.67% residual no longer exists. This keeps total mass fixed and
 * transfers 40 g from water to sucrose, producing a real Engine-derived
 * ice_fraction below the approved native band without inventing a metric.
 */
const hardIceResidualAtTargetBatch = (rec: RecipeInput): RecipeInput => {
  const stabilizerMass = rec.items
    .filter((item) => isTemplateControlledStabilizer(item.ingredient))
    .reduce((sum, item) => sum + item.planned_grams, 0);
  const adjustableMass = rec.items
    .filter((item) => !isTemplateControlledStabilizer(item.ingredient))
    .reduce((sum, item) => sum + item.planned_grams, 0);
  const factor = (rec.target_batch_grams - stabilizerMass) / adjustableMass;
  return {
    ...rec,
    items: rec.items.map((item) => {
      const normalized = isTemplateControlledStabilizer(item.ingredient)
        ? item.planned_grams
        : item.planned_grams * factor;
      if (item.id === 'l-suc') return { ...item, planned_grams: normalized + 40 };
      if (item.id === 'l-water') return { ...item, planned_grams: normalized - 40 };
      return { ...item, planned_grams: normalized };
    }),
  };
};

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
    // OWNER FINAL INTEGRATION ADDENDUM item 2 (2026-07-25) — SUPERSEDES
    // „templateStatus === 'reference_derived'". The guarantee behind that pin
    // was: a reference/demo/surrogate source can never produce a production
    // claim. It is now enforced far more strongly — the reference-derived
    // template is QUARANTINED out of the runtime registry entirely, so this
    // refusal seeds from an APPROVED template and no runtime outcome can carry
    // reference-derived provenance at all. Both halves are pinned here.
    expect(result.templateStatus).toBe('approved');
    expect(isApprovedTemplateId(result.templateId)).toBe(true);
    expect(
      listFormulationTemplates().some((t) => t.status !== 'approved'),
      'the runtime registry must contain approved templates only',
    ).toBe(false);
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
    // Honest account of the search: bounded attempts, never "full search proof".
    expect(message).toContain('Sprawdziliśmy dostępne korekty (18 prób)');
    expect(message).toContain('taki wynik nie jest uznawany za gotową recepturę');
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
        [
          line('l-straw', STRAWBERRIES(), grams, 'grams'),
          line('l-milk', findDemoIngredient('milk_3_5')!, 0),
        ],
        'milk_gelato',
      ),
      { byLineId: { 'l-straw': { mode: 'locked', grams } } },
      'now',
    );
    if (!verified.ok) expect(verified.code).not.toBe('impossible_under_constraints');
    else expect(verified.preview.iteration?.capped).not.toBe(true);
  });

  it('DOOR-ENFORCED: a capped optimize preview can never commit (not UI-only)', () => {
    // A genuinely feasible constrained preview…
    const rec = input([line('l-straw', STRAWBERRIES(), 600, 'grams')], 'milk_gelato');
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
    expect(outcome.messagePl).toContain('limit prób');
    expect(outcome.messagePl).toContain('Podgląd jest tylko diagnostyczny');
  });

  // CURRENT-DRAFT OPTIMIZATION P0 (owner, 2026-07-25) — DELIBERATE expectation
  // update: with the CURRENT-DRAFT candidate vector (every unlocked selected
  // line is adjustable) both constrained fixtures now reach EVERY band in
  // range, so the proof verdict strengthens from `engine_improved` /
  // `no_feasible_improvement` to `all_bands_in_range`. Applicability — the
  // property this block exists to pin — is unchanged.
  it('genuinely feasible constrained results stay applicable (all bands in range, no cap)', () => {
    const rec = input([line('l-straw', STRAWBERRIES(), 600, 'grams')], 'milk_gelato');
    const set: ConstraintSet = { byLineId: { 'l-straw': { mode: 'locked', grams: 600 } } };
    const result = buildOptimizePreview(rec, set, 'now');
    const preview = buildOk(result);
    expect(preview.formulation?.proof?.verdict).toBe('all_bands_in_range');
    expect(detectViolations(calculateRecipe(preview.proposedInput))).toHaveLength(0);
    expect(preview.iteration?.capped).toBe(false);
    const outcome = commitPreview(rec, set, preview, 'now', 'apply-test-600');
    expect(outcome.ok).toBe(true);
  });

  it('a verified non-capped fixed point stays applicable (strawberry EXACT 350)', () => {
    const rec = input([line('l-straw', STRAWBERRIES(), 350, 'grams')], 'milk_gelato');
    const set: ConstraintSet = { byLineId: { 'l-straw': { mode: 'locked', grams: 350 } } };
    const result = buildOptimizePreview(rec, set, 'now');
    const preview = buildOk(result);
    expect(preview.formulation?.proof?.verdict).toBe('all_bands_in_range');
    expect(preview.iteration?.capped).toBe(false);
    // The EXACT lock is still byte-exact after the current-draft optimization.
    const straw = preview.proposedInput.items.find((item) => item.id === 'l-straw')!;
    expect(Object.is(straw.planned_grams, 350)).toBe(true);
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

  // OWNER FINAL INTEGRATION ADDENDUM item 1 (2026-07-25) — the T12 STATE is no
  // longer provisional: it is a dairy fruit gelato, i.e. canonical `milk_gelato`
  // scored on NATIVE bands. The guarantee this test exists to protect — a
  // profile scored on SUBSTITUTED bands may never show a validated native 10/10
  // — is unchanged and re-pinned below directly on the engine's fallback
  // mechanism (which still exists for any category the science team has not
  // seeded yet), together with the new fact that runtime can no longer reach it.
  it('provisional/fallback profiles can never show a validated native 10/10', () => {
    // `fruit_gelato` is an UNSEEDED engine cell → selectTargetBand substitutes
    // the milk_gelato bands and flags category_fallback. Runtime can no longer
    // produce this state (pinned right below), but the engine mechanism — and
    // the honesty contract on top of it — must stay correct.
    const provisionalState = input(milk500Items(), 'fruit_gelato');
    const result = calculateRecipe(provisionalState);
    expect(result.indicators.some((i) => i.category_fallback === true)).toBe(true);
    const fit = recipeTechnicalFit(result);
    expect(fit.provisional).toBe(true);
    expect(fit.validatedNative).toBe(false);
    expect(fit.score === null || fit.score <= 9).toBe(true);
    // …and no runtime routing can ever hand the engine that category again.
    expect(canonicalInternalCategory('fruit_gelato', provisionalState.items)).toBe('milk_gelato');
  });

  it('native profile with a real hard residual degrades honestly below 10', () => {
    const { input: rec } = t14();
    const result = calculateRecipe(hardIceResidualAtTargetBatch(rec));
    expect(detectViolations(result).length).toBeGreaterThan(0);
    const fit = recipeTechnicalFit(result);
    expect(fit.score).not.toBeNull();
    expect(fit.score!).toBeLessThanOrEqual(9);
    expect(fit.validatedNative).toBe(false);
  });
});

/* ═══ addendum3 — HARD RESIDUALS ⇒ DIAGNOSTIC PREVIEW ONLY (T14/T19) ═════ */

describe('addendum3 — hard-native residuals block Apply at the door', () => {
  /**
   * CURRENT-DRAFT OPTIMIZATION P0 (owner, 2026-07-25) — DELIBERATE update.
   * The old T14 residual came from the removed milk-anchor fallback. The
   * addendum-3 guarantee is now pinned to a deliberate mass-preserving Sorbet
   * composition that the real Engine places outside native ice authority. The
   * door re-derives that provenance TRUSTLESSLY from `proposedInput`.
   */

  /** A preview carrying the hard-residual proposal, with a proof that is
   * SELF-CONSISTENT with it (so the door's earlier proof gate cannot pre-empt
   * the addendum-3 gate under test). */
  const withHardResidualProposal = (
    preview: ConstraintPreview,
    rec: RecipeInput,
  ): ConstraintPreview => {
    const forged = structuredClone(preview);
    const hardResidual = hardIceResidualAtTargetBatch(rec);
    const currentTara = rec.items.find((item) => item.id === 'l-tara');
    const residualTara = hardResidual.items.find((item) => item.id === 'l-tara');
    const residualWater = hardResidual.items.find((item) => item.id === 'l-water');
    if (currentTara && residualTara && residualWater) {
      residualWater.planned_grams += residualTara.planned_grams - currentTara.planned_grams;
      residualTara.planned_grams = currentTara.planned_grams;
    }
    const practical = practicalizeRecipeCandidate(hardResidual, forged.nextConstraints);
    if (!practical.ok) throw new Error(`hard residual fixture: ${practical.code}`);
    // Forge only formulation/batch. Product/science context must stay exactly
    // the context under which the staged Preview was built; that invariant now
    // has its own trustless Apply gate.
    forged.proposedInput = {
      ...practical.audit.executableInput,
    };
    forged.practicalization = { status: 'ready', audit: practical.audit };
    if (forged.formulation?.proof) forged.formulation.proof.verdict = 'no_feasible_improvement';
    return forged;
  };

  it('a Sorbet native ice residual is blocked at the Apply door', () => {
    const { input: rec, set } = t14();
    const proposal = hardIceResidualAtTargetBatch(rec);
    // The residual is HARD by the SAME provenance classifier the door uses.
    expect(classifyViolationBands(proposal).hardMetrics).toContain('ice_fraction');

    const preview = buildOk(buildOptimizePreview(rec, set, 'now'));
    // The optimizer itself now repairs T14 — the improvement is real.
    expect(classifyViolationBands(preview.proposedInput).hardMetrics).toEqual([]);

    // THE DOOR on the hard-residual proposal: structurally blocked.
    const outcome = commitPreview(
      rec,
      set,
      withHardResidualProposal(preview, rec),
      'now',
      'apply-test-t14',
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('hard_residual_violations');
    if (outcome.code !== 'hard_residual_violations') return;
    expect(outcome.hardMetrics).toContain('ice_fraction');
    expect(outcome.messagePl).toContain('Udział lodu');
    expect(outcome.messagePl).toContain('diagnostyczny');
    expect(outcome.messagePl).toContain('nie można go zastosować');
  });

  it('T19 (sorbet from strawberry): the native ice residual is REPAIRED, not laundered', () => {
    // T19's draft is hollow (Strawberry 0 g), so it has no composition to
    // normalize — the addendum-3 door itself is pinned on T14 above. What T19
    // pins here is the CURRENT-DRAFT improvement: the formulated sorbet no
    // longer leaves a hard NATIVE ice_fraction residual behind.
    const { input: rec, set } = t19();
    const preview = buildOk(buildOptimizePreview(rec, set, 'now'));
    expect(classifyViolationBands(preview.proposedInput).hardMetrics).toEqual([]);
    expect(preview.diagnosticOnly).toBe(false);
    expect(commitPreview(rec, set, preview, 'now', 'apply-test-t19').ok).toBe(true);
  });

  it('the door is TRUSTLESS: stripping the preview flags does not open it', () => {
    const { input: rec, set } = t14();
    const preview = buildOk(buildOptimizePreview(rec, set, 'now'));
    const stripped = withHardResidualProposal(preview, rec);
    delete stripped.hardResidualMetrics;
    delete stripped.diagnosticOnly;
    const outcome = commitPreview(rec, set, stripped, 'now', 'apply-test-stripped');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('hard_residual_violations');
  });

  it('a repaired native profile (no hard residual) stays applicable', () => {
    const { input: rec, set } = t14();
    const preview = buildOk(buildOptimizePreview(rec, set, 'now'));
    expect(preview.hardResidualMetrics).toEqual([]);
    expect(preview.diagnosticOnly).toBe(false);
    // Optional Inulin remains absent; no executable 0 g placeholder is added.
    expect(preview.proposedInput.items.some((item) => item.id === 'l-inulin')).toBe(false);
    const outcome = commitPreview(rec, set, preview, 'now', 'apply-test-t14-ok');
    expect(outcome.ok).toBe(true);
  });

  it('soft/provisional residuals STAY applicable with explanation (T12 state)', () => {
    const rec = input(milk500Items(), 'milk_gelato');
    const preview = buildOk(buildOptimizePreview(rec, T12_SET, 'now'));
    // Any residual sits on provisional fallback bands only — never hard.
    expect(preview.hardResidualMetrics).toEqual([]);
    expect(preview.diagnosticOnly).toBe(false);
    const outcome = commitPreview(rec, T12_SET, preview, 'now', 'apply-test-soft');
    expect(outcome.ok).toBe(true);
  });

  it('apply-through-store: a hard-residual proposal is blocked and the recipe stays untouched', () => {
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
    const before = JSON.stringify(
      useRecipeStore.getState().items.map((i) => [i.id, i.planned_grams]),
    );
    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = useConstraintStudioStore.getState().preview;
    expect(staged).not.toBeNull();
    // Force the staged proposal to the hard-residual state (the door is the
    // only thing being pinned here — it must refuse regardless of provenance).
    useConstraintStudioStore.setState({
      preview: withHardResidualProposal(staged!, selectCanonicalDraft().input),
    });
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
      expect(result.preview.proposedInput.items.some((i) => i.ingredient.id === 'milk_3_5')).toBe(
        true,
      );
    }
  });

  it.each([
    ['engine id', 'milk_3_5'],
    ['canonical Mapper id', 'PI-ING-000236'],
  ])(
    'excluded under the %s: milk NEVER returns — solver ADDs are filtered',
    (_label, excludedId) => {
      const result = buildOptimizePreview(milkRemovedDraft(), NO_SET, 'now', {
        excludedIngredientIds: [excludedId],
      });
      if (result.ok) {
        // If anything is proposed at all, it must not contain the excluded milk.
        expect(result.preview.proposedInput.items.some((i) => i.ingredient.id === 'milk_3_5')).toBe(
          false,
        );
      } else {
        // The honest refusal path: neither the local solver nor the template
        // fallback fabricated the excluded ingredient — there is NO proposed
        // state at all (contrast with the CONTROL run above, which reintroduces
        // milk through the fallback when nothing is excluded). The move-level
        // `excluded_add_blocked` evidence is pinned in the preview-path test
        // below, where the engine's chosen move IS the milk add.
        expect(result.code).not.toBe('impossible_under_constraints');
      }
    },
  );

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
      category: 'milk_gelato',
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
    expect(draft.constraints.byLineId['l-milk']).toEqual({
      mode: 'range',
      minGrams: 0,
      maxGrams: 500,
    });
  });

  it('(a) the optimum may use LESS than the max: milk max 800 on native milk_gelato lands strictly below', () => {
    const rec = input(
      [line('l-milk', findDemoIngredient('milk_3_5')!, 700, 'grams')],
      'milk_gelato',
    );
    const set: ConstraintSet = {
      byLineId: { 'l-milk': { mode: 'range', minGrams: 0, maxGrams: 800 } },
    };
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
      milk500Items().map((item) => (item.id === 'l-milk' ? { ...item, planned_grams: 450 } : item)),
      'milk_gelato',
    );
    expect(verifyConstraintsPreserved(T12_SET, state450).ok).toBe(true);
    expect(verifyConstraintsPreserved(T11_SET, state450).ok).toBe(false);
    // …and the freedom is REAL through the pipeline: the exact lock is
    // byte-held at 500 g while the max-500 solver lands BELOW the bound at the
    // template proportion (grams may only coincide when the optimum happens to
    // sit at the bound — here it does not).
    const exact = buildOk(
      buildOptimizePreview(input(milk500Items(), 'milk_gelato'), T11_SET, 'now'),
    );
    const ranged = buildOk(
      buildOptimizePreview(input(milk500Items(), 'milk_gelato'), T12_SET, 'now'),
    );
    const milkExact = exact.proposedInput.items.find((i) => i.id === 'l-milk')!.planned_grams;
    const milkRanged = ranged.proposedInput.items.find((i) => i.id === 'l-milk')!.planned_grams;
    expect(Object.is(milkExact, 500)).toBe(true); // exact: byte-held
    expect(milkRanged).toBeLessThanOrEqual(500); // max: never above the bound
    expect(milkRanged).toBeLessThan(milkExact); // max moved below; exact could not
    expect(exact.nextConstraints.byLineId['l-milk']!.mode).toBe('locked');
    expect(ranged.nextConstraints.byLineId['l-milk']!.mode).toBe('range');
  });

  it('(c) range bounds are respected round-trip through preview + apply', () => {
    const rec = input(milk500Items(), 'milk_gelato');
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
    expect(
      verifyConstraintsPreserved(outcome.verified.constraints, outcome.verified.input).ok,
    ).toBe(true);
  });
});
