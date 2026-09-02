/// <reference types="node" />
/**
 * FINANCIAL FUNCTION PERMISSIONS — owner acceptance point 3.
 *
 * Proves, statically against every migration this workstream adds, that an
 * ordinary authenticated user cannot invoke anything that moves money or
 * changes what money will be paid, and that every SECURITY DEFINER financial
 * function pins an explicit safe search_path.
 *
 * Static rather than live because the repo convention is file-first migrations
 * (docs/billing-partner/IMPLEMENTATION_STATUS.md): the SQL is the artefact under
 * review, and the owner applies it. A live-privilege probe belongs to the
 * staging acceptance package, not to the unit suite.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const MIGRATIONS = join(REPO, 'supabase', 'migrations');

/** Every migration this workstream contributes. */
const WORKSTREAM_MIGRATIONS = [
  '20260831200000_partner_code_slots_and_alias_ownership.sql',
  '20260831200500_partner_rate_profiles.sql',
  '20260831201000_partner_application_more_information.sql',
  '20260831201500_email_jobs.sql',
  '20260831202000_partner_tier_snapshot_writer.sql',
  '20260831202500_payout_execution.sql',
  '20260831203000_partner_scheduling.sql',
] as const;

const SQL_BY_FILE = new Map(
  WORKSTREAM_MIGRATIONS.map((file) => [file, readFileSync(join(MIGRATIONS, file), 'utf8')]),
);
const ALL_SQL = [...SQL_BY_FILE.values()].join('\n');
/** Comment-stripped, so prose like "no grants:" cannot satisfy a grant scan. */
const ALL_CODE = ALL_SQL.replace(/--.*$/gm, '');

/** A real `grant <privs> on ... <table>` statement, not a word in a sentence. */
const grantsOn = (table: string, privileges: string) =>
  new RegExp(`grant\\s+(?:${privileges})[^;]*?\\bon\\b[^;]*?\\b${table}\\b`, 'i').test(ALL_CODE);

/**
 * The functions an ordinary authenticated user must NEVER be able to invoke,
 * grouped by the owner's six named capabilities.
 */
const FORBIDDEN_TO_CLIENTS: Readonly<Record<string, readonly string[]>> = {
  'tier snapshot mutation': [
    'gellatti_write_partner_tier_snapshots_v1',
    'gellatti_partner_active_referred_count_v1',
    'gellatti_partner_elite_active_v1',
  ],
  'payout batch creation': ['gellatti_build_payout_batch_v1'],
  'payout transfer / release': [
    'gellatti_claim_payout_lines_v1',
    'gellatti_mark_payout_paid_v1',
    'gellatti_live_payouts_released_v1',
    'gellatti_assert_payout_allowed_v1',
  ],
  'payout reconciliation': [
    'gellatti_stuck_payout_lines_v1',
    'gellatti_mark_payout_failed_v1',
    'gellatti_close_payout_batch_v1',
  ],
  'Elite rate mutation': [
    'gellatti_partner_elite_rate_v1',
    'enforce_partner_rate_profile_no_overlap',
  ],
  'manual financial adjustment': [
    'gellatti_transition_eligible_commissions_v1',
    'gellatti_enqueue_email_v1',
    'gellatti_claim_email_jobs_v1',
    'gellatti_mark_email_sent_v1',
    'gellatti_mark_email_failed_v1',
    'gellatti_run_partner_job_v1',
    'gellatti_partner_daily_jobs_v1',
    'gellatti_partner_monthly_jobs_v1',
  ],
};

const ALL_FORBIDDEN = Object.values(FORBIDDEN_TO_CLIENTS).flat();

/** Read-only admin surfaces: granted, but each must check a permission itself. */
const ADMIN_READ_FUNCTIONS = [
  'gellatti_admin_email_jobs_v1',
  'gellatti_admin_partner_tier_snapshots_v1',
  'gellatti_admin_payout_batches_v1',
  'gellatti_admin_partner_job_runs_v1',
] as const;

