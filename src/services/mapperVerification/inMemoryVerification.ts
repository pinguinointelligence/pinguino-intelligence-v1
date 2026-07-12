/**
 * In-memory Product Verification adapter — the deterministic reference implementation of the
 * PI Verified workflow. It COMPOSES the pure domain (queue transitions, sign-off gate, required
 * fields, flag severity) + the REUSED product policy (`decideProductStatus` via the gate) +
 * the REUSED red-flag detector, over an in-memory store with injected clock + id generator.
 *
 * This is what browser acceptance drives while paid staging is a launch gate. The production
 * Supabase adapter mirrors this surface against migration 0026 and persists PI Verified ONLY
 * through the existing guarded `productStatusWrite.setProductLifecycleStatus` path.
 */
import { detectRedFlags } from '@/data/products/productRedFlags';
import type { StatusDecisionInput } from '@/data/products/productStatusDecision';
import {
  buildSignoffRecord,
  canTransitionQueue,
  evaluateSignoffGate,
  type SignoffGateResult,
} from '@/features/mapper-verification/caseWorkflow';
import { classifyFlags } from '@/features/mapper-verification/flagSeverity';
import { evaluateRequiredFields, type ProductCategoryFamily } from '@/features/mapper-verification/requiredFields';
import { resolveReviewCapabilities } from '@/features/mapper-verification/reviewRoles';
import { filterQueue, paginate, sortQueue, summarizeCase, type QueueFilter, type QueueSort, type QueueSummary } from '@/features/mapper-verification/queue';
import type {
  CaseEvent,
  CaseEventType,
  ClassifiedFlag,
  FieldCandidate,
  FieldResolution,
  QueueState,
  ReviewCapabilities,
  ReviewRole,
  SignoffRecord,
  VerificationCase,
  VerificationRevision,
  WarningWaiver,
} from '@/features/mapper-verification/contracts';

const POLICY_VERSION = 'pi_verified.policy.v1';

export interface CreateCaseInput {
  caseId?: string;
  productId: string;
  ownerUserId: string;
  source: VerificationCase['source'];
  statusDecisionInput: StatusDecisionInput;
  categoryFamily: ProductCategoryFamily;
  priority?: VerificationCase['priority'];
  duplicateResolved?: boolean;
}

interface CaseRecord extends VerificationCase {
  statusDecisionInput: StatusDecisionInput;
  categoryFamily: ProductCategoryFamily;
  duplicateResolved: boolean;
  revisions: VerificationRevision[];
}

const SETTLED_STATUS: FieldResolution['status'][] = ['accepted', 'edited'];

let seq = 0;

export class InMemoryVerification {
  private readonly cases = new Map<string, CaseRecord>();
  private readonly roles = new Map<string, ReviewRole>();

  constructor(
    private readonly now: () => string,
    private readonly nextId: () => string = () => `id-${(seq += 1)}`,
  ) {}

  /** Grant a review role (a privileged server action in production). */
  grantRole(userId: string, role: ReviewRole): void {
    this.roles.set(userId, role);
  }
  capabilitiesOf(userId: string): ReviewCapabilities {
    return resolveReviewCapabilities(null, this.roles.get(userId) ?? 'none');
  }

  private require(caseId: string): CaseRecord {
    const c = this.cases.get(caseId);
    if (!c) throw new Error(`unknown case ${caseId}`);
    return c;
  }

  private touch(c: CaseRecord): void {
    c.lastActivityAt = this.now();
  }

  private event(c: CaseRecord, eventType: CaseEventType, actorId: string, reason: string | null, metadata: CaseEvent['metadata'] = {}): void {
    const ev: CaseEvent = {
      eventType, actorId, at: this.now(), reason, metadata,
      correlationKey: `${eventType}:${c.caseId}:${c.revision}:${this.nextId()}`,
      policyVersion: c.policyVersion,
    };
    (c.events as CaseEvent[]).push(ev);
  }

  private transition(c: CaseRecord, to: QueueState, actorId: string, reason: string | null): void {
    if (c.state !== to && !canTransitionQueue(c.state, to)) {
      throw new Error(`illegal transition ${c.state} → ${to}`);
    }
    c.state = to;
    this.touch(c);
    this.event(c, 'status_changed', actorId, reason, { to });
  }

  createCase(input: CreateCaseInput): VerificationCase {
    const id = input.caseId ?? this.nextId();
    const now = this.now();
    const c: CaseRecord = {
      caseId: id,
      productId: input.productId,
      ownerUserId: input.ownerUserId,
      source: input.source,
      state: 'draft',
      priority: input.priority ?? 'normal',
      revision: 1,
      assignedReviewerId: null,
      createdAt: now,
      lastActivityAt: now,
      candidates: [],
      resolutions: [],
      waivers: [],
      events: [],
      policyVersion: POLICY_VERSION,
      statusDecisionInput: input.statusDecisionInput,
      categoryFamily: input.categoryFamily,
      duplicateResolved: input.duplicateResolved ?? true,
      revisions: [{ revision: 1, openedAt: now, openedBy: input.ownerUserId, openReason: null, signoff: null }],
    };
    this.cases.set(id, c);
    this.event(c, 'case_created', input.ownerUserId, null);
    return c;
  }

