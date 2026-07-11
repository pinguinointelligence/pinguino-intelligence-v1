/// <reference types="node" />
/**
 * Billing/Partner platform migration guards (Track D — migrations 0014–0021).
 *
 * Locks the §14 domain model files: every table exists with RLS enabled; NO
 * client write grant or policy anywhere (all financial writes are
 * service-role only); the 11 seeded catalog offers with exact cents /
 * interval / renewal mapping; the 12 seeded v1 commission rates; and the
 * §14.14 uniqueness spine (duplicate commission key, duplicate benefit use,
 * unique batch month, unique active code, unique event key, unique active
 * subscription owner). Static SQL/source-text guard; no live DB.
 *
 * CRLF-safe ON PURPOSE: files are normalized to LF before any regexing so a
 * Windows checkout (core.autocrlf=true) can never make `/--.*$/` miss the
 * `\r` and leak comment text into the executable scan (the 0001–0013 lesson).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');

/** Read a migration and normalize CR/CRLF to LF (CRLF-safe parsing). */
const readSql = (file: string): string =>
  readFileSync(join(REPO, 'supabase', 'migrations', file), 'utf8').replace(/\r\n?/g, '\n');

/** The SQL with every line comment (-- … end of line) removed. */
const executable = (sql: string): string =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

/** Executable SQL flattened to single spaces (order-exact seed matching). */
const flat = (sql: string): string => executable(sql).replace(/\s+/g, ' ');

const FILES = [
  '0014_billing_price_catalog.sql',
  '0015_customer_subscriptions_entitlements.sql',
  '0016_partner_program.sql',
  '0017_referral_attribution.sql',
  '0018_commission_ledger.sql',
  '0019_payouts.sql',
  '0020_invite_codes.sql',
  '0021_webhook_events_audit_log.sql',
] as const;

const SQL = new Map<string, string>(FILES.map((f) => [f, readSql(f)]));
const sqlOf = (file: string): string => {
  const sql = SQL.get(file);
  if (sql === undefined) throw new Error(`unknown migration file: ${file}`);
  return sql;
};
const ALL = FILES.map(sqlOf).join('\n');
const ALL_EXEC = executable(ALL);

const TABLES_BY_FILE: Record<string, string[]> = {
  '0014_billing_price_catalog.sql': ['billing_price_catalog'],
  '0015_customer_subscriptions_entitlements.sql': [
    'customer_subscriptions',
    'entitlements',
    'subscription_conversion_intents',
  ],
  '0016_partner_program.sql': ['partner_applications', 'partners', 'partner_codes'],
  '0017_referral_attribution.sql': [
    'referral_clicks',
    'referral_attributions',
    'partner_benefit_uses',
  ],
  '0018_commission_ledger.sql': [
    'partner_tier_snapshots',
    'commission_rules',
    'commission_entries',
    'commission_adjustments',
  ],
  '0019_payouts.sql': ['payout_batches', 'partner_payouts', 'partner_payout_items'],
  '0020_invite_codes.sql': ['invite_code_slots', 'invite_codes'],
  '0021_webhook_events_audit_log.sql': ['stripe_webhook_events', 'audit_log'],
};

describe('CRLF safety of this guard itself', () => {
  it('normalizes CRLF/CR before comment-stripping (no \\r can hide executable text)', () => {
    const crlf = '-- comment\r\ncreate table x;\r-- tail';
    const normalized = crlf.replace(/\r\n?/g, '\n');
    expect(normalized).not.toContain('\r');
    expect(executable(normalized)).toContain('create table x;');
    expect(executable(normalized)).not.toContain('comment');
  });

  it('the loaded migrations contain no carriage returns after normalization', () => {
    expect(ALL.includes('\r')).toBe(false);
  });
});

