/// <reference types="node" />
/**
 * I-ADM-05 — sensitive admin actions ask first, ask why, and are audited.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  REASON_REQUIRED,
  adminPartnerActionCopy,
  reasonProblem,
  type AdminPartnerPendingAction,
} from './adminPartnerActionConfirm';

const partner = { partnerId: 'p1', partner: 'Kasia Lody' };
const ACTIONS: AdminPartnerPendingAction[] = [
  { kind: 'suspend', ...partner },
  { kind: 'active', ...partner },
  { kind: 'connect', ...partner },
  { kind: 'profile-approve', ...partner },
  { kind: 'profile-disable', ...partner },
  { kind: 'logo-remove', ...partner },
  { kind: 'code-disable', ...partner, codeId: 'c1', item: 'KASIA1' },
  { kind: 'code-enable', ...partner, codeId: 'c1', item: 'KASIA1' },
  { kind: 'link-disable', ...partner, linkId: 'l1', item: 'lato' },
  { kind: 'link-enable', ...partner, linkId: 'l1', item: 'lato' },
  { kind: 'commission', product: 'pro', cadence: 'annual', tier: 'gold', amountCents: 1200 },
  { kind: 'activate', partner: 'Kasia Lody' },
];

describe('every sensitive action says what will happen', () => {
  it('names who or what it acts on, explains itself and labels its confirm', () => {
    for (const action of ACTIONS) {
      const text = adminPartnerActionCopy(action);
      const subject =
        'item' in action ? action.item : 'partner' in action ? action.partner : 'wersję';
      expect(text.title).toContain(subject);
      expect(text.body.length).toBeGreaterThan(10);
      expect(text.confirmLabel).not.toBe('');
    }
  });

  it('what takes something away or changes money is marked for attention', () => {
    const attention = ACTIONS.filter((action) => adminPartnerActionCopy(action).attention).map(
      (action) => action.kind,
    );
    expect(attention).toEqual([
      'suspend',
      'profile-disable',
      'logo-remove',
      'code-disable',
      'link-disable',
      'commission',
      'activate',
    ]);
  });

  it('the commission summary reads as the form does, not as raw values', () => {
    expect(
      adminPartnerActionCopy(ACTIONS.find((action) => action.kind === 'commission')!).body,
    ).toContain('Pro · Rocznie · Gold · 1200');
  });
});

describe('a reason is required wherever the RPC records one', () => {
  it('every action but Connect provisioning asks for a reason — that call takes none', () => {
    expect(
      ACTIONS.filter((action) => !adminPartnerActionCopy(action).needsReason).map(
        (action) => action.kind,
      ),
    ).toEqual(['connect']);
  });

  it('an empty or blank reason is refused; a written one passes', () => {
    expect(reasonProblem('')).toBe(REASON_REQUIRED);
    expect(reasonProblem('   ')).toBe(REASON_REQUIRED);
    expect(reasonProblem('Kod udostępniony na forum z rabatami')).toBeNull();
  });
});

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const files = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort();

/** The body of the newest definition of `fn` — located by its CREATE, not by a grant. */
const definitionOf = (fn: string): string => {
  const opener = `create or replace function public.${fn}(`;
  for (const file of [...files].reverse()) {
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8').toLowerCase();
    const at = sql.lastIndexOf(opener);
    if (at < 0) continue;
    const tag = /\bas (\$[a-z_]*\$)/.exec(sql.slice(at))?.[1];
    if (!tag) continue;
    const open = sql.indexOf(tag, at) + tag.length;
    return sql.slice(open, sql.indexOf(tag, open));
  }
  return '';
};

/** Every RPC the panel's confirmed actions call, and whether it refuses a blank reason. */
const PANEL_RPCS: Record<string, boolean> = {
  gellatti_admin_partner_status_v1: true,
  gellatti_admin_partner_profile_action_v1: true,
  gellatti_admin_partner_link_action_v1: true,
  gellatti_admin_partner_code_action_v1: true,
  gellatti_admin_set_commission_rule_v1: true,
  // Records the reason in its audit row but does not refuse a blank one; the
  // panel's confirmation is what requires it here.
  gellatti_activate_partner_for_user_v1: false,
  // Connect provisioning: the admin-control edge function creates the Stripe
  // account, then registers it — and writes the audit row — through this RPC.
  gellatti_admin_register_partner_connect_v1: false,
};

describe('server side: every confirmed action is audited', () => {
  for (const [fn, refusesBlank] of Object.entries(PANEL_RPCS)) {
    it(`${fn} writes an audit row${refusesBlank ? ' and refuses a blank reason' : ''}`, () => {
      const body = definitionOf(fn);
      expect(body).not.toBe('');
      expect(body).toMatch(/perform\s+public\.gellatti_write_audit_v1\s*\(/);
      if (refusesBlank) expect(body).toMatch(/raise exception\s+'[a-z_]*reason_required'/);
    });
  }
});
