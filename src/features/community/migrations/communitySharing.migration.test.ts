/// <reference types="node" />
/**
 * Static security guards for the Community / Sharing / Partner migration.
 *
 * Same discipline as `billingPlatform.migration.test.ts`: a source-text scan
 * of the executable SQL, no live database. What it pins is the part that
 * cannot be fixed later without a data migration — the grant surface, the
 * write surface, and the two functions through which a formulation may leave
 * the database.
 *
 * CRLF-safe on purpose: the file is normalised to LF before any regexing, so a
 * Windows checkout can never let `\r` hide executable text inside a comment
 * scan.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '20260823140000_community_creators_sharing_v1.sql';
const HARDENING = '20260823141500_community_sharing_v1_grant_and_policy_hardening.sql';

const read = (file: string): string =>
  readFileSync(resolve(import.meta.dirname, '../../../../supabase/migrations', file), 'utf8')
    .replace(/\r\n?/g, '\n');

const RAW = read(MIGRATION);
const HARDENING_RAW = read(HARDENING);
const HARDENING_EXEC = HARDENING_RAW.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

/** The SQL with every line comment removed — comments must never be evidence. */
const EXEC = RAW.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const TABLES = [
  'creator_profiles',
  'creator_reserved_handles',
  'community_publications',
  'recipe_lineage',
  'recipe_share_links',
  'recipe_share_recipients',
  'recipe_usage_events',
  'recipe_make_events',
  'recipe_ratings',
  'publication_metrics',
  'creator_metrics',
  'ranking_snapshots',
  'community_reports',
] as const;

describe('the migration is strictly additive', () => {
  it('never drops a table and never alters an Engine/recipe/billing table', () => {
    expect(/drop\s+table/i.test(EXEC)).toBe(false);
    for (const locked of [
      'public.saved_recipes',
      'public.recipe_versions',
      'public.saved_recipe_meta',
      'public.production_runs',
      'public.partners',
      'public.partner_codes',
      'public.referral_attributions',
      'public.customer_subscriptions',
      'public.entitlements',
      'public.mapper_basement',
    ]) {
      expect(
        new RegExp(`alter\\s+table\\s+${locked.replace('.', '\\.')}\\b`, 'i').test(EXEC),
        `${locked} must not be altered`,
      ).toBe(false);
    }
  });

  it('creates no publication and no share for any pre-existing recipe', () => {
    // The ONLY seed insert in this migration is the reserved-handle list.
    const inserts = EXEC.match(/insert\s+into\s+public\.[a-z_]+/gi) ?? [];
    const topLevelSeeds = inserts.filter((statement) =>
      /creator_reserved_handles/i.test(statement),
    );
    expect(topLevelSeeds.length).toBeGreaterThan(0);
    expect(/insert\s+into\s+public\.community_publications[\s\S]{0,200}select[\s\S]{0,200}from\s+public\.saved_recipes/i.test(EXEC)).toBe(false);
    expect(/insert\s+into\s+public\.recipe_share_links[\s\S]{0,200}select[\s\S]{0,200}from\s+public\.saved_recipes/i.test(EXEC)).toBe(false);
  });
});

describe('every new table exists with RLS enabled', () => {
  for (const table of TABLES) {
    it(`public.${table} is created and RLS-protected`, () => {
      expect(EXEC.includes(`create table if not exists public.${table} (`)).toBe(true);
      expect(EXEC.includes(`alter table public.${table} enable row level security`)).toBe(true);
    });
  }

  it('enables RLS exactly as many times as it creates tables — nothing slips through', () => {
    const created = (EXEC.match(/create table if not exists public\./g) ?? []).length;
    const secured = (EXEC.match(/enable row level security/g) ?? []).length;
    expect(created).toBe(TABLES.length);
    expect(secured).toBe(created);
  });
});

