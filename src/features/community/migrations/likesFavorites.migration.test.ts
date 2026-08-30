/// <reference types="node" />
/**
 * Static security guards for the Likes / Favourites migration (§90, §91, §94).
 *
 * Same discipline as `communitySharing.migration.test.ts`: a source-text scan of the
 * EXECUTABLE SQL with comments stripped, so a reassuring comment can never stand in
 * as evidence for a policy that is not there.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '20260830120000_community_likes_favorites.sql';
const DNA = '20260830110000_community_root_creator_dna.sql';

const read = (file: string): string =>
  readFileSync(resolve(import.meta.dirname, '../../../../supabase/migrations', file), 'utf8')
    .replace(/\r\n?/g, '\n');

const strip = (raw: string): string =>
  raw
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

const EXEC = strip(read(MIGRATION));
const DNA_EXEC = strip(read(DNA));

describe('§90 — the two social tables exist with RLS on', () => {
  for (const table of ['publication_likes', 'publication_favorites']) {
    it(`creates ${table} and enables row level security`, () => {
      expect(EXEC).toMatch(new RegExp(`create table if not exists public\\.${table}`));
      expect(EXEC).toMatch(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`),
      );
    });

    it(`makes a duplicate ${table} row structurally impossible`, () => {
      // §109 "no duplicates" is a property of the primary key, not of app code.
      const block = EXEC.slice(EXEC.indexOf(`create table if not exists public.${table}`));
      expect(block.slice(0, 600)).toMatch(/primary key \(publication_id, user_id\)/);
    });

    it(`grants ${table} only select/insert/delete to authenticated — never update`, () => {
      expect(EXEC).toMatch(
        new RegExp(`grant select, insert, delete on public\\.${table} to authenticated`),
      );
      expect(EXEC).not.toMatch(new RegExp(`grant[^;]*update[^;]*on public\\.${table}`));
      expect(EXEC).not.toMatch(new RegExp(`on public\\.${table} to anon`));
    });

    it(`scopes every ${table} policy to the owner`, () => {
      for (const action of ['select', 'insert', 'delete']) {
        expect(EXEC).toMatch(
          new RegExp(`create policy ${table}_${action}_own[\\s\\S]{0,200}auth\\.uid\\(\\) = user_id`),
        );
      }
    });
  }
});

describe('§94 — login is required, a subscription is NOT', () => {
  it('has no entitlement, subscription or plan term in any policy', () => {
    const policies = EXEC.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).not.toMatch(/entitlement|subscription|stripe|price_id|canPro|plan/i);
    }
  });
});

describe('RLS caller-visibility trap (learned 2026-08-29)', () => {
  it('checks "is published" through a SECURITY DEFINER predicate, not a direct select', () => {
    // A bare `exists (select 1 from community_publications …)` inside WITH CHECK is
    // evaluated AS THE CALLER and silently refuses every write when RLS hides the row.
    expect(EXEC).toMatch(
      /create or replace function public\.gellatti_publication_is_published_v1[\s\S]*?security definer/,
    );
    const withChecks = EXEC.match(/with check \([\s\S]*?\);/g) ?? [];
    expect(withChecks.length).toBeGreaterThan(0);
    for (const check of withChecks) {
      expect(check).toMatch(/gellatti_publication_is_published_v1/);
      expect(check).not.toMatch(/from public\.community_publications/);
    }
  });
});

describe('§91 — the liked-by list exposes a public profile and nothing more', () => {
  const fn = EXEC.slice(EXEC.indexOf('gellatti_publication_likers_v1'));

  it('returns only avatar, display name and public handle', () => {
    expect(fn).toMatch(/returns table \(\s*handle text,\s*display_handle text,\s*display_name text,\s*avatar_url text,\s*liked_at timestamptz\s*\)/);
  });

  it('never returns a user id or an email', () => {
    const signature = fn.slice(0, fn.indexOf('$$'));
    expect(signature).not.toMatch(/user_id|email/);
  });

  it('names only likers who chose a PUBLIC creator profile', () => {
    expect(fn).toMatch(/c\.is_public/);
    expect(fn).toMatch(/c\.moderation_status = 'ok'/);
  });

  it('caps the page size so the RPC cannot be used to dump the table', () => {
    expect(fn).toMatch(/least\(coalesce\(p_limit, 50\), 100\)/);
  });
});

describe('§93 — counts are public, the rows are not', () => {
  it('exposes counts through a SECURITY DEFINER reader granted to anon', () => {
    expect(EXEC).toMatch(
      /grant execute on function public\.gellatti_publication_social_v1\(uuid\) to anon, authenticated/,
    );
  });

  it('keeps base-table SELECT owner-only so nobody can enumerate another account', () => {
    expect(EXEC).toMatch(
      /create policy publication_likes_select_own[\s\S]{0,120}auth\.uid\(\) = user_id/,
    );
  });
});

describe('§38 — public attribution names the ORIGINAL creator', () => {
  it('resolves based_on from the lineage ROOT, not the parent', () => {
    expect(DNA_EXEC).toMatch(
      /coalesce\(lineage\.root_publication_id, lineage\.parent_publication_id\)/,
    );
  });

  it('no longer joins the parent publication directly for attribution', () => {
    expect(DNA_EXEC).not.toMatch(/on parent\.id = lineage\.parent_publication_id/);
  });

  it('keeps every other card key, so this is an attribution fix and not a rewrite', () => {
    for (const key of [
      'publication_id', 'title', 'slug', 'description', 'image_url', 'category',
      'tags', 'version_number', 'published_at', 'creator', 'metrics',
      'unique_users', 'unique_makers', 'total_makes', 'remix_count',
      'rating_count', 'rating_average',
    ]) {
      expect(DNA_EXEC, key).toContain(`'${key}'`);
    }
  });

  it('keeps the moderation and published gates intact', () => {
    expect(DNA_EXEC).toMatch(/p\.status = 'published'/);
    expect(DNA_EXEC).toMatch(/c\.moderation_status = 'ok'/);
  });
});
