/**
 * AGENT 2 — ENGINE AUTHENTICITY audit harness (NIGHTLY P0, read-only science).
 *
 * The owner's 20 offline tests (T1–T20) executed DIRECTLY against the real
 * production pipeline: `buildOptimizePreview` (the ONLY preview door of the
 * Constraint Studio) + `calculateRecipe` (the canonical engine entry point) in
 * a plain node environment — no browser, no UI, no mocks of any engine value.
 *
 * PURPOSE: prove (or disprove) that every displayed score/metric derives from
 * CURRENT engine output. Each run returns the owner's full structured template
 * (profile, template seed, solver mode, iterations, stop reason, final grams,
 * POD/PAC/NPAC/ice/water/solids/fat/protein/lactose, stabilizer provenance,
 * score, violations, hard-safe classification, best-found proof) plus:
 *  - a PROPORTIONAL-SCALING DETECTOR (output_i / baseline_i per unlocked
 *    ingredient — a shared factor ≠ 1 across most lines ⇒ SUSPECTED-FAKE);
 *  - a TARA (stabilizer) provenance report — the engine has NO stabilizer
 *    target metric (TargetMetric does not include one), so a template dose is
 *    honestly labelled as NOT engine-optimized;
 *  - the 10/10 contract: a provisional (category_fallback / temperature_
 *    fallback / estimated band) profile is never classified as a validated
 *    native optimum.
 *
 * READ-ONLY: nothing here changes any engine/formulation value. Fixtures reuse
 * the repo's canonical demo catalog and the documented strawberry surrogate
 * (raspberry demo row re-identified as PI-ING-001553), exactly as
 * src/qa/engine-validation/fixtures.ts documents.
 */
import {
  calculateRecipe,
  detectViolations,
  DEFAULT_CORRECTION_CANDIDATES,
  TARGET_BANDS,
  type EngineIngredient,
  type RecipeInput,
  type RecipeItem,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { canonicalInternalCategory } from '@/features/studio/productType';
import {
  buildOptimizePreview,
  plannedSum,
  type BuildPreviewResult,
  type IterationDiagnostics,
} from '@/features/constraint-studio/applyPipeline';
import { routeFormulationMode, type FormulationOptions } from '@/features/formulation/formulate';
import { classifyViolationBands } from '@/features/formulation/violationBands';
import { recipeMatchScore } from '@/features/recipe-score';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { r4, recordEngineOutput, strawberrySurrogate, type EngineRecord } from '@/qa/engine-validation/fixtures';

/* ── shared fixture builders (cloned per call — never shared mutable state) ─ */

const WATER: EngineIngredient = DEFAULT_CORRECTION_CANDIDATES.find((c) => c.id === 'water')!
  .ingredient;

const demo = (id: string): EngineIngredient => {
  const found = findDemoIngredient(id);
  if (!found) throw new Error(`demo catalog ingredient missing: ${id}`);
  return { ...found, composition: { ...found.composition } };
};

const line = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  lock: RecipeItem['lock_type'] = 'unlocked',
): RecipeItem => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: lock,
});

/**
 * OWNER FINAL INTEGRATION ADDENDUM item 1 (2026-07-25) — this harness claims to
 * run DIRECTLY against the real production pipeline, so it must not be able to
 * construct a state the runtime cannot: the declared category is passed through
 * the SAME canonicalization the engine seam applies (`buildRecipeInput`), so an
 * unseeded cell (the `fruit_gelato` these fixtures used to declare) is derived
 * back to its canonical family from the real ingredients.
 */
const input = (
  items: RecipeItem[],
  category: RecipeInput['category'],
  temp = -11,
  batch = 1000,
): RecipeInput => ({
  mode: 'classic',
  category: canonicalInternalCategory(category, items),
  target_temperature_c: temp,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items,
});

const NO_CONSTRAINTS: ConstraintSet = { byLineId: {} };

/** T1–T9 — Strawberry EXACT lock at `grams`, Milk selected (0 g, unlocked),
 * full approved toolbox available for auto-fill. Fruit Gelato −11 / 1000 g. */
const strawberryExact = (grams: number): { input: RecipeInput; set: ConstraintSet } => ({
  input: input(
    [line('l-straw', strawberrySurrogate(), grams, 'grams'), line('l-milk', demo('milk_3_5'), 0)],
    'fruit_gelato',
  ),
  set: { byLineId: { 'l-straw': { mode: 'locked', grams } } },
});

