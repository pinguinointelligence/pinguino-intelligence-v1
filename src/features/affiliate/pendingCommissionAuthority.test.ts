/// <reference types="node" />
/**
 * "Oczekująca prowizja" (admin) and "W trakcie" / "Do wypłaty" (Partner) are
 * the NET money still to be paid — the payout authority's own number, never a
 * browser sum.
 *
 * Before: both panels added up GROSS amounts. A held 100 € entry with a 20 €
 * partial refund read 100 € while gellatti_build_payout_batch_v1 would pay 80 €.
 *
 * The owner's cases A–E are proven against the real ledger on the QA branch by
 * scripts/qa-growth/netting/run_netting_proof.py (run e7770cb5: 17/17, E against
 * the real batch builder, every case rolled back). These assertions pin the
 * shape that makes that proof hold: one server rule that mirrors the builder,
 * two thin projections, and panels that only display.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8');

const MIGRATION = read('supabase', 'migrations', '20260918160000_partner_commission_netting.sql');
const ROLLBACK = read('supabase', 'rollbacks', '20260918160000_partner_commission_netting.rollback.sql');
/* The batch builder lives in 20260917140000_payout_execution_batch_binding.sql,
   which ships in #389 (sha256 7446958a…) and is not on this branch's base yet.
   Its predicates are pinned here as text; once #389 is in, the same strings are
   also asserted against the builder itself, so the two cannot drift apart. */
const BUILDER_PATH = join(REPO, 'supabase', 'migrations', '20260917140000_payout_execution_batch_binding.sql');
const BUILDER: string | null = existsSync(BUILDER_PATH) ? readFileSync(BUILDER_PATH, 'utf8') : null;
const inBuilder = (text: string) => {
  if (BUILDER !== null) expect(BUILDER).toContain(text);
};
const PARTNER_PAGE = read('src', 'pages', 'community', 'PartnerPage.tsx');
const ADMIN_PARTNERS = read('src', 'features', 'admin', 'AdminPartnersSection.tsx');

const code = (sql: string) => sql.replace(/--[^\n]*/g, '');
const NETTING = code(MIGRATION.slice(MIGRATION.indexOf('function public.gellatti_partner_commission_netting_v1(')));

describe('one rule, the batch builder\'s', () => {
  it('an entry reserved by an unreleased line is left to that line — as the builder does', () => {
    const reserved =
      'select 1 from public.partner_payout_items i\n' +
      '        where i.commission_entry_id = ce.id and i.released_at is null';
    inBuilder(reserved);
    expect(NETTING).toContain(reserved);
  });

  it('a correction already reserved by a line is not counted again — as the builder does', () => {
    const reserved = 'where i.commission_adjustment_id = ca.id and i.released_at is null';
    inBuilder(reserved);
    expect(NETTING).toContain(reserved);
  });

  it('a correction on an entry a PAID payout settled is netted into the next payout — as the builder does', () => {
    inBuilder("where i.commission_entry_id is not null and i.released_at is null and pp.status = 'paid'");
    expect(NETTING).toContain("and pp.status = 'paid'");
    expect(NETTING).toContain('or a.commission_entry_id in (select s.entry_id from settled_entries s)');
  });

  it('payable is eligible entries plus their open corrections — the builder\'s gross + adjustment', () => {
    inBuilder('gross_cents + adjustment_cents as net_cents');
    expect(NETTING).toContain("from unreserved_entries e where e.status = 'eligible'");
  });

  it('held counts its corrections too, so it is what the same rule pays once the entry is eligible', () => {
    expect(NETTING).toContain("from unreserved_entries e where e.status = 'held'");
    expect(NETTING).toContain("where a.commission_entry_id in (select e.id from unreserved_entries e where e.status = 'held')");
  });

  it('a line already written is in flight and not counted twice', () => {
    expect(NETTING).toContain("and pp.status in ('pending', 'processing')");
    expect(NETTING).toContain("'readyNetCents', t.payable_cents + t.in_flight_cents");
    expect(NETTING).toContain("'pendingNetCents', t.held_cents + t.payable_cents + t.in_flight_cents");
  });

  it('reads the ledger and never writes it', () => {
    expect(code(MIGRATION)).not.toMatch(/\b(insert into|update public\.|delete from|truncate)\b/i);
    // the batch builder is not redefined here: the 72 h DB soak exercises it
    expect(MIGRATION).not.toContain('function public.gellatti_build_payout_batch_v1');
  });
});

describe('who reads which money', () => {
  it('the rule itself is internal', () => {
    expect(MIGRATION).toContain(
      'revoke all on function public.gellatti_partner_commission_netting_v1(uuid, boolean)\n  from public, anon, authenticated;',
    );
  });

  it('a Partner reads only their own row', () => {
    expect(MIGRATION).toContain('where p.user_id = auth.uid()');
    expect(MIGRATION).toContain('grant execute on function public.gellatti_partner_pending_commission_v1() to authenticated;');
  });

  it('an admin needs the PARTNER permission', () => {
    expect(MIGRATION).toContain("if not public.gellatti_admin_has_permission_v1('PARTNER') then");
    expect(MIGRATION).toContain("raise exception 'partner_administrator_required';");
  });

  it('the server decides live or test from the request origin; no client parameter chooses it', () => {
    expect(MIGRATION).toContain("(public.gellatti_request_app_origin_v1() ->> 'environment') = 'production'");
    expect(MIGRATION).toContain('function public.gellatti_partner_pending_commission_v1()\nreturns jsonb');
    expect(MIGRATION).toContain('function public.gellatti_admin_partner_pending_commission_v1()\nreturns jsonb');
  });

  it('refuses to apply before what it reads exists', () => {
    expect(MIGRATION).toContain("raise exception 'apply 20260910175900_mail_origin_and_escaping.sql first'");
    expect(MIGRATION).toContain("raise exception 'apply 20260917140000_payout_execution_batch_binding.sql first'");
  });

  it('the rollback drops the three functions and touches no row', () => {
    expect(ROLLBACK).toContain('drop function if exists public.gellatti_partner_commission_netting_v1(uuid, boolean);');
    expect(ROLLBACK).toContain('drop function if exists public.gellatti_partner_pending_commission_v1();');
    expect(ROLLBACK).toContain('drop function if exists public.gellatti_admin_partner_pending_commission_v1();');
    expect(code(ROLLBACK)).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
  });
});

describe('the panels display; they do not calculate', () => {
  it('the Partner tiles read the server\'s net figures', () => {
    expect(PARTNER_PAGE).toContain('net(pending.data?.heldNetCents)');
    expect(PARTNER_PAGE).toContain('net(pending.data?.readyNetCents)');
    expect(PARTNER_PAGE).not.toContain('money(summary.heldCents)');
    expect(PARTNER_PAGE).not.toContain('money(summary.eligibleCents)');
  });

  it('the admin row reads the server\'s net figure, not the directory\'s gross sum', () => {
    expect(ADMIN_PARTNERS).toContain('row.pendingNetCents');
    expect(ADMIN_PARTNERS).not.toContain('money(partner.pendingCommission)');
  });

  it('no arithmetic on the net fields in either panel', () => {
    for (const source of [PARTNER_PAGE, ADMIN_PARTNERS]) {
      expect(source).not.toMatch(/(held|payable|ready|pending)NetCents\s*[+\-*/]/);
      expect(source).not.toMatch(/[+\-*/]\s*[\w.?]*(held|payable|ready|pending)NetCents/);
      expect(source).not.toMatch(/inFlightCents\s*[-+]/);
    }
  });
});
