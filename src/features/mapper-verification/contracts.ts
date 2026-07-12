/**
 * PI VERIFIED & MAPPER REVIEW — shared contracts (types only, no logic/IO/SDK).
 *
 * An additive verification-WORKFLOW layer that COMPOSES the existing product architecture —
 * it never re-implements it:
 *   • the status vocabulary + policy is `@/data/products/productStatusDecision` (reused);
 *   • red flags are `@/data/products/productRedFlags` (reused);
 *   • persistence of PI Verified is `@/services/productStatusWrite.setProductLifecycleStatus`
 *     (reused — its 4 attestations are the load-bearing gate);
 *   • history reuses `product_snapshots`; roles CONSUME Account Access.
 *
 * LOCKED principles encoded here: OCR/CSV/match/confidence can NEVER assign PI Verified;
 * PI Verified needs an explicit authorized reviewer sign-off + independent provenance +
 * red-flags-clear; unknown stays null; corrections append candidates (never overwrite
 * source evidence); every decision keeps actor + timestamp + reason; verified snapshots are
 * immutable; authorization uses internal user ids, never email.
 */
import type { ProductStatus } from '@/data/products/productRow';
import type { RedFlagCode } from '@/data/products/productRedFlags';

/* ── review roles (NEW capabilities, layered on Account Access admin) ───────── */

/** A review-workflow capability. `admin` (from Account Access) is separate from partner. */
export type ReviewRole = 'none' | 'reviewer' | 'senior_reviewer' | 'review_admin';

/** Effective review capabilities for a signed-in identity (resolved, never client-claimed). */
export interface ReviewCapabilities {
  /** May open assigned cases + accept/reject candidates + propose sign-off. */
  canReview: boolean;
  /** May finalise sign-off, waive a blocking flag (with reason), reopen a verified case. */
  canSeniorReview: boolean;
  /** May assign reviewers, activate policy versions, reopen/suspend workflows. */
  canAdminReview: boolean;
  role: ReviewRole;
}

/* ── case / queue ──────────────────────────────────────────────────────────── */

/** Where the product under review originated. */
export type CaseSource =
  | 'ocr'
  | 'csv_import'
  | 'manual_entry'
  | 'supplier_doc'
  | 'existing_product'
  | 'mapper_match'
  | 'pi_calculated'
  | 'pi_generated';

export type QueueState =
  | 'draft'
  | 'pending_review'
  | 'assigned'
  | 'in_review'
  | 'needs_more_evidence'
  | 'blocked'
  | 'ready_for_signoff'
  | 'verified'
  | 'rejected'
  | 'reopened';

/** Terminal queue states — no further transition except an explicit reopen. */
export const TERMINAL_QUEUE_STATES: readonly QueueState[] = ['verified', 'rejected'];

export type ReviewPriority = 'low' | 'normal' | 'high';

/* ── field candidates + provenance ─────────────────────────────────────────── */

/** Where a candidate value came from (superset of OCR EvidenceProvenance). */
export type CandidateSourceType =
  | 'package_label'
  | 'ocr'
  | 'manual_entry'
  | 'csv'
  | 'supplier_sheet'
  | 'manufacturer_data'
  | 'barcode_db'
  | 'mapper_reference'
  | 'pi_calculated'
  | 'pi_generated'
  | 'previous_snapshot'
  | 'reviewer_correction';

/** How a value came to exist (mirrors OCR EvidenceProvenance, extended). */
export type CandidateProvenance = 'explicit' | 'calculated' | 'inferred' | 'manual' | 'absent';

export interface FieldCandidate {
  candidateId: string;
  fieldKey: string;
  rawValue: string | null;
  /** Deterministically normalized value (null = not normalizable / unknown — NEVER a fake 0). */
  normalizedValue: string | null;
  unit: string | null;
  sourceType: CandidateSourceType;
  provenance: CandidateProvenance;
  /** Reference to the source (image id / row id / snapshot id / supplier doc ref). */
  sourceRef: string | null;
  /** 0..100 where meaningful; null when a raw confidence is not meaningful. */
  confidence: number | null;
  /** Calculation/inference method where meaningful (e.g. 'atwater', 'reference_linked'). */
  method: string | null;
  /** Internal user id or system source that created the candidate. NEVER an email. */
  createdBy: string;
  createdAt: string;
  warnings: readonly string[];
  /** Red-flag codes attached to this candidate, if any (reused RedFlagCode vocabulary). */
  redFlags: readonly RedFlagCode[];
  /** Active candidates are selectable; rejected ones stay VISIBLE in history. */
  active: boolean;
  /** When a reviewer correction supersedes an earlier candidate, the superseded id. */
  supersedes: string | null;
}

