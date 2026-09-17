/// <reference types="node" />
/**
 * J-REF-17 — the referral RPCs never hand one person's data to the other.
 *
 * A referrer sees what they earned: how many people claimed their link, and
 * one row per reward (product, cadence, days, status, date). They never see
 * WHO bought, or anything that identifies the purchase. A referred person, in
 * turn, learns nothing about their referrer from claiming a code.
 *
 * Pinned on the three RPCs a signed-in user may call, at their LATEST
 * definition (found by content, not filename: DB-DRIFT-01 renames are due).
 *
 * Not covered here, deliberately: `authenticated` also holds a table-level
 * SELECT on `referral_rewards` and `user_referral_attributions`, so a referrer
 * reading the table directly gets `referred_user_id` and the purchase's Stripe
 * ids. Closing that is a grant change, which needs the owner's DB approval; it
 * is tracked on the J-REF-17 row, not asserted away in a test.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const files = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort();

/** The latest definition of a function, comments removed, whitespace collapsed. */
const latestDefinition = (name: string): string => {
  const opener = `create or replace function public.${name}(`;
  let found: string | undefined;
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    const start = sql.indexOf(opener);
    if (start < 0) continue;
    const bodyStart = sql.indexOf('$$', start);
    const close = sql.indexOf('$$;', bodyStart + 2);
    found = sql.slice(start, close + 3);
  }
  if (!found) throw new Error(`no migration defines ${name}`);
  return found.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
};

/**
 * The top-level arguments of every `jsonb_build_object(…)` call, split on the
 * commas that are not inside parentheses or quotes — the values are subqueries.
 */
const buildObjectCalls = (definition: string): string[][] => {
  const calls: string[][] = [];
  const opener = 'jsonb_build_object(';
  for (let at = definition.indexOf(opener); at >= 0; at = definition.indexOf(opener, at + 1)) {
    const args: string[] = [];
    let depth = 0;
    let quoted = false;
    let current = '';
    for (let i = at + opener.length; i < definition.length; i += 1) {
      const ch = definition[i]!;
      if (ch === "'") quoted = !quoted;
      if (!quoted && ch === '(') depth += 1;
      if (!quoted && ch === ')') {
        if (depth === 0) break;
        depth -= 1;
      }
      if (!quoted && depth === 0 && ch === ',') {
        args.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    args.push(current.trim());
    calls.push(args);
  }
  return calls;
};

/** Every key any `jsonb_build_object` in the body names: the even arguments. */
const returnedKeys = (definition: string): string[] => {
  const keys = new Set<string>();
  for (const args of buildObjectCalls(definition)) {
    args.forEach((arg, index) => {
      if (index % 2 === 1) return;
      const key = arg.match(/^'([^']*)'$/);
      if (!key) throw new Error(`a non-literal key in jsonb_build_object: ${arg}`);
      keys.add(key[1]!);
    });
  }
  return [...keys].sort();
};

/** Anything that would identify the other person, or their purchase. */
const IDENTIFYING = /referred_user_id|stripe_subscription_id|stripe_invoice_id|attribution_id|reversal_reason|auth\.users|\bemail\b|full_name|display_name|profiles/;

const DASHBOARD = latestDefinition('gellatti_my_referral_dashboard_v1');
const CLAIM = latestDefinition('gellatti_claim_referral_code_v1');
const MY_CODE = latestDefinition('gellatti_my_referral_code_v1');

describe("J-REF-17 — the referrer's dashboard", () => {
  it('returns one reward row as exactly six fields, none about the referred person', () => {
    const rewardRow = DASHBOARD.match(
      /jsonb_agg\(jsonb_build_object\(([^)]*)\) order by r\.earned_at desc\)/,
    );
    expect(rewardRow).not.toBeNull();
    const keys = [...rewardRow![1]!.matchAll(/'([A-Za-z]+)'\s*,/g)].map((m) => m[1]);
    expect(keys).toEqual(['id', 'product', 'cadence', 'bonusDays', 'status', 'earnedAt']);
    expect(rewardRow![1]).not.toMatch(IDENTIFYING);
  });

  it('returns only its own counts and totals at the top level', () => {
    expect(returnedKeys(DASHBOARD)).toEqual(
      [
        'activeBonusEndsAt',
        'bankDays',
        'bonusDays',
        'cadence',
        'code',
        'daysEarned',
        'earnedAt',
        'id',
        'invited',
        'ok',
        'product',
        'reason',
        'reversed',
        'rewarded',
        'rewards',
        'status',
      ].sort(),
    );
  });

  it('reads nothing that identifies the referred person or their purchase', () => {
    expect(DASHBOARD).not.toMatch(IDENTIFYING);
    // `invited` is a count, scoped to the caller as referrer.
    expect(DASHBOARD).toContain(
      "'invited', (select count(*) from public.user_referral_attributions where referrer_user_id = v_user)",
    );
    expect(DASHBOARD).toContain('from public.referral_rewards r where r.referrer_user_id = v_user');
  });

  it('the client type carries the same six fields and no more', () => {
    const service = readFileSync(new URL('../../services/referral.ts', import.meta.url), 'utf8');
    const block = service.match(/export interface ReferralRewardRow \{([\s\S]*?)\}/)?.[1] ?? '';
    const fields = [...block.matchAll(/^\s*([A-Za-z]+)\??:/gm)].map((m) => m[1]);
    expect(fields).toEqual(['id', 'product', 'cadence', 'bonusDays', 'status', 'earnedAt']);
  });
});

describe('J-REF-17 — claiming a code and minting one', () => {
  it('a claim answers only ok and a reason, never who the referrer is', () => {
    expect(returnedKeys(CLAIM)).toEqual(['ok', 'reason']);
    expect(CLAIM).not.toMatch(/'(?:referrer|referrerUserId|referrer_user_id|email|name)'\s*,/);
  });

  it("minting answers only the caller's own code", () => {
    expect(returnedKeys(MY_CODE)).toEqual(['code', 'ok', 'reason', 'status']);
    expect(MY_CODE).not.toMatch(IDENTIFYING);
  });

  it('all three are for signed-in users only', () => {
    const sql = files.map((file) => readFileSync(new URL(file, MIGRATIONS), 'utf8')).join('\n');
    for (const signature of [
      'gellatti_my_referral_dashboard_v1()',
      'gellatti_claim_referral_code_v1(text)',
      'gellatti_my_referral_code_v1()',
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${signature} to authenticated;`);
    }
  });
});
