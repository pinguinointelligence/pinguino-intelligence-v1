/**
 * Correction solver (spec §13, §10, §12, §15) — the core product feature.
 *
 * Deterministic, bounded, pure: detect violations → rank by the Golden Middle
 * priority order → generate candidates per the spec §13 table → solve exact
 * grams with MASS-CHANGE-AWARE math (the denominator grows with every added
 * gram) → verify every proposal by re-running the FULL calculateRecipe →
 * rank → redact at source for demo.
 *
 * The Golden Middle rule is enforced in verify.ts: a proposal that fixes a
 * lower-priority metric by breaking a higher-priority one is rejected.
 * When no valid correction exists, an explicit tradeoff/impossible proposal
 * explains why (blocking constraint codes) and what the user can change.
 *
 * Algorithm parameters below (MIN/MAX action mass, search bounds) are
 * deterministic solver settings, not calibration data.
 */
import { calculateRecipe } from '../calculateRecipe';
import { GOLDEN_MIDDLE_PRIORITY } from '../config/priorities';
import { MODES } from '../config/modes';
import { ingredientNpacContribution } from '../pac';
import { ingredientPodContribution } from '../pod';
import type {
  EffectiveRecipeItem,
  EngineIngredient,
  PriorityKey,
  RecipeResult,
  TargetMetric,
  TargetRange,
} from '../types';
import { DEFAULT_CORRECTION_CANDIDATES, selectCandidates } from './candidates';
import { redactProposal } from './redact';
import type {
  CorrectionAction,
  CorrectionBlocking,
  CorrectionCandidate,
  CorrectionConfidence,
  CorrectionPrediction,
  CorrectionProposal,
  CorrectionReasonCode,
  CorrectionRequest,
  CorrectionResult,
  CorrectionSeverity,
  CorrectionViolation,
} from './types';
import {
  applyCorrectionActions,
  isReductionAllowed,
  verifyCorrectionProposal,
  type CorrectionConstraints,
} from './verify';

/* ── solver parameters (deterministic settings, not calibration data) ────── */

const MIN_ACTION_GRAMS = 0.05; // below display precision — not worth proposing
const MAX_ADDITION_FACTOR = 2; // a single action never adds more than 2× the batch
const CANDIDATES_PER_VIOLATION = 3;
const DEFAULT_MAX_PROPOSALS = 3;
const EPSILON = 1e-9;

/* ── violation detection (spec §10 ranking) ──────────────────────────────── */

const METRIC_PRIORITY_KEY: Record<TargetMetric, PriorityKey> = {
  alcohol: 'feasibility_safety',
  ice_fraction: 'freezing_stability',
  npac: 'npac_pac',
  pod: 'pod',
  water: 'water_solids',
  total_solids: 'water_solids',
  fat: 'fat',
  aerating_protein: 'protein',
  protein_in_solids: 'protein',
  lactose: 'lactose_sandiness',
  lactose_sandiness_risk: 'lactose_sandiness',
};

const priorityRank = (metric: TargetMetric): number =>
  GOLDEN_MIDDLE_PRIORITY.indexOf(METRIC_PRIORITY_KEY[metric]);

/**
 * Preview-only target override: return a COPY of `result` whose indicator bands are
 * replaced per `override` (metric → band). IMMUTABLE — the input result and its band
 * objects are never mutated; metrics absent from the map keep their engine band, and
 * metric VALUES / keys / fallback flags are preserved. Lets a caller solve/detect
 * against injected targets (e.g. Temperature Regulator bands) WITHOUT changing the
 * global `TARGET_BANDS`. Not re-exported from the engine barrel; when no override is
 * supplied the solver never calls this and its behavior is unchanged.
 */
export function applyTargetBandOverride(
  result: RecipeResult,
  override: Partial<Record<TargetMetric, TargetRange>>,
): RecipeResult {
  const indicators = result.indicators.map((indicator) => {
    const band = override[indicator.key as TargetMetric];
    return band ? { ...indicator, band: { ...band } } : indicator;
  });
  return { ...result, indicators };
}

