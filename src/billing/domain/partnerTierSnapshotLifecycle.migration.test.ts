/**
 * TIER SNAPSHOT LIFECYCLE — P0 Affiliate reliability.
 *
 * The defect: `partner_tier_snapshots` had no row for 2026-09, and BOTH
 * commission writers refuse without one — the Starter Pack writer and the
 * SUBSCRIPTION writer. Any attributed paid order that month would have been
 * taken by Stripe and then deferred for ever, because the refusal is retryable
 * and no retry worker exists. Never Starter-Pack-specific.
 *
 * The intended lifecycle already existed in 20260831203000 but was never
 * applied, because that file also schedules payout batches and depends on the
 * payout execution layer the owner is holding. 20260903090000 applies the
 * snapshot half only, reusing the same functions, ordering and run table.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) =>
  readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');

const LIFECYCLE = read('20260903090000_partner_tier_snapshot_lifecycle.sql');
const INTENDED = read('20260831203000_partner_scheduling.sql');

describe('tier snapshot lifecycle', () => {
  it('CATCHES UP before writing the current month', () => {
    const catchup = LIFECYCLE.indexOf('gellatti_catchup_partner_tier_snapshots_v1()');
    const current = LIFECYCLE.indexOf('gellatti_write_partner_tier_snapshots_v1()');
    expect(catchup).toBeGreaterThan(-1);
    expect(current).toBeGreaterThan(-1);
    // Order is the whole point: a gap must be closed before the new month is
    // added, or a missed month strands its commissions for ever.
    expect(catchup).toBeLessThan(current);
  });

  it('reuses the EXISTING snapshot authority — no parallel tier system', () => {
    for (const fn of [
      'gellatti_catchup_partner_tier_snapshots_v1',
      'gellatti_write_partner_tier_snapshots_v1',
    ]) {
      expect(LIFECYCLE).toContain(fn);
      expect(INTENDED).toContain(fn);
    }
    // It must not compute a tier of its own.
    expect(LIFECYCLE).not.toMatch(/insert\s+into\s+public\.partner_tier_snapshots/i);
  });

  it('is safe under duplicate invocation', () => {
    // An advisory lock so two schedulers cannot race at the month boundary...
    expect(LIFECYCLE).toContain('pg_try_advisory_lock');
    expect(LIFECYCLE).toContain('pg_advisory_unlock');
    // ...and the loser records that it skipped rather than failing.
    expect(LIFECYCLE).toContain('already_running');
  });

  it('runs DAILY, so one missed run cannot cost a whole month', () => {
    expect(LIFECYCLE).toMatch(/cron\.schedule\(\s*'gellatti-partner-tier-snapshots',\s*'30 2 \* \* \*'/);
    // The intended file scheduled snapshots monthly; a missed 1st would leave
    // the entire month uncovered.
    expect(INTENDED).toMatch(/'45 2 1 \* \*'/);
  });

  it('is observable: every run is recorded, success or failure', () => {
    expect(LIFECYCLE).toContain('partner_job_runs');
    expect(LIFECYCLE).toMatch(/ok\s*=\s*true/);
    expect(LIFECYCLE).toMatch(/ok\s*=\s*false/);
    expect(LIFECYCLE).toContain('error_message');
  });

  it('re-schedules cleanly instead of stacking duplicate cron jobs', () => {
    expect(LIFECYCLE).toContain("cron.unschedule('gellatti-partner-tier-snapshots')");
    const unschedule = LIFECYCLE.indexOf('cron.unschedule');
    const schedule = LIFECYCLE.indexOf('cron.schedule');
    expect(unschedule).toBeLessThan(schedule);
  });

  it('cannot move money — it only writes tier rows', () => {
    // Comments are stripped: the migration DOCUMENTS why the payout half of
    // 20260831203000 is deliberately excluded, and prose is not an execution
    // path. What must be absent is any CALL.
    const code = LIFECYCLE.replace(/--.*$/gm, '').toLowerCase();
    for (const forbidden of ['payout', 'transfer', 'livemode', 'commission_entries']) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('is not reachable from a browser role', () => {
    expect(LIFECYCLE).toMatch(
      /revoke all on function public\.gellatti_partner_tier_snapshot_job_v1\(\) from public, anon, authenticated/,
    );
  });
});

describe('the earned month, not the wall-clock month', () => {
  it('both commission writers read the tier of the month the payment was EARNED in', () => {
    const dispatch = readFileSync(
      new URL('../../../supabase/functions/stripe-webhook/dispatch.ts', import.meta.url),
      'utf8',
    );
    // An Aug-31 payment replayed in September must read AUGUST. Both writers
    // derive the month from the payment time, never from now().
    const months = dispatch.match(/commissionMonthDate\(paidAtUtcMs\)/g) ?? [];
    expect(months.length).toBe(2);
    expect(dispatch).not.toMatch(/commissionMonthDate\(Date\.now\(\)\)/);
  });

  it('neither writer falls back to standard when the snapshot is missing', () => {
    const dispatch = readFileSync(
      new URL('../../../supabase/functions/stripe-webhook/dispatch.ts', import.meta.url),
      'utf8',
    );
    const refusals = dispatch.match(/tier_snapshot_missing/g) ?? [];
    expect(refusals.length).toBe(2);
    // No silent default anywhere near the tier resolution.
    expect(dispatch).not.toMatch(/tier\s*\?\?\s*'standard'/);
    expect(dispatch).not.toMatch(/tier\s*\|\|\s*'standard'/);
  });
});

describe('affiliate link -> shop', () => {
  const SHOP = read('20260903091000_partner_content_link_shop_destination.sql');

  it('adds /shop as a destination', () => {
    expect(SHOP).toContain("p_destination_path='/shop'");
    expect(SHOP).toContain("'SHOP'");
  });

  it('does NOT weaken the allowlist — every prior destination survives', () => {
    for (const kept of ["'/subscription'", "'/community'", "'/partner'", "'/@%'", "'/share/%'"]) {
      expect(SHOP).toContain(kept);
    }
    for (const type of ['PUBLIC_PROFILE', 'COMMUNITY_RECIPE', 'SHARED_RECIPE', 'PRICING', 'PUBLIC_PAGE']) {
      expect(SHOP).toContain(type);
    }
  });

  it('keeps the shape checks and the ownership check', () => {
    expect(SHOP).toContain("p_destination_path not like '/%'");
    expect(SHOP).toContain("p_destination_path like '//%'");
    expect(SHOP).toContain('active_owned_partner_code_required');
  });

  it('teaches the TABLE constraint the same type rather than dropping it', () => {
    expect(SHOP).toContain('partner_content_links_destination_type_check');
    expect(SHOP).toMatch(/add constraint partner_content_links_destination_type_check/);
  });
});
