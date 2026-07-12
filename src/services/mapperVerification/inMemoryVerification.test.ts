import { beforeEach, describe, expect, it } from 'vitest';
import type { StatusDecisionInput } from '@/data/products/productStatusDecision';
import { InMemoryVerification, type CreateCaseInput } from './inMemoryVerification';

const NOW = '2026-07-12T10:00:00.000Z';
const ownMeasured: StatusDecisionInput = { product_name_display: 'Vanilla Gelato Base', mapper_status: 'matched', pac_value: 25, pod_value: 18 };
const REQUIRED = ['product_name', 'brand', 'package_size', 'package_unit', 'ean_code', 'category', 'nutrition_basis', 'energy_kcal', 'fat', 'carbohydrate', 'sugars', 'protein', 'salt', 'ingredients_text', 'allergens_text'];

let svc: InMemoryVerification;
let k: number;
beforeEach(() => {
  k = 0;
  svc = new InMemoryVerification(() => NOW, () => `id-${(k += 1)}`);
  svc.grantRole('admin1', 'review_admin');
  svc.grantRole('sr1', 'senior_reviewer');
  svc.grantRole('rev1', 'reviewer');
});

const mkCase = (over: Partial<CreateCaseInput> = {}) =>
  svc.createCase({ caseId: 'c1', productId: 'PR-1', ownerUserId: 'owner1', source: 'ocr', statusDecisionInput: ownMeasured, categoryFamily: 'food_label', ...over });
const resolveAll = (caseId: string, by: string) => REQUIRED.forEach((f) => svc.decideField(caseId, f, 'accept', by));

describe('case lifecycle', () => {
  it('create → submit → assign → in_review', () => {
    mkCase();
    expect(svc.loadCase('c1')?.state).toBe('draft');
    svc.submit('c1', 'owner1');
    expect(svc.loadCase('c1')?.state).toBe('pending_review');
    svc.assign('c1', 'sr1', 'admin1');
    expect(svc.loadCase('c1')?.assignedReviewerId).toBe('sr1');
    expect(svc.loadCase('c1')?.state).toBe('in_review');
  });

  it('assigning requires review-admin', () => {
    mkCase();
    svc.submit('c1', 'owner1');
    expect(() => svc.assign('c1', 'sr1', 'rev1')).toThrow(/review-admin/);
  });
});

describe('sign-off gate — no auto-verify, full gate required', () => {
  beforeEach(() => { mkCase(); svc.submit('c1', 'owner1'); svc.assign('c1', 'sr1', 'admin1'); });

  it('refuses sign-off while required fields are unresolved', () => {
    const gate = svc.evaluate('c1', { signedBy: 'sr1', reason: 'ok', independentProvenance: true });
    expect(gate.allowed).toBe(false);
    expect(gate.blockers.some((b) => /required fields/.test(b))).toBe(true);
  });

  it('a plain reviewer cannot verify (not authorized for sign-off)', () => {
    resolveAll('c1', 'rev1');
    const gate = svc.evaluate('c1', { signedBy: 'rev1', reason: 'ok', independentProvenance: true });
    expect(gate.allowed).toBe(false);
    expect(gate.blockers.some((b) => /not authorized/.test(b))).toBe(true);
  });

  it('permits + records an immutable sign-off once the whole gate passes', () => {
    resolveAll('c1', 'sr1');
    expect(svc.evaluate('c1', { signedBy: 'sr1', reason: 'lab sheet', independentProvenance: true }).allowed).toBe(true);
    const { case: c, signoff } = svc.verify('c1', { signedBy: 'sr1', reason: 'lab sheet confirms pac/pod', independentProvenance: true });
    expect(c.state).toBe('verified');
    expect(signoff.status).toBe('pi_verified');
    expect(signoff.independentProvenance).toBe(true);
    // the verified revision keeps the immutable snapshot
    expect(svc.revisionsOf('c1')[0]?.signoff?.signedBy).toBe('sr1');
    // audit trail records the whole path
    expect(svc.listEvents('c1').map((e) => e.eventType)).toEqual(expect.arrayContaining(['case_created', 'submitted', 'assigned', 'verified']));
    // the product-status write is delegated to the guarded path, not done here
    expect(svc.listEvents('c1').find((e) => e.eventType === 'verified')?.metadata.productStatusWrite).toBe('delegated_to_setProductLifecycleStatus');
  });

  it('verify() throws (no verified state) when the gate refuses', () => {
    resolveAll('c1', 'sr1');
    expect(() => svc.verify('c1', { signedBy: 'sr1', reason: 'x', independentProvenance: false })).toThrow(/refused/);
    expect(svc.loadCase('c1')?.state).toBe('in_review'); // unchanged
  });
});

describe('red flags block sign-off (reuses detector)', () => {
  it('a polyol product cannot be verified even by a senior reviewer', () => {
    mkCase({ caseId: 'c2', statusDecisionInput: { ...ownMeasured, polyol_percent: 12, detected_text: 'contains maltitol' } });
    svc.submit('c2', 'owner1');
    svc.assign('c2', 'sr1', 'admin1');
    resolveAll('c2', 'sr1');
    const gate = svc.evaluate('c2', { signedBy: 'sr1', reason: 'ok', independentProvenance: true });
    expect(gate.allowed).toBe(false);
    expect(gate.redFlagsClear).toBe(false);
  });
});

describe('waivers + reopen + reject', () => {
  it('waiving a blocking flag requires a senior reviewer + reason', () => {
    mkCase();
    expect(() => svc.waiveWarning('c1', 'sweetener_or_polyol', 'ok', 'rev1')).toThrow(/senior/);
    expect(() => svc.waiveWarning('c1', 'sweetener_or_polyol', '  ', 'sr1')).toThrow(/reason/);
    const w = svc.waiveWarning('c1', 'sweetener_or_polyol', 'supplier technical sheet reviewed', 'sr1');
    expect(w.waivedBy).toBe('sr1');
  });

  it('reopen creates a NEW revision and preserves the prior verified snapshot', () => {
    mkCase(); svc.submit('c1', 'owner1'); svc.assign('c1', 'sr1', 'admin1'); resolveAll('c1', 'sr1');
    svc.verify('c1', { signedBy: 'sr1', reason: 'verified', independentProvenance: true });
    svc.reopen('c1', 'new supplier data arrived', 'sr1');
    const c = svc.loadCase('c1');
    expect(c?.revision).toBe(2);
    expect(c?.state).toBe('reopened');
    // revision 1's sign-off is preserved (immutable history)
    expect(svc.revisionsOf('c1')[0]?.signoff?.status).toBe('pi_verified');
    expect(svc.revisionsOf('c1')[1]?.signoff).toBeNull();
  });

  it('reopen requires a senior reviewer + reason', () => {
    mkCase();
    expect(() => svc.reopen('c1', 'x', 'rev1')).toThrow(/senior/);
  });
});

describe('queue', () => {
  it('lists and filters cases with privacy-safe summaries', () => {
    mkCase({ caseId: 'a', priority: 'high' });
    mkCase({ caseId: 'b', priority: 'low' });
    const q = svc.listQueue({}, 'priority', 1, 10);
    expect(q.items[0]?.priority).toBe('high');
    expect(q.total).toBe(2);
  });
});