describe('§14 domain model — every table exists with RLS enabled', () => {
  for (const [file, tables] of Object.entries(TABLES_BY_FILE)) {
    for (const table of tables) {
      it(`${file} creates public.${table} with RLS enabled`, () => {
        const sql = sqlOf(file);
        expect(sql.includes(`create table if not exists public.${table} (`)).toBe(true);
        expect(sql.includes(`alter table public.${table} enable row level security`)).toBe(true);
      });
    }
  }

  it('creates all 21 tables and enables RLS exactly as many times (nothing slips through)', () => {
    const expected = Object.values(TABLES_BY_FILE).flat().length;
    expect(expected).toBe(21);
    const created = (ALL_EXEC.match(/create table if not exists public\./g) ?? []).length;
    const rlsEnabled = (ALL_EXEC.match(/enable row level security/g) ?? []).length;
    expect(created).toBe(expected);
    expect(rlsEnabled).toBe(expected);
  });
});

describe('service-role-only writes — no client write path anywhere', () => {
  it('has NO insert/update/delete/all grant to anon or authenticated in any new migration', () => {
    expect(/grant\s+[^;]*\b(insert|update|delete|all|truncate)\b[^;]*to\s+(anon|authenticated)/i.test(ALL_EXEC)).toBe(false);
  });

  it('has NO insert/update/delete/all policies — SELECT policies only', () => {
    expect(/create policy[^;]*for\s+(insert|update|delete|all)\b/i.test(ALL_EXEC)).toBe(false);
    const policies = ALL_EXEC.match(/create policy[^;]+;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(/for\s+select/i.test(policy), policy).toBe(true);
    }
  });

  it('grants nothing to anon at all (demo sessions never see billing state)', () => {
    expect(/grant[^;]*to\s+anon\b/i.test(ALL_EXEC)).toBe(false);
  });

  it('executable SQL never references a privileged role (no service_role dependency)', () => {
    expect(/service[_-]?role/i.test(ALL_EXEC)).toBe(false);
  });

  it('money columns are integer cents — no numeric/float/money types anywhere', () => {
    expect(/\b(numeric|decimal|real|double precision|money)\b/i.test(ALL_EXEC)).toBe(false);
    expect(/amount_cents integer/i.test(ALL_EXEC)).toBe(true);
  });

  it('is additive: never drops a table, never alters the 0001–0013 tables', () => {
    expect(/drop\s+table/i.test(ALL_EXEC)).toBe(false);
    for (const locked of [
      'public.subscriptions',
      'public.billing_customers',
      'public.saved_recipes',
      'public.accepted_corrections',
      'public.products',
      'public.mapper_basement',
    ]) {
      expect(new RegExp(`alter\\s+table\\s+${locked.replace('.', '\\.')}\\b`, 'i').test(ALL_EXEC), locked).toBe(false);
    }
  });

  it('seeds ONLY the price catalog and the commission rules (no other DML)', () => {
    const inserts = ALL_EXEC.match(/insert\s+into\s+public\.\w+/gi) ?? [];
    expect(inserts).toEqual([
      'insert into public.billing_price_catalog',
      'insert into public.commission_rules',
    ]);
    expect(/\bdelete\s+from\b/i.test(ALL_EXEC)).toBe(false);
    expect(/\bupdate\s+public\./i.test(ALL_EXEC)).toBe(false);
  });
});