export type FieldDecisionAction =
  | 'accept'
  | 'reject'
  | 'edit_accept'
  | 'add_reviewer_candidate'
  | 'mark_unknown'
  | 'request_evidence'
  | 'resolve_conflict'
  | 'restore_previous'
  | 'waive_warning'
  | 'defer';

export interface FieldDecision {
  fieldKey: string;
  action: FieldDecisionAction;
  /** The candidate the decision selected (or null for mark_unknown / request_evidence). */
  selectedCandidateId: string | null;
  actorId: string;
  at: string;
  reason: string | null;
}

/** The reviewed state of one field (the current selection + whether it is settled). */
export interface FieldResolution {
  fieldKey: string;
  selectedCandidateId: string | null;
  status: 'unresolved' | 'accepted' | 'edited' | 'unknown' | 'conflict' | 'evidence_requested';
  /** True when a manual correction produced the selected value (→ Manual Adjusted signal). */
  manual: boolean;
}

/* ── red-flag severity taxonomy (over the reused detector) ──────────────────── */

export type FlagSeverity = 'blocking' | 'warning' | 'informational';

export interface ClassifiedFlag {
  code: RedFlagCode | string;
  severity: FlagSeverity;
  reason: string;
  evidence: string | null;
}

export interface WarningWaiver {
  waiverId: string;
  flagCode: string;
  /** A waiver requires an authorized role + a written reason (senior_reviewer / review_admin). */
  waivedBy: string;
  reason: string;
  at: string;
}

/* ── case events (append-only audit) ───────────────────────────────────────── */

export type CaseEventType =
  | 'case_created'
  | 'submitted'
  | 'assigned'
  | 'assignment_changed'
  | 'candidate_added'
  | 'candidate_accepted'
  | 'candidate_rejected'
  | 'manual_candidate_added'
  | 'field_marked_unknown'
  | 'evidence_requested'
  | 'evidence_provided'
  | 'conflict_resolved'
  | 'warning_waived'
  | 'status_changed'
  | 'signoff_proposed'
  | 'verified'
  | 'rejected'
  | 'reopened';

export interface CaseEvent {
  eventType: CaseEventType;
  actorId: string;
  at: string;
  reason: string | null;
  /** Safe metadata — never a secret/token. */
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  /** Idempotency key so the same logical event is never double-recorded. */
  correlationKey: string;
  /** The policy version in force when the event happened. */
  policyVersion: string;
}

/* ── sign-off ──────────────────────────────────────────────────────────────── */

export interface SignoffProposal {
  caseId: string;
  proposedBy: string;
  at: string;
  reason: string;
}

/** The immutable sign-off record produced by a successful PI Verified decision. */
export interface SignoffRecord {
  caseId: string;
  revision: number;
  signedBy: string;
  at: string;
  reason: string;
  policyVersion: string;
  /** The four attestations required by productStatusWrite.assertVerifiedReview. */
  independentProvenance: boolean;
  redFlagsClear: boolean;
  /** Final resolved field selections captured at sign-off (immutable). */
  finalFields: readonly FieldResolution[];
  /** Any waivers displayed at sign-off. */
  waivers: readonly WarningWaiver[];
  /** The product-level status set (always 'pi_verified' for a sign-off record). */
  status: Extract<ProductStatus, 'pi_verified'>;
}

/* ── case + revision ───────────────────────────────────────────────────────── */

export interface VerificationRevision {
  revision: number;
  openedAt: string;
  openedBy: string;
  /** Reason a revision was opened (null for the first revision). */
  openReason: string | null;
  /** The sign-off record for a verified revision, or null. */
  signoff: SignoffRecord | null;
}

export interface VerificationCase {
  caseId: string;
  productId: string;
  ownerUserId: string;
  source: CaseSource;
  state: QueueState;
  priority: ReviewPriority;
  /** Current revision number (1-based); reopening increments it. */
  revision: number;
  assignedReviewerId: string | null;
  createdAt: string;
  lastActivityAt: string;
  candidates: readonly FieldCandidate[];
  resolutions: readonly FieldResolution[];
  waivers: readonly WarningWaiver[];
  events: readonly CaseEvent[];
  /** The policy version this case is being reviewed under. */
  policyVersion: string;
}
