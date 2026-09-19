/// <reference types="node" />
/**
 * Contract for the Community match oracle v2 — AND between groups, OR inside a group.
 *
 * Owner approval (conditional) covers ONE function:
 * `public.gellatti_match_community_top100_v2(p_ingredient_groups jsonb, p_category text,
 * p_limit integer)`. v1 stays untouched; ranking, moderation and visibility stay identical
 * to v1; no gram or mass value ever leaves the function. Owner rule: if the SQL has to
 * change — new version, new hash, test result. So the exact bytes are pinned below: any
 * edit to the migration or its rollback fails this test until it is re-reviewed.
 *
 * Source-text scan of the EXECUTABLE SQL with comments stripped, so a reassuring comment
 * can never stand in for a clause that is not there. Behaviour (T0–T16, 21 checks) and a
 * mutation check are executed in isolation in PGlite 17.5 against these exact bytes; they
 * never touch the shared database.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const VERSION = '20260918200000_home_community_match_oracle_v2';
const V1_MIGRATION = '20260830140000_home_community_match_oracle.sql';

const ROOT = resolve(import.meta.dirname, '../../../..');
const bytes = (path: string) => readFileSync(resolve(ROOT, path));
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

const MIGRATION_BYTES = bytes(`supabase/migrations/${VERSION}.sql`);
const ROLLBACK_BYTES = bytes(`supabase/rollbacks/${VERSION}.rollback.sql`);

/** Executable SQL only — every `--` comment removed, whitespace collapsed. */
const code = (buf: Buffer) =>
  buf
    .toString('utf8')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();

const EXEC = code(MIGRATION_BYTES);
const ROLLBACK = code(ROLLBACK_BYTES);
const SIGNATURE = 'public.gellatti_match_community_top100_v2(jsonb, text, integer)';

describe('the reviewed bytes are the applied bytes', () => {
  it('pins the migration and the rollback by sha256', () => {
    expect(sha256(MIGRATION_BYTES)).toBe(
      '9582303ff03196ff81c9f60d17a18740a88ab9d07c575a5e070f9775fd155d3c',
    );
    expect(sha256(ROLLBACK_BYTES)).toBe(
      '8ba19134b2c7a82b8c7ecd681f04f2d4b7f43d99d09b08e40ef86359ef8560d3',
    );
  });

  it('leaves the deployed v1 migration byte for byte', () => {
    expect(sha256(bytes(`supabase/migrations/${V1_MIGRATION}`))).toBe(
      '6b46867d11d3b68e0227862f2685667e53274a52763ebac1ce274e5766d3f242',
    );
  });
});

describe('ONE function, nothing else', () => {
  it('creates exactly the approved signature', () => {
    expect(EXEC).toContain(
      'create or replace function public.gellatti_match_community_top100_v2( p_ingredient_groups jsonb, p_category text default null, p_limit integer default 10 ) returns jsonb',
    );
    expect(EXEC.match(/\bcreate\b/gi)).toHaveLength(1);
  });

  it('creates, alters or drops no other object and never touches v1', () => {
    expect(EXEC).not.toMatch(/\b(alter|drop|truncate|insert|update|delete)\b/i);
    expect(EXEC).not.toMatch(/\b(table|view|policy|trigger|index|sequence|type|schema)\b/i);
    expect(EXEC).not.toContain('gellatti_match_community_top100_v1');
  });

  it('touches only v2 in its comment, revoke and grant', () => {
    expect(EXEC).toContain(`comment on function ${SIGNATURE} is`);
    expect(EXEC.match(/\bcomment on\b/gi)).toHaveLength(1);
    expect(EXEC.match(/\brevoke\b/gi)).toHaveLength(1);
    expect(EXEC.match(/\bgrant\b/gi)).toHaveLength(1);
  });
});

describe('SQL hardening', () => {
  it('is a STABLE SQL function running as SECURITY DEFINER', () => {
    expect(EXEC).toContain('returns jsonb language sql stable security definer');
  });

  it("pins search_path exactly like v1: 'pg_catalog', 'public'", () => {
    expect(EXEC).toContain("security definer set search_path to 'pg_catalog', 'public' as $$");
    expect(EXEC.match(/search_path/g)).toHaveLength(1);
  });

  it('revokes PUBLIC and grants execute only to anon and authenticated', () => {
    expect(EXEC).toContain(`revoke all on function ${SIGNATURE} from public, anon, authenticated;`);
    // The one grant statement, exactly — no broader role (public, service_role, postgres).
    expect(EXEC.match(/\bgrant [^;]*;/g)).toEqual([
      `grant execute on function ${SIGNATURE} to anon, authenticated;`,
    ]);
  });

  it('caps its page size exactly like v1', () => {
    expect(EXEC).toContain('limit greatest(0, least(coalesce(p_limit, 10), 25))');
  });
});