/** Out-of-range indicators → violations sorted by (priority rank, severity). */
export function detectViolations(result: RecipeResult): CorrectionViolation[] {
  const violations: CorrectionViolation[] = [];

  for (const indicator of result.indicators) {
    if (!(indicator.key in METRIC_PRIORITY_KEY)) continue;
    const metric = indicator.key as TargetMetric;
    const band = indicator.band ?? null;
    const value = indicator.value;
    if (value === null || band === null || Number.isNaN(value)) continue;

    let direction: 'low' | 'high' | null = null;
    if (value < band.min) direction = 'low';
    else if (value > band.max) direction = 'high';
    else if (band.warn_above !== undefined && value > band.warn_above) direction = 'high';
    else if (band.warn_below !== undefined && value < band.warn_below) direction = 'low';
    if (direction === null) continue;

    const halfWidth = (band.max - band.min) / 2;
    const beyond = direction === 'high' ? value - band.max : band.min - value;
    const severity_points = Math.max(
      0.01, // warn-only floor keeps "strict improvement" meaningful
      halfWidth > 0 ? beyond / halfWidth : beyond,
    );

    violations.push({
      metric,
      direction,
      value,
      band,
      severity_points,
      priority_rank: priorityRank(metric),
      reason: `${metric}_${direction}`,
    });
  }

  violations.sort(
    (a, b) =>
      a.priority_rank - b.priority_rank ||
      b.severity_points - a.severity_points ||
      a.metric.localeCompare(b.metric),
  );
  return violations;
}

/* ── mass-change-aware ratio models (spec §13 step 3) ────────────────────── */

/** value = N / D × 100; adding m grams of a candidate moves N by n·m and D by d·m. */
interface RatioModel {
  N: number;
  D: number;
  /** target as a fraction (band center / 100 — the Golden Middle move). */
  t: number;
  n: (ingredient: EngineIngredient) => number;
  d: (ingredient: EngineIngredient) => number;
}

const unitItem = (ingredient: EngineIngredient): EffectiveRecipeItem => ({
  id: `unit-${ingredient.id}`,
  ingredient,
  planned_grams: 1,
  actual_grams: null,
  lock_type: 'unlocked',
  effective_grams: 1,
  difference: 0,
  is_actual: false,
});

const bandOf = (result: RecipeResult, metric: TargetMetric): TargetRange | null =>
  result.indicators.find((indicator) => indicator.key === metric)?.band ?? null;

const center = (band: TargetRange): number => (band.min + band.max) / 2;

function modelFor(result: RecipeResult, metric: TargetMetric): RatioModel | null {
  const B = result.total_batch_g;
  if (B <= 0) return null;
  const totals = result.totals;
  const one = () => 1;

  const percentModel = (
    componentG: number,
    fraction: (i: EngineIngredient) => number,
    band: TargetRange | null,
  ): RatioModel | null =>
    band ? { N: componentG, D: B, t: center(band) / 100, n: fraction, d: one } : null;

  switch (metric) {
    case 'pod':
      return bandOf(result, 'pod')
        ? {
            N: ((result.pod_points ?? 0) * B) / 100,
            D: B,
            t: center(bandOf(result, 'pod')!) / 100,
            n: (i) => ingredientPodContribution(unitItem(i)),
            d: one,
          }
        : null;
    case 'npac':
    case 'ice_fraction': {
      // ice fraction is solved through its NPAC proxy (anchor band centers
      // correspond by construction of the seeded row — spec §9/§13)
      const band = bandOf(result, 'npac');
      return band
        ? {
            N: ((result.npac_points ?? 0) * B) / 100,
            D: B,
            t: center(band) / 100,
            n: (i) => ingredientNpacContribution(unitItem(i)),
            d: one,
          }
        : null;
    }
    case 'water':
      return percentModel(totals.water_g, (i) => i.composition.water_percent / 100, bandOf(result, metric));
    case 'total_solids':
      return percentModel(totals.solids_g, (i) => i.composition.solids_percent / 100, bandOf(result, metric));
    case 'fat':
      return percentModel(totals.fat_g, (i) => i.composition.fat_percent / 100, bandOf(result, metric));
    case 'aerating_protein':
      return percentModel(totals.protein_g, (i) => i.composition.protein_percent / 100, bandOf(result, metric));
    case 'lactose':
      return percentModel(totals.lactose_g, (i) => i.composition.lactose_percent / 100, bandOf(result, metric));
    case 'alcohol':
      return percentModel(totals.alcohol_g, (i) => i.composition.alcohol_percent / 100, bandOf(result, metric));
    case 'protein_in_solids': {
      const band = bandOf(result, metric);
      return band
        ? {
            N: totals.protein_g,
            D: totals.solids_g,
            t: center(band) / 100,
            n: (i) => i.composition.protein_percent / 100,
            d: (i) => i.composition.solids_percent / 100,
          }
        : null;
    }
    case 'lactose_sandiness_risk': {
      const band = bandOf(result, metric);
      return band
        ? {
            N: totals.lactose_g,
            D: totals.water_g,
            t: center(band) / 100,
            n: (i) => i.composition.lactose_percent / 100,
            d: (i) => i.composition.water_percent / 100,
          }
        : null;
    }
  }
}