describe('§57 — the client write surface is closed', () => {
  const grants = EXEC.match(/grant[^;]+on\s+public\.[a-z_]+\s+to\s+[a-z, ]+;/gi) ?? [];

  it('grants INSERT to authenticated on community_reports ONLY', () => {
    const inserters = grants
      .filter((grant) => /\binsert\b/i.test(grant))
      .map((grant) => /on\s+public\.([a-z_]+)/i.exec(grant)?.[1]);
    expect(inserters).toEqual(['community_reports']);
  });

  it('grants DELETE on nothing at all', () => {
    expect(grants.some((grant) => /\bdelete\b/i.test(grant))).toBe(false);
  });

  it('never grants any table privilege to anon', () => {
    for (const grant of grants) {
      expect(/\bto\b[^;]*\banon\b/i.test(grant), grant).toBe(false);
    }
  });

  it('never grants a privilege on a counter or ranking table', () => {
    for (const serverOwned of [
      'publication_metrics',
      'creator_metrics',
      'ranking_snapshots',
      'recipe_usage_events',
      'creator_reserved_handles',
    ]) {
      const writes = grants.filter(
        (grant) =>
          new RegExp(`on\\s+public\\.${serverOwned}\\b`, 'i').test(grant) &&
          /\b(insert|update|delete)\b/i.test(grant),
      );
      expect(writes, `${serverOwned} must not be client-writable`).toEqual([]);
    }
  });

  it('counters and lineage have no client INSERT/UPDATE policy either', () => {
    const policies = EXEC.match(/create policy[^;]+;/gi) ?? [];
    for (const serverOwned of [
      'publication_metrics',
      'creator_metrics',
      'ranking_snapshots',
      'recipe_lineage',
      'recipe_usage_events',
      'recipe_make_events',
      'creator_reserved_handles',
    ]) {
      const writePolicies = policies.filter(
        (policy) =>
          new RegExp(`on\\s+public\\.${serverOwned}\\b`, 'i').test(policy) &&
          /for\s+(insert|update|delete|all)\b/i.test(policy),
      );
      expect(writePolicies, `${serverOwned} write policy`).toEqual([]);
    }
  });

  it('community_publications has no client INSERT path — publishing is an RPC', () => {
    expect(/grant[^;]*insert[^;]*on public\.community_publications/i.test(EXEC)).toBe(false);
    expect(
      /create policy[^;]*on public\.community_publications[^;]*for insert/i.test(EXEC),
    ).toBe(false);
  });

  it('recipe_ratings has no client write path — a rating must prove a make', () => {
    expect(/grant[^;]*(insert|update)[^;]*on public\.recipe_ratings/i.test(EXEC)).toBe(false);
  });
});

