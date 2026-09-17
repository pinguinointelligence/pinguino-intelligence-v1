/// <reference types="node" />
/**
 * Payout execution — batch binding, netting scope and mode scope.
 *
 * A contract over 20260917140000_payout_execution_batch_binding.sql, which is
 * READY but NOT APPLIED and corrects the equally unapplied
 * 20260831202500_payout_execution.sql. The behaviour itself is proven on an
 * isolated PostgreSQL by scripts/qa-growth/sql/payout_batch_binding_scenarios.sql
 * (hand-written expected amounts). These tests pin the SQL shape that makes
 * those results hold, so a later edit cannot quietly undo them.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const VERSION = '20260917140000_payout_execution_batch_binding';
const RAW = readFileSync(join(REPO, 'supabase', 'migrations', `${VERSION}.sql`), 'utf8');
const ROLLBACK = readFileSync(join(REPO, 'supabase', 'rollbacks', `${VERSION}.rollback.sql`), 'utf8');
const ORIGINAL = readFileSync(join(REPO, 'supabase', 'migrations', '20260831202500_payout_execution.sql'), 'utf8');

/** Comments explain the defects by name; only executable SQL is judged. */
const SQL = RAW.replace(/--[^\n]*/g, '');
const flat = (sql: string) => sql.replace(/\s+/g, ' ');

const fn = (sql: string, name: string): string => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`${name} is not defined here`);
  const end = sql.indexOf('end $$;', start);
  return sql.slice(start, end + 'end $$;'.length);
};

const BUILD = flat(fn(SQL, 'gellatti_build_payout_batch_v1'));
const CLAIM = flat(fn(SQL, 'gellatti_claim_payout_lines_v1'));
const SETTLE = flat(fn(SQL, 'gellatti_settle_payout_line_v2'));
const FAILED = flat(fn(SQL, 'gellatti_mark_payout_failed_v1'));

describe('status', () => {
  it('is READY / NOT APPLIED and corrects the unapplied payout execution file', () => {
    expect(RAW).toContain('STATUS: READY / NOT APPLIED');
    expect(RAW).toContain('20260831202500_payout_execution.sql');
  });
});