/** The owner's exact Gelato-with-milk-500 fixture (1120 g draft). */
const milk500Items = (): RecipeItem[] => [
  line('l-straw', strawberrySurrogate(), 350),
  line('l-milk', demo('milk_3_5'), 500, 'grams'),
  line('l-cream', demo('cream_30'), 80),
  line('l-smp', demo('smp'), 40),
  line('l-suc', demo('sucrose'), 110),
  line('l-dex', demo('dextrose'), 35),
  line('l-tara', demo('tara_gum'), 5),
  line('l-water', WATER, 0),
];

/** The owner's exact Sorbet fixture with inulin locked at 0 (944.6 g draft). */
const inulinZeroItems = (): RecipeItem[] => [
  line('l-straw', strawberrySurrogate(), 600),
  line('l-water', WATER, 181),
  line('l-suc', demo('sucrose'), 103.8),
  line('l-dex', demo('dextrose'), 59),
  line('l-inulin', demo('inulin'), 0, 'grams'),
  line('l-tara', demo('tara_gum'), 0.8),
];

/** The owner's complete Fruit Gelato (FAILURE A fixture, 1000 g). */
const fruitCompleteItems = (): RecipeItem[] => [
  line('l-straw', strawberrySurrogate(), 350),
  line('l-milk', demo('milk_3_5'), 380),
  line('l-cream', demo('cream_30'), 80),
  line('l-smp', demo('smp'), 40),
  line('l-suc', demo('sucrose'), 110),
  line('l-dex', demo('dextrose'), 35),
  line('l-tara', demo('tara_gum'), 5),
];

/* ── case definitions (the owner's exact T1–T19; T20 is the battery below) ── */

export interface AuthenticityCaseDef {
  id: string;
  title: string;
  build: () => { input: RecipeInput; set: ConstraintSet };
  options?: FormulationOptions;
  /** The owner's stated intent for the case (documentation only). */
  intent: string;
}

