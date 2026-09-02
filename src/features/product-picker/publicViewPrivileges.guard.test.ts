/**
 * SECURITY GUARD — a public VIEW must never hand a browser role write privileges.
 *
 * Why this exists. `mapper_basement_search_demo` was a `security_invoker=false` view
 * owned by `postgres`, so writes through it ran with the OWNER's rights and skipped
 * `mapper_basement`'s row-level security. It carried ALL for `anon`, and an anonymous
 * INSERT reached the table (it failed on a NOT NULL constraint, not on permissions).
 * The database is shared with production.
 *
 * Nobody wrote `grant insert to anon`. Supabase's schema default privileges grant ALL on
 * newly created objects to `anon` and `authenticated`, so a `create or replace view`
 * SILENTLY arrives writable, and only an explicit REVOKE naming every role closes it.
 * The two original migrations each missed a role.
 *
 * That is the trap this guard exists for: the danger is not a bad grant, it is a missing
 * revoke. A view added tomorrow is writable by default unless its migration says
 * otherwise.
 *
 * SCOPE. CI has no database, so this reads the migration corpus — which is exactly where
 * a future reopening would be introduced. The live ACLs of every existing public view
 * were scanned on 2026-09-02 and are SELECT-only or no-access; migrations older than the
 * cutoff are therefore not re-litigated here, and the rule binds everything added since.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'supabase/migrations';

/**
 * Migrations from this timestamp on must revoke browser writes on any public view they
 * create. Everything earlier was verified against the live database on 2026-09-02.
 */
const RULE_BINDS_FROM = '20260902120000';

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const sqlOf = (f: string) => readFileSync(`${DIR}/${f}`, 'utf8');

/** `create [or replace] view public.x` / `create materialized view public.x`. */
const createdViews = (sql: string): string[] =>
  [
    ...sql.matchAll(
      /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+public\.([a-z0-9_]+)/gi,
    ),
  ].map((m) => (m[1] ?? '').toLowerCase());

/** `create table [if not exists] public.x`. */
const createdTables = (sql: string): string[] =>
  [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)].map((m) =>
    (m[1] ?? '').toLowerCase(),
  );

/** Does the migration switch row-level security on for this table? */
const enablesRls = (sql: string, table: string): boolean =>
  new RegExp(
    `alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
    'i',
  ).test(sql);

/** Roles a statement revokes write privileges from, for this view. */
const revokesWritesFrom = (sql: string, view: string): Set<string> => {
  const roles = new Set<string>();
  const pattern = new RegExp(
    `revoke\\s+([a-z, \\t]+?)\\s+on\\s+public\\.${view}\\s+from\\s+([a-z0-9_, \\t]+)`,
    'gi',
  );
  for (const m of sql.matchAll(pattern)) {
    const privileges = (m[1] ?? '').toLowerCase();
    const writes = /\ball\b/.test(privileges) || /insert|update|delete/.test(privileges);
    if (!writes) continue;
    for (const role of (m[2] ?? '').split(',')) roles.add(role.trim().toLowerCase());
  }
  return roles;
};

describe('a new public view cannot arrive writable by a browser role', () => {
  const bound = files.filter((f) => f.slice(0, 14) >= RULE_BINDS_FROM);

  it.each(bound.length ? bound : ['(no migrations at or after the cutoff yet)'])(
    '%s revokes browser writes on every public view it creates',
    (file) => {
      if (!bound.includes(file)) return;
      const sql = sqlOf(file);
      for (const view of new Set(createdViews(sql))) {
        const revoked = revokesWritesFrom(sql, view);
        for (const role of ['public', 'anon', 'authenticated']) {
          expect(
            revoked.has(role),
            `${file} creates public.${view} but never revokes writes from \`${role}\`. ` +
              `Supabase's default privileges make it writable, so the REVOKE must name every role.`,
          ).toBe(true);
        }
      }
    },
  );
});

describe('the two Mapper search views keep their exact contract', () => {
  const corpus = files.map(sqlOf).join('\n');

  it('mapper_basement_search_demo — anon and authenticated may only SELECT', () => {
    const revoked = revokesWritesFrom(corpus, 'mapper_basement_search_demo');
    for (const role of ['public', 'anon', 'authenticated'])
      expect(revoked.has(role), role).toBe(true);
    expect(corpus).toMatch(
      /grant\s+select\s+on\s+public\.mapper_basement_search_demo\s+to\s+anon/i,
    );
  });

  it('mapper_basement_search — authenticated may only SELECT, anon gets nothing', () => {
    const revoked = revokesWritesFrom(corpus, 'mapper_basement_search');
    for (const role of ['public', 'anon', 'authenticated'])
      expect(revoked.has(role), role).toBe(true);
    // The rich view carries cost and PAC/POD; anon must never be granted it.
    expect(corpus).not.toMatch(
      /grant[^;]*\bon\s+public\.mapper_basement_search\s+to[^;]*\banon\b/i,
    );
  });
});

describe('a new public table cannot be browser-writable with RLS off', () => {
  /**
   * The table half of the same trap. `_main_authority_baseline_20260823` held 2088 rows
   * with `anon` carrying SELECT/INSERT/UPDATE/DELETE and RLS switched OFF, so nothing
   * stood between an anonymous caller and the data.
   *
   * Browser DML on a table is NORMAL here and deliberately allowed: ~98 tables rely on
   * "table privileges + RLS", which is why the owner kept Supabase's defaults. What must
   * never happen is DML with no RLS behind it. So a migration creating a public table
   * must do ONE of: enable row-level security, or revoke browser writes.
   */
  const bound = files.filter((f) => f.slice(0, 14) >= RULE_BINDS_FROM);

  it.each(bound.length ? bound : ['(no migrations at or after the cutoff yet)'])(
    '%s either enables RLS or revokes browser writes on every public table it creates',
    (file) => {
      if (!bound.includes(file)) return;
      const sql = sqlOf(file);
      for (const table of new Set(createdTables(sql))) {
        const revoked = revokesWritesFrom(sql, table);
        const closed =
          enablesRls(sql, table) || ['anon', 'authenticated'].every((role) => revoked.has(role));
        expect(
          closed,
          `${file} creates public.${table} but neither enables row-level security nor ` +
            `revokes writes from anon and authenticated. Supabase's default privileges ` +
            `make it browser-writable, so one of the two is required.`,
        ).toBe(true);
      }
    },
  );
});

describe('the ad-hoc baseline snapshot is not browser-facing', () => {
  const corpus = files.map(sqlOf).join('\n');

  it('revokes every privilege from anon, authenticated and PUBLIC', () => {
    // Created outside the migration corpus, so only the revoke is recorded here.
    expect(corpus).toMatch(
      /revoke\s+all\s+on\s+public\._main_authority_baseline_20260823\s+from\s+anon,\s*authenticated,\s*public/i,
    );
  });

  it('leaves the snapshot DATA alone', () => {
    const migration = files
      .filter((f) => corpus && sqlOf(f).includes('_main_authority_baseline_20260823'))
      .map(sqlOf)
      .join('\n')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(migration).not.toMatch(/\b(drop\s+table|truncate|delete\s+from|update\s+public\.)\b/i);
  });
});
