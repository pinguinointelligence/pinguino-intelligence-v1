/// <reference types="node" />
/**
 * REFER A FRIEND guard (20260902100000 + 20260902100100).
 *
 * Three things this file refuses to let drift:
 *  1. the SQL bonus-day table and `REFERRAL_BONUS_DAYS` agree (F1/F2);
 *  2. the reward lane never touches the MONEY lane — no statement in either
 *     migration writes commission_entries, commission_adjustments,
 *     partner_payouts, partner_payout_items, payout_batches or
 *     partner_rate_profiles;
 *  3. no user-facing role can write value: every reward-creating function is
 *     revoked from `authenticated`, and no table carries a write policy.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_BONUS_DAYS,
  REFERRAL_BONUS_DAYS,
  decideBonusSettlement,
  proBonusBalance,
  refundableDays,
  referralBonusDays,
} from './referralRewardRules';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const readMigration = (name: string) =>
  readFileSync(join(REPO, 'supabase', 'migrations', name), 'utf8');

const SCHEMA_RAW = readMigration('20260902100000_refer_a_friend_pro_bonus.sql');
const FUNCTIONS_RAW = readMigration('20260902100100_refer_a_friend_functions.sql');
/** Comments explain the money lane by name; only executable SQL is scanned. */
const SCHEMA = SCHEMA_RAW.replace(/--.*$/gm, '');
const FUNCTIONS = FUNCTIONS_RAW.replace(/--.*$/gm, '');
const ALL_SQL = `${SCHEMA}\n${FUNCTIONS}`;

describe('refer-a-friend — SQL/TS parity', () => {
  it('F1/F2 — the SQL bonus-day table matches the module exactly', () => {
    const fn =
      /create or replace function public\.gellatti_referral_bonus_days_v1[\s\S]*?\$\$;/.exec(
        FUNCTIONS,
      )?.[0] ?? '';
    expect(fn).not.toBe('');
    expect(fn).toMatch(/when 'monthly' then 7/);
    expect(fn).toMatch(/when 'annual'\s+then 30/);
    expect(REFERRAL_BONUS_DAYS.monthly).toBe(7);
    expect(REFERRAL_BONUS_DAYS.annual).toBe(30);
    expect(referralBonusDays('monthly')).toBe(7);
    expect(referralBonusDays('annual')).toBe(30);
  });

  it('the reward amounts the DB accepts are exactly the ones the module knows', () => {
    expect(SCHEMA).toMatch(/bonus_days integer not null check \(bonus_days in \(7, 30\)\)/);
    expect([...ALLOWED_BONUS_DAYS].sort((a, b) => a - b)).toEqual([7, 30]);
    expect([...new Set(Object.values(REFERRAL_BONUS_DAYS))].sort((a, b) => a - b)).toEqual([7, 30]);
  });
});

describe('refer-a-friend — separation from the Affiliate money lane', () => {
  const MONEY_TABLES = [
    'commission_entries',
    'commission_adjustments',
    'commission_rules',
    'partner_payouts',
    'partner_payout_items',
    'payout_batches',
    'partner_rate_profiles',
    'partner_tier_snapshots',
  ];

  it('never writes any table of the commission or payout ledger', () => {
    for (const table of MONEY_TABLES) {
      for (const verb of ['insert into', 'update', 'delete from']) {
        expect(ALL_SQL.toLowerCase()).not.toContain(`${verb} public.${table}`);
        expect(ALL_SQL.toLowerCase()).not.toContain(`${verb} ${table}`);
      }
    }
  });

  it('reads the partner lane for exactly one purpose — refusing a double reward', () => {
    // `referral_attributions` (the PARTNER table) may only be READ, and only to
    // decide that the partner owns the conversion.
    const partnerReads = FUNCTIONS.match(/referral_attributions/g) ?? [];
    expect(partnerReads.length).toBeGreaterThan(0);
    expect(FUNCTIONS).toMatch(/partner_attribution_wins/);
    expect(FUNCTIONS).toMatch(/partner_attribution_exists/);
    for (const verb of ['insert into public.referral_attributions', 'update public.referral_attributions']) {
      expect(FUNCTIONS.toLowerCase()).not.toContain(verb);
    }
  });

  it('creates its own tables and does not extend a partner table', () => {
    for (const table of [
      'user_referral_codes',
      'user_referral_attributions',
      'referral_rewards',
      'pro_bonus_consumptions',
    ]) {
      expect(SCHEMA).toContain(`create table if not exists public.${table}`);
    }
    // The ONE existing table it touches is `entitlements`, and only to widen a
    // vocabulary — no column of a partner table is altered.
    const alters = SCHEMA.match(/alter table public\.(\w+)/g) ?? [];
    expect([...new Set(alters)]).toEqual(expect.arrayContaining(['alter table public.entitlements']));
    for (const alter of alters) {
      expect(alter).toMatch(
        /alter table public\.(entitlements|user_referral_codes|user_referral_attributions|referral_rewards|pro_bonus_consumptions)/,
      );
    }
  });
});

