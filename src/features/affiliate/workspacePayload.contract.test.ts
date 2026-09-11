/// <reference types="node" />
/**
 * S-SEC-03 — the Partner workspace returns only the partner's own data, and
 * nothing that identifies a customer.
 *
 * D-LINK-04 guarded the render side (the page prints no customer field). This
 * guards the payload itself — what reaches the browser — over the latest
 * definition of gellatti_partner_workspace_v1:
 * - the partner is the caller's own row, and every list is scoped to it;
 * - every returned key is on an allowlist, so a new field is added deliberately;
 * - no key names a person, a contact detail, an account or a payment method;
 * - customer-side numbers are aggregates — counts, never rows.
 *
 * Two provider identifiers are returned but never rendered: a commission's
 * Stripe invoice id and a payout's failure reason. Dropping them from the
 * payload is a DB change, recorded on S-SEC-03 for the owner.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

const WORKSPACE = (() => {
  const opener = 'create or replace function public.gellatti_partner_workspace_v1(';
  let found: string | undefined;
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    const start = sql.lastIndexOf(opener);
    if (start < 0) continue;
    const tag = /as (\$[a-z]*\$)/.exec(sql.slice(start))?.[1];
    if (!tag) continue;
    const open = sql.indexOf(tag, start) + tag.length;
    found = sql.slice(open, sql.indexOf(tag, open));
  }
  if (!found) throw new Error('no migration defines the workspace RPC');
  return found;
})();

const KEYS = [
  ...new Set([...WORKSPACE.matchAll(/'([A-Za-z]+)',/g)].map((match) => match[1] ?? '')),
];

/** Every field the partner's browser may receive. Add here deliberately, or not at all. */
const ALLOWED = new Set([
  // envelope
  'ok',
  'reason',
  'status',
  'partner',
  'profile',
  'codes',
  'links',
  'commissions',
  'payouts',
  // the partner's own row and public profile
  'id',
  'tier',
  'onboardingComplete',
  'payoutsEnabled',
  'connectAccountPresent',
  'slug',
  'displayName',
  'logoPath',
  'shortDescription',
  'websiteUrl',
  'socialLinks',
  'defaultDestinationPath',
  'moderationStatus',
  'updatedAt',
  // codes and campaign links
  'code',
  'label',
  'createdAt',
  'linkSlug',
  'destinationType',
  'destinationPath',
  'partnerCodeId',
  // aggregates — counts and sums, never rows
  'clickCount',
  'uniqueVisitors',
  'signups',
  'paidCustomers',
  'activeSubscriptions',
  'grossAttributedRevenueCents',
  'refundCommissionCents',
  'pendingCommissionCents',
  'approvedCommissionCents',
  'paidCommissionCents',
  // the partner's own ledger rows
  'product',
  'cadence',
  'amountCents',
  'currency',
  'earnedAt',
  'eligibleAt',
  'livemode',
  'carryForwardCents',
  'paidAt',
  // provider identifiers — returned, never rendered (see the header)
  'invoiceId',
  'failureReason',
]);

/** The partner's own public name is the one "name" the payload may carry. */
const OWN_FIELDS = new Set(['displayName']);
const PERSONAL =
  /email|phone|address|name$|firstName|lastName|userId|customer(?!s)|visitor(?!s)|card|iban|recipe|hash/i;

describe("S-SEC-03 — only the partner's own rows", () => {
  it("the partner is the caller's own row", () => {
    expect(WORKSPACE).toContain(
      'select * into v_partner from public.partners where user_id=auth.uid();',
    );
  });

  it('every list is scoped to that partner', () => {
    for (const scope of [
      'where p.partner_id=v_partner.id',
      'from public.partner_codes c where c.partner_id=v_partner.id',
      'where l.partner_id=v_partner.id',
      'where ce.partner_id=v_partner.id',
      'where pp.partner_id=v_partner.id',
    ]) {
      expect(WORKSPACE, scope).toContain(scope);
    }
  });
});

describe('S-SEC-03 — nothing that identifies a customer', () => {
  it('every returned key is on the allowlist', () => {
    expect(KEYS.filter((key) => !ALLOWED.has(key))).toEqual([]);
  });

  it('no key names a person, a contact detail, an account or a payment method', () => {
    for (const key of KEYS) {
      if (!OWN_FIELDS.has(key)) expect(key).not.toMatch(PERSONAL);
    }
  });

  it('the body never reaches into accounts or contact data', () => {
    expect(WORKSPACE).not.toMatch(/auth\.users|\.email\b|raw_user_meta_data/i);
  });

  it('customer-side numbers are aggregates — counts, never rows', () => {
    const values = [
      ...WORKSPACE.matchAll(
        /'(clickCount|uniqueVisitors|signups|paidCustomers|activeSubscriptions)',\s*([^\n]+)/g,
      ),
    ];
    expect(values.length).toBeGreaterThan(0);
    for (const [, key, value] of values) {
      expect(value, key).toMatch(
        /^\(select count\(|^public\.gellatti_partner_active_referred_count_v2\(/,
      );
    }
  });

  it('the two provider identifiers in the payload are never rendered', () => {
    const page = readFileSync(
      new URL('../../pages/community/PartnerPage.tsx', import.meta.url),
      'utf8',
    );
    expect(page).not.toMatch(/row\.invoiceId|row\.failureReason/);
  });
});