  submit(caseId: string, actorId: string): VerificationCase {
    const c = this.require(caseId);
    this.transition(c, 'pending_review', actorId, null);
    this.event(c, 'submitted', actorId, null);
    return c;
  }

  assign(caseId: string, reviewerId: string, byUserId: string): VerificationCase {
    const c = this.require(caseId);
    if (!this.capabilitiesOf(byUserId).canAdminReview) throw new Error('assigning reviewers requires review-admin');
    c.assignedReviewerId = reviewerId;
    this.transition(c, 'assigned', byUserId, null);
    this.event(c, 'assigned', byUserId, null, { reviewerId });
    if (canTransitionQueue(c.state, 'in_review')) this.transition(c, 'in_review', reviewerId, null);
    return c;
  }

  addCandidate(caseId: string, candidate: Omit<FieldCandidate, 'candidateId' | 'createdAt'>, actorId: string): FieldCandidate {
    const c = this.require(caseId);
    const full: FieldCandidate = { ...candidate, candidateId: this.nextId(), createdAt: this.now() };
    (c.candidates as FieldCandidate[]).push(full);
    this.ensureResolution(c, full.fieldKey);
    this.touch(c);
    this.event(c, candidate.sourceType === 'reviewer_correction' ? 'manual_candidate_added' : 'candidate_added', actorId, null, { fieldKey: full.fieldKey });
    return full;
  }

  private ensureResolution(c: CaseRecord, fieldKey: string): FieldResolution {
    let r = (c.resolutions as FieldResolution[]).find((x) => x.fieldKey === fieldKey);
    if (!r) { r = { fieldKey, selectedCandidateId: null, status: 'unresolved', manual: false }; (c.resolutions as FieldResolution[]).push(r); }
    return r;
  }

  /** Reviewer decision on a field. Corrections append a candidate (source evidence stays). */
  decideField(caseId: string, fieldKey: string, action: 'accept' | 'reject' | 'edit_accept' | 'mark_unknown' | 'request_evidence' | 'resolve_conflict', byUserId: string, opts: { candidateId?: string; editedValue?: string; reason?: string } = {}): FieldResolution {
    const c = this.require(caseId);
    if (!this.capabilitiesOf(byUserId).canReview) throw new Error('field decisions require a reviewer');
    const r = this.ensureResolution(c, fieldKey);
    if (action === 'accept' || action === 'resolve_conflict') { r.status = 'accepted'; r.selectedCandidateId = opts.candidateId ?? r.selectedCandidateId; r.manual = false; }
    else if (action === 'edit_accept') {
      const added = this.addCandidate(caseId, { fieldKey, rawValue: null, normalizedValue: opts.editedValue ?? null, unit: null, sourceType: 'reviewer_correction', provenance: 'manual', sourceRef: null, confidence: null, method: null, createdBy: byUserId, warnings: [], redFlags: [], active: true, supersedes: r.selectedCandidateId }, byUserId);
      r.status = 'edited'; r.selectedCandidateId = added.candidateId; r.manual = true;
    }
    else if (action === 'reject') { if (r.selectedCandidateId === (opts.candidateId ?? null)) { r.selectedCandidateId = null; r.status = 'unresolved'; } this.event(c, 'candidate_rejected', byUserId, opts.reason ?? null, { fieldKey }); this.touch(c); return r; }
    else if (action === 'mark_unknown') { r.status = 'unknown'; r.selectedCandidateId = null; this.event(c, 'field_marked_unknown', byUserId, opts.reason ?? null, { fieldKey }); this.touch(c); return r; }
    else { r.status = 'evidence_requested'; this.event(c, 'evidence_requested', byUserId, opts.reason ?? null, { fieldKey }); this.touch(c); return r; }
    this.event(c, 'candidate_accepted', byUserId, opts.reason ?? null, { fieldKey });
    this.touch(c);
    return r;
  }

  /** Waive a blocking flag — an authorized senior/admin action with a written reason. */
  waiveWarning(caseId: string, flagCode: string, reason: string, byUserId: string): WarningWaiver {
    const c = this.require(caseId);
    if (!this.capabilitiesOf(byUserId).canSeniorReview) throw new Error('waiving a blocking flag requires a senior reviewer');
    if (reason.trim() === '') throw new Error('a waiver requires a written reason');
    const w: WarningWaiver = { waiverId: this.nextId(), flagCode, waivedBy: byUserId, reason, at: this.now() };
    (c.waivers as WarningWaiver[]).push(w);
    this.event(c, 'warning_waived', byUserId, reason, { flagCode });
    this.touch(c);
    return w;
  }

  private classifiedFlags(c: CaseRecord): ClassifiedFlag[] {
    return classifyFlags(detectRedFlags(c.statusDecisionInput));
  }

