/**
 * Correction verification (spec §13 step 4): proposals are never trusted on
 * paper — every action set is applied to a hypothetical recipe and the FULL
 * calculateRecipe pipeline is re-run. A proposal is valid only if it improves
 * its targets, breaks no higher-priority metric (Golden Middle, spec §10),
 * respects every lock/context rule and stays within machine capacity.
 *
 * Context rules (enforced here AND at candidate generation):
 * - planning: unlocked lines may be reduced; locked lines never change; the
 *   main line follows the mode gate below.
 * - actual_batch: NOTHING is ever reduced — rescue is add-only; any line with
 *   actual_grams present is physically added regardless of lock_type.
 * - Lines with actual_grams are never reduced in ANY context (physically
 *   added material cannot be taken back out).
 *
 * Main-ingredient gate (spec §12): PREMIUM/SIGNATURE — never reduced;
 * ECO/CLASSIC — only when context is planning, the line has no actuals, and
 * allow_main_ingredient_reduction is explicitly true (default false).
 */
import { calculateRecipe } from '../calculateRecipe';
import type { ProductMode, RecipeInput, RecipeItem, RecipeResult, TargetMetric } from '../types';
import type {
  CorrectionAction,
  CorrectionCandidate,
  CorrectionContext,
  CorrectionViolation,
} from './types';

export interface CorrectionConstraints {
  context: CorrectionContext;
  mode: ProductMode;
  allow_main_ingredient_reduction: boolean;
  machine_capacity_grams: number | null;
}

const EPSILON = 1e-9;

/** May this line be reduced under the given constraints? */
export function isReductionAllowed(line: RecipeItem, constraints: CorrectionConstraints): boolean {
  if (constraints.context === 'actual_batch') return false;
  if (line.actual_grams !== null) return false; // physically added — never reduced
  if (line.lock_type === 'main') {
    return (
      (constraints.mode === 'eco' || constraints.mode === 'classic') &&
      constraints.allow_main_ingredient_reduction
    );
  }
  return line.lock_type === 'unlocked';
}

/**
 * Applies actions immutably. Returns null when any action is not applicable
 * under the constraints (never throws). Structurally incapable of reducing
 * locked/main/already-added lines or anything in actual-batch context.
 */
export function applyCorrectionActions(
  input: RecipeInput,
  actions: readonly CorrectionAction[],
  constraints: CorrectionConstraints,
  candidates: readonly CorrectionCandidate[],
): RecipeInput | null {
  const items = input.items.map((item) => ({ ...item }));

  for (const [index, action] of actions.entries()) {
    if (!(action.grams > EPSILON) || !Number.isFinite(action.grams)) return null;

    if (action.type === 'add') {
      const existing =
        action.target_line_id !== undefined
          ? items.find((item) => item.id === action.target_line_id)
          : undefined;
      if (existing) {
        if (existing.lock_type !== 'unlocked') return null; // top-ups only on unlocked lines
        existing.planned_grams += action.grams;
      } else {
        const candidate = candidates.find((c) => c.id === action.ingredient_id);
        if (!candidate) return null;
        items.push({
          id: `correction-${action.ingredient_id}-${index}`,
          ingredient: candidate.ingredient,
          planned_grams: action.grams,
          actual_grams: null,
          lock_type: 'unlocked',
        });
      }
    } else {
      if (action.target_line_id === undefined) return null;
      const line = items.find((item) => item.id === action.target_line_id);
      if (!line) return null;
      if (!isReductionAllowed(line, constraints)) return null;
      if (action.grams > line.planned_grams + EPSILON) return null;
      line.planned_grams = Math.max(0, line.planned_grams - action.grams);
    }
  }

  return { ...input, items };
}

export interface VerifyOutcome {
  valid: boolean;
  after: RecipeResult | null;
  afterViolations: CorrectionViolation[];
  /** Priority-weighted total badness reduction across all metrics. */
  improvement: number;
  /** Before-violations now fully in-band. */
  resolved: TargetMetric[];
  rejection?: 'apply_failed' | 'capacity' | 'higher_priority_break' | 'no_improvement';
}

const badnessByMetric = (violations: readonly CorrectionViolation[]): Map<TargetMetric, number> =>
  new Map(violations.map((v) => [v.metric, v.severity_points]));

export interface VerifyArgs {
  beforeViolations: readonly CorrectionViolation[];
  targets: readonly CorrectionViolation[];
  hypothetical: RecipeInput | null;
  constraints: CorrectionConstraints;
  /** Injected from solver.ts to avoid a module cycle. */
  detect: (result: RecipeResult) => CorrectionViolation[];
  priorityCount: number;
}

/** Re-runs calculateRecipe on the hypothetical recipe and judges the outcome. */
export function verifyCorrectionProposal(args: VerifyArgs): VerifyOutcome {
  const { beforeViolations, targets, hypothetical, constraints, detect, priorityCount } = args;
  const fail = (rejection: VerifyOutcome['rejection']): VerifyOutcome => ({
    valid: false,
    after: null,
    afterViolations: [],
    improvement: 0,
    resolved: [],
    rejection,
  });

  if (!hypothetical) return fail('apply_failed');

  const after = calculateRecipe(hypothetical);

  if (
    constraints.machine_capacity_grams !== null &&
    after.total_batch_g > constraints.machine_capacity_grams + EPSILON
  ) {
    return { ...fail('capacity'), after };
  }

  const afterViolations = detect(after);
  const beforeBadness = badnessByMetric(beforeViolations);
  const afterBadness = badnessByMetric(afterViolations);
  const metricRank = new Map<TargetMetric, number>();
  for (const v of [...beforeViolations, ...afterViolations]) metricRank.set(v.metric, v.priority_rank);

  // every targeted violation must strictly improve
  for (const target of targets) {
    const before = beforeBadness.get(target.metric) ?? 0;
    const afterB = afterBadness.get(target.metric) ?? 0;
    if (!(afterB < before - EPSILON)) {
      return { ...fail('no_improvement'), after, afterViolations };
    }
  }

  // Golden Middle guard: no metric with HIGHER priority than the targets may worsen
  const minTargetRank = Math.min(...targets.map((t) => t.priority_rank));
  for (const [metric, afterB] of afterBadness) {
    const rank = metricRank.get(metric) ?? Number.POSITIVE_INFINITY;
    if (rank < minTargetRank && afterB > (beforeBadness.get(metric) ?? 0) + EPSILON) {
      return { ...fail('higher_priority_break'), after, afterViolations };
    }
  }

  // priority-weighted improvement across all metrics
  let improvement = 0;
  const allMetrics = new Set<TargetMetric>([...beforeBadness.keys(), ...afterBadness.keys()]);
  for (const metric of allMetrics) {
    const weight = priorityCount - (metricRank.get(metric) ?? priorityCount - 1);
    improvement += weight * ((beforeBadness.get(metric) ?? 0) - (afterBadness.get(metric) ?? 0));
  }

  const resolved = beforeViolations
    .filter((v) => (afterBadness.get(v.metric) ?? 0) === 0)
    .map((v) => v.metric);

  return { valid: true, after, afterViolations, improvement, resolved };
}