describe('billing_price_catalog (0014) — structure', () => {
  const sql = () => sqlOf('0014_billing_price_catalog.sql');

  it('pins offer_key and lookup_key unique, EUR-only integer cents', () => {
    expect(sql().includes('offer_key text not null unique')).toBe(true);
    expect(sql().includes('lookup_key text not null unique')).toBe(true);
    expect(sql().includes('amount_cents integer not null check (amount_cents > 0)')).toBe(true);
    expect(sql().includes("currency text not null default 'eur' check (currency = 'eur')")).toBe(true);
  });

  it('enforces the commission-cadence rule in SQL: monthly→monthly, yearly + 15m→annual', () => {
    const f = flat(sql());
    expect(f).toContain("(cadence = 'monthly' and commission_cadence = 'monthly') or (cadence <> 'monthly' and commission_cadence = 'annual')");
  });

  it('enforces that exactly the 15-month offers carry a renewal_offer_key', () => {
    const f = flat(sql());
    expect(f).toContain("(cadence = 'initial_15_month' and renewal_offer_key is not null) or (cadence <> 'initial_15_month' and renewal_offer_key is null)");
    expect(f).toContain('renewal_offer_key text references public.billing_price_catalog (offer_key)');
  });

  it('pins the Stripe recurring shape: 15m = month × 15, monthly = month × 1, annual = year × 1', () => {
    const f = flat(sql());
    expect(f).toContain("(cadence = 'initial_15_month' and \"interval\" = 'month' and interval_count = 15)");
    expect(f).toContain("(cadence = 'monthly' and \"interval\" = 'month' and interval_count = 1)");
    expect(f).toContain("(cadence = 'annual' and \"interval\" = 'year' and interval_count = 1)");
  });

  it('keeps Stripe ids nullable (never invented) but unique once configured', () => {
    const f = flat(sql());
    expect(f).toContain('stripe_product_id text,');
    expect(f).toContain('stripe_price_id text,');
    expect(f).toContain('on public.billing_price_catalog (stripe_price_id) where stripe_price_id is not null');
  });

  it('exposes ONLY public_enabled rows to authenticated clients', () => {
    const f = flat(sql());
    expect(f).toContain('for select to authenticated using (public_enabled = true)');
  });
});

describe('billing_price_catalog (0014) — the 11 locked offers, seeded verbatim', () => {
  const f = flat(sqlOf('0014_billing_price_catalog.sql'));

  // (offer_key, product, cadence, variant, lookup_key, amount_cents, currency,
  //  interval, interval_count, public_enabled, renewal_offer_key,
  //  commission_cadence, version)
  const EXPECTED_SEED: ReadonlyArray<readonly [string, string]> = [
    ['pi_home_monthly_standard_eur', "('home_monthly_standard', 'home', 'monthly', 'standard', 'pi_home_monthly_standard_eur', 999, 'eur', 'month', 1, true, null, 'monthly', 1)"],
    ['pi_home_yearly_standard_eur', "('home_yearly_standard', 'home', 'annual', 'standard', 'pi_home_yearly_standard_eur', 4900, 'eur', 'year', 1, true, null, 'annual', 1)"],
    ['pi_home_yearly_launch_eur', "('home_yearly_launch', 'home', 'annual', 'home_launch', 'pi_home_yearly_launch_eur', 3900, 'eur', 'year', 1, true, null, 'annual', 1)"],
    ['pi_home_15m_standard_partner_eur', "('home_15m_standard_partner', 'home', 'initial_15_month', 'standard', 'pi_home_15m_standard_partner_eur', 4900, 'eur', 'month', 15, false, 'home_yearly_standard', 'annual', 1)"],
    ['pi_home_15m_launch_partner_eur', "('home_15m_launch_partner', 'home', 'initial_15_month', 'home_launch', 'pi_home_15m_launch_partner_eur', 3900, 'eur', 'month', 15, false, 'home_yearly_launch', 'annual', 1)"],
    ['pi_pro_monthly_standard_eur', "('pro_monthly_standard', 'pro', 'monthly', 'standard', 'pi_pro_monthly_standard_eur', 2499, 'eur', 'month', 1, true, null, 'monthly', 1)"],
    ['pi_pro_monthly_founding_eur', "('pro_monthly_founding', 'pro', 'monthly', 'pro_founding', 'pi_pro_monthly_founding_eur', 1999, 'eur', 'month', 1, true, null, 'monthly', 1)"],
    ['pi_pro_yearly_standard_eur', "('pro_yearly_standard', 'pro', 'annual', 'standard', 'pi_pro_yearly_standard_eur', 19900, 'eur', 'year', 1, true, null, 'annual', 1)"],
    ['pi_pro_yearly_founding_eur', "('pro_yearly_founding', 'pro', 'annual', 'pro_founding', 'pi_pro_yearly_founding_eur', 14900, 'eur', 'year', 1, true, null, 'annual', 1)"],
    ['pi_pro_15m_standard_partner_eur', "('pro_15m_standard_partner', 'pro', 'initial_15_month', 'standard', 'pi_pro_15m_standard_partner_eur', 19900, 'eur', 'month', 15, false, 'pro_yearly_standard', 'annual', 1)"],
    ['pi_pro_15m_founding_partner_eur', "('pro_15m_founding_partner', 'pro', 'initial_15_month', 'pro_founding', 'pi_pro_15m_founding_partner_eur', 14900, 'eur', 'month', 15, false, 'pro_yearly_founding', 'annual', 1)"],
  ];

  for (const [lookupKey, tuple] of EXPECTED_SEED) {
    it(`seeds ${lookupKey} with exact cents/interval/renewal`, () => {
      expect(f).toContain(tuple);
    });
  }

  it('seeds exactly 11 offers (no invented prices), idempotently', () => {
    const occurrences = (f.match(/'pi_(home|pro)_[a-z0-9_]+_eur'/g) ?? []).length;
    expect(occurrences).toBe(11);
    expect(f).toContain('on conflict (lookup_key) do nothing');
  });

  it('keeps the 15-month partner offers non-public (server-resolved only)', () => {
    for (const key of EXPECTED_SEED.filter(([k]) => k.includes('15m'))) {
      expect(key[1]).toContain('15, false,');
    }
  });
});