  private resolvedMap(c: CaseRecord): Record<string, FieldResolution['status']> {
    const m: Record<string, FieldResolution['status']> = {};
    for (const r of c.resolutions) m[r.fieldKey] = r.status;
    return m;
  }

  /** Evaluate the sign-off gate for a case + reviewer sign-off (does not persist). */
  evaluate(caseId: string, signoff: { signedBy: string; reason: string; independentProvenance: boolean }): SignoffGateResult {
    const c = this.require(caseId);
    return evaluateSignoffGate({
      capabilities: this.capabilitiesOf(signoff.signedBy),
      signoff,
      statusDecisionInput: c.statusDecisionInput,
      requiredFields: evaluateRequiredFields({ categoryFamily: c.categoryFamily, resolved: this.resolvedMap(c) }),
      classifiedFlags: this.classifiedFlags(c),
      waivers: c.waivers,
      duplicateResolved: c.duplicateResolved,
    });
  }

  proposeSignoff(caseId: string, byUserId: string): VerificationCase {
    const c = this.require(caseId);
    if (!this.capabilitiesOf(byUserId).canReview) throw new Error('proposing sign-off requires a reviewer');
    this.transition(c, 'ready_for_signoff', byUserId, null);
    this.event(c, 'signoff_proposed', byUserId, null);
    return c;
  }

  /** Attempt PI Verified sign-off. Records an IMMUTABLE sign-off + transitions to verified. */
  verify(caseId: string, signoff: { signedBy: string; reason: string; independentProvenance: boolean }): { case: VerificationCase; signoff: SignoffRecord } {
    const c = this.require(caseId);
    const input = {
      capabilities: this.capabilitiesOf(signoff.signedBy),
      signoff,
      statusDecisionInput: c.statusDecisionInput,
      requiredFields: evaluateRequiredFields({ categoryFamily: c.categoryFamily, resolved: this.resolvedMap(c) }),
      classifiedFlags: this.classifiedFlags(c),
      waivers: c.waivers,
      duplicateResolved: c.duplicateResolved,
    };
    // buildSignoffRecord throws (with the blockers) if the gate refuses — no verified state on failure.
    const record = buildSignoffRecord(caseId, c.revision, input, c.resolutions, c.policyVersion, this.now());
    const rev = c.revisions.find((r) => r.revision === c.revision);
    if (rev) rev.signoff = record;
    // advance to ready_for_signoff via the legal path before the terminal verified transition
    if (c.state !== 'ready_for_signoff' && canTransitionQueue(c.state, 'ready_for_signoff')) {
      this.transition(c, 'ready_for_signoff', signoff.signedBy, 'auto-proposed at sign-off');
      this.event(c, 'signoff_proposed', signoff.signedBy, null);
    }
    this.transition(c, 'verified', signoff.signedBy, signoff.reason);
    this.event(c, 'verified', signoff.signedBy, signoff.reason, { productStatusWrite: 'delegated_to_setProductLifecycleStatus' });
    return { case: c, signoff: record };
  }

  reject(caseId: string, reason: string, byUserId: string): VerificationCase {
    const c = this.require(caseId);
    if (!this.capabilitiesOf(byUserId).canReview) throw new Error('rejecting requires a reviewer');
    this.transition(c, 'rejected', byUserId, reason);
    this.event(c, 'rejected', byUserId, reason);
    return c;
  }

  /** Reopen a verified/rejected case → NEW revision, prior verified snapshot preserved. */
  reopen(caseId: string, reason: string, byUserId: string): VerificationCase {
    const c = this.require(caseId);
    if (!this.capabilitiesOf(byUserId).canSeniorReview) throw new Error('reopening requires a senior reviewer');
    if (reason.trim() === '') throw new Error('reopening requires a reason');
    this.transition(c, 'reopened', byUserId, reason);
    c.revision += 1;
    c.revisions.push({ revision: c.revision, openedAt: this.now(), openedBy: byUserId, openReason: reason, signoff: null });
    this.event(c, 'reopened', byUserId, reason, { revision: c.revision });
    return c;
  }

  /* ── reads ── */
  loadCase(caseId: string): VerificationCase | null { return this.cases.get(caseId) ?? null; }
  revisionsOf(caseId: string): readonly VerificationRevision[] { return this.require(caseId).revisions; }
  listEvents(caseId: string): readonly CaseEvent[] { return this.require(caseId).events; }
  listQueue(filter: QueueFilter = {}, sort: QueueSort = 'priority', page = 1, pageSize = 20): { items: QueueSummary[]; total: number; totalPages: number } {
    const all = sortQueue(filterQueue([...this.cases.values()], filter), sort);
    const p = paginate(all, page, pageSize);
    return { items: p.items.map(summarizeCase), total: p.total, totalPages: p.totalPages };
  }
  isSettled(caseId: string, fieldKey: string): boolean {
    const r = this.require(caseId).resolutions.find((x) => x.fieldKey === fieldKey);
    return r !== undefined && SETTLED_STATUS.includes(r.status);
  }
}