describe('refer-a-friend — a user can never mint value', () => {
  const VALUE_FUNCTIONS = [
    'gellatti_record_referral_reward_v1',
    'gellatti_reverse_referral_reward_v1',
    'gellatti_settle_pro_bonus_v1',
    'gellatti_pro_bonus_balance_v1',
  ];

  it('revokes every value-creating function from authenticated and anon', () => {
    for (const fn of VALUE_FUNCTIONS) {
      const revoke = new RegExp(
        `revoke all on function public\\.${fn}\\([^)]*\\)\\s*\\n?\\s*from public, anon, authenticated;`,
      );
      expect(FUNCTIONS).toMatch(revoke);
      // …and never grants them back.
      expect(FUNCTIONS).not.toMatch(new RegExp(`grant execute on function public\\.${fn}[^;]*authenticated`));
    }
  });

  it('grants users only the two harmless entry points', () => {
    const granted = [...FUNCTIONS.matchAll(/grant execute on function public\.(\w+)\([^)]*\)[^;]*to ([^;]+);/g)]
      .filter(([, , roles]) => /authenticated/.test(roles ?? ''))
      .map(([, name]) => name);
    expect(new Set(granted)).toEqual(
      new Set([
        'gellatti_referral_bonus_days_v1', // pure lookup, no side effect
        'gellatti_my_referral_code_v1',
        'gellatti_claim_referral_code_v1',
        'gellatti_my_referral_dashboard_v1',
      ]),
    );
  });

  it('gives the new tables SELECT only, after revoking the Supabase default grant', () => {
    for (const table of [
      'user_referral_codes',
      'user_referral_attributions',
      'referral_rewards',
      'pro_bonus_consumptions',
    ]) {
      expect(SCHEMA).toContain(`revoke all on public.${table} from anon, authenticated;`);
      expect(SCHEMA).toContain(`grant select on public.${table} to authenticated;`);
      expect(SCHEMA).not.toMatch(new RegExp(`grant (insert|update|delete)[^;]*public\\.${table}`));
    }
  });

  it('declares no write policy on any reward table', () => {
    const policies = [...SCHEMA.matchAll(/create policy (\w+) on public\.(\w+)\s+for (\w+)/g)];
    expect(policies.length).toBeGreaterThan(0);
    for (const [, , , command] of policies) {
      expect(command).toBe('select');
    }
  });

  it('F8 — self-referral is a database constraint, not a code path', () => {
    expect(SCHEMA).toMatch(
      /constraint user_referral_no_self check \(referrer_user_id <> referred_user_id\)/,
    );
  });

  it('F3 — one live reward per referred person is a unique index', () => {
    expect(SCHEMA).toMatch(
      /create unique index if not exists referral_rewards_first_purchase_uniq\s*\n\s*on public\.referral_rewards \(referred_user_id\)\s*\n\s*where status = 'earned'/,
    );
  });

  it('one reward per invoice is a unique index', () => {
    expect(SCHEMA).toMatch(
      /create unique index if not exists referral_rewards_invoice_uniq\s*\n\s*on public\.referral_rewards \(stripe_invoice_id\)/,
    );
  });
});

describe('refer-a-friend — the settlement rule', () => {
  it('F5 — a paid-PRO referrer banks the days instead of losing them', () => {
    expect(
      decideBonusSettlement({ paidProActive: true, bonusGrantActive: false, balanceDays: 30 }),
    ).toBe('banked_while_paid_pro');
  });

  it('F5 — a running bonus is cut short when paid PRO starts, and refunded', () => {
    expect(
      decideBonusSettlement({ paidProActive: true, bonusGrantActive: true, balanceDays: 0 }),
    ).toBe('returned_to_bank');
  });

  it('F6 — a referrer without paid PRO activates immediately', () => {
    expect(
      decideBonusSettlement({ paidProActive: false, bonusGrantActive: false, balanceDays: 7 }),
    ).toBe('activated');
  });

  it('is idempotent while a bonus is already running', () => {
    expect(
      decideBonusSettlement({ paidProActive: false, bonusGrantActive: true, balanceDays: 0 }),
    ).toBe('bonus_already_active');
  });

  it('F9 — a negative bank activates nothing until future rewards absorb it', () => {
    expect(
      decideBonusSettlement({ paidProActive: false, bonusGrantActive: false, balanceDays: -7 }),
    ).toBe('nothing_to_activate');
    expect(
      decideBonusSettlement({ paidProActive: false, bonusGrantActive: false, balanceDays: 0 }),
    ).toBe('nothing_to_activate');
  });

  it('returns whole unused days and charges nothing for a part-used day', () => {
    expect(refundableDays(30, 10)).toBe(20);
    expect(refundableDays(30, 10.9)).toBe(20);
    expect(refundableDays(30, 0)).toBe(30);
    expect(refundableDays(30, 30)).toBe(0);
    expect(refundableDays(30, 45)).toBe(0);
    expect(refundableDays(7, -1)).toBe(7);
  });

  it('derives the balance and lets it go negative', () => {
    expect(proBonusBalance({ earnedDays: 37, consumedDays: 7, returnedDays: 0 })).toBe(30);
    expect(proBonusBalance({ earnedDays: 0, consumedDays: 7, returnedDays: 0 })).toBe(-7);
    expect(proBonusBalance({ earnedDays: 30, consumedDays: 30, returnedDays: 20 })).toBe(20);
  });

  it('refuses an unknown cadence rather than guessing a reward', () => {
    expect(() => referralBonusDays('weekly' as never)).toThrow(RangeError);
  });
});