/** Solve (N + n·m)/(D + d·m) = t for the added mass m. */
function solveAddition(model: RatioModel, ingredient: EngineIngredient): number | null {
  const denominator = model.n(ingredient) - model.t * model.d(ingredient);
  if (Math.abs(denominator) < EPSILON) return null;
  const m = (model.t * model.D - model.N) / denominator;
  if (!Number.isFinite(m) || m < MIN_ACTION_GRAMS) return null;
  if (m > model.D * MAX_ADDITION_FACTOR) return null;
  return m;
}

/* ── proposal assembly ───────────────────────────────────────────────────── */

const severityFor = (rank: number): CorrectionSeverity =>
  rank === 0 ? 'critical' : rank <= 3 ? 'warning' : 'info';

const addAction = (candidate: CorrectionCandidate, grams: number): CorrectionAction => ({
  type: 'add',
  ingredient_id: candidate.id,
  ingredient_name: candidate.name,
  ingredient_category: candidate.ingredient.category,
  grams,
});

function confidenceFor(
  primary: CorrectionViolation,
  afterViolations: readonly CorrectionViolation[],
): CorrectionConfidence {
  if (afterViolations.length === 0) return 'high';
  if (!afterViolations.some((v) => v.metric === primary.metric)) return 'medium';
  return 'low';
}

interface BlockTracker {
  capacity: boolean;
}