/**
 * Functions an ordinary signed-in user IS meant to call, because the function
 * itself decides who may proceed. They must still be revoked from PUBLIC and
 * anon: the default privileges hand EXECUTE to anon on every new function, and
 * "the body refuses anon anyway" is a refusal, not a privilege boundary.
 *
 * Added after 20260831201000 was found granting EXECUTE to authenticated while
 * never revoking the inherited PUBLIC/anon grant — verified live on the
 * deployed functions, whose acl was `=X/postgres | anon | authenticated | ...`.
 * Neither function was in any list here, which is why nothing caught it.
 */
const AUTHENTICATED_ENTRYPOINTS: ReadonlyArray<readonly [string, string, RegExp]> = [
  [
    'gellatti_submit_partner_application_v1',
    'jsonb',
    /raise exception 'authentication required'/,
  ],
  [
    'gellatti_admin_partner_application_action_v1',
    'uuid, text, text',
    /raise exception 'partner_administrator_required'/,
  ],
];

function definitionOf(name: string): string {
  const match = new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`).exec(
    ALL_SQL,
  );
  return match?.[0] ?? '';
}

describe('an ordinary authenticated user cannot invoke any financial function', () => {
  for (const [capability, functions] of Object.entries(FORBIDDEN_TO_CLIENTS)) {
    describe(capability, () => {
      for (const name of functions) {
        it(`${name} is revoked from public, anon and authenticated`, () => {
          const revoke = new RegExp(
            `revoke all on function public\\.${name}\\s*\\([^)]*\\)\\s*\\n?\\s*from public, anon, authenticated`,
          );
          expect(revoke.test(ALL_SQL), `${name} missing full revoke`).toBe(true);
        });

        it(`${name} is never granted to authenticated`, () => {
          const grant = new RegExp(`grant execute on function public\\.${name}\\b`);
          expect(grant.test(ALL_SQL), `${name} unexpectedly granted`).toBe(false);
        });
      }
    });
  }

  it('covers every one of the owner’s six named capabilities', () => {
    expect(Object.keys(FORBIDDEN_TO_CLIENTS)).toHaveLength(6);
    expect(ALL_FORBIDDEN.length).toBeGreaterThanOrEqual(18);
  });
});

describe('every SECURITY DEFINER function pins an explicit safe search_path', () => {
  // Without it, a caller-controlled search_path can shadow a referenced object
  // and run attacker code with the definer's privileges.
  for (const [file, sql] of SQL_BY_FILE) {
    it(`${file}: all definer functions set search_path`, () => {
      const headers = [
        ...sql.matchAll(/create or replace function public\.(\w+)\s*\([\s\S]*?as \$\$/g),
      ];
      expect(headers.length, `${file} declares no functions`).toBeGreaterThan(0);
      for (const header of headers) {
        const [body, name] = header;
        if (!/security definer/.test(body)) continue;
        expect(/set search_path\s*=?\s*/.test(body), `${name} has no search_path`).toBe(true);
        // and it must be a fixed, safe list — never something caller-controlled
        expect(body, `${name} search_path is not a literal`).toMatch(
          /set search_path (?:=|to) ['a-z_, ]+/,
        );
      }
    });
  }

  it('no financial function leaves search_path to the caller', () => {
    expect(ALL_SQL).not.toMatch(/security definer(?![\s\S]{0,200}set search_path)/);
  });
});

describe('no dynamic SQL inside a SECURITY DEFINER financial function', () => {
  it('the scheduler runs a fixed allowlist, not a caller-supplied statement', () => {
    const runner = definitionOf('gellatti_run_partner_job_v1');
    expect(runner).not.toContain('execute p_statement');
    expect(runner).not.toMatch(/execute\s+p_/);
    expect(runner).toContain('unknown_partner_job');
    for (const job of ['commission_eligibility', 'tier_snapshots', 'payout_batch_test']) {
      expect(runner, job).toContain(`'${job}'`);
    }
  });

  it('no workstream migration uses EXECUTE on a parameter', () => {
    for (const [file, sql] of SQL_BY_FILE) {
      const code = sql.replace(/--.*$/gm, '');
      expect(/\bexecute\s+p_\w+/i.test(code), `${file} executes a parameter`).toBe(false);
    }
  });
});

describe('admin read surfaces are granted but self-guarded', () => {
  for (const name of ADMIN_READ_FUNCTIONS) {
    it(`${name} checks an admin permission before returning anything`, () => {
      const body = definitionOf(name);
      expect(body, `${name} not found`).not.toBe('');
      expect(body).toContain('gellatti_admin_has_permission_v1');
      expect(body).toMatch(
        /raise exception '(administrator_required|partner_administrator_required)'/,
      );
    });

    it(`${name} is revoked from anon and granted only to authenticated`, () => {
      expect(ALL_SQL).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\s*\\([^)]*\\)\\s*from public, anon`),
      );
      expect(ALL_SQL).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\s*\\([^)]*\\)\\s*to authenticated`),
      );
    });
  }
});

describe('authenticated entry points are revoked from PUBLIC and anon', () => {
  for (const [name, , guard] of AUTHENTICATED_ENTRYPOINTS) {
    it(`${name} revokes public and anon before granting authenticated`, () => {
      expect(ALL_CODE).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\s*\\([^)]*\\)\\s*\\n?\\s*from public, anon`,
        ),
      );
      expect(ALL_CODE).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\s*\\([^)]*\\)\\s*to authenticated`),
      );
      // never handed back to anon by a later line
      expect(ALL_CODE).not.toMatch(
        new RegExp(`grant execute on function public\\.${name}[^;]*to[^;]*anon`),
      );
    });

    it(`${name} still refuses a caller it must not serve`, () => {
      // The revoke is the boundary; this guard is the second line, and both
      // must exist. A revoke without the guard would be one grant away from
      // being wide open again.
      expect(definitionOf(name)).toMatch(guard);
    });
  }
});

describe('financial tables grant no client write path', () => {
  const FINANCIAL_TABLES = [
    'partner_rate_profiles',
    'email_jobs',
    'payout_release_state',
    'partner_job_runs',
  ] as const;

  for (const table of FINANCIAL_TABLES) {
    it(`${table} enables RLS`, () => {
      expect(ALL_SQL).toContain(`alter table public.${table} enable row level security`);
    });

    it(`${table} has no insert/update/delete grant`, () => {
      expect(grantsOn(table, 'insert|update|delete|all'), `${table} has a client write grant`).toBe(
        false,
      );
    });
  }

  it('the payout release gate has no policy at all, so no client can read or change it', () => {
    expect(/create policy[^;]*payout_release_state/i.test(ALL_CODE)).toBe(false);
    expect(grantsOn('payout_release_state', 'select|insert|update|delete|all')).toBe(false);
  });

  it('a partner may READ their own rate profile but never write it', () => {
    expect(ALL_SQL).toContain('create policy partner_rate_profiles_select_own');
    expect(ALL_SQL).toContain('grant select on public.partner_rate_profiles to authenticated');
    expect(grantsOn('partner_rate_profiles', 'insert|update|delete|all')).toBe(false);
  });

  it('email job bodies are never exposed to a client at all', () => {
    expect(/create policy[^;]*email_jobs/i.test(ALL_CODE)).toBe(false);
    expect(grantsOn('email_jobs', 'select|insert|update|delete|all')).toBe(false);
  });
});

describe('the immutable ledger is never opened for client writes', () => {
  it('no workstream migration grants write access to the ledger or payout tables', () => {
    for (const table of [
      'commission_entries',
      'commission_adjustments',
      'partner_payouts',
      'partner_payout_items',
      'payout_batches',
      'partner_tier_snapshots',
    ]) {
      expect(grantsOn(table, 'insert|update|delete|all'), `${table} write granted`).toBe(false);
    }
  });
});
