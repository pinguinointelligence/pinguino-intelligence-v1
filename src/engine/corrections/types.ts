/**
 * Correction solver types (spec §13–§15, §10, §12, §14).
 *
 * The solver is the core product feature: exact Pro instructions like
 * "Add 34.7 g sucrose and 178.0 g milk 3.5 %", with strict demo redaction.
 * Codes only — no English lives in the engine; the copy layer renders text.
 */
import type {
  EngineIngredient,
  IngredientCategory,
  ProductCategory,
  RecipeInput,
  TargetMetric,
  TargetRange,
} from '../types';

/** Drives redaction: Pro sees exact grams, Demo sees teasers only. */
export type CorrectionMode = 'pro' | 'demo';

/** Drives the reduction rules — see solver/verify context table. */
export type CorrectionContext = 'planning' | 'actual_batch';

/** Pro-facing quality level. Deterministic rule:
 * high = every detected violation resolved, no residuals anywhere;
 * medium = the primary violation fully resolved but residuals remain;
 * low = the primary violation improved but not fully in-band;
 * tradeoff = kind tradeoff/impossible. */
export type CorrectionConfidence = 'high' | 'medium' | 'low' | 'tradeoff';

export type CorrectionSeverity = 'info' | 'warning' | 'critical';

export type CorrectionReasonCode =
  | `${TargetMetric}_low`
  | `${TargetMetric}_high`
  | 'alcohol_unfixable'
  | 'main_ingredient_floor'
  | 'machine_capacity_blocked'
  | 'locked_ingredient_blocked'
  | 'no_valid_correction';

/** What a candidate can fix — informational grouping for future config. */
export type CandidateRole =
  | 'sweetness_up'
  | 'freezing_up'
  | 'dilution'
  | 'fat_up'
  | 'solids_up'
  | 'protein_up'
  | 'stabilizer';

export interface CorrectionCandidate {
  id: string;
  name: string;
  /** Full composition so the solver can compute exact effects. */
  ingredient: EngineIngredient;
  roles: CandidateRole[];
  /** When set, the candidate is allowed only for these recipe categories
   * (e.g. water for sorbet/vegan/fruit — spec §13). */
  allowed_categories?: ProductCategory[];
}

export interface CorrectionViolation {
  metric: TargetMetric;
  direction: 'low' | 'high';
  value: number | null;
  band: TargetRange | null;
  /** Distance beyond the band edge in band half-widths. */
  severity_points: number;
  /** Index into GOLDEN_MIDDLE_PRIORITY — lower = more important (spec §10). */
  priority_rank: number;
  reason: CorrectionReasonCode;
}

export interface CorrectionAction {
  type: 'add' | 'reduce';
  ingredient_id: string;
  ingredient_name: string;
  ingredient_category: IngredientCategory;
  /** Exact grams, full float precision — display rounds to 0.1 g (spec §6). */
  grams: number;
  /** Present when the action adjusts an existing recipe line. */
  target_line_id?: string;
}

export interface CorrectionBlocking {
  constraint:
    | 'locked_ingredient'
    | 'already_added'
    | 'main_ingredient_floor'
    | 'machine_capacity'
    | 'no_candidate';
  line_id?: string;
  ingredient_name?: string;
}

export interface CorrectionPrediction {
  metric: TargetMetric;
  before: number | null;
  after: number | null;
}

export interface CorrectionProposal {
  /** Deterministic id (reason + actions). */
  id: string;
  kind: 'correction' | 'tradeoff' | 'impossible';
  confidence: CorrectionConfidence;
  severity: CorrectionSeverity;
  reasons: CorrectionReasonCode[];
  affected_metrics: TargetMetric[];
  /** Exact gram actions (Pro). Empty for tradeoff/impossible proposals. */
  actions: CorrectionAction[];
  /** Verified before/after values from the calculateRecipe re-run (Pro). */
  predicted: CorrectionPrediction[];
  /** Before-violations now fully in-band after the proposal. */
  resolves: TargetMetric[];
  /** Violations still present after the proposal. */
  residual_reasons: CorrectionReasonCode[];
  /** Why a tradeoff/impossible proposal is blocked + what the user can change. */
  blocking?: CorrectionBlocking;
}

export type RedactedDirection = 'add' | 'reduce' | 'rebalance';

/**
 * STRICT demo shape (spec §14): broad affected area, broad direction, broad
 * confidence label and teaser code ONLY. No grams, no ingredient names, no
 * ingredient categories, no predicted values, no deltas — the type has no
 * numeric fields, so nothing numeric can hide anywhere in a returned object.
 */
export interface RedactedCorrectionProposal {
  id: string;
  kind: 'correction' | 'tradeoff' | 'impossible';
  confidence: CorrectionConfidence;
  affected_metrics: TargetMetric[];
  direction: RedactedDirection;
  teaser_code: 'pro_can_calculate';
}

export interface CorrectionRequest {
  input: RecipeInput;
  /** planning: unlocked lines may be increased or reduced.
   * actual_batch: NOTHING physically added is ever reduced — rescue is
   * add-only; any line with actual_grams present counts as physically added
   * regardless of lock_type. */
  context: CorrectionContext;
  /** Redact-at-source for demo sessions (spec §14). */
  redact: boolean;
  /** ECO/CLASSIC may reduce the main line only with this explicit opt-in
   * (AND planning context AND unlocked AND no actuals). Default false. */
  allow_main_ingredient_reduction?: boolean;
  /** Restrict the solver to specific metrics (UI "fix this indicator"). */
  focus?: TargetMetric[];
  /** Override the default candidate catalog (configurable by design). */
  candidates?: readonly CorrectionCandidate[];
  /** Max ranked proposals returned (default 3). */
  max_proposals?: number;
}

/** Discriminated union: the redacted branch is structurally incapable of
 * carrying actions, names or numbers. */
export type CorrectionResult =
  | { redacted: false; context: CorrectionContext; proposals: CorrectionProposal[] }
  | { redacted: true; context: CorrectionContext; proposals: RedactedCorrectionProposal[] };
