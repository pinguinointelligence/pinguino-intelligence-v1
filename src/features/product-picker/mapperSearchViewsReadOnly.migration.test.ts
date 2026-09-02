/**
 * SECURITY REGRESSION — the Mapper search views must stay READ-ONLY for browser roles.
 *
 * Found 2026-09-02: both views are `security_invoker=false` and owned by `postgres`, so
 * writes through them execute with the owner's rights and skip `mapper_basement`'s RLS.
 * Live, `mapper_basement_search_demo` carried ALL for `anon`. Proven against the shared
 * project: an INSERT straight into `mapper_basement` is refused with 42501, while the
 * same insert through the demo view reached the table and failed only on a NOT NULL
 * constraint. This database is shared with production.
 *
 * The drift came from Supabase's schema default privileges (ALL to anon/authenticated on
 * newly created objects) plus REVOKEs that did not name every role:
 *   0809194002 revoked from `public, anon`  → authenticated kept ALL
 *   0809194003 revoked from `public`        → both roles kept ALL
 *
 * These assertions pin the corrected shape so a future `create or replace view` cannot
 * silently reopen it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  'supabase/migrations/20260902120000_mapper_search_views_read_only.sql',
  'utf8',
);

const WRITE_PRIVILEGES = ['insert', 'update', 'delete', 'truncate', 'references', 'trigger'];

/**
 * The executable statements only. The rationale above them names `postgres`,
 * `service_role` and `security_invoker` precisely to explain what is NOT being touched,
 * and a guard that reads the prose would fail on its own explanation.
 */
const STATEMENTS = SQL.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('every browser role loses every write privilege', () => {
  for (const view of ['mapper_basement_search', 'mapper_basement_search_demo']) {
    it(`revokes writes on ${view} from public, anon AND authenticated`, () => {
      const revoke = new RegExp(
        `revoke\\s+${WRITE_PRIVILEGES.join(',\\s*')}\\s+on\\s+public\\.${view}\\s+from\\s+public,\\s*anon,\\s*authenticated`,
        'i',
      );
      expect(SQL).toMatch(revoke);
    });
  }

  it('names every role, because a partial REVOKE is exactly how this drifted', () => {
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(SQL.match(new RegExp(`from[^;]*\\b${role}\\b`, 'gi'))?.length ?? 0).toBeGreaterThan(1);
    }
  });
});

describe('reads are preserved — this is a privilege fix, not a feature removal', () => {
  it('keeps anonymous SELECT on the demo view', () => {
    expect(SQL).toMatch(/grant\s+select\s+on\s+public\.mapper_basement_search_demo\s+to\s+anon/i);
  });

  it('keeps authenticated SELECT on both views', () => {
    expect(SQL).toMatch(
      /grant\s+select\s+on\s+public\.mapper_basement_search\s+to\s+authenticated/i,
    );
    expect(SQL).toMatch(
      /grant\s+select\s+on\s+public\.mapper_basement_search_demo\s+to\s+anon,\s*authenticated/i,
    );
  });

  it('never grants anon the RICH view, which carries cost and PAC/POD', () => {
    expect(SQL).not.toMatch(/grant[^;]*\bon\s+public\.mapper_basement_search\s+to[^;]*\banon\b/i);
  });
});

describe('the hotfix stays a hotfix', () => {
  it('does not touch postgres or service_role', () => {
    expect(STATEMENTS).not.toMatch(/\bservice_role\b/i);
    expect(STATEMENTS).not.toMatch(/\bpostgres\b/i);
  });

  it('does not redefine either view or its projection', () => {
    expect(STATEMENTS).not.toMatch(/create\s+(or\s+replace\s+)?view/i);
    expect(STATEMENTS).not.toMatch(/drop\s+view/i);
  });

  it('does not flip security_invoker — anon SELECT depends on the definer projection', () => {
    expect(STATEMENTS).not.toMatch(/security_invoker/i);
  });

  it('does not touch Mapper data', () => {
    expect(STATEMENTS).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from)\b/i);
  });
});
