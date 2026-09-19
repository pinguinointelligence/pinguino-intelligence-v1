/// <reference types="node" />
/**
 * C-APP-09 / C-APP-10 — what approving a Partner application actually grants.
 *
 * Verified read-only on 2026-09-10: the live
 * gellatti_admin_partner_application_action_v1 equals the repo's latest
 * definition (normalised md5 f718220b7f4d5f10f1e6f7411d2fef19). These tests pin
 * every effect of the approve branch, so none of them can quietly go missing:
 * the account is linked to one partner row and activated, HOME + PRO + PARTNER
 * are granted as entitlements — never as a zero-price Stripe subscription — a
 * first code exists, the profile is approved, the applicant is told, and an
 * audit row is written.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

/** The latest definition of a function in any migration, found by content. */
const latestDefinition = (name: string): string => {
  const opener = `create or replace function public.${name}(`;
  let found: string | undefined;
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    const start = sql.lastIndexOf(opener);
    if (start < 0) continue;
    const tag = /as (\$[a-z]*\$)/.exec(sql.slice(start))?.[1];
    if (!tag) continue;
    const open = sql.indexOf(tag, start) + tag.length;
    found = sql.slice(start, sql.indexOf(tag, open) + tag.length);
  }
  if (!found) throw new Error(`no migration defines ${name}`);
  return found;
};

/** Whitespace-insensitive, so a reformatted line does not read as a lost effect. */
const flat = (sql: string) => sql.replace(/\s+/g, ' ');

const ACTION = latestDefinition('gellatti_admin_partner_application_action_v1');
// Reject and request_information return early; everything after this line is approval.
const APPROVE_START = ACTION.indexOf('v_display := coalesce(');
const APPROVE = flat(ACTION.slice(APPROVE_START));

const has = (snippet: string) => expect(APPROVE).toContain(flat(snippet));

describe('C-APP-09 — approval grants everything it promises', () => {
  it('the approve branch is where the tests think it is', () => {
    expect(APPROVE_START).toBeGreaterThan(0);
  });

  it('only a Partner administrator can act, and that is checked before anything is written', () => {
    const gate = ACTION.indexOf("gellatti_admin_has_permission_v1('PARTNER', v_admin)");
    expect(gate).toBeGreaterThan(-1);
    for (const write of ['update public.', 'insert into public.']) {
      expect(ACTION.indexOf(write), write).toBeGreaterThan(gate);
    }
  });

  it('links the account to exactly one partner row and activates it', () => {
    has('select id into v_partner from public.partners where user_id = v_app.user_id;');
    has(
      "insert into public.partners(user_id, application_id, status) values (v_app.user_id, v_app.id, 'active')",
    );
    has("update public.partners set status = 'active', application_id = v_app.id,");
  });

  it('grants HOME, PRO and PARTNER as entitlements', () => {
    has(
      'insert into public.entitlements(user_id, scope, source_type, source_id, granted_by, metadata)',
    );
    has("select v_app.user_id, s.scope, 'approved_partner', v_partner, v_admin::text,");
    has("from (values ('home'), ('pro'), ('partner')) s(scope)");
  });

  it('approves the public profile', () => {
    has(
      'insert into public.partner_public_profiles(partner_id, slug, display_name, updated_by_user_id)',
    );
    has("moderation_status = 'APPROVED'");
  });

  it('makes a first code available when the partner has none active', () => {
    has("from public.partner_codes where partner_id = v_partner and status = 'active' limit 1;");
    has(
      "insert into public.partner_codes(partner_id, code, slug, status, internal_label) values (v_partner, v_code, v_slug, 'active', 'Pierwszy kod partnera')",
    );
  });

  it('marks the application approved', () => {
    has("set status = 'approved', reviewed_at = statement_timestamp(),");
  });

  it('tells the applicant in-app, and sends them to /partner', () => {
    has("v_app.user_id, 'PARTNER_ACTIVATED', 'partners', v_partner::text,");
    has("'/partner', 'partner:activated:' || v_partner::text");
  });

  it('writes an audit row', () => {
    has(
      "perform public.gellatti_write_audit_v1( 'partner.application_approved', 'partners', v_partner::text,",
    );
  });

  it('Connect becomes available: onboarding requires exactly an active partner', () => {
    const onboarding = readFileSync(
      new URL(
        '../../../supabase/functions/create-connect-onboarding-link/index.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(onboarding).toContain(".from('partners')");
    expect(onboarding).toContain(".select('status, stripe_connect_account_id')");
    expect(onboarding).toContain('return json(403, { error: eligibility.reason })');
  });
});

describe('C-APP-10 — no fake zero-price Stripe subscription for Partner access', () => {
  it('the approval never touches subscriptions, prices or Stripe', () => {
    expect(ACTION).not.toMatch(/customer_subscriptions|billing_price_catalog|stripe/i);
  });

  it('free access is carried by entitlements rows with their own source', () => {
    has("'approved_partner'");
  });
});
