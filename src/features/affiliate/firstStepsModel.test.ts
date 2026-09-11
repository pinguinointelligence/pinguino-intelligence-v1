/**
 * G-WEL — first steps are read from what the partner has actually done.
 */
import { describe, expect, it } from 'vitest';
import type { PartnerCodeAnalytics, PartnerWorkspace } from '@/services/partner';
import { firstStepsComplete, partnerFirstSteps } from './firstStepsModel';

const code = (status: PartnerCodeAnalytics['status'], text = 'KASIA1'): PartnerCodeAnalytics => ({
  id: text,
  code: text,
  slug: text.toLowerCase(),
  label: null,
  status,
  createdAt: '2026-09-01T00:00:00.000Z',
  clickCount: 0,
  uniqueVisitors: 0,
  signups: 0,
  paidCustomers: 0,
  grossAttributedRevenueCents: 0,
  refundCommissionCents: 0,
  pendingCommissionCents: 0,
  approvedCommissionCents: 0,
  paidCommissionCents: 0,
});

const workspace = (
  patch: Partial<PartnerWorkspace> & {
    payoutsEnabled?: boolean;
    connectAccountPresent?: boolean;
  },
): PartnerWorkspace => ({
  ok: true,
  partner: {
    id: 'p1',
    status: 'active',
    tier: 'standard',
    onboardingComplete: false,
    payoutsEnabled: patch.payoutsEnabled ?? false,
    connectAccountPresent: patch.connectAccountPresent ?? false,
  },
  codes: patch.codes ?? [],
  links: patch.links ?? [],
  commissions: [],
  payouts: [],
});

const byId = (data: PartnerWorkspace) =>
  Object.fromEntries(partnerFirstSteps(data).map((step) => [step.id, step]));

describe('each step is done exactly when the partner has done it', () => {
  it('a freshly approved partner: the first code exists, a link and payouts do not', () => {
    const steps = byId(workspace({ codes: [code('active')] }));
    expect(steps.code?.done).toBe(true);
    expect(steps.code?.detail).toContain('KASIA1');
    expect(steps.link).toMatchObject({ done: false, section: 'generator' });
    expect(steps.payouts?.done).toBe(false);
  });

  it('only an ACTIVE campaign link counts', () => {
    expect(byId(workspace({ links: [{ status: 'ARCHIVED' }] })).link?.done).toBe(false);
    expect(byId(workspace({ links: [{ status: 'ACTIVE' }] })).link?.done).toBe(true);
  });

  it('only an active code counts — an alias is not a working code', () => {
    const steps = byId(workspace({ codes: [code('retired'), code('blocked', 'OLD2')] }));
    expect(steps.code).toMatchObject({ done: false, section: 'codes' });
  });
});

describe('payouts (G-WEL-05 / G-WEL-07)', () => {
  it('no Connect account yet: the next move is Gellatti’s — no action, and nothing else is blocked', () => {
    const payouts = byId(workspace({})).payouts;
    expect(payouts?.section).toBeUndefined();
    expect(payouts?.detail).toContain('Kody i linki działają już teraz');
  });

  it('an account that is not finished: the partner finishes it in Wypłaty', () => {
    expect(byId(workspace({ connectAccountPresent: true })).payouts).toMatchObject({
      done: false,
      section: 'payouts',
    });
  });

  it('payouts enabled: done', () => {
    expect(
      byId(workspace({ connectAccountPresent: true, payoutsEnabled: true })).payouts?.done,
    ).toBe(true);
  });
});

describe('the guide steps aside when nothing is left', () => {
  it('complete only when every step is done', () => {
    const ready = workspace({
      codes: [code('active')],
      links: [{ status: 'ACTIVE' }],
      connectAccountPresent: true,
      payoutsEnabled: true,
    });
    expect(firstStepsComplete(partnerFirstSteps(ready))).toBe(true);
    expect(firstStepsComplete(partnerFirstSteps(workspace({ codes: [code('active')] })))).toBe(
      false,
    );
  });
});