describe('customer_subscriptions + entitlements + conversion intents (0015)', () => {
  const sql = () => sqlOf('0015_customer_subscriptions_entitlements.sql');

  it('EXTENDS the 0003 cache — never drops or alters public.subscriptions', () => {
    const exec = executable(sql());
    expect(/drop\s+table/i.test(exec)).toBe(false);
    expect(/alter\s+table\s+public\.subscriptions\b/i.test(exec)).toBe(false);
  });

  it('customer_subscriptions: unique Stripe subscription + unique nullable schedule + catalog FK', () => {
    expect(sql().includes('stripe_subscription_id text not null unique')).toBe(true);
    expect(sql().includes('stripe_schedule_id text unique')).toBe(true);
    expect(flat(sql())).toContain('offer_key text not null references public.billing_price_catalog (offer_key)');
    expect(sql().includes('benefit_used boolean not null default false')).toBe(true);
    expect(sql().includes('continuity_armed boolean not null default false')).toBe(true);
    expect(sql().includes('livemode boolean not null default false')).toBe(true);
  });

  it('entitlements: scope/source vocabularies + duplicate-active-grant prevention (§14.14)', () => {
    const f = flat(sql());
    expect(f).toContain("scope text not null check (scope in ('home', 'pro', 'partner'))");
    expect(f).toContain("('paid_subscription', 'approved_partner', 'admin_grant', 'invite_home_trial')");
    expect(f).toContain("on public.entitlements (user_id, scope, source_type, source_id) where status = 'active'");
  });

  it('entitlements: an invite trial is Home-only and time-bounded, in SQL not convention', () => {
    const f = flat(sql());
    expect(f).toContain("source_type <> 'invite_home_trial' or (scope = 'home' and ends_at is not null)");
  });

  it('conversion intents: unique ACTIVE intent per subscription + unique idempotency key (§14.5)', () => {
    const f = flat(sql());
    expect(f).toContain('idempotency_key text not null unique');
    expect(f).toContain("on public.subscription_conversion_intents (subscription_id) where status in ('pending', 'processing')");
    expect(f).toContain("('pending', 'processing', 'completed', 'failed', 'cancelled', 'expired')");
  });

  it('customers read ONLY their own rows on all three tables', () => {
    const ownerPolicies = (sql().match(/for select using \(auth\.uid\(\) = user_id\)/g) ?? []).length;
    expect(ownerPolicies).toBe(3);
  });
});