describe('the refusal guard — malformed or oversized requests answer [], never everything', () => {
  it('reads the top level only when it is a JSON array (no 22023 on a scalar or object)', () => {
    expect(EXEC).toContain(
      "from jsonb_array_elements( case when jsonb_typeof(p_ingredient_groups) = 'array' then p_ingredient_groups else '[]'::jsonb end) as g(grp)",
    );
    expect(EXEC).toContain("coalesce(jsonb_typeof(p_ingredient_groups) = 'array', false)");
  });

  it('reads a group only when it is a JSON array, and drops JSON nulls inside it', () => {
    expect(EXEC).toContain(
      "case when jsonb_typeof(grp) = 'array' then array(select x from jsonb_array_elements_text(grp) x where x is not null) end as ids",
    );
  });

  it('refuses the WHOLE request for a non-array or empty group — a group is never dropped', () => {
    expect(EXEC).toContain(
      "not exists ( select 1 from groups where jsonb_typeof(grp) <> 'array' or cardinality(ids) = 0)",
    );
  });

  it('allows 1..8 groups and at most 64 ids in total', () => {
    expect(EXEC).toContain('(select count(*) from groups) between 1 and 8');
    expect(EXEC).toContain('(select coalesce(sum(cardinality(ids)), 0) from groups) <= 64 as ok');
    expect(EXEC).toContain('where (select ok from guard)');
  });
});

describe('§32 strictness — AND between groups, OR inside a group', () => {
  it('a publication matches only when no group is absent', () => {
    expect(EXEC).toContain(
      'and not exists ( select 1 from groups g where not (g.ids && c.ingredient_ids))',
    );
  });

  it('excludes every requested form from also_includes with the ARRAY form of <> all', () => {
    // The reviewed text `<> all ((select ids from flat))` is the ALL-subquery form and
    // fails CREATE FUNCTION with 42883 (text <> text[]). The cast forces the array form.
    expect(EXEC).toContain('<> all ((select ids from flat)::text[])');
    expect(EXEC).not.toMatch(/<> all \(\(select ids from flat\)\)/);
  });

  it('filters by category exactly like v1 (§40)', () => {
    expect(EXEC).toContain(
      "where p_category is null or lower(coalesce(p.category, '')) = lower(p_category)",
    );
  });
});

describe('visibility and ranking stay identical to v1', () => {
  it('requires a published publication and a moderation-ok creator', () => {
    expect(EXEC).toContain("on p.id = t.publication_id and p.status = 'published'");
    expect(EXEC).toContain("on c.id = p.creator_profile_id and c.moderation_status = 'ok'");
  });

  it('reads the version the publication points at — never "latest"', () => {
    expect(EXEC).toContain(
      'on v.recipe_id = p.recipe_id and v.version_number = p.recipe_version_number',
    );
    expect(EXEC).not.toContain('saved_recipes');
  });

  it('takes its order from the Top 100 authority and never re-scores', () => {
    expect(EXEC).toContain(
      "from jsonb_array_elements(public.gellatti_top_recipes_v1('all_time', 100)) with ordinality as ranked(elem, ord)",
    );
    expect(EXEC).toContain('order by c.rank limit');
    expect(EXEC).toContain("coalesce(jsonb_agg(card order by rank), '[]'::jsonb)");
    for (const forbidden of ['unique_makers', 'total_makes', 'rating_sum', 'remix_count', 'weights']) {
      expect(EXEC, forbidden).not.toContain(forbidden);
    }
  });
});

describe('the gram boundary — no mass ever leaves the function', () => {
  it('never mentions a gram, mass, percentage or batch field', () => {
    for (const forbidden of [
      'planned_grams',
      'actual_grams',
      'total_batch_g',
      'batch_grams',
      'percent_constraint',
      'main_ratio_weight',
      'range_constraint',
    ]) {
      expect(EXEC, forbidden).not.toContain(forbidden);
    }
  });

  it('returns exactly the v1 card keys plus matched_ids — never recipe_input or items', () => {
    const returned = EXEC.slice(EXEC.indexOf('jsonb_build_object( '));
    const keys = [...returned.matchAll(/'([a-z_]+)', /g)].map((m) => m[1]).sort();
    expect(keys).toEqual(
      [
        'all_requested_present',
        'also_includes',
        'avatar_url',
        'based_on',
        'category',
        'creator',
        'description',
        'display_handle',
        'display_name',
        'handle',
        'image_url',
        'matched_ids',
        'publication_id',
        'published_at',
        'rank',
        'slug',
        'title',
        'verification_status',
        'version_number',
      ].sort(),
    );
    expect(returned).not.toMatch(/'recipe_input'|'items'/);
  });

  it('orders also_includes by NAME, so mass order cannot be inferred', () => {
    expect(EXEC).toContain(
      "jsonb_agg(distinct item->'ingredient'->>'name' order by item->'ingredient'->>'name')",
    );
  });

  it('matched_ids can only name ids the caller sent', () => {
    expect(EXEC).toContain(
      "select coalesce(jsonb_agg(distinct m.id), '[]'::jsonb) from groups g, unnest(g.ids) as m(id) where m.id = any (c.ingredient_ids)",
    );
  });
});

describe('the rollback removes v2 and nothing else', () => {
  it('drops exactly the v2 signature, idempotently', () => {
    expect(ROLLBACK).toBe(`drop function if exists ${SIGNATURE};`);
  });
});
