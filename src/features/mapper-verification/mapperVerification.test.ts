import { describe, expect, it } from 'vitest';
import type { EffectiveAccess } from '@/access/accountAccess/contracts';
import type { StatusDecisionInput } from '@/data/products/productStatusDecision';
import { resolveReviewCapabilities } from './reviewRoles';
import { evaluateRequiredFields, type RequiredFieldsInput } from './requiredFields';
import { classifyFlags, redFlagsClear, unwaivedBlockingFlags } from './flagSeverity';
import { buildSignoffRecord, canTransitionQueue, evaluateSignoffGate, type SignoffGateInput } from './caseWorkflow';
import { filterQueue, paginate, sortQueue, summarizeCase } from './queue';
import type { ReviewCapabilities, VerificationCase, WarningWaiver } from './contracts';

const adminAccess = { canAdmin: true } as EffectiveAccess;

describe('resolveReviewCapabilities — hierarchy (admin ≠ partner)', () => {
  it('an Account-Access admin is a review-admin (implies senior + reviewer)', () => {
    const c = resolveReviewCapabilities(adminAccess, 'none');
    expect([c.canReview, c.canSeniorReview, c.canAdminReview]).toEqual([true, true, true]);
  });
  it('senior_reviewer can review + sign off but is not admin', () => {
    const c = resolveReviewCapabilities(null, 'senior_reviewer');
    expect([c.canReview, c.canSeniorReview, c.canAdminReview]).toEqual([true, true, false]);
  });
  it('reviewer can review only', () => {
    const c = resolveReviewCapabilities(null, 'reviewer');
    expect([c.canReview, c.canSeniorReview, c.canAdminReview]).toEqual([true, false, false]);
  });
  it('none grants nothing', () => {
    const c = resolveReviewCapabilities(null, 'none');
    expect([c.canReview, c.canSeniorReview, c.canAdminReview]).toEqual([false, false, false]);
  });
});

describe('evaluateRequiredFields — category-aware, never invents', () => {
  const allSettled = (): RequiredFieldsInput['resolved'] => {
    const r: Record<string, 'accepted'> = {};
    for (const k of ['product_name', 'brand', 'package_size', 'package_unit', 'ean_code', 'category', 'nutrition_basis', 'energy_kcal', 'fat', 'carbohydrate', 'sugars', 'protein', 'salt', 'ingredients_text', 'allergens_text']) {
      r[k] = 'accepted';
    }
    return r;
  };
  it('complete when all required fields are settled', () => {
    const e = evaluateRequiredFields({ categoryFamily: 'food_label', resolved: allSettled() });
    expect(e.complete).toBe(true);
    expect(e.completeness).toBe(1);
  });
  it('an unknown required field blocks (missing, not invented)', () => {
    const resolved = { ...allSettled(), salt: 'unknown' as const };
    const e = evaluateRequiredFields({ categoryFamily: 'food_label', resolved });
    expect(e.complete).toBe(false);
    expect(e.missingRequired).toContain('salt');
  });
  it('a conflicting required field blocks', () => {
    const resolved = { ...allSettled(), sugars: 'conflict' as const };
    const e = evaluateRequiredFields({ categoryFamily: 'food_label', resolved });
    expect(e.conflictingRequired).toContain('sugars');
    expect(e.complete).toBe(false);
  });
  it('ingredient family drops the nutrition-basis / allergen requirements', () => {
    const resolved = { ...allSettled() };
    delete (resolved as Record<string, unknown>).nutrition_basis;
    delete (resolved as Record<string, unknown>).allergens_text;
    const e = evaluateRequiredFields({ categoryFamily: 'ingredient', resolved });
    expect(e.missingRequired).not.toContain('nutrition_basis');
    expect(e.missingRequired).not.toContain('allergens_text');
  });
});

describe('flag severity — all existing codes block; waiver clears', () => {
  it('classifies every detector code as blocking', () => {
    const classified = classifyFlags([{ code: 'sweetener_or_polyol', reason: 'polyol', evidence: 'maltitol' }]);
    expect(classified[0]?.severity).toBe('blocking');
    expect(redFlagsClear(classified, [])).toBe(false);
  });
  it('an authorized waiver clears a blocking flag', () => {
    const classified = classifyFlags([{ code: 'sweetener_or_polyol', reason: 'polyol', evidence: 'maltitol' }]);
    const waivers: WarningWaiver[] = [{ waiverId: 'w1', flagCode: 'sweetener_or_polyol', waivedBy: 'sr1', reason: 'supplier sheet confirms', at: 't' }];
    expect(unwaivedBlockingFlags(classified, waivers)).toHaveLength(0);
    expect(redFlagsClear(classified, waivers)).toBe(true);
  });
});

describe('queue transitions', () => {
  it('allows the review path and reopen, forbids illegal jumps', () => {
    expect(canTransitionQueue('in_review', 'ready_for_signoff')).toBe(true);
    expect(canTransitionQueue('ready_for_signoff', 'verified')).toBe(true);
    expect(canTransitionQueue('verified', 'reopened')).toBe(true);
    expect(canTransitionQueue('draft', 'verified')).toBe(false);
    expect(canTransitionQueue('verified', 'in_review')).toBe(false);
  });
});