describe('partner program (0016)', () => {
  const sql = () => sqlOf('0016_partner_program.sql');

  it('applications: full status vocabulary + ONE non-terminal application per user', () => {
    const f = flat(sql());
    expect(f).toContain("('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended', 'terminated')");
    expect(f).toContain("on public.partner_applications (user_id) where status in ('draft', 'submitted', 'under_review')");
  });

  it('partners: immutable identity — unique user, unique nullable Connect account, tier + flags', () => {
    const f = flat(sql());
    expect(f).toContain('user_id uuid not null unique references auth.users (id)');
    expect(f).toContain('stripe_connect_account_id text unique');
    expect(f).toContain("tier text not null default 'standard' check (tier in ('standard', 'gold', 'elite'))");
    expect(sql().includes('onboarding_complete boolean not null default false')).toBe(true);
    expect(sql().includes('payouts_enabled boolean not null default false')).toBe(true);
    // financial anchor: user deletion is NOT cascaded through the partner row
    expect(/user_id uuid not null unique references auth\.users \(id\) on delete cascade/.test(sql())).toBe(false);
  });

  it('partner_codes: code + slug unique AMONG ACTIVE only, with replacement link (§14.14)', () => {
    const f = flat(sql());
    expect(f).toContain("on public.partner_codes (code) where status = 'active'");
    expect(f).toContain("on public.partner_codes (slug) where status = 'active'");
    expect(f).toContain('replacement_code_id uuid references public.partner_codes (id)');
  });

  it('a partner reads own rows via their own partner row (auth.uid() joins, no privileged helper)', () => {
    expect(sql().includes('p.user_id = auth.uid()')).toBe(true);
  });
});

