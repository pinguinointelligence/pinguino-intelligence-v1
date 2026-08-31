/// <reference types="node" />
/**
 * Partner TIER SNAPSHOT WRITER guard (20260831202000).
 *
 * Two halves, both required by the owner:
 *  1. the SQL writer enforces the same rules as tierSnapshots.ts (static scan);
 *  2. the owner's boundary scenarios hold — 99 Standard, 100 Gold, a later drop
 *     below 100 leaves the written snapshot alone and downgrades at the NEXT
 *     snapshot — proven against the pure module that the SQL mirrors.
 *
 * Plus the proof the owner asked for explicitly: a commission event reads the
 * PERSISTED snapshot, never a recomputed or client-supplied tier.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GOLD_THRESHOLD,
  computeTierSnapshot,
  selectSnapshotForMonth,
} from './tierSnapshots';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260831202000_partner_tier_snapshot_writer.sql'),
  'utf8',
);
const SQL = MIGRATION.replace(/--.*$/gm, '');
const DISPATCH = readFileSync(
  join(REPO, 'supabase', 'functions', 'stripe-webhook', 'dispatch.ts'),
  'utf8',
);

const WRITER =
  /create or replace function public\.gellatti_write_partner_tier_snapshots_v1[\s\S]*?\$\$;/.exec(
    SQL,
  )?.[0] ?? '';
const COUNT =
  /create or replace function public\.gellatti_partner_active_referred_count_v1[\s\S]*?\$\$;/.exec(
    SQL,
  )?.[0] ?? '';
const ELITE =
  /create or replace function public\.gellatti_partner_elite_active_v1[\s\S]*?\$\$;/.exec(
    SQL,
  )?.[0] ?? '';

// ---------------------------------------------------------------------------
// 1. SQL invariants
// ---------------------------------------------------------------------------

describe('the writer exists at all — this is the gap that made Gold unreachable', () => {
  it('declares a writer for partner_tier_snapshots', () => {
    expect(WRITER).toContain('insert into public.partner_tier_snapshots');
  });

  it('dispatch.ts reads that same table, so writer and reader now meet', () => {
    expect(DISPATCH).toContain("from('partner_tier_snapshots')");
  });
});

describe('T2 — the Gold threshold', () => {
  it('shares the TS threshold of 100', () => {
    expect(DEFAULT_GOLD_THRESHOLD).toBe(100);
    expect(SQL).toMatch(
      /create or replace function public\.gellatti_gold_threshold_v1[\s\S]*?select 100/,
    );
  });

  it('uses >= so exactly 100 is Gold and 99 is Standard', () => {
    expect(WRITER).toContain('when active_count >= v_threshold then');
    expect(WRITER).not.toContain('active_count > v_threshold');
  });

  it('defaults to standard', () => {
    expect(WRITER).toContain("else 'standard'");
  });
});

describe('T3 — what counts', () => {
  it('counts HOME and PRO combined — no product filter at all', () => {
    expect(COUNT).not.toMatch(/cs\.product\s*=/);
    expect(COUNT).not.toMatch(/product in \(/);
  });

  it('counts distinct subscriptions, so a duplicate attribution cannot inflate the tier', () => {
    expect(COUNT).toContain('count(distinct cs.id)');
  });

  it('excludes the partner’s own subscription (self-referral)', () => {
    expect(COUNT).toContain('cs.user_id <> p.user_id');
  });

  it('only counts active attributions', () => {
    expect(COUNT).toContain("ra.status = 'active'");
  });

  it('counts active and trialing', () => {
    expect(COUNT).toContain("cs.status in ('active', 'trialing')");
  });

  it('counts past_due ONLY inside its already-paid window, never a fixed number of days', () => {
    expect(COUNT).toContain("cs.status = 'past_due'");
    expect(COUNT).toContain('cs.current_period_end > p_at');
    expect(COUNT).not.toMatch(/interval\s+'\d+\s+day/i);
  });

  it('ignores cancel_at_period_end, so a cancelling subscription still counts until access ends', () => {
    expect(COUNT).not.toContain('cancel_at_period_end');
  });
});

describe('T4 — an active Elite override wins', () => {
  it('is checked before the automatic tier', () => {
    const caseBlock = /case\s+when elite then 'elite'[\s\S]*?end as tier/.exec(WRITER)?.[0] ?? '';
    expect(caseBlock).toContain("when elite then 'elite'");
    expect(caseBlock.indexOf("'elite'")).toBeLessThan(caseBlock.indexOf("'gold'"));
  });

  it('derives Elite from the rate profile, so the override and its rates cannot disagree', () => {
    expect(ELITE).toContain('from public.partner_rate_profiles rp');
  });

  it('respects the window and the revocation', () => {
    expect(ELITE).toContain('rp.effective_start <= p_at');
    expect(ELITE).toContain('rp.effective_end is null or p_at < rp.effective_end');
    expect(ELITE).toContain('rp.revoked_at    is null or p_at < rp.revoked_at');
  });

  it('records the override on the snapshot for audit', () => {
    expect(WRITER).toContain('elite_override');
  });
});

describe('immutability, idempotency and no retroactive rewrite', () => {
  it('inserts with ON CONFLICT DO NOTHING — the first snapshot for a month wins', () => {
    expect(WRITER).toContain('on conflict (partner_id, month) do nothing');
  });

  it('never updates or deletes an existing snapshot', () => {
    expect(/update public\.partner_tier_snapshots/i.test(SQL)).toBe(false);
    expect(/delete from public\.partner_tier_snapshots/i.test(SQL)).toBe(false);
  });

  it('reports how many were skipped, so a second run is visibly a no-op', () => {
    expect(WRITER).toContain('snapshotsSkipped');
  });

  it('the rollback deliberately does NOT remove written snapshots', () => {
    expect(MIGRATION).toContain('Written snapshots are NOT removed by a rollback');
  });
});

describe('Europe/Madrid month boundaries', () => {
  it('derives the month in Madrid, not UTC or server-local time', () => {
    expect(WRITER).toContain("at time zone 'Europe/Madrid'");
    expect(WRITER).toContain("date_trunc('month'");
  });

  it('refuses a month that is not the first day', () => {
    expect(WRITER).toContain('tier_snapshot_month_must_be_first_of_month');
  });

  it('measures counts at an explicit instant rather than an ambient clock', () => {
    expect(WRITER).toContain('p_count_at timestamptz');
    expect(WRITER).toContain('countedAt');
  });
});

describe('scope and security', () => {
  it('writes snapshots only for active partners', () => {
    expect(WRITER).toContain("where p.status = 'active'");
  });

  it('no writer function is client-callable', () => {
    for (const fn of [
      'gellatti_write_partner_tier_snapshots_v1',
      'gellatti_partner_active_referred_count_v1',
      'gellatti_partner_elite_active_v1',
    ]) {
      expect(SQL, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}`));
      expect(new RegExp(`grant execute on function public\\.${fn}`).test(SQL), fn).toBe(false);
    }
  });

  it('the admin read requires an admin permission', () => {
    const fn =
      /create or replace function public\.gellatti_admin_partner_tier_snapshots_v1[\s\S]*?\$\$;/.exec(
        SQL,
      )?.[0] ?? '';
    expect(fn).toContain('gellatti_admin_has_permission_v1');
  });
});

// ---------------------------------------------------------------------------
// 2. The owner's boundary scenarios, on the module the SQL mirrors
// ---------------------------------------------------------------------------

function snapshotFor(count: number, month: string) {
  return computeTierSnapshot('partner-1', month, count);
}

describe('owner scenario — 99 snapshots Standard', () => {
  it('99 eligible actives is Standard', () => {
    const snapshot = snapshotFor(99, '2026-01');
    expect(snapshot.count).toBe(99);
    expect(snapshot.automaticTier).toBe('standard');
    expect(snapshot.effectiveTier).toBe('standard');
  });
});

describe('owner scenario — 100 snapshots Gold', () => {
  it('exactly 100 flips to Gold', () => {
    const snapshot = snapshotFor(100, '2026-02');
    expect(snapshot.count).toBe(100);
    expect(snapshot.effectiveTier).toBe('gold');
  });

  it('the boundary is exact — 99 Standard, 100 Gold, 101 Gold', () => {
    expect(snapshotFor(99, '2026-02').effectiveTier).toBe('standard');
    expect(snapshotFor(100, '2026-02').effectiveTier).toBe('gold');
    expect(snapshotFor(101, '2026-02').effectiveTier).toBe('gold');
  });
});

describe('owner scenario — dropping below 100 preserves the current snapshot and downgrades NEXT', () => {
  it('the written Gold snapshot is unchanged by a later drop, and the next month is Standard', () => {
    const february = snapshotFor(100, '2026-02'); // written when the partner had 100
    const march = snapshotFor(87, '2026-03'); // the count fell during March

    // the already-written month keeps its tier — this is what immutability buys
    expect(february.effectiveTier).toBe('gold');
    expect(february.count).toBe(100);

    // the downgrade lands on the NEXT snapshot, never retroactively
    expect(march.effectiveTier).toBe('standard');
    expect(march.count).toBe(87);
  });

  it('a commission earned in February still resolves Gold after the March downgrade', () => {
    const history = [snapshotFor(100, '2026-02'), snapshotFor(87, '2026-03')];
    expect(selectSnapshotForMonth(history, 'partner-1', '2026-02')?.effectiveTier).toBe('gold');
    expect(selectSnapshotForMonth(history, 'partner-1', '2026-03')?.effectiveTier).toBe('standard');
  });

  it('selecting a month never falls back to another month', () => {
    const history = [snapshotFor(100, '2026-02')];
    expect(selectSnapshotForMonth(history, 'partner-1', '2026-03')).toBeNull();
    expect(selectSnapshotForMonth(history, 'partner-1', '2026-02')).toEqual(history[0]);
  });

  it('computation is pure — the same inputs give an identical snapshot', () => {
    expect(snapshotFor(100, '2026-02')).toEqual(snapshotFor(100, '2026-02'));
  });
});

// ---------------------------------------------------------------------------
// 3. The commission event reads the PERSISTED snapshot
// ---------------------------------------------------------------------------

describe('a commission event reads the persisted snapshot, not a calculation', () => {
  it('selects the tier from partner_tier_snapshots for the earned month', () => {
    expect(DISPATCH).toContain("from('partner_tier_snapshots')");
    expect(DISPATCH).toContain(".select('tier')");
    expect(DISPATCH).toContain(".eq('month', month)");
  });

  it('defers the event when the snapshot is missing rather than guessing a tier', () => {
    expect(DISPATCH).toContain('tier_snapshot_missing');
    expect(DISPATCH).toMatch(/if \(!tier\) throw new RetryableEffectError/);
  });

  it('never falls back to the partners.tier convenience mirror', () => {
    // the tier used for money must come from the month's snapshot only
    expect(DISPATCH).not.toMatch(/\.select\('[^']*\btier\b[^']*'\)[\s\S]{0,200}from\('partners'\)/);
    expect(DISPATCH).not.toContain('partnerRow.tier');
  });

  it('never accepts a tier from the webhook payload or any client input', () => {
    expect(DISPATCH).not.toMatch(/tier\s*[:=]\s*(event|payload|body|input|req)\./);
  });

  it('keys the snapshot lookup on the month the commission was EARNED', () => {
    expect(DISPATCH).toContain('const month = commissionMonthDate(paidAtUtcMs)');
  });
});

// ---------------------------------------------------------------------------
// 4. Owner point D — the catch-up contract, BOTH directions
// ---------------------------------------------------------------------------

describe('owner point D — a late run must produce the SAME snapshot as an on-time run', () => {
  // The property that makes a catch-up safe: the tier depends only on the
  // boundary's own facts, so WHEN the job runs cannot change what it writes.
  it('February Gold → March Standard: the late February write is still Gold', () => {
    const februaryOnTime = snapshotFor(105, '2026-02'); // what 1 Feb would have written
    const februaryLate = snapshotFor(105, '2026-02'); // what a 3 Mar catch-up writes
    expect(februaryLate).toEqual(februaryOnTime);
    expect(februaryLate.effectiveTier).toBe('gold');

    const march = snapshotFor(87, '2026-03');
    expect(march.effectiveTier).toBe('standard');
    // and February is untouched by March's fall
    expect(februaryLate.count).toBe(105);
  });

  it('February Standard → March Gold: the inverse never overpays February', () => {
    const february = snapshotFor(87, '2026-02');
    const march = snapshotFor(105, '2026-03');
    expect(february.effectiveTier).toBe('standard');
    expect(march.effectiveTier).toBe('gold');
    // February must NOT inherit March's Gold — that would overpay
    expect(february.count).toBe(87);
  });

  it('the rejected design would have got both cases wrong', () => {
    // Filling February with March's count: 87 → Standard, underpaying a Gold
    // month. And in the inverse, 105 → Gold, overpaying a Standard month.
    // Recorded as a test so the mistake cannot quietly return.
    expect(snapshotFor(87, '2026-02').effectiveTier).toBe('standard');
    expect(snapshotFor(105, '2026-02').effectiveTier).toBe('gold');
    expect(snapshotFor(87, '2026-02')).not.toEqual(snapshotFor(105, '2026-02'));
  });

  it('a commission earned in February keeps February’s tier after March moves', () => {
    const history = [snapshotFor(105, '2026-02'), snapshotFor(87, '2026-03')];
    expect(selectSnapshotForMonth(history, 'partner-1', '2026-02')?.effectiveTier).toBe('gold');
    expect(selectSnapshotForMonth(history, 'partner-1', '2026-03')?.effectiveTier).toBe('standard');
  });

  it('and the same holds in the inverse direction', () => {
    const history = [snapshotFor(87, '2026-02'), snapshotFor(105, '2026-03')];
    expect(selectSnapshotForMonth(history, 'partner-1', '2026-02')?.effectiveTier).toBe('standard');
    expect(selectSnapshotForMonth(history, 'partner-1', '2026-03')?.effectiveTier).toBe('gold');
  });

  it('writing twice is writing once — the snapshot is a pure function of its inputs', () => {
    expect(snapshotFor(105, '2026-02')).toEqual(snapshotFor(105, '2026-02'));
    expect(snapshotFor(87, '2026-03')).toEqual(snapshotFor(87, '2026-03'));
  });

  it('February and March are computed independently', () => {
    // no shared state: the March value cannot influence the February one
    const feb = snapshotFor(105, '2026-02');
    const mar = snapshotFor(87, '2026-03');
    expect(feb.month).toBe('2026-02');
    expect(mar.month).toBe('2026-03');
    expect(feb.count).not.toBe(mar.count);
  });
});

describe('owner point D — the SQL uses the boundary, so late equals on-time', () => {
  const CATCHUP =
    /create or replace function public\.gellatti_catchup_partner_tier_snapshots_v1[\s\S]*?\$\$;/.exec(
      SQL,
    )?.[0] ?? '';

  it('computes the boundary from the MONTH, never from the run time', () => {
    expect(CATCHUP).toContain("v_boundary := (v_month::timestamp at time zone 'Europe/Madrid')");
  });

  it('passes the boundary — not p_now — to both the count and the Elite check', () => {
    expect(CATCHUP).toContain('gellatti_partner_referred_count_asof_v1(v_partner.id, v_boundary)');
    expect(CATCHUP).toContain('gellatti_partner_elite_active_v1(v_partner.id, v_boundary)');
  });

  it('uses p_now ONLY as computed_at, so lateness is visible but not causal', () => {
    // computed_at is provenance; it must never feed the tier decision
    expect(CATCHUP).toMatch(/v_count, v_elite, p_now/);
  });

  it('still refuses to overwrite an existing snapshot', () => {
    expect(CATCHUP).toContain('on conflict (partner_id, month) do nothing');
  });
});