// ── the sign-off gate (reuses decideProductStatus) ──────────────────────────
const senior: ReviewCapabilities = { canReview: true, canSeniorReview: true, canAdminReview: false, role: 'senior_reviewer' };
const ownMeasuredMatched: StatusDecisionInput = {
  product_name_display: 'Vanilla Gelato Base',
  mapper_status: 'matched',
  pac_value: 25,
  pod_value: 18,
};
const completeFields = { policyVersion: 'v1', missingRequired: [], conflictingRequired: [], completeness: 1, complete: true };

const gate = (over: Partial<SignoffGateInput> = {}): SignoffGateInput => ({
  capabilities: senior,
  signoff: { signedBy: 'sr-1', reason: 'own-measured pac/pod verified against technical sheet', independentProvenance: true },
  statusDecisionInput: ownMeasuredMatched,
  requiredFields: completeFields,
  classifiedFlags: [],
  waivers: [],
  duplicateResolved: true,
  ...over,
});

describe('evaluateSignoffGate — PI Verified only with the full gate', () => {
  it('permits sign-off for an own-measured matched product with an authorized senior reviewer', () => {
    const r = evaluateSignoffGate(gate());
    expect(r.allowed).toBe(true);
    expect(r.policyStatus).toBe('pi_verified');
  });
  it('OCR/confidence can never auto-verify: no reviewer → not permitted', () => {
    const r = evaluateSignoffGate(gate({ capabilities: { canReview: true, canSeniorReview: false, canAdminReview: false, role: 'reviewer' } }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => /not authorized/.test(b))).toBe(true);
  });
  it('a blocking red flag prevents sign-off (reuses the policy)', () => {
    const flagged: StatusDecisionInput = { ...ownMeasuredMatched, polyol_percent: 12 };
    const r = evaluateSignoffGate(gate({ statusDecisionInput: flagged, classifiedFlags: classifyFlags([{ code: 'sweetener_or_polyol', reason: 'polyol 12%', evidence: 'maltitol 12%' }]) }));
    expect(r.allowed).toBe(false);
    expect(r.policyStatus).not.toBe('pi_verified');
  });
  it('missing required fields block sign-off', () => {
    const r = evaluateSignoffGate(gate({ requiredFields: { ...completeFields, complete: false, missingRequired: ['salt'] } }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => /required fields/.test(b))).toBe(true);
  });
  it('no independent-provenance attestation blocks sign-off', () => {
    const r = evaluateSignoffGate(gate({ signoff: { signedBy: 'sr-1', reason: 'x', independentProvenance: false } }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => /independent-provenance/.test(b))).toBe(true);
  });
  it('an unresolved duplicate blocks sign-off', () => {
    const r = evaluateSignoffGate(gate({ duplicateResolved: false }));
    expect(r.allowed).toBe(false);
  });
  it('buildSignoffRecord returns an immutable record when allowed and throws otherwise', () => {
    const rec = buildSignoffRecord('c1', 1, gate(), [], 'policy.v1', 't1');
    expect(rec.status).toBe('pi_verified');
    expect(rec.signedBy).toBe('sr-1');
    expect(() => buildSignoffRecord('c1', 1, gate({ duplicateResolved: false }), [], 'policy.v1', 't1')).toThrow(/refused/);
  });
});

// ── queue ────────────────────────────────────────────────────────────────────
const mkCase = (over: Partial<VerificationCase>): VerificationCase => ({
  caseId: 'c', productId: 'p', ownerUserId: 'u', source: 'ocr', state: 'pending_review', priority: 'normal',
  revision: 1, assignedReviewerId: null, createdAt: 't0', lastActivityAt: 't0',
  candidates: [], resolutions: [], waivers: [], events: [], policyVersion: 'v1', ...over,
});

describe('queue filter/sort/paginate/summarize', () => {
  const cases = [
    mkCase({ caseId: 'a', priority: 'low', assignedReviewerId: 'r1', createdAt: 't3' }),
    mkCase({ caseId: 'b', priority: 'high', assignedReviewerId: null, createdAt: 't1' }),
    mkCase({ caseId: 'c', priority: 'normal', assignedReviewerId: null, createdAt: 't2' }),
  ];
  it('filters by unassigned + priority', () => {
    expect(filterQueue(cases, { unassigned: true }).map((c) => c.caseId).sort()).toEqual(['b', 'c']);
    expect(filterQueue(cases, { priority: 'high' }).map((c) => c.caseId)).toEqual(['b']);
  });
  it('sorts by priority (high first), deterministic ties', () => {
    expect(sortQueue(cases, 'priority').map((c) => c.caseId)).toEqual(['b', 'c', 'a']);
  });
  it('sorts by age (oldest first)', () => {
    expect(sortQueue(cases, 'age').map((c) => c.caseId)).toEqual(['b', 'c', 'a']);
  });
  it('paginates safely', () => {
    const p = paginate(cases, 2, 2);
    expect(p.totalPages).toBe(2);
    expect(p.items).toHaveLength(1);
  });
  it('summarizeCase counts conflicts + unresolved without leaking data', () => {
    const c = mkCase({ resolutions: [
      { fieldKey: 'fat', selectedCandidateId: null, status: 'conflict', manual: false },
      { fieldKey: 'salt', selectedCandidateId: null, status: 'unresolved', manual: false },
    ] });
    const s = summarizeCase(c);
    expect(s.conflictCount).toBe(1);
    expect(s.unresolvedCount).toBe(1);
  });
});