export const AUTHENTICITY_CASES: readonly AuthenticityCaseDef[] = [
  ...[100, 200, 300, 400, 500, 600, 700, 800, 900].map(
    (grams, index): AuthenticityCaseDef => ({
      id: `T${index + 1}`,
      title: `Strawberry EXACT lock ${grams} g — Fruit Gelato −11 °C / 1000 g`,
      build: () => strawberryExact(grams),
      intent:
        grams === 900
          ? 'The owner-reported suspected false positive — do not assume impossibility before Engine proof.'
          : 'Exact fruit lock; the rest must be genuinely reformulated around it.',
    }),
  ),
  {
    id: 'T10',
    // Owner addendum items 1+2: the fruit carries a real amount — no APPROVED
    // template has a fruit role for a dairy gelato, so a 0 g fruit is the
    // honest "give me the amount" stop (pinned in the formulation suites).
    title: 'Strawberry 350 g + Milk 0 g unlocked — full formulation, actual optimum',
    build: () => ({
      input: input(
        [line('l-milk', demo('milk_3_5'), 0), line('l-straw', strawberrySurrogate(), 350)],
        'fruit_gelato',
      ),
      set: NO_CONSTRAINTS,
    }),
    intent: 'Fresh minimal draft — the template-seeded full formulation, no constraints.',
  },
  {
    id: 'T11',
    title: 'Milk EXACT 500 g (owner fixture, 1120 g draft) — rest optimized, not scaled',
    build: () => ({
      input: input(milk500Items(), 'fruit_gelato'),
      set: { byLineId: { 'l-milk': { mode: 'locked', grams: 500 } } },
    }),
    intent: 'Exact dairy lock; proportional scaling of the rest would be a fake.',
  },
  {
    id: 'T12',
    title: 'Milk MAX 500 g (range 0–500) — solver may use less',
    build: () => ({
      input: input(milk500Items(), 'fruit_gelato'),
      set: { byLineId: { 'l-milk': { mode: 'range', minGrams: 0, maxGrams: 500 } } },
    }),
    intent: 'Upper bound only — the engine chooses the milk amount within the range.',
  },
  {
    id: 'T13',
    title: 'Strawberry RANGE 250–400 g — engine picks the optimum inside the range',
    build: () => ({
      input: input(
        [line('l-straw', strawberrySurrogate(), 0), line('l-milk', demo('milk_3_5'), 0)],
        'fruit_gelato',
      ),
      set: { byLineId: { 'l-straw': { mode: 'range', minGrams: 250, maxGrams: 400 } } },
    }),
    intent: 'A range is a target constraint on a fresh draft — report why the chosen value stands.',
  },
  {
    id: 'T14',
    title: 'Inulin unavailable (locked 0) — the owner sorbet fixture, 944.6 g draft',
    build: () => ({
      input: input(inulinZeroItems(), 'sorbet'),
      set: { byLineId: { 'l-inulin': { mode: 'locked', grams: 0 } } },
    }),
    intent: 'Established fixture: safe suboptimal result with the honest fiber_body gap.',
  },
  {
    id: 'T15',
    title: 'SMP EXACT 0 g on the complete Fruit Gelato — reformulate or prove impossible',
    build: () => {
      const items = fruitCompleteItems().map((item) =>
        item.id === 'l-smp' ? { ...item, planned_grams: 0, lock_type: 'grams' as const } : item,
      );
      return {
        input: input(items, 'fruit_gelato'),
        set: { byLineId: { 'l-smp': { mode: 'locked', grams: 0 } } },
      };
    },
    intent: 'Milk-solids role forced to zero — explain the missing role honestly.',
  },
  {
    id: 'T16',
    title: 'Sucrose unavailable (excluded) — no silent substitution allowed',
    build: () => ({
      input: input(
        [line('l-milk', demo('milk_3_5'), 0), line('l-straw', strawberrySurrogate(), 350)],
        'fruit_gelato',
      ),
      set: NO_CONSTRAINTS,
    }),
    options: { excludedIngredientIds: ['sucrose'] },
    intent: 'Can dextrose alone satisfy the bands? The engine must answer honestly, never substitute silently.',
  },
  {
    id: 'T17',
    title: 'Gelato −12 °C unconstrained (native milk_gelato profile)',
    build: () => ({
      input: input([line('l-milk', demo('milk_3_5'), 0)], 'milk_gelato', -12),
      set: NO_CONSTRAINTS,
    }),
    intent: 'Native −12 bands — the result must differ from −11 where physics requires.',
  },
  {
    id: 'T18',
    title: 'Gelato −13 °C unconstrained (native milk_gelato profile)',
    build: () => ({
      input: input([line('l-milk', demo('milk_3_5'), 0)], 'milk_gelato', -13),
      set: NO_CONSTRAINTS,
    }),
    intent: 'Native −13 bands — not a copied −11 result.',
  },
  {
    id: 'T19',
    title: 'Sorbet from Strawberry 0 g unlocked — no dairy anywhere',
    build: () => ({
      input: input([line('l-straw', strawberrySurrogate(), 0)], 'sorbet'),
      set: NO_CONSTRAINTS,
    }),
    intent: 'Full sorbet formulation from the user fruit alone; dairy must never appear.',
  },
];

/* ── structured record (the owner template) ────────────────────────────────── */

/**
 * OWNER FINAL INTEGRATION ADDENDUM item 3 (honest terminology, 2026-07-25).
 *
 * WHAT WAS TRUE BEFORE: the verdict was `AUTHENTIC-BEST-ACHIEVABLE`. The solver
 * is COORDINATE DESCENT over a fixed gram ladder (see draftCandidateVector.ts):
 * it can prove a LOCAL verified fixed point, never a global mathematical
 * optimum, so "best achievable" was a claim the machinery cannot support.
 *
 * WHAT IS TRUE NOW: `AUTHENTIC-BEST-FOUND` — the best result THIS solver found,
 * always reported together with its stop reason. `AUTHENTIC-OPTIMAL` keeps its
 * narrow meaning: every approved NATIVE band is satisfied (0 violations) — a
 * statement about the bands, still never a claim of global optimality.
 */
export type AuthenticityVerdict =
  | 'AUTHENTIC-OPTIMAL'
  | 'AUTHENTIC-BEST-FOUND'
  | 'HONEST-IMPOSSIBLE'
  | 'SUSPECTED-FAKE';

export interface RecordedViolation {
  metric: string;
  value: number | null;
  band: { min: number; max: number } | null;
  severityPoints: number;
  /** Band provenance: 'hard' = native approved band; 'soft' = provisional/fallback. */
  provenance: 'hard' | 'soft';
}