describe('referral attribution + benefit uses (0017)', () => {
  const sql = () => sqlOf('0017_referral_attribution.sql');

  it('attributions: unique ACTIVE owner per subscription — partial unique (§14.14)', () => {
    const f = flat(sql());
    expect(f).toContain("on public.referral_attributions (subscription_id) where status = 'active' and subscription_id is not null");
    expect(f).toContain("on public.referral_attributions (stripe_subscription_id) where status = 'active' and stripe_subscription_id is not null");
  });

  it('attributions: evidence-vs-authority state machine + 30-day window fields', () => {
    const f = flat(sql());
    expect(f).toContain("('pending', 'active', 'superseded', 'expired', 'revoked')");
    expect(f).toContain("method text not null check (method in ('referral_link', 'explicit_code'))");
    expect(sql().includes('window_expires_at timestamptz not null')).toBe(true);
    expect(sql().includes('locked_at timestamptz')).toBe(true);
  });

  it('benefit uses: duplicate benefit use is impossible — HARD unique per subscription (§14.14)', () => {
    const f = flat(sql());
    expect(f).toContain('stripe_subscription_id text not null unique');
    expect(f).toContain('subscription_id uuid unique');
  });

  it('clicks and benefit uses are NOT client-readable; customers read own attributions only', () => {
    const policies = executable(sql()).match(/create policy[^;]+;/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain('on public.referral_attributions');
    expect(policies[0]).toContain('auth.uid() = user_id');
    expect(/grant[^;]*on public\.referral_clicks/i.test(executable(sql()))).toBe(false);
    expect(/grant[^;]*on public\.partner_benefit_uses/i.test(executable(sql()))).toBe(false);
  });
});

describe('commission ledger (0018)', () => {
  const sql = () => sqlOf('0018_commission_ledger.sql');

  it('tier snapshots: one per partner per month, month pinned to day 1 (§14.14)', () => {
    const f = flat(sql());
    expect(f).toContain('unique (partner_id, month)');
    expect(f).toContain('month date not null check (extract(day from month) = 1)');
  });

  it('seeds the 12 locked v1 commission rates verbatim', () => {
    const f = flat(sql());
    const rates: Array<[string, string, string, number]> = [
      ['home', 'monthly', 'standard', 199],
      ['home', 'monthly', 'gold', 249],
      ['home', 'monthly', 'elite', 299],
      ['home', 'annual', 'standard', 900],
      ['home', 'annual', 'gold', 1400],
      ['home', 'annual', 'elite', 1900],
      ['pro', 'monthly', 'standard', 499],
      ['pro', 'monthly', 'gold', 599],
      ['pro', 'monthly', 'elite', 699],
      ['pro', 'annual', 'standard', 2900],
      ['pro', 'annual', 'gold', 3900],
      ['pro', 'annual', 'elite', 4900],
    ];
    for (const [product, cadence, tier, cents] of rates) {
      expect(f, `${product}/${cadence}/${tier}`).toContain(`(1, '${product}', '${cadence}', '${tier}', ${cents})`);
    }
    // exactly 12 seeded cells, unique per (version, product, cadence, tier)
    expect((f.match(/\(1, '(home|pro)', '(monthly|annual)', '(standard|gold|elite)', \d+\)/g) ?? []).length).toBe(12);
    expect(f).toContain('unique (version, product, cadence, tier)');
  });

  it('entries: duplicate commission key impossible — unique invoice id where not null (§14.14)', () => {
    const f = flat(sql());
    expect(f).toContain('on public.commission_entries (stripe_invoice_id) where stripe_invoice_id is not null');
  });

  it('entries: hold state machine + provenance (tier and rule version at earn time)', () => {
    const f = flat(sql());
    expect(f).toContain("('held', 'eligible', 'paid', 'reversed')");
    expect(sql().includes('eligible_at timestamptz not null')).toBe(true);
    expect(sql().includes('rule_version integer not null')).toBe(true);
  });

  it('adjustments: append-only (no touch trigger, no updated_at) + unique source event (§14.14)', () => {
    const f = flat(sql());
    expect(f).toContain('on public.commission_adjustments (source_event_key) where source_event_key is not null');
    expect(f).toContain('amount_cents integer not null check (amount_cents <> 0)');
    // append-only: the adjustments table gets NO update trigger and no updated_at
    expect(/create trigger commission_adjustments_touch/i.test(sql())).toBe(false);
    const adjustmentsBlock = sql().split('create table if not exists public.commission_adjustments')[1] ?? '';
    expect((adjustmentsBlock.split('create index')[0] ?? '').includes('updated_at')).toBe(false);
  });

  it('partners read own snapshots/entries/adjustments; the rules table is NOT client-readable', () => {
    const policies = executable(sql()).match(/create policy[^;]+;/g) ?? [];
    expect(policies).toHaveLength(3);
    for (const policy of policies) {
      expect(policy).toContain('p.user_id = auth.uid()');
      expect(policy).not.toContain('commission_rules');
    }
    expect(/grant[^;]*on public\.commission_rules/i.test(executable(sql()))).toBe(false);
  });
});

describe('payouts (0019)', () => {
  const sql = () => sqlOf('0019_payouts.sql');

  it('batches: unique month + currency + livemode — a month can never run twice (§14.14)', () => {
    const f = flat(sql());
    expect(f).toContain('unique (month, currency, livemode)');
    expect(f).toContain('month date not null check (extract(day from month) = 1)');
  });

  it('payouts: unique idempotency key + one row per partner per batch + unique transfer id', () => {
    const f = flat(sql());
    expect(f).toContain('idempotency_key text not null unique');
    expect(f).toContain('unique (batch_id, partner_id)');
    expect(f).toContain('stripe_transfer_id text unique');
    expect(sql().includes('carry_forward_cents integer not null default 0')).toBe(true);
  });

  it('payout items: an entry/adjustment is settled by at most ONE payout ever, XOR source', () => {
    const f = flat(sql());
    expect(f).toContain('on public.partner_payout_items (commission_entry_id) where commission_entry_id is not null');
    expect(f).toContain('on public.partner_payout_items (commission_adjustment_id) where commission_adjustment_id is not null');
    expect(f).toContain('(commission_entry_id is null) <> (commission_adjustment_id is null)');
  });

  it('partners read own payouts + items; batches are NOT client-readable', () => {
    const policies = executable(sql()).match(/create policy[^;]+;/g) ?? [];
    expect(policies).toHaveLength(2);
    expect(policies.join('\n')).toContain('on public.partner_payouts');
    expect(policies.join('\n')).toContain('on public.partner_payout_items');
    expect(policies.join('\n')).not.toContain('payout_batches');
    expect(/grant[^;]*on public\.payout_batches/i.test(executable(sql()))).toBe(false);
  });
});

describe('invite codes (0020)', () => {
  const sql = () => sqlOf('0020_invite_codes.sql');

  it('slots: stable slot_number, enabled flag, current-code link closed via ALTER (circular FK)', () => {
    expect(sql().includes('slot_number integer not null unique check (slot_number >= 1)')).toBe(true);
    expect(sql().includes('enabled boolean not null default true')).toBe(true);
    expect(flat(sql())).toContain('foreign key (current_code_id) references public.invite_codes (id)');
  });

  it('codes: hashed storage, full status vocabulary, versioned rotation + replacement link', () => {
    const f = flat(sql());
    expect(f).toContain('code_hash text not null unique');
    expect(f).toContain("('available', 'reserved', 'sent', 'redeemed', 'expired', 'revoked')");
    expect(f).toContain('unique (slot_id, version)');
    expect(f).toContain('replacement_code_id uuid references public.invite_codes (id)');
    expect(f).toContain('entitlement_id uuid references public.entitlements (id)');
  });

  it('unique active code: at most ONE open (non-terminal) code per slot (§14.14)', () => {
    expect(flat(sql())).toContain("on public.invite_codes (slot_id) where status in ('available', 'reserved', 'sent')");
  });

  it('is fully server-side: RLS enabled with NO policies and NO grants (no client enumeration)', () => {
    const exec = executable(sql());
    expect(/create policy/i.test(exec)).toBe(false);
    expect(/\bgrant\b/i.test(exec)).toBe(false);
    expect(sql().includes('alter table public.invite_codes enable row level security')).toBe(true);
  });
});

describe('webhook durability + audit (0021)', () => {
  const sql = () => sqlOf('0021_webhook_events_audit_log.sql');

  it('events: unique event key (account_scope, livemode, event_id) — exactly-once intake (§14.14)', () => {
    expect(flat(sql())).toContain('unique (account_scope, livemode, event_id)');
  });

  it('events: retryable state machine with attempts + last_error', () => {
    const f = flat(sql());
    expect(f).toContain("('received', 'processing', 'processed', 'skipped', 'failed', 'dead_letter')");
    expect(sql().includes('attempts integer not null default 0')).toBe(true);
    expect(sql().includes('last_error text')).toBe(true);
  });

  it('audit_log: actor/action/entity/diff/reason/correlation shape, append-only', () => {
    const f = flat(sql());
    expect(f).toContain("actor_type text not null check (actor_type in ('system', 'admin', 'user', 'webhook'))");
    for (const col of ['action text not null', 'entity_type text not null', 'diff jsonb', 'correlation_id text']) {
      expect(sql().includes(col), col).toBe(true);
    }
    expect(/create trigger audit_log_touch/i.test(sql())).toBe(false);
  });

  it('neither table is client-readable: RLS enabled, NO policies, NO grants', () => {
    const exec = executable(sql());
    expect(/create policy/i.test(exec)).toBe(false);
    expect(/\bgrant\b/i.test(exec)).toBe(false);
  });
});
