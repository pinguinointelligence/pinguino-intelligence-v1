/// <reference types="node" />
/**
 * Security contract for the §32–§40 Community match oracle.
 *
 * Source-text scan of the EXECUTABLE SQL with comments stripped, so a reassuring
 * comment can never stand in for a clause that is not there. The property being
 * protected is narrow and specific: the oracle answers WHICH published recipes match,
 * and must never become a way to read grams before entitlement.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '20260830140000_home_community_match_oracle.sql';

const RAW = readFileSync(
  resolve(import.meta.dirname, '../../../../supabase/migrations', MIGRATION),
  'utf8',
).replace(/\r\n?/g, '\n');

/** Executable SQL only — every `--` comment removed. */
const EXEC = RAW.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('the oracle is a MATCH oracle, never a gram oracle', () => {
  it('never selects a gram, mass, percentage or batch field', () => {
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

  it('never returns the raw recipe_input or its items to the caller', () => {
    // `recipe_input` is READ internally to decide containment; it must not appear in
    // any jsonb_build_object the caller receives.
    const returned = EXEC.slice(EXEC.indexOf('jsonb_build_object'));
    expect(returned).not.toMatch(/'recipe_input'/);
    expect(returned).not.toMatch(/'items'/);
  });

  it('orders the public ingredient names by NAME, so mass order cannot be inferred', () => {
    expect(EXEC).toMatch(/jsonb_agg\(distinct item->'ingredient'->>'name' order by item->'ingredient'->>'name'\)/);
  });

  it('returns a plain boolean answer rather than a private evidence trail', () => {
    expect(EXEC).toMatch(/'all_requested_present', true/);
  });
});

describe('visibility — drafts and unpublished rows cannot appear', () => {
  it('requires the publication to be published', () => {
    expect(EXEC).toMatch(/p\.status = 'published'/);
  });

  it('requires the creator to be moderation-ok', () => {
    expect(EXEC).toMatch(/c\.moderation_status = 'ok'/);
  });

  it('reads the version the publication itself points at — never "latest"', () => {
    expect(EXEC).toMatch(/v\.version_number = p\.recipe_version_number/);
  });

  it('never reads saved_recipes, so a private draft is unreachable', () => {
    expect(EXEC).not.toContain('saved_recipes');
  });
});

describe('ranking authority is not reimplemented (§34, §110)', () => {
  it('sources candidates from the existing Top 100 authority', () => {
    expect(EXEC).toContain('gellatti_top_recipes_v1');
  });

  it('preserves that order as rank via WITH ORDINALITY', () => {
    expect(EXEC).toMatch(/with ordinality/i);
    expect(EXEC).toMatch(/order by rank|order by c\.rank/);
  });

  it('computes no popularity of its own', () => {
    for (const forbidden of ['unique_makers', 'total_makes', 'rating_sum', 'remix_count', 'weights']) {
      expect(EXEC, forbidden).not.toContain(forbidden);
    }
  });
});

describe('§32 strictness is containment, not overlap', () => {
  it('uses the containment operator', () => {
    expect(EXEC).toMatch(/<@/);
    expect(EXEC).not.toMatch(/&&\s*c\.ingredient_ids/); // overlap would be a false positive
  });

  it('refuses an empty request rather than matching everything', () => {
    expect(EXEC).toMatch(/cardinality\(coalesce\(p_ingredient_ids, array\[\]::text\[\]\)\) > 0/);
  });

  it('filters by category when a profile is known (§40)', () => {
    expect(EXEC).toMatch(/p_category is null or lower\(coalesce\(p\.category, ''\)\) = lower\(p_category\)/);
  });
});

describe('SQL hardening', () => {
  it('pins a fixed safe search_path', () => {
    expect(EXEC).toMatch(/set search_path to 'pg_catalog', 'public'/);
  });

  it('is STABLE, so it cannot be used to write', () => {
    expect(EXEC).toMatch(/\bstable\b/);
  });

  it('caps its own page size', () => {
    expect(EXEC).toMatch(/least\(coalesce\(p_limit, 10\), 25\)/);
  });

  it('grants execute only to anon and authenticated — never to a broader role', () => {
    expect(EXEC).toMatch(
      /grant execute on function public\.gellatti_match_community_top100_v1\(text\[\], text, integer\)\s*to anon, authenticated/,
    );
    expect(EXEC).not.toMatch(/to\s+(public|service_role|postgres)\b/);
  });
});