export function proposeCorrections(request: CorrectionRequest): CorrectionResult {
  const {
    input,
    context,
    redact,
    allow_main_ingredient_reduction = false,
    candidates = DEFAULT_CORRECTION_CANDIDATES,
    max_proposals = DEFAULT_MAX_PROPOSALS,
    focus,
    targetBandOverride,
  } = request;

  const constraints: CorrectionConstraints = {
    context,
    mode: input.mode,
    allow_main_ingredient_reduction,
    machine_capacity_grams: input.machine_capacity_grams,
  };

  // Optional preview-only target override: solve/detect against injected bands (e.g. the
  // Temperature Regulator target) without touching the global config. Absent → identical
  // to the default engine behavior (`before` is the raw result; `detect` is detectViolations).
  const before = targetBandOverride
    ? applyTargetBandOverride(calculateRecipe(input), targetBandOverride)
    : calculateRecipe(input);
  const detect = targetBandOverride
    ? (result: RecipeResult): CorrectionViolation[] =>
        detectViolations(applyTargetBandOverride(result, targetBandOverride))
    : detectViolations;
  const allViolations = detectViolations(before);
  const violations = focus?.length
    ? allViolations.filter((violation) => focus.includes(violation.metric))
    : allViolations;

  if (violations.length === 0) {
    return redact
      ? { redacted: true, context, proposals: [] }
      : { redacted: false, context, proposals: [] };
  }

  const ranking = MODES[input.mode].candidate_ranking;
  const proposals: CorrectionProposal[] = [];
  const improvementById = new Map<string, number>();
  const blocked: BlockTracker = { capacity: false };

  const tryActions = (
    targets: CorrectionViolation[],
    actions: CorrectionAction[],
  ): void => {
    const hypothetical = applyCorrectionActions(input, actions, constraints, candidates);
    const outcome = verifyCorrectionProposal({
      beforeViolations: allViolations,
      targets,
      hypothetical,
      constraints,
      detect,
      priorityCount: GOLDEN_MIDDLE_PRIORITY.length,
    });
    if (!outcome.valid) {
      if (outcome.rejection === 'capacity') blocked.capacity = true;
      return;
    }

    const primary = targets[0]!;
    const after = outcome.after!;
    const predicted: CorrectionPrediction[] = targets.map((target) => ({
      metric: target.metric,
      before: target.value,
      after: after.indicators.find((indicator) => indicator.key === target.metric)?.value ?? null,
    }));

    const id = `${primary.reason}:${actions
      .map((action) => `${action.type}-${action.ingredient_id}`)
      .join('+')}`;
    if (proposals.some((proposal) => proposal.id === id)) return;

    proposals.push({
      id,
      kind: 'correction',
      confidence: confidenceFor(primary, outcome.afterViolations),
      severity: severityFor(primary.priority_rank),
      reasons: targets.map((target) => target.reason),
      affected_metrics: targets.map((target) => target.metric),
      actions,
      predicted,
      resolves: outcome.resolved,
      residual_reasons: outcome.afterViolations.map((violation) => violation.reason),
    });
    improvementById.set(id, outcome.improvement); // ranking key, closure-scoped
  };

  const primary = violations[0]!;
  const secondary = violations[1];

  // single-action ADD proposals for the top two violations
  for (const violation of [primary, secondary].filter(
    (v): v is CorrectionViolation => v !== undefined,
  )) {
    const model = modelFor(before, violation.metric);
    if (!model) continue;
    const options = selectCandidates(
      violation.metric,
      violation.direction,
      input.category,
      ranking,
      candidates,
    ).slice(0, CANDIDATES_PER_VIOLATION);
    for (const candidate of options) {
      const grams = solveAddition(model, candidate.ingredient);
      if (grams === null) continue;
      tryActions([violation], [addAction(candidate, grams)]);
    }
  }

  // single-action REDUCE proposal for the primary violation (planning only)
  const reduceOutcome = buildReduceAction(before, primary, constraints);
  if (reduceOutcome.action) tryActions([primary], [reduceOutcome.action]);

  // paired two-action proposal across the top two violations (spec showcase)
  if (secondary) {
    const m1 = modelFor(before, primary.metric);
    const m2 = modelFor(before, secondary.metric);
    if (m1 && m2) {
      const c1s = selectCandidates(primary.metric, primary.direction, input.category, ranking, candidates).slice(0, CANDIDATES_PER_VIOLATION);
      const c2s = selectCandidates(secondary.metric, secondary.direction, input.category, ranking, candidates).slice(0, CANDIDATES_PER_VIOLATION);
      outer: for (const c1 of c1s) {
        for (const c2 of c2s) {
          if (c1.id === c2.id) continue;
          const pair = solvePair(m1, m2, c1.ingredient, c2.ingredient);
          if (!pair) continue;
          tryActions(
            [primary, secondary],
            [addAction(c1, pair[0]), addAction(c2, pair[1])],
          );
          if (proposals.length >= max_proposals + 2) break outer;
        }
      }
    }
  }

  // deterministic ranking
  proposals.sort(
    (a, b) =>
      (improvementById.get(b.id) ?? 0) - (improvementById.get(a.id) ?? 0) ||
      a.actions.length - b.actions.length ||
      totalGrams(a) - totalGrams(b) ||
      a.id.localeCompare(b.id),
  );
  const ranked = proposals.slice(0, max_proposals);

  // no valid correction → explicit tradeoff/impossible proposal (spec F)
  if (ranked.length === 0) {
    ranked.push(buildBlockedProposal(primary, blocked, reduceOutcome.blocking));
  }

  return redact
    ? {
        redacted: true,
        context,
        proposals: ranked.map((proposal, index) => redactProposal(proposal, index)),
      }
    : { redacted: false, context, proposals: ranked };
}

const totalGrams = (proposal: CorrectionProposal): number =>
  proposal.actions.reduce((sum, action) => sum + action.grams, 0);

/* ── reduce path (planning context, spec §13 "reduce if not locked") ─────── */