describe('§16 — a formulation leaves the database through exactly two doors', () => {
  const bodies = RAW.split('create or replace function public.').slice(1);
  const named = new Map(
    bodies.map((body) => [/^([a-z0-9_]+)/.exec(body)?.[1] ?? '', body] as const),
  );

  const FORMULATION_DOORS = [
    'gellatti_get_publication_full_v1',
    'gellatti_open_received_share_v1',
    'gellatti_open_share_v1',
  ];

  it('only these three functions read recipe_input as an output', () => {
    const emitters = [...named.entries()]
      .filter(([, body]) => /'recipe_input',\s*v_version\.recipe_input/.test(body))
      .map(([name]) => name)
      .sort();
    expect(emitters).toEqual(FORMULATION_DOORS);
  });

  it('every one of them checks paid access first', () => {
    for (const name of FORMULATION_DOORS) {
      expect(named.get(name), name).toContain('gellatti_has_paid_access_v1');
    }
  });

  it('none of them is executable by anon', () => {
    for (const name of FORMULATION_DOORS) {
      expect(
        new RegExp(`grant execute on function public\\.${name}[^;]*to anon`, 'i').test(EXEC),
        name,
      ).toBe(false);
    }
  });

  it('the public projection is a whitelist that names no gram field', () => {
    const projection = named.get('gellatti_demo_safe_projection_v1') ?? '';
    expect(projection).not.toBe('');
    for (const forbidden of [
      'planned_grams',
      'actual_grams',
      'composition',
      'pod_value',
      'pac_value',
      'cost_per_kg',
      'grams_constraint',
      'goals',
    ]) {
      expect(projection.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('the public reader functions never select recipe_input', () => {
    for (const name of [
      'gellatti_get_publication_v1',
      'gellatti_publication_card_v1',
      'gellatti_list_community_v1',
      'gellatti_search_community_v1',
      'gellatti_get_creator_v1',
      'gellatti_top_creators_v1',
    ]) {
      expect((named.get(name) ?? '').includes('recipe_input'), name).toBe(false);
    }
  });

  it('the logged-out share resolver returns only the demo-safe projection', () => {
    const resolver = named.get('gellatti_resolve_share_v1') ?? '';
    expect(resolver).toContain('gellatti_demo_safe_projection_v1');
    expect(/'recipe_input',\s*v_version\.recipe_input/.test(resolver)).toBe(false);
  });
});

describe('§48/§49 — share tokens and partner attribution cannot be forged', () => {
  it('stores only a hash of the token, never the token', () => {
    expect(EXEC).toContain('token_hash bytea not null unique');
    expect(/create table if not exists public\.recipe_share_links[\s\S]*?\n\);/.exec(EXEC)?.[0])
      .not.toMatch(/^\s+token text/m);
    expect(EXEC).toContain("extensions.digest(convert_to(v_token, 'UTF8'), 'sha256')");
  });

  it('generates the token from a CSPRNG, not from a sequential id', () => {
    expect(EXEC).toContain('extensions.gen_random_bytes(32)');
  });

  it('never accepts a partner id as a function parameter', () => {
    const signatures = RAW.match(/create or replace function public\.[a-z0-9_]+\([^)]*\)/g) ?? [];
    for (const signature of signatures) {
      if (/gellatti_partner_is_active_v1|gellatti_active_partner_for_user_v1/.test(signature)) continue;
      expect(/p_partner_id/i.test(signature), signature).toBe(false);
    }
  });

  it('re-checks partner activity at attribution time, not only at share time', () => {
    const opener = RAW.split('create or replace function public.gellatti_open_share_v1')[1] ?? '';
    expect(opener).toContain('gellatti_partner_is_active_v1');
    expect(opener).toContain('v_link.shared_by_user_id <> v_uid');
  });

  it('creates no parallel commission table — the 0018 ledger stays the only one', () => {
    expect(/create table if not exists public\.[a-z_]*commission/i.test(EXEC)).toBe(false);
    expect(/create table if not exists public\.[a-z_]*payout/i.test(EXEC)).toBe(false);
    expect(EXEC).toContain('insert into public.referral_attributions');
  });

  it('never lets a client change partner_id or a share counter', () => {
    const revokePolicy =
      /create policy recipe_share_links_revoke_own[\s\S]*?;/.exec(EXEC)?.[0] ?? '';
    expect(revokePolicy).toContain("status = 'revoked'");
    expect(revokePolicy).toContain('partner_id is not distinct from');
    expect(revokePolicy).toContain('open_count =');
  });
});

describe('§41/§42/§50 — proof of use cannot be inflated', () => {
  it('a make must reference a unique production run', () => {
    expect(EXEC).toContain('production_run_id uuid unique');
    const recorder = RAW.split('create or replace function public.gellatti_record_make_v1')[1] ?? '';
    expect(recorder).toContain("pr.status = 'completed'");
    expect(recorder).toContain('pr.owner_user_id = v_uid');
    expect(recorder).toContain('on conflict (production_run_id) do nothing');
  });

  it('a usage event is idempotent per derived recipe — a refresh cannot count twice', () => {
    expect(EXEC).toContain('derived_recipe_id uuid unique');
    expect(EXEC).toContain('on conflict (derived_recipe_id) do nothing');
  });

  it('a rating structurally requires a make', () => {
    expect(EXEC).toContain('make_event_id uuid not null references public.recipe_make_events');
    const rater = RAW.split('create or replace function public.gellatti_rate_publication_v1')[1] ?? '';
    expect(rater).toContain('rating_requires_confirmed_make');
  });

  it('self-actions are excluded from every recomputed metric', () => {
    const recompute =
      RAW.split('create or replace function public.gellatti_recompute_publication_metrics_v1')[1] ?? '';
    const selfExclusions = (recompute.match(/user_id <> v_pub\.creator_user_id/g) ?? []).length;
    expect(selfExclusions).toBeGreaterThanOrEqual(7);
  });

  it('stores no per-view row anywhere — views carry no ranking weight', () => {
    expect(/create table if not exists public\.[a-z_]*view/i.test(EXEC)).toBe(false);
    expect(EXEC).not.toContain("'viewed'");
  });
});

describe('§52 — Creator and Partner moderation are separate levers', () => {
  it('the creator moderation function never touches public.partners', () => {
    const moderator =
      RAW.split('create or replace function public.gellatti_moderate_creator_v1')[1] ?? '';
    expect(moderator.split('$$;')[0]).not.toMatch(/update\s+public\.partners/i);
  });

  it('a creator cannot self-award verification, ranking eligibility or moderation state', () => {
    // There is no client write path to creator_profiles at all, so the columns
    // are unreachable rather than merely guarded.
    const grants = EXEC.match(/grant[^;]+on\s+public\.creator_profiles[^;]+;/gi) ?? [];
    expect(grants).toEqual(['grant select on public.creator_profiles to authenticated;']);
    expect(/create policy[^;]*on public\.creator_profiles[^;]*for (insert|update|delete|all)/i.test(EXEC)).toBe(false);

    // And the one writer cannot set them either: its INSERT column list and its
    // ON CONFLICT SET list both omit all three.
    const claimer =
      RAW.split('create or replace function public.gellatti_claim_creator_handle_v1')[1] ?? '';
    const writeBody = claimer.split('returning * into v_row')[0] ?? '';
    for (const column of ['verification_status', 'moderation_status', 'ranking_eligible']) {
      expect(writeBody.includes(column), column).toBe(false);
    }
  });
});

describe('every SECURITY DEFINER function is locked down before being granted', () => {
  it('pins search_path and revokes the default PUBLIC execute grant', () => {
    const definers = RAW.split('create or replace function public.').slice(1);
    for (const body of definers) {
      const name = /^([a-z0-9_]+)/.exec(body)?.[1] ?? '?';
      if (!/security definer/.test(body.split('$$')[0] ?? '')) continue;
      expect(
        (body.split('$$')[0] ?? '').includes('set search_path = pg_catalog, public'),
        `${name} search_path`,
      ).toBe(true);
      expect(
        new RegExp(`revoke all on function public\\.${name}\\(`).test(RAW),
        `${name} revoke`,
      ).toBe(true);
    }
  });
});

/**
 * The hardening migration exists because the grant list in v1 was not the
 * whole access story: a Supabase project's default privileges hand every new
 * public table full DML to `anon` and `authenticated`, so RLS policies are the
 * real control. These guards pin the two things that discovery changed.
 */
describe('grant + policy hardening (20260823141500)', () => {
  it('revokes the inherited default from every table this feature created', () => {
    expect(HARDENING_EXEC).toContain("revoke all on table public.%I from anon, authenticated");
    for (const table of TABLES) {
      expect(HARDENING_RAW.includes(`'${table}'`), table).toBe(true);
    }
  });

  it('re-grants nothing to anon anywhere', () => {
    const grants = HARDENING_EXEC.match(/grant[^;]+on\s+public\.[a-z_]+\s+to\s+[a-z, ]+;/gi) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      expect(/\bto\b[^;]*\banon\b/i.test(grant), grant).toBe(false);
    }
  });

  it('leaves the counter and ranking tables with no grant at all', () => {
    for (const serverOwned of [
      'publication_metrics',
      'creator_metrics',
      'ranking_snapshots',
      'creator_reserved_handles',
    ]) {
      expect(
        new RegExp(`grant[^;]+on\\s+public\\.${serverOwned}\\b`, 'i').test(HARDENING_EXEC),
        serverOwned,
      ).toBe(false);
    }
  });

  it('HOLE 1: a recipient can no longer repoint their membership at another share', () => {
    const policy =
      /create policy recipe_share_recipients_update_own[\s\S]*?;/.exec(HARDENING_EXEC)?.[0] ?? '';
    expect(policy).not.toBe('');
    // share_link_id IS the access proof for gellatti_open_received_share_v1.
    for (const pinned of [
      'share_link_id =',
      'recipient_user_id =',
      'open_count =',
      'first_opened_at =',
      'last_opened_at =',
      'created_at =',
    ]) {
      expect(policy.includes(pinned), pinned).toBe(true);
    }
  });

  it('HOLE 2: a creator can no longer rewrite the public body, status or ranking', () => {
    const policy =
      /create policy community_publications_update_own[\s\S]*?;/.exec(HARDENING_EXEC)?.[0] ?? '';
    expect(policy).not.toBe('');
    for (const pinned of [
      'public_projection =',
      'status =',
      'ranking_eligible =',
      'recipe_version_id =',
      'recipe_version_number =',
      'creator_user_id =',
      'published_at =',
    ]) {
      expect(policy.includes(pinned), pinned).toBe(true);
    }
  });

  it('revoking a share changes the status and nothing else', () => {
    const policy =
      /create policy recipe_share_links_revoke_own[\s\S]*?;/.exec(HARDENING_EXEC)?.[0] ?? '';
    for (const pinned of [
      "status = 'revoked'",
      'token_hash =',
      'owner_user_id =',
      'creator_user_id =',
      'shared_by_user_id =',
      'partner_id is not distinct from',
      'recipe_version_id =',
      'title =',
      'open_count =',
    ]) {
      expect(policy.includes(pinned), pinned).toBe(true);
    }
  });

  it('does NOT change the project-wide default privileges (out of scope)', () => {
    expect(/alter\s+default\s+privileges/i.test(HARDENING_EXEC)).toBe(false);
  });
});
