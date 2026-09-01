/// <reference types="node" />
/**
 * Partner ELITE rate-profile migration guard (20260831200500).
 *
 * Proven statically against the SQL text (comment-stripped). No live DB.
 * Drift between src/billing/domain/partnerRateProfiles.ts and the SQL breaks
 * this test — the TS module and the database must enforce the SAME owner rules.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ELITE_DEFAULT_SUGGESTION_RATES } from './partnerRateProfiles';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260831200500_partner_rate_profiles.sql'),
  'utf8',
);
const CODE = SQL.replace(/--.*$/gm, '');

const TABLE =
  /create table if not exists public\.partner_rate_profiles[\s\S]*?\n\);/.exec(CODE)?.[0] ?? '';
const RESOLVER =
  /create or replace function public\.gellatti_partner_elite_rate_v1[\s\S]*?\$\$;/.exec(
    CODE,
  )?.[0] ?? '';
const OVERLAP =
  /create or replace function public\.enforce_partner_rate_profile_no_overlap[\s\S]*?\$\$;/.exec(
    CODE,
  )?.[0] ?? '';

describe('RP2 — the four per-partner rates exist as positive cents', () => {
  it('declares one column per (product, cadence)', () => {
    for (const column of [
      'home_monthly_cents',
      'home_annual_cents',
      'pro_monthly_cents',
      'pro_annual_cents',
    ]) {
      expect(TABLE, column).toContain(column);
    }
  });

  it('RP8 — every rate column is constrained positive, so a zero rate cannot silently un-pay', () => {
    for (const column of [
      'home_monthly_cents',
      'home_annual_cents',
      'pro_monthly_cents',
      'pro_annual_cents',
    ]) {
      // the SQL aligns column types, so allow runs of whitespace
      expect(TABLE, column).toMatch(
        new RegExp(`${column}\\s+integer not null check \\(${column}\\s*> 0\\)`),
      );
    }
  });

  it('is EUR-only, matching the billing domain', () => {
    expect(TABLE).toContain("check (currency = 'eur')");
  });
});

describe('RP3 — versioning and audit fields', () => {
  it('records every field the owner listed', () => {
    for (const column of [
      'effective_start',
      'effective_end',
      'reason',
      'admin_actor_user_id',
      'note',
      'prior_version_id',
      'revoked_at',
      'revoked_reason',
      'created_at',
    ]) {
      expect(TABLE, column).toContain(column);
    }
  });

  it('requires a non-empty reason and a real admin actor', () => {
    expect(TABLE).toContain("check (btrim(reason) <> '')");
    expect(TABLE).toMatch(/admin_actor_user_id uuid not null references auth\.users \(id\)/);
  });

  it('links a version to the one it supersedes', () => {
    expect(TABLE).toMatch(/prior_version_id uuid references public\.partner_rate_profiles \(id\)/);
  });

  it('orders the window and the revocation', () => {
    expect(TABLE).toContain('check (effective_end is null or effective_end > effective_start)');
    expect(TABLE).toContain('check (revoked_at is null or revoked_at >= effective_start)');
  });
});

describe('RP4 — exactly one version in force at any instant', () => {
  it('allows only one open-ended version per partner', () => {
    expect(CODE).toMatch(
      /create unique index if not exists partner_rate_profiles_one_open_uniq\s*\n?\s*on public\.partner_rate_profiles \(partner_id\)\s*\n?\s*where effective_end is null and revoked_at is null/,
    );
  });

  it('refuses overlapping declared windows via a trigger', () => {
    expect(OVERLAP).toContain('partner_rate_profile_overlap');
    expect(CODE).toMatch(
      /create trigger partner_rate_profiles_no_overlap\s+before insert or update of effective_start, effective_end, partner_id/,
    );
  });

  it('uses half-open interval logic, so touching windows do NOT overlap', () => {
    // [start, end) semantics: strict < on both sides
    expect(OVERLAP).toContain('p.effective_start < new.effective_end');
    expect(OVERLAP).toContain('new.effective_start < p.effective_end');
  });

  it('excludes the row being updated from its own overlap check', () => {
    expect(OVERLAP).toContain('p.id is distinct from new.id');
  });

  it('is not executable by clients', () => {
    expect(CODE).toContain(
      'revoke all on function public.enforce_partner_rate_profile_no_overlap() from public, anon, authenticated',
    );
  });
});

describe('RP5 — no retroactive rewriting', () => {
  it('the resolver keys on a caller-supplied instant, never now()', () => {
    expect(RESOLVER).toContain('p_at timestamptz');
    expect(RESOLVER).toContain('p.effective_start <= p_at');
    expect(RESOLVER).not.toMatch(/\bnow\(\)/);
    expect(RESOLVER).not.toMatch(/current_timestamp/i);
  });

  it('is STABLE, so it cannot depend on mutable session state', () => {
    expect(RESOLVER).toContain('stable');
  });

  it('honours revocation as well as the natural end', () => {
    expect(RESOLVER).toContain('p.effective_end is null or p_at < p.effective_end');
    expect(RESOLVER).toContain('p.revoked_at    is null or p_at < p.revoked_at');
  });

  it('the ledger snapshots which version paid an elite entry', () => {
    expect(CODE).toMatch(
      /alter table public\.commission_entries\s*\n?\s*add column if not exists rate_profile_version_id uuid/,
    );
  });

  it('the ledger column is additive and nullable — no historical row changes', () => {
    const alter = /alter table public\.commission_entries[\s\S]*?;/.exec(CODE)?.[0] ?? '';
    expect(alter).toContain('add column if not exists');
    expect(alter).not.toContain('not null');
    expect(alter).not.toContain('default');
  });
});

describe('RP1/RP6 — Standard, Gold and the Elite suggestions are untouched', () => {
  it('never modifies commission_rules', () => {
    expect(/(?:drop|alter|delete from|update)[^;]*\bcommission_rules\b/i.test(CODE)).toBe(false);
  });

  it('keeps the historical Elite values available as suggestions', () => {
    // documented intent: the v1 row stays for historical re-resolution
    expect(SQL).toContain('299/1900/699/4900');
    expect(ELITE_DEFAULT_SUGGESTION_RATES).toEqual({
      homeMonthlyCents: 299,
      homeAnnualCents: 1900,
      proMonthlyCents: 699,
      proAnnualCents: 4900,
    });
  });
});

describe('RP7 — a missing profile must not become a wrong payment', () => {
  it('the resolver returns no row rather than a fallback rate', () => {
    // no COALESCE to a constant, no default table lookup
    expect(RESOLVER).not.toMatch(/coalesce\s*\(/i);
    expect(RESOLVER).not.toContain('commission_rules');
  });

  it('documents that the caller must defer, not fall back', () => {
    expect(SQL).toContain('retryable deferral');
  });
});

describe('security posture', () => {
  it('a partner may read their own rate history', () => {
    expect(CODE).toMatch(
      /create policy partner_rate_profiles_select_own on public\.partner_rate_profiles/,
    );
    expect(CODE).toContain('pr.id = partner_id and pr.user_id = auth.uid()');
  });

  it('grants SELECT only — a partner can never set their own rate', () => {
    expect(CODE).toContain('grant select on public.partner_rate_profiles to authenticated');
    expect(/grant (insert|update|delete)[^;]*partner_rate_profiles/i.test(CODE)).toBe(false);
  });

  it('enables RLS on the new table', () => {
    expect(CODE).toContain('alter table public.partner_rate_profiles enable row level security');
  });

  it('the resolver is not client-callable', () => {
    expect(CODE).toContain(
      'revoke all on function public.gellatti_partner_elite_rate_v1(uuid, text, text, timestamptz)',
    );
    expect(/grant execute on function public\.gellatti_partner_elite_rate_v1/.test(CODE)).toBe(
      false,
    );
  });
});

describe('safety invariants', () => {
  it('never drops or rewrites ledger, attribution or payout tables', () => {
    for (const table of [
      'commission_adjustments',
      'referral_attributions',
      'partner_payouts',
      'payout_batches',
      'partner_codes',
    ]) {
      expect(
        new RegExp(`(drop|delete from|update)[^;]*\\b${table}\\b`, 'i').test(CODE),
        table,
      ).toBe(false);
    }
  });

  it('never deletes from commission_entries — only adds a column', () => {
    expect(/(drop table|delete from)[^;]*commission_entries/i.test(CODE)).toBe(false);
  });

  it('documents a rollback with the correct ordering caveat', () => {
    expect(SQL).toContain('ROLLBACK');
    expect(SQL).toContain('drop the column FIRST');
  });
});

describe('the live commission path resolves elite from the profile', () => {
  const DISPATCH = readFileSync(
    join(REPO, 'supabase', 'functions', 'stripe-webhook', 'dispatch.ts'),
    'utf8',
  );

  it('calls the per-partner resolver for elite, not the global rule table', () => {
    expect(DISPATCH).toContain("rpc('gellatti_partner_elite_rate_v1'");
    expect(DISPATCH).toContain("if (tier === 'elite')");
  });

  it('resolves at the instant the commission was EARNED', () => {
    expect(DISPATCH).toContain('p_at: new Date(paidAtUtcMs).toISOString()');
  });

  it('defers rather than guessing when no profile is in force (RP7)', () => {
    expect(DISPATCH).toContain('elite_rate_profile_missing');
    expect(DISPATCH).toMatch(/throw new RetryableEffectError\(`elite_rate_profile_missing/);
  });

  it('never falls back to the standard rate or the old fixed elite row', () => {
    const eliteBranch = /if \(tier === 'elite'\) \{[\s\S]*?elite_rate_profile_missing[\s\S]*?\}/.exec(
      DISPATCH,
    )?.[0];
    expect(eliteBranch).toBeDefined();
    // the branch must not silently substitute another tier's amount, nor the
    // historical fixed elite values that are now suggestions only
    expect(eliteBranch).not.toMatch(/tier:\s*'standard'/);
    for (const suggestion of ['299', '1900', '699', '4900']) {
      expect(eliteBranch, suggestion).not.toContain(`?? ${suggestion}`);
    }
  });

  it('overrides the amount but keeps the global rule version on the ledger row', () => {
    // rule_version stays populated so the entry remains self-describing even
    // though the money came from the partner's own profile
    expect(DISPATCH).toContain('ruleVersion: rule.version');
    expect(DISPATCH).toContain('amountCents = eliteAmount');
  });

  it('snapshots the profile version onto the ledger row', () => {
    expect(DISPATCH).toContain('rateProfileVersionId');
    const EFFECTS = readFileSync(
      join(REPO, 'supabase', 'functions', 'stripe-webhook', 'effects.ts'),
      'utf8',
    );
    expect(EFFECTS).toContain("'rate_profile_version_id',");
    expect(EFFECTS).toContain('rate_profile_version_id: input.rateProfileVersionId ?? null');
  });

  it('standard and gold still use the global versioned table', () => {
    expect(DISPATCH).toContain("from('commission_rules')");
  });
});

describe('resolver determinism and vocabulary (pre-apply hardening)', () => {
  it('never resolves with an arbitrary limit 1', () => {
    // `limit 1` with no `order by` picks an arbitrary row. The no-overlap
    // trigger makes that unreachable normally, but a disabled trigger would
    // then pay a silently wrong rate.
    expect(CODE).toMatch(/order by p\.effective_start desc[^;]*limit 1/s);
  });

  it('returns no row rather than a null amount beside a real version id', () => {
    // A half-row reads as "resolved" to a caller checking `found`, and pays null.
    expect(CODE).toContain('where resolved.amount_cents is not null');
  });

  it('covers exactly the product/cadence vocabulary the ledger CHECK allows', () => {
    // Live: CHECK (product = ANY ('home','pro')) and (cadence = ANY ('monthly','annual')).
    for (const branch of [
      "p_product = 'home' and p_cadence = 'monthly'",
      "p_product = 'home' and p_cadence = 'annual'",
      "p_product = 'pro'  and p_cadence = 'monthly'",
      "p_product = 'pro'  and p_cadence = 'annual'",
    ]) {
      expect(CODE).toContain(branch);
    }
  });

  it('keeps the elite commission_rules row as history, never deleting it', () => {
    expect(CODE).not.toMatch(/delete\s+from\s+public\.commission_rules/i);
    expect(CODE).not.toMatch(/update\s+public\.commission_entries/i);
  });
});