function buildReduceAction(
  before: RecipeResult,
  violation: CorrectionViolation,
  constraints: CorrectionConstraints,
): { action: CorrectionAction | null; blocking: CorrectionBlocking | null } {
  if (violation.direction !== 'high') return { action: null, blocking: null };
  const model = modelFor(before, violation.metric);
  if (!model) return { action: null, blocking: null };

  // dominant contributor line to the violating numerator
  let dominant: EffectiveRecipeItem | null = null;
  let dominantShare = 0;
  for (const item of before.items) {
    const share = model.n(item.ingredient) * item.effective_grams;
    if (share > dominantShare + EPSILON) {
      dominantShare = share;
      dominant = item;
    }
  }
  if (!dominant || dominantShare <= EPSILON) return { action: null, blocking: null };

  if (!isReductionAllowed(dominant, constraints)) {
    const blocking: CorrectionBlocking = {
      constraint:
        dominant.actual_grams !== null
          ? 'already_added'
          : dominant.lock_type === 'main'
            ? 'main_ingredient_floor'
            : 'locked_ingredient',
      line_id: dominant.id,
      ingredient_name: dominant.ingredient.name,
    };
    return { action: null, blocking };
  }

  // solve (N − n·m)/(D − d·m) = t  ⇒  m = (N − t·D)/(n − t·d), capped at the line
  const n = model.n(dominant.ingredient);
  const d = model.d(dominant.ingredient);
  const denominator = n - model.t * d;
  if (denominator <= EPSILON) return { action: null, blocking: null };
  const ideal = (model.N - model.t * model.D) / denominator;
  if (!Number.isFinite(ideal) || ideal < MIN_ACTION_GRAMS) return { action: null, blocking: null };
  const grams = Math.min(ideal, dominant.planned_grams);
  if (grams < MIN_ACTION_GRAMS) return { action: null, blocking: null };

  return {
    action: {
      type: 'reduce',
      ingredient_id: dominant.ingredient.id,
      ingredient_name: dominant.ingredient.name,
      ingredient_category: dominant.ingredient.category,
      grams,
      target_line_id: dominant.id,
    },
    blocking: null,
  };
}

/* ── blocked/impossible diagnosis (spec F) ───────────────────────────────── */

function buildBlockedProposal(
  primary: CorrectionViolation,
  blocked: BlockTracker,
  reduceBlocking: CorrectionBlocking | null,
): CorrectionProposal {
  let kind: CorrectionProposal['kind'] = 'impossible';
  let reason: CorrectionReasonCode = 'no_valid_correction';
  let blocking: CorrectionBlocking = { constraint: 'no_candidate' };

  if (blocked.capacity) {
    kind = 'tradeoff';
    reason = 'machine_capacity_blocked';
    blocking = { constraint: 'machine_capacity' };
  } else if (reduceBlocking) {
    kind = 'tradeoff';
    reason =
      reduceBlocking.constraint === 'main_ingredient_floor'
        ? 'main_ingredient_floor'
        : 'locked_ingredient_blocked';
    blocking = reduceBlocking;
  } else if (primary.metric === 'alcohol') {
    kind = 'tradeoff';
    reason = 'alcohol_unfixable'; // spec §5/§13: alcohol cannot always be fixed
  }

  return {
    id: `${kind}:${primary.reason}`,
    kind,
    confidence: 'tradeoff',
    severity: severityFor(primary.priority_rank),
    reasons: [primary.reason, reason],
    affected_metrics: [primary.metric],
    actions: [],
    predicted: [],
    resolves: [],
    residual_reasons: [primary.reason],
    blocking,
  };
}

/* ── paired 2×2 solve (Cramer) ───────────────────────────────────────────── */

function solvePair(
  m1: RatioModel,
  m2: RatioModel,
  ca: EngineIngredient,
  cb: EngineIngredient,
): [number, number] | null {
  const a11 = m1.n(ca) - m1.t * m1.d(ca);
  const a12 = m1.n(cb) - m1.t * m1.d(cb);
  const a21 = m2.n(ca) - m2.t * m2.d(ca);
  const a22 = m2.n(cb) - m2.t * m2.d(cb);
  const b1 = m1.t * m1.D - m1.N;
  const b2 = m2.t * m2.D - m2.N;

  const det = a11 * a22 - a12 * a21;
  if (Math.abs(det) < EPSILON) return null;
  const mA = (b1 * a22 - a12 * b2) / det;
  const mB = (a11 * b2 - b1 * a21) / det;
  if (!Number.isFinite(mA) || !Number.isFinite(mB)) return null;
  if (mA < MIN_ACTION_GRAMS || mB < MIN_ACTION_GRAMS) return null;
  if (mA + mB > m1.D * MAX_ADDITION_FACTOR) return null;
  return [mA, mB];
}