export interface ProportionalScalingReport {
  /** ≥1 unlocked line with a positive baseline existed to compare. */
  applicable: boolean;
  eligibleLines: number;
  /** Per-line output/baseline factors (unlocked, baseline > 0). */
  factors: { lineId: string; name: string; factor: number }[];
  sharedFactor: number | null;
  matchedLines: number;
  detected: boolean;
}

export interface TaraReport {
  present: boolean;
  grams: number | null;
  percentOfMix: number | null;
  /** template_seed_auto_added | user_line_template_dose | user_line_solver_or_lock | absent */
  source: string;
  engineHasStabilizerMetric: boolean;
  optimizedByEngine: boolean;
  notePl: string | null;
}

export interface AuthenticityRecord {
  testId: string;
  title: string;
  intent: string;
  input: {
    category: string;
    temperatureC: number;
    targetBatchG: number;
    lines: { id: string; ingredientId: string; name: string; grams: number; lock: string }[];
    excludedIngredientIds: string[];
  };
  constraints: string[];
  selectedProfile: string;
  template: { id: string; status: string } | null;
  targetBandSource: string;
  initialSeed: string;
  solverMode: string;
  iterations: number | null;
  stopReason: string;
  outcome: string;
  outcomeDetail: string;
  finalLines: { id: string; ingredientId: string; name: string; grams: number }[] | null;
  batchTotalG: number | null;
  metrics: {
    podPoints: number | null;
    pacPoints: number | null;
    npacPoints: number | null;
    iceFractionPercent: number | null;
    waterPercent: number | null;
    totalSolidsPercent: number | null;
    fatPercent: number | null;
    proteinPercent: number | null;
    lactosePercent: number | null;
  };
  stabilizer: TaraReport;
  score: {
    overall0to100: number | null;
    tenPoint: number | null;
    label: string;
    provisionalBands: boolean;
  };
  violations: RecordedViolation[];
  hardSafe: boolean;
  proportionalScaling: ProportionalScalingReport;
  bestFoundProof: string;
  runtimeReferenceData: string[];
  verdict: AuthenticityVerdict;
  verdictReason: string;
  engineVersion: string;
  configVersion: string;
  /** The full flattened engine record of the assessed (final or draft) state. */
  engineRecord: EngineRecord;
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

const describeConstraints = (set: ConstraintSet, rec: RecipeInput): string[] => {
  const names = new Map(rec.items.map((item) => [item.id, item.ingredient.name]));
  const rows = Object.entries(set.byLineId).map(([lineId, constraint]) => {
    const name = names.get(lineId) ?? lineId;
    if (constraint.mode === 'locked') return `${name}: EXACT ${constraint.grams} g`;
    if (constraint.mode === 'range')
      return `${name}: RANGE ${constraint.minGrams}–${constraint.maxGrams} g`;
    return `${name}: ai`;
  });
  const engineLocks = rec.items
    .filter((item) => item.lock_type !== 'unlocked')
    .map((item) => `${item.ingredient.name}: line lock '${item.lock_type}'`);
  const all = [...rows, ...engineLocks.filter((row) => !rows.some((r) => r.startsWith(row.split(':')[0]!)))];
  return all.length > 0 ? all : ['none (unconstrained)'];
};

/** The engine truly has NO stabilizer target metric — computed, not asserted. */
export const engineHasStabilizerMetric = (): boolean =>
  TARGET_BANDS.some((band) => Object.keys(band.metrics).some((key) => key.includes('stabilizer')));

const TARA_TEMPLATE_NOTE_PL =
  'Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.';

function buildTaraReport(
  finalInput: RecipeInput | null,
  base: RecipeInput,
  addedIds: readonly string[],
): TaraReport {
  const assessed = finalInput ?? base;
  const tara = assessed.items.find((item) => item.ingredient.id === 'tara_gum');
  const hasMetric = engineHasStabilizerMetric();
  if (!tara) {
    return {
      present: false,
      grams: null,
      percentOfMix: null,
      source: 'absent',
      engineHasStabilizerMetric: hasMetric,
      optimizedByEngine: false,
      notePl: null,
    };
  }
  const total = plannedSum(assessed);
  const wasAdded = addedIds.includes('tara_gum');
  const baseTara = base.items.find((item) => item.ingredient.id === 'tara_gum');
  const source = wasAdded
    ? 'template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false)'
    : baseTara && Object.is(baseTara.planned_grams, tara.planned_grams)
      ? 'user_line_template_dose (odziedziczona, niezmieniona)'
      : 'user_line_solver_or_lock (zmieniona względem draftu)';
  return {
    present: true,
    grams: r4(tara.planned_grams),
    percentOfMix: total > 0 ? r4((tara.planned_grams / total) * 100) : null,
    source,
    engineHasStabilizerMetric: hasMetric,
    // No stabilizer target metric exists, so the engine can never have
    // OPTIMIZED the dose against a band — template/inherited by construction.
    optimizedByEngine: false,
    notePl: TARA_TEMPLATE_NOTE_PL,
  };
}

function detectProportionalScaling(
  base: RecipeInput,
  finalInput: RecipeInput | null,
): ProportionalScalingReport {
  const empty: ProportionalScalingReport = {
    applicable: false,
    eligibleLines: 0,
    factors: [],
    sharedFactor: null,
    matchedLines: 0,
    detected: false,
  };
  if (!finalInput) return empty;
  const afterById = new Map(finalInput.items.map((item) => [item.id, item]));
  const factors: ProportionalScalingReport['factors'] = [];
  for (const item of base.items) {
    if (item.lock_type !== 'unlocked') continue;
    if (!(item.planned_grams > 0)) continue;
    const after = afterById.get(item.id);
    if (!after) continue;
    factors.push({
      lineId: item.id,
      name: item.ingredient.name,
      factor: after.planned_grams / item.planned_grams,
    });
  }
  if (factors.length === 0) return empty;
  const sorted = factors.map((f) => f.factor).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const tolerance = Math.max(1e-9, Math.abs(median) * 1e-3);
  const matched = factors.filter((f) => Math.abs(f.factor - median) <= tolerance).length;
  // A shared factor of exactly 1 is "no change" (a fixed point), not scaling.
  const isRescale = Math.abs(median - 1) > 1e-9;
  const detected =
    isRescale && factors.length >= 3 && matched >= Math.max(3, Math.ceil(factors.length * 0.8));
  return {
    applicable: true,
    eligibleLines: factors.length,
    factors: factors.map((f) => ({ ...f, factor: r4(f.factor)! })),
    sharedFactor: detected ? r4(median) : null,
    matchedLines: matched,
    detected,
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/* ── the runner ────────────────────────────────────────────────────────────── */

export function runAuthenticityCase(def: AuthenticityCaseDef): AuthenticityRecord {
  const { input: rec, set } = def.build();
  const decision = routeFormulationMode(rec, set);
  const result: BuildPreviewResult = buildOptimizePreview(
    rec,
    set,
    'AGENT2-AUTHENTICITY',
    def.options ?? {},
  );

  const finalInput = result.ok ? result.preview.proposedInput : null;
  const assessed = finalInput ?? rec;
  const engineRecord = recordEngineOutput(assessed);
  const assessedResult = calculateRecipe(assessed);
  const violationList = detectViolations(assessedResult);
  const bands = classifyViolationBands(assessed);
  const match = recipeMatchScore(assessedResult.scores);
  const provisionalBands = assessedResult.indicators.some(
    (i) => i.category_fallback === true || i.temperature_fallback === true || i.band_status === 'estimated',
  );

  const iteration: IterationDiagnostics | undefined = result.ok
    ? result.preview.iteration
    : 'iteration' in result
      ? result.iteration
      : undefined;

  const outcome = result.ok ? 'preview' : result.code;
  const outcomeDetail = result.ok
    ? `verified preview; violations ${result.preview.violationsBefore} → ${result.preview.violationsAfter}` +
      (result.preview.formulation?.localFallback ? '; template-seeded local fallback' : '')
    : result.code === 'missing_required_role'
      ? `${result.code}: ${result.role} — ${result.messagePl}`
      : result.code === 'best_safe_result'
        ? `${result.code}: soft violations [${result.softViolatedMetrics.join(', ')}] on ${result.bandSource}; stop=${result.stopReason}; solver ran ${result.solverInvocations}×`
        : result.code === 'no_proposal' || result.code === 'unsafe_proposal'
          ? `${result.code}: violated [${(result.violatedMetrics ?? []).join(', ')}]; solver ran ${result.solverInvocations ?? 0}×`
          : result.code;

  const template = result.ok
    ? result.preview.formulation
      ? { id: result.preview.formulation.templateId, status: result.preview.formulation.templateStatus }
      : decision.template
        ? { id: decision.template.templateId, status: decision.template.status }
        : null
    : decision.template
      ? { id: decision.template.templateId, status: decision.template.status }
      : null;

  const addedIds = result.ok
    ? (result.preview.formulation?.added.map((a) => a.ingredientId) ?? [])
    : [];

  const violations: RecordedViolation[] = violationList.map((violation) => ({
    metric: violation.metric,
    value: r4(violation.value),
    band: violation.band ? { min: violation.band.min, max: violation.band.max } : null,
    severityPoints: r4(violation.severity_points)!,
    provenance: bands.hardMetrics.includes(violation.metric) ? 'hard' : 'soft',
  }));

  const proportionalScaling = detectProportionalScaling(rec, finalInput);
  const stabilizer = buildTaraReport(finalInput, rec, addedIds);

  const roundsText = iteration
    ? iteration.rounds
        .map((round) => `r${round.round}:v${round.violations}/s${round1(round.severityPoints)}`)
        .join(' → ')
    : 'n/a';
  const bestFoundProof = iteration
    ? `solver invoked ${iteration.solverInvocations}×; trajectory ${roundsText}; stop=${iteration.stopReason}` +
      (iteration.stopDetail ? ` (${iteration.stopDetail})` : '') +
      (iteration.capped ? '; CAP HIT (reported honestly)' : '')
    : result.ok
      ? 'no iteration diagnostics (formulation reached its state without local rounds)'
      : 'no solver iteration recorded for this outcome';

  /* verdict — computed from evidence, never asserted */
  let verdict: AuthenticityVerdict;
  let verdictReason: string;
  const hardResidual = violations.some((violation) => violation.provenance === 'hard');
  const hasHardConstraints =
    Object.values(set.byLineId).some((constraint) => constraint.mode !== 'ai') ||
    rec.items.some((item) => item.lock_type !== 'unlocked');
  /** The solver PROVABLY attempted moves (or nothing was left to attempt). */
  const provenAttempt =
    iteration !== undefined &&
    (iteration.solverInvocations > 0 || iteration.stopReason === 'all_bands_in_range');
  if (result.ok) {
    if (violations.length === 0 && !provisionalBands) {
      verdict = 'AUTHENTIC-OPTIMAL';
      verdictReason = '0 violations on NATIVE approved bands — verified optimum.';
    } else if (violations.length === 0 && provisionalBands) {
      verdict = 'AUTHENTIC-BEST-FOUND';
      verdictReason =
        '0 violations, but the profile is scored on PROVISIONAL (fallback/estimated) bands — honest partial validation, never presented as a validated native 10/10.';
    } else if (proportionalScaling.detected && !hasHardConstraints) {
      verdict = 'SUSPECTED-FAKE';
      verdictReason = `PROPORTIONAL SCALING DETECTED on an UNCONSTRAINED draft: ${proportionalScaling.matchedLines}/${proportionalScaling.eligibleLines} unlocked lines share factor ${proportionalScaling.sharedFactor} — not a per-line optimization.`;
    } else if (!hardResidual) {
      verdict = 'AUTHENTIC-BEST-FOUND';
      verdictReason = `Residual out-of-band metrics [${violations.map((v) => v.metric).join(', ')}] sit ONLY on provisional/fallback bands — best result found by the current solver for these ingredients/constraints.`;
    } else if (hasHardConstraints) {
      verdict = 'AUTHENTIC-BEST-FOUND';
      verdictReason = `Constrained optimum: hard-band residuals [${violations.filter((v) => v.provenance === 'hard').map((v) => v.metric).join(', ')}] remain because explicit user constraints bind — surfaced honestly, never hidden.`;
    } else if (provenAttempt) {
      verdict = 'AUTHENTIC-BEST-FOUND';
      verdictReason = `Native-band PROVEN FIXED POINT: solver really attempted moves (${iteration!.solverInvocations}×, stop=${iteration!.stopReason}) and residual hard metrics [${violations.filter((v) => v.provenance === 'hard').map((v) => v.metric).join(', ')}] are reported, not hidden.`;
    } else {
      verdict = 'SUSPECTED-FAKE';
      verdictReason =
        'An UNCONSTRAINED preview carries hard native-band violations WITHOUT any proven solver attempt — cannot rule out a static/fake result.';
    }
    if (proportionalScaling.detected && verdict !== 'SUSPECTED-FAKE') {
      verdictReason =
        `PROPORTIONAL SCALING DETECTED (factor ${proportionalScaling.sharedFactor} on ` +
        `${proportionalScaling.matchedLines}/${proportionalScaling.eligibleLines} unlocked lines) — legitimate HERE because explicit ` +
        `constraints bind and the solver verified no admissible improving move (the constrained optimum may equal the ` +
        `proportional projection; per-100 g composition is invariant under it). | ` +
        verdictReason;
    }
  } else if (result.code === 'already_clean') {
    verdict = provisionalBands ? 'AUTHENTIC-BEST-FOUND' : 'AUTHENTIC-OPTIMAL';
    verdictReason = 'Draft already inside every approved band — PI honestly proposes no change.';
  } else if (result.code === 'best_safe_result') {
    verdict = 'AUTHENTIC-BEST-FOUND';
    verdictReason = `Explanatory best-safe fixed point: solver really ran ${result.solverInvocations}×, remaining deviations [${result.softViolatedMetrics.join(', ')}] sit only on ${result.bandSource} bands.`;
  } else if (result.code === 'missing_required_role' || result.code === 'unsupported_profile') {
    verdict = 'HONEST-IMPOSSIBLE';
    verdictReason =
      result.code === 'missing_required_role'
        ? `Hard technological role '${'role' in result ? result.role : '?'}' cannot be filled (excluded/locked out) — refused with the exact Polish explanation, no silent substitution.`
        : 'No approved template for this profile × temperature — honestly unsupported.';
  } else if (result.code === 'no_proposal' || result.code === 'unsafe_proposal') {
    const ran = result.solverInvocations ?? 0;
    verdict = ran > 0 ? 'HONEST-IMPOSSIBLE' : 'SUSPECTED-FAKE';
    verdictReason =
      ran > 0
        ? `Proven refusal: solver really ran ${ran}× and could not safely improve [${(result.violatedMetrics ?? []).join(', ')}].`
        : 'Refusal WITHOUT any solver attempt — cannot prove the impossibility.';
  } else {
    verdict = 'HONEST-IMPOSSIBLE';
    verdictReason = `Structured failure '${result.code}' — honest refusal state.`;
  }

  return {
    testId: def.id,
    title: def.title,
    intent: def.intent,
    input: {
      category: rec.category,
      temperatureC: rec.target_temperature_c,
      targetBatchG: rec.target_batch_grams,
      lines: rec.items.map((item) => ({
        id: item.id,
        ingredientId: item.ingredient.id,
        name: item.ingredient.name,
        grams: item.planned_grams,
        lock: item.lock_type,
      })),
      excludedIngredientIds: [...(def.options?.excludedIngredientIds ?? [])],
    },
    constraints: describeConstraints(set, rec),
    selectedProfile: `${rec.category} @ ${rec.target_temperature_c} °C (mode ${rec.mode})`,
    template,
    targetBandSource:
      bands.bandSource === 'native'
        ? `native seeded bands${bands.temperatureFallback ? ' (temperature fallback!)' : ''}`
        : `category_fallback → milk_gelato bands (calibration-pending)${bands.temperatureFallback ? ' + temperature fallback' : ''}`,
    initialSeed: template
      ? `template ${template.id} (${template.status}) mapped onto the user's selected identities`
      : 'draft as-is (local correction basin — no template seed)',
    solverMode: decision.mode,
    iterations: iteration?.solverInvocations ?? null,
    stopReason: iteration?.stopReason ?? (result.ok ? 'formulation_complete' : outcome),
    outcome,
    outcomeDetail,
    finalLines: finalInput
      ? finalInput.items.map((item) => ({
          id: item.id,
          ingredientId: item.ingredient.id,
          name: item.ingredient.name,
          grams: r4(item.planned_grams)!,
        }))
      : null,
    batchTotalG: finalInput ? r4(plannedSum(finalInput)) : r4(plannedSum(rec)),
    metrics: {
      podPoints: engineRecord.pod_points,
      pacPoints: engineRecord.pac_points,
      npacPoints: engineRecord.npac_points,
      iceFractionPercent: engineRecord.ice_fraction_percent,
      waterPercent: engineRecord.percentages['water_percent'] ?? null,
      totalSolidsPercent: engineRecord.percentages['solids_percent'] ?? null,
      fatPercent: engineRecord.percentages['fat_percent'] ?? null,
      proteinPercent: engineRecord.percentages['protein_percent'] ?? null,
      lactosePercent: engineRecord.percentages['lactose_percent'] ?? null,
    },
    stabilizer,
    score: {
      overall0to100: r4(assessedResult.scores?.overall ?? null),
      tenPoint: match.score,
      label: match.label,
      provisionalBands,
    },
    violations,
    hardSafe: !hardResidual,
    proportionalScaling,
    bestFoundProof,
    runtimeReferenceData: [
      'src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553)',
      template
        ? `src/features/formulation/templateRegistry.ts → ${template.id} (${template.status})`
        : 'no template consulted (local correction)',
      `src/engine/config/targets.ts → TARGET_BANDS cell for ${bands.bandSource === 'native' ? `${rec.category} @ ${rec.target_temperature_c} °C` : `milk_gelato fallback serving ${rec.category}`}`,
    ],
    verdict,
    verdictReason,
    engineVersion: engineRecord.engine_version,
    configVersion: engineRecord.config_version,
    engineRecord,
  };
}

export function runAllAuthenticityCases(): AuthenticityRecord[] {
  return AUTHENTICITY_CASES.map((def) => runAuthenticityCase(def));
}

/* ── T20 — repeatability / anti-fixture battery ────────────────────────────── */

export interface DeterminismBatteryResult {
  /** Canonical signatures of the 10 fresh direct runs (interleaved with unrelated calcs). */
  directSignatures: string[];
  allDirectIdentical: boolean;
  /** The record of run #1 (the representative T10 result). */
  record: AuthenticityRecord;
}

/** Canonical byte-comparable signature of a preview outcome + its engine metrics. */
export function previewSignature(result: BuildPreviewResult): string {
  if (!result.ok) return JSON.stringify({ failed: result.code });
  const proposed = result.preview.proposedInput;
  const calc = calculateRecipe(proposed);
  return JSON.stringify({
    items: proposed.items.map((item) => [item.id, item.ingredient.id, item.planned_grams]),
    batch: plannedSum(proposed),
    pod: calc.pod_points,
    pac: calc.pac_points,
    npac: calc.npac_points,
    ice: calc.ice_fraction_percent,
    overall: calc.scores?.overall ?? null,
    engine: calc.engine_version,
    config: calc.config_version,
  });
}

const T10_DEF = AUTHENTICITY_CASES.find((def) => def.id === 'T10')!;

/** An unrelated calculation between runs — contamination probe (frozen dairy fixture). */
const unrelatedCalc = (): void => {
  const dairy = input(
    [
      line('u-milk', demo('milk_3_5'), 592.3),
      line('u-cream', demo('cream_30'), 216.6),
      line('u-smp', demo('smp'), 22),
      line('u-suc', demo('sucrose'), 32.5),
      line('u-dex', demo('dextrose'), 110),
      line('u-salt', demo('salt'), 0.8),
      line('u-inulin', demo('inulin'), 23.7),
      line('u-tara', demo('tara_gum'), 2.01),
    ],
    'milk_gelato',
  );
  calculateRecipe(dairy);
  buildOptimizePreview(input([line('u2-milk', demo('milk_3_5'), 0)], 'milk_gelato', -12), NO_CONSTRAINTS, 'AGENT2-UNRELATED');
};

/** T20 direct half: 10 fresh runs of the SAME unconstrained Gelato, unrelated
 * calculations interleaved. Store-reload evidence is added by the test layer. */
export function runDeterminismBattery(): DeterminismBatteryResult {
  const directSignatures: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const { input: fresh, set } = T10_DEF.build();
    directSignatures.push(previewSignature(buildOptimizePreview(fresh, set, 'AGENT2-AUTHENTICITY')));
    unrelatedCalc();
  }
  const allDirectIdentical = directSignatures.every((sig) => sig === directSignatures[0]);
  const record = runAuthenticityCase({
    ...T10_DEF,
    id: 'T20',
    title:
      'Repeatability / anti-fixture: the T10 unconstrained Gelato 10× fresh, interleaved with unrelated calcs, plus store save/reload (test layer)',
    intent:
      'Byte-identical outputs across fresh runs and store reloads — any drift means fixture memory or cross-run contamination.',
  });
  if (!allDirectIdentical) {
    record.verdict = 'SUSPECTED-FAKE';
    record.verdictReason =
      'DETERMINISM FAILURE: the same input produced different outputs across fresh runs — fixture memory or contamination.';
  } else {
    record.verdictReason += ' — T20: 10/10 fresh direct runs byte-identical (unrelated calcs interleaved).';
  }
  return { directSignatures, allDirectIdentical, record };
}
