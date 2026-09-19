/**
 * THE CANONICAL RESCUE DIAGNOSTIC RECORD.
 *
 * Owner decision (NAPRAWA 5): „Create canonical diagnostic evidence... Do not
 * expose all diagnostics to the customer. Tests and audit must be able to
 * inspect them."
 *
 * So this is the shape every Rescue stage reports into, and the shape the audit
 * and the contract tests read back. It holds EVIDENCE, not presentation: no
 * copy, no labels, no decisions about what a customer sees. A surface picks
 * what to show; it never picks what is true.
 *
 * Two rules are structural rather than documentary:
 *
 *  - every candidate carries WHERE IT CAME FROM (`source`) and WHY IT WAS OR
 *    WAS NOT USED (`rejectionReason`), so „no recommendation" is always
 *    explainable and never an absence of information;
 *  - the whole record carries the six-stage chain and its classification, so
 *    nothing can report „genuinely unreachable" without the exhaustion evidence
 *    that entitles it to.
 */
import type { RescueBaseRoute } from './rescueBaseRoute';
import type { RescueInadmissibleReason } from './rescueToolboxAuthority';
import type { RescueProteinVerdict } from './rescueProteinGate';
import type {
  RescueOutcomeClassification,
  RescueStageRecord,
} from './rescueOutcomeClassification';

/** Where a candidate came from. A customer-facing surface may phrase this; it
 *  may not invent a source that CORE did not record. */
export type RescueCandidateSource =
  | 'existing_line'
  | 'profile_toolbox'
  | 'starter_pack'
  | 'constraint_what_if'
  | 'bounded_pair';

export type RescueHardGateResult = 'PASS' | 'FAIL' | 'SKIPPED';

export interface RescueCandidateDiagnostic {
  readonly canonicalIngredientId: string;
  readonly namePl: string;
  readonly source: RescueCandidateSource;
  /** The interval the dosage authority permitted on this draft. */
  readonly dosageBandMinGrams: number | null;
  readonly dosageBandMaxGrams: number | null;
  /** Provenance of that authority, including „no published window" where true. */
  readonly dosageProvenance: string | null;
  /** Every dose actually priced, smallest first. */
  readonly dosesTested: readonly number[];
  /** The smallest dose that won, or null when none did. */
  readonly smallestWinningGrams: number | null;
  readonly scoreBefore: number | null;
  readonly scoreAfter: number | null;
  readonly distanceBefore: number | null;
  readonly distanceAfter: number | null;
  readonly targetReached: boolean;
  /** True when the winning dose sits in the approved controlled range. */
  readonly relaxationUsed: boolean;
  readonly profileIdentityPreserved: boolean;
  readonly proteinVerdict: RescueProteinVerdict;
  readonly hardGates: RescueHardGateResult;
  /** Why this candidate is not the recommendation. Null when it IS. */
  readonly rejectionReason: RescueInadmissibleReason | 'no_material_improvement' | null;
}

export interface RescueDiagnosticRecord {
  /** Profile and base route the whole search was bound by. */
  readonly profile: string;
  readonly baseRoute: RescueBaseRoute;
  /** Requested Direction axes and their levels, as asked. */
  readonly directionAxes: readonly { readonly axis: string; readonly level: number }[];
  readonly currentScore: number | null;
  readonly currentDistance: number | null;
  readonly currentEnvelope: 'normal' | 'controlled';
  readonly candidates: readonly RescueCandidateDiagnostic[];
  readonly candidatesEvaluated: number;
  readonly pairRescueAttempted: boolean;
  readonly stages: readonly RescueStageRecord[];
  readonly classification: RescueOutcomeClassification;
  /** Cheap screened vectors priced. The performance contract reads this. */
  readonly screenEvaluations: number;
  /** Full Previews priced. The expensive half of the same contract. */
  readonly previewEvaluations: number;
}

/**
 * Assemble the record. Pure, total, and deliberately unopinionated: it does not
 * decide anything, it only refuses to lose anything.
 */
export function buildRescueDiagnosticRecord(
  parts: RescueDiagnosticRecord,
): RescueDiagnosticRecord {
  return {
    ...parts,
    candidates: [...parts.candidates],
    stages: [...parts.stages],
    directionAxes: [...parts.directionAxes],
  };
}

/**
 * The one question a surface is allowed to ask the record.
 *
 * A recommendation exists when a candidate survived every gate and nothing
 * rejected it. Everything else — including „we found nothing" — is answered
 * from `classification`, which carries the exhaustion evidence with it.
 */
export const recommendedCandidate = (
  record: RescueDiagnosticRecord,
): RescueCandidateDiagnostic | null =>
  record.candidates.find(
    (candidate) =>
      candidate.rejectionReason === null &&
      candidate.hardGates === 'PASS' &&
      candidate.profileIdentityPreserved,
  ) ?? null;
