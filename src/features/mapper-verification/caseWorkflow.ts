/**
 * Verification case workflow (PURE) — queue transitions + the PI Verified sign-off gate.
 *
 * The sign-off gate REUSES the existing product policy `decideProductStatus` (it never
 * re-implements the rules) and mirrors the four attestations enforced by the existing
 * persistence guard `productStatusWrite.assertVerifiedReview` (reviewed_by, review_notes,
 * independent_provenance === true, red_flags_clear === true). PI Verified is granted ONLY
 * when the reused policy returns 'pi_verified' AND all workflow preconditions hold.
 */
import {
  decideProductStatus,
  type StatusDecisionInput,
} from '@/data/products/productStatusDecision';
import type { ProductStatus } from '@/data/products/productRow';
import { redFlagsClear as computeRedFlagsClear } from './flagSeverity';
import type {
  ClassifiedFlag,
  QueueState,
  ReviewCapabilities,
  SignoffRecord,
  WarningWaiver,
} from './contracts';
import { TERMINAL_QUEUE_STATES } from './contracts';
import type { RequiredFieldsEvaluation } from './requiredFields';

/* ── queue state machine ───────────────────────────────────────────────────── */

const QUEUE_TRANSITIONS: Readonly<Record<QueueState, readonly QueueState[]>> = {
  draft: ['pending_review'],
  pending_review: ['assigned', 'draft'],
  assigned: ['in_review', 'pending_review'],
  in_review: ['needs_more_evidence', 'blocked', 'ready_for_signoff', 'rejected'],
  needs_more_evidence: ['in_review', 'rejected'],
  blocked: ['in_review', 'rejected'],
  ready_for_signoff: ['verified', 'in_review', 'rejected'],
  verified: ['reopened'],
  rejected: ['reopened'],
  reopened: ['in_review', 'pending_review'],
};

export function canTransitionQueue(from: QueueState, to: QueueState): boolean {
  return QUEUE_TRANSITIONS[from].includes(to);
}

export function isTerminalQueueState(state: QueueState): boolean {
  return TERMINAL_QUEUE_STATES.includes(state);
}

/* ── sign-off gate ─────────────────────────────────────────────────────────── */

export interface SignoffGateInput {
  capabilities: ReviewCapabilities;
  signoff: { signedBy: string; reason: string; independentProvenance: boolean };
  /** The reused product decision input (WITHOUT reviewerApproval — this gate adds it). */
  statusDecisionInput: StatusDecisionInput;
  requiredFields: RequiredFieldsEvaluation;
  classifiedFlags: readonly ClassifiedFlag[];
  waivers: readonly WarningWaiver[];
  duplicateResolved: boolean;
}

export interface SignoffGateResult {
  allowed: boolean;
  blockers: readonly string[];
  /** Status the REUSED policy recommends with the reviewer approval applied. */
  policyStatus: ProductStatus;
  redFlagsClear: boolean;
}

/**
 * Evaluate whether PI Verified sign-off is permitted. Deterministic. Composes:
 *   1. authorized senior reviewer;      2. reviewer id + written reason present;
 *   3. all required fields resolved;    4. duplicate resolved;
 *   5. no unwaived blocking red flags;  6. independent-provenance attestation;
 *   7. the REUSED decideProductStatus (with reviewerApproval) returns 'pi_verified'.
 */
export function evaluateSignoffGate(input: SignoffGateInput): SignoffGateResult {
  const blockers: string[] = [];
  const signedBy = input.signoff.signedBy.trim();
  const reason = input.signoff.reason.trim();

  if (!input.capabilities.canSeniorReview) blockers.push('reviewer is not authorized for sign-off');
  if (signedBy === '') blockers.push('sign-off requires the reviewer id');
  if (reason === '') blockers.push('sign-off requires a written reason');
  if (!input.requiredFields.complete) {
    blockers.push(`unresolved required fields: [${input.requiredFields.missingRequired.concat(input.requiredFields.conflictingRequired).join(', ')}]`);
  }
  if (!input.duplicateResolved) blockers.push('duplicate state is not resolved');

  const rfc = computeRedFlagsClear(input.classifiedFlags, input.waivers);
  if (!rfc) blockers.push('unwaived blocking red flags remain');
  if (!input.signoff.independentProvenance) blockers.push('independent-provenance attestation is required');

  // REUSE the product policy — with the reviewer approval applied — as the source of truth.
  const decision = decideProductStatus({
    ...input.statusDecisionInput,
    reviewerApproval: {
      verified_by: signedBy,
      basis: reason,
      independent_provenance: input.signoff.independentProvenance,
    },
  });
  for (const b of decision.blockers) blockers.push(`policy: ${b}`);
  if (decision.recommended_status !== 'pi_verified') {
    blockers.push(`policy did not grant pi_verified (got '${decision.recommended_status}')`);
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    policyStatus: decision.recommended_status,
    redFlagsClear: rfc,
  };
}

/** Build the immutable sign-off record for a permitted sign-off. Throws if not allowed. */
export function buildSignoffRecord(
  caseId: string,
  revision: number,
  input: SignoffGateInput,
  finalFields: SignoffRecord['finalFields'],
  policyVersion: string,
  now: string,
): SignoffRecord {
  const gate = evaluateSignoffGate(input);
  if (!gate.allowed) {
    throw new Error(`sign-off refused: ${gate.blockers.join('; ')}`);
  }
  return {
    caseId,
    revision,
    signedBy: input.signoff.signedBy.trim(),
    at: now,
    reason: input.signoff.reason.trim(),
    policyVersion,
    independentProvenance: input.signoff.independentProvenance,
    redFlagsClear: gate.redFlagsClear,
    finalFields,
    waivers: input.waivers,
    status: 'pi_verified',
  };
}