describe('N1/N2 — netting counts each amount once', () => {
  it('gross is eligible entries of the batch mode that no active item holds', () => {
    expect(BUILD).toContain("where ce.status = 'eligible' and ce.livemode = p_livemode");
    expect(BUILD).toContain('i.commission_entry_id = ce.id and i.released_at is null');
  });

  it('an adjustment counts only for an entry in this gross, or one a PAID payout settled', () => {
    expect(BUILD).toMatch(
      /counted_adjustments as \(.*and \( exists \(select 1 from gross_entries g where g\.id = ce\.id\) or exists \(select 1 from settled_entries s where s\.entry_id = ce\.id\) \)/,
    );
    expect(BUILD).toMatch(/settled_entries as \(.*pp\.status = 'paid'/);
  });

  it('no longer sums every unsettled adjustment of the partner whatever its entry status (D1)', () => {
    // The original's adjustment sum had no entry-status scope at all.
    expect(flat(ORIGINAL.replace(/--[^\n]*/g, ''))).toMatch(
      /select sum\(ca\.amount_cents\) from public\.commission_adjustments ca join public\.commission_entries ce2 on ce2\.id = ca\.commission_entry_id where ce2\.partner_id = p\.id and ce2\.livemode = p_livemode and not exists/,
    );
    expect(BUILD).not.toContain('ce2.partner_id = p.id');
  });

  it('keeps the payability order: status, Connect readiness, negative, zero, threshold', () => {
    const order = [
      "when partner_status <> 'active' then 'skipped_not_payable'",
      "when not (payouts_enabled and onboarding_complete) then 'skipped_not_payable'",
      "when stripe_connect_account_id is null then 'skipped_not_payable'",
      "when gross_cents + adjustment_cents < 0 then 'skipped_negative_balance'",
      "when gross_cents + adjustment_cents = 0 then 'skipped_below_threshold'",
      "when gross_cents + adjustment_cents < p_threshold_cents then 'skipped_below_threshold'",
    ].map((clause) => BUILD.indexOf(clause));
    expect(order.every((position) => position > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(BUILD).toContain('p_threshold_cents integer default 2500');
  });
});

describe('B1/B2 — build reserves exactly what it counted', () => {
  it('reserves the counted entries and adjustments for every payable line', () => {
    expect(BUILD).toMatch(
      /reserved_entries as \( insert into public\.partner_payout_items \(payout_id, commission_entry_id, amount_cents\) select w\.id, g\.id, g\.amount_cents from written w join gross_entries g on g\.partner_id = w\.partner_id where w\.status = 'pending'/,
    );
    expect(BUILD).toMatch(
      /reserved_adjustments as \( insert into public\.partner_payout_items \(payout_id, commission_adjustment_id, amount_cents\) select w\.id, a\.id, a\.amount_cents from written w join counted_adjustments a on a\.partner_id = w\.partner_id where w\.status = 'pending'/,
    );
  });

  it('refuses to commit a line whose amount differs from its reserved items', () => {
    expect(BUILD).toContain("raise exception 'payout_reservation_mismatch'");
  });

  it('one ACTIVE item per entry and adjustment, globally; released items stay as history', () => {
    const sql = flat(SQL);
    expect(sql).toContain('drop index if exists public.partner_payout_items_entry_uniq;');
    expect(sql).toContain('drop index if exists public.partner_payout_items_adjustment_uniq;');
    expect(sql).toContain(
      'create unique index if not exists partner_payout_items_entry_active_uniq on public.partner_payout_items (commission_entry_id) where commission_entry_id is not null and released_at is null;',
    );
    expect(sql).toContain(
      'create unique index if not exists partner_payout_items_adjustment_active_uniq on public.partner_payout_items (commission_adjustment_id) where commission_adjustment_id is not null and released_at is null;',
    );
    expect(sql).toContain('check ((released_at is null) = (release_reason is null))');
    expect(sql).not.toMatch(/delete from public\.partner_payout_items/);
  });
});

describe('C1 — claim re-validates before any transfer', () => {
  it('two workers claim disjoint lines', () => {
    expect(CLAIM).toContain('for update of pp skip locked');
  });

  it('checks eligibility, late corrections, the item sum and payee readiness', () => {
    for (const problem of [
      'reserved_entry_no_longer_eligible',
      'correction_arrived_after_build',
      'reserved_items_do_not_sum_to_amount',
      'partner_not_payable',
    ]) {
      expect(CLAIM).toContain(`v_problem := '${problem}'`);
    }
    expect(CLAIM).toContain('p.stripe_connect_account_id is not null');
  });

  it('a stale line fails with its reason, releases its reservation, and is audited', () => {
    expect(CLAIM).toContain("set status = 'failed', failure_reason = 'stale_line:' || v_problem");
    expect(CLAIM).toContain("set released_at = p_now, release_reason = 'stale_line:' || v_problem where payout_id = v_line.id and released_at is null");
    expect(CLAIM).toContain("'payout.line_released_stale'");
  });

  it('names its columns unambiguously next to the OUT parameters', () => {
    expect(CLAIM).toContain('#variable_conflict use_column');
  });
});

describe('S1 — settle binds nothing new', () => {
  it('requires the claimed line and the expected partner, amount, currency and mode', () => {
    expect(SETTLE).toContain("if v_line.status <> 'processing' then raise exception 'payout_line_not_claimed'");
    expect(SETTLE).toMatch(
      /v_line\.partner_id <> p_partner_id or v_line\.amount_cents <> p_amount_cents or v_line\.currency <> lower\(btrim\(coalesce\(p_currency, ''\)\)\) or v_line\.livemode <> p_livemode then raise exception 'payout_settlement_does_not_match_line'/,
    );
    expect(SETTLE).toContain("raise exception 'payout_items_do_not_sum_to_amount'");
  });

  it('flips only the entries THIS line reserved, and inserts no item', () => {
    expect(SETTLE).toContain('where i.payout_id = p_payout_id and i.released_at is null and i.commission_entry_id = ce.id');
    expect(SETTLE).not.toContain('insert into public.partner_payout_items');
  });

  it('the same transfer id again is a no-op; a different one is refused', () => {
    expect(SETTLE).toMatch(/if v_line\.stripe_transfer_id = p_stripe_transfer_id then return jsonb_build_object\('id', p_payout_id, 'status', 'paid', 'alreadySettled', true\)/);
    expect(SETTLE).toContain("raise exception 'payout_line_already_paid_by_another_transfer'");
  });

  it('withdraws the unsafe settle', () => {
    expect(flat(SQL)).toContain('drop function if exists public.gellatti_mark_payout_paid_v1(uuid, text, timestamptz);');
  });
});

describe('F1 — a failed line releases, and a transferred line is never failed', () => {
  it('releases the reservation of a line without a transfer', () => {
    expect(FAILED).toContain("raise exception 'payout_line_has_transfer_settle_it_instead'");
    expect(FAILED).toContain("set released_at = p_now, release_reason = 'line_failed:' || p_reason where payout_id = p_payout_id and released_at is null");
    expect(FAILED).toContain("raise exception 'payout_failure_requires_reason'");
  });
});

describe('grant surface', () => {
  it('every function is closed to client roles', () => {
    for (const signature of [
      'gellatti_build_payout_batch_v1(date, boolean, timestamptz, integer)',
      'gellatti_claim_payout_lines_v1(uuid, integer, timestamptz)',
      'gellatti_settle_payout_line_v2(uuid, text, uuid, integer, text, boolean, timestamptz)',
      'gellatti_mark_payout_failed_v1(uuid, text, timestamptz)',
    ]) {
      expect(flat(SQL)).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
    }
    expect(SQL).not.toMatch(/grant\s+execute/i);
  });
});

describe('rollback', () => {
  it('restores the four original function bodies byte-identical', () => {
    for (const name of [
      'gellatti_build_payout_batch_v1',
      'gellatti_claim_payout_lines_v1',
      'gellatti_mark_payout_paid_v1',
      'gellatti_mark_payout_failed_v1',
    ]) {
      expect(fn(ROLLBACK, name)).toBe(fn(ORIGINAL, name));
    }
  });

  it('refuses when released history exists, drops v2, and restores the global indexes', () => {
    expect(ROLLBACK).toContain("raise exception 'rollback refused: released payout items exist");
    expect(ROLLBACK).toContain('drop function if exists public.gellatti_settle_payout_line_v2(');
    expect(flat(ROLLBACK)).toContain(
      'create unique index if not exists partner_payout_items_entry_uniq on public.partner_payout_items (commission_entry_id) where commission_entry_id is not null;',
    );
    expect(ROLLBACK).toMatch(/^begin;$/m);
    expect(ROLLBACK).toMatch(/^commit;$/m);
  });
});
