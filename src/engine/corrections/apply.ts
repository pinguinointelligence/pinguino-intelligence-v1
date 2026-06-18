/**
 * Auto Fix apply/idempotence core (Slice 1A) — PURE, stateless, IO-free.
 *
 * Two thin wrappers around the existing solver. NO new optimizer, NO new math:
 *   - `proposeAutoFix` builds a `CorrectionRequest` and delegates to
 *     `proposeCorrections` (same engine, same Golden-Middle verification).
 *     Redaction is driven by `exactCorrectionGrams` (Pro sees grams; Free
 *     Preview / demo gets the redacted shape), mirroring the studio's
 *     `redact = !exactCorrectionGrams` rule.
 *   - `applyAutoFix` extracts a (non-redacted) proposal's actions and delegates
 *     to `applyCorrectionActions`, returning a discriminated result. It never
 *     throws and never mutates the input (the underlying apply clones).
 *
 * Idempotence is NOT a stored cache here — it is a PROPERTY proven by the apply
 * tests: an already-balanced recipe yields zero proposals (no-op), and repeated
 * propose→apply reaches a fixed point rather than drifting (the external
 * reference's repeated-auto-balance flaw must never happen in PINGÜINO).
 *
 * Constraints are derived from the input the SAME way `proposeCorrections`
 * derives them internally, so propose and apply stay symmetric and a caller
 * cannot build a mismatched constraint set.
 */
import type { RecipeInput, TargetMetric } from '../types';
import { DEFAULT_CORRECTION_CANDIDATES } from './candidates';
import { proposeCorrections } from './solver';
import type {
  CorrectionAction,
  CorrectionCandidate,
  CorrectionContext,
  CorrectionProposal,
  CorrectionResult,
  RedactedCorrectionProposal,
} from './types';
import { applyCorrectionActions, type CorrectionConstraints } from './verify';

export interface ProposeAutoFixArgs {
  input: RecipeInput;
  context: CorrectionContext;
  /** Pro (true) → exact grams; Free Preview / demo (false) → redacted shape. */
  exactCorrectionGrams: boolean;
  /** ECO/CLASSIC may reduce the main line only with this explicit opt-in. */
  allowMainIngredientReduction?: boolean;
  focus?: TargetMetric[];
  candidates?: readonly CorrectionCandidate[];
  maxProposals?: number;
}

/** Propose corrections through the existing solver. Pure passthrough — no re-ranking. */
export function proposeAutoFix(args: ProposeAutoFixArgs): CorrectionResult {
  return proposeCorrections({
    input: args.input,
    context: args.context,
    redact: !args.exactCorrectionGrams,
    allow_main_ingredient_reduction: args.allowMainIngredientReduction ?? false,
    focus: args.focus,
    candidates: args.candidates,
    max_proposals: args.maxProposals,
  });
}

export type ApplyAutoFixResult =
  | { success: true; newInput: RecipeInput; actions: readonly CorrectionAction[] }
  | { success: false; reason: 'redacted_proposal' | 'no_actions' | 'apply_failed' };

export interface ApplyAutoFixArgs {
  input: RecipeInput;
  /** Only a non-redacted Pro proposal can be applied (redacted carries no grams). */
  proposal: CorrectionProposal | RedactedCorrectionProposal;
  context: CorrectionContext;
  allowMainIngredientReduction?: boolean;
  candidates?: readonly CorrectionCandidate[];
}

/**
 * Apply a proposal's actions immutably via the existing solver apply. Returns a
 * discriminated result (never throws):
 *   - redacted_proposal: a demo/redacted proposal has no actions to apply;
 *   - no_actions: a tradeoff/impossible proposal carries an empty action set;
 *   - apply_failed: `applyCorrectionActions` rejected an action (locked line,
 *     reduction not allowed, etc.).
 */
export function applyAutoFix(args: ApplyAutoFixArgs): ApplyAutoFixResult {
  const { input, proposal, context } = args;
  if (!('actions' in proposal)) {
    return { success: false, reason: 'redacted_proposal' };
  }
  if (proposal.actions.length === 0) {
    return { success: false, reason: 'no_actions' };
  }

  const constraints: CorrectionConstraints = {
    context,
    mode: input.mode,
    allow_main_ingredient_reduction: args.allowMainIngredientReduction ?? false,
    machine_capacity_grams: input.machine_capacity_grams,
  };
  const candidates = args.candidates ?? DEFAULT_CORRECTION_CANDIDATES;

  const newInput = applyCorrectionActions(input, proposal.actions, constraints, candidates);
  if (newInput === null) {
    return { success: false, reason: 'apply_failed' };
  }
  return { success: true, newInput, actions: proposal.actions };
}
