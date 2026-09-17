/// <reference types="node" />
/**
 * Share photos, part 2 — a contract over two migrations that are READY but NOT
 * APPLIED (staging and production share one database; the owner applies them).
 *
 *   20260917153000_community_photo_exact_upload_url — Community accepts only the
 *     exact public URL of the maker's own upload.
 *   20260917154000_direct_share_own_photo — a private, link-scoped own photo for
 *     direct shares.
 *
 * These read the SQL. They prove shape and scope, not execution: the live
 * behaviour is verified only after the owner applies the files.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url).pathname;
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
/** Executable SQL only: `--` comments removed, whitespace collapsed. */
const code = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const EXACT = '20260917153000_community_photo_exact_upload_url';
const PHOTO = '20260917154000_direct_share_own_photo';
const EXACT_SQL = read(`supabase/migrations/${EXACT}.sql`);
const EXACT_ROLLBACK = read(`supabase/rollbacks/${EXACT}.rollback.sql`);
const PHOTO_SQL = read(`supabase/migrations/${PHOTO}.sql`);
const PHOTO_ROLLBACK = read(`supabase/rollbacks/${PHOTO}.rollback.sql`);
const PREVIOUS = read('supabase/migrations/20260913233000_home_community_recipe_images.sql');

/** The `create or replace function public.<name>( … $$;` statement, verbatim. */
function functionStatement(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start === -1) throw new Error(`no ${name} in SQL`);
  const bodyStart = sql.indexOf('$$', start);
  const bodyEnd = sql.indexOf('$$;', bodyStart + 2);
  return sql.slice(start, bodyEnd + 3);
}

describe(`${EXACT} — Community takes the exact own upload`, () => {
  const next = functionStatement(EXACT_SQL, 'gellatti_publish_recipe_v1');
  const live = functionStatement(PREVIOUS, 'gellatti_publish_recipe_v1');
  const lines = (statement: string) =>
    statement
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  /** Lines of the live function that belong to the old photo check only. */
  const OLD_PHOTO_CHECK = [
    "if v_image_url = '' or position(v_image_marker in v_image_url) = 0 then",
    "raise exception 'community_photo_required' using errcode = '22023';",
    'end if;',
    "v_image_path := split_part(split_part(v_image_url, v_image_marker, 2), '?', 1);",
    "if v_image_path not like v_uid::text || '/%'",
  ];

  it('MIG-CP-01 replaces only gellatti_publish_recipe_v1, nothing else', () => {
    expect(code(EXACT_SQL).match(/create or replace function public\.\w+/g)).toEqual([
      'create or replace function public.gellatti_publish_recipe_v1',
    ]);
    // Outside that one function statement: grants only — no DDL, no data change.
    const outside = code(EXACT_SQL.replace(next, ''));
    expect(outside).not.toMatch(/\b(?:create|alter|drop) (?:table|policy|index|trigger)\b/i);
    expect(outside).not.toMatch(/\b(?:insert into|delete from|update public\.|truncate)\b/i);
    expect(outside.split(';').map((statement) => statement.trim().split(' ')[0])).toEqual([
      'revoke',
      'grant',
      '',
    ]);
  });

  it('MIG-CP-02 every other statement of the live function is kept verbatim', () => {
    const kept = lines(live).filter((line) => !OLD_PHOTO_CHECK.includes(line));
    const nextLines = lines(next);
    for (const line of kept) expect(nextLines, line).toContain(line);
  });

  it('MIG-CP-03 the photo URL must start with this project origin + the bucket path, then own folder + generated file', () => {
    expect(next).toContain(
      "v_storage_origin text := regexp_replace(coalesce(auth.jwt() ->> 'iss', ''), '/auth/v1/?$', '');",
    );
    expect(next).toContain('v_image_prefix := v_storage_origin || v_image_marker;');
    expect(next).toContain('left(v_image_url, length(v_image_prefix)) <> v_image_prefix');
    expect(next).toContain(
      "if v_image_path !~ ('^' || v_uid::text || '/[A-Za-z0-9-]+\\.(jpg|png|webp)$')",
    );
    // The permissive forms are gone: marker anywhere, and a path read up to `?`.
    expect(next).not.toContain('position(v_image_marker in v_image_url)');
    expect(next).not.toContain('split_part(');
    // The object must still exist in the Community bucket.
    expect(next).toContain("where object.bucket_id = 'community-recipe-images'");
    expect(next).toContain('and object.name = v_image_path');
  });

  it('MIG-CP-04 same error codes and the same grants', () => {
    for (const error of ['community_photo_required', 'community_photo_not_owned']) {
      expect(next).toContain(`'${error}'`);
    }
    const grants = (sql: string) =>
      code(sql).match(/(?:revoke|grant) [^;]*gellatti_publish_recipe_v1[^;]*/g);
    expect(grants(EXACT_SQL)).toEqual(
      grants(PREVIOUS.slice(PREVIOUS.indexOf('create or replace function'))),
    );
  });

  it('MIG-CP-05 the rollback restores the live definition byte for byte', () => {
    expect(functionStatement(EXACT_ROLLBACK, 'gellatti_publish_recipe_v1')).toBe(live);
    expect(code(EXACT_ROLLBACK)).not.toMatch(/\b(?:table|policy|bucket)\b/i);
  });
});

describe(`${PHOTO} — a private, link-scoped own photo`, () => {
  const sql = code(PHOTO_SQL);

  it('MIG-SP-01 the bucket is private, image-only and capped at 10 MB', () => {
    expect(sql).toContain(
      "insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ( 'recipe-share-photos', 'recipe-share-photos', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'] )",
    );
    expect(sql).toContain('on conflict (id) do update set public = false');
    expect(sql).not.toContain("'community-recipe-images'");
  });

  it('MIG-SP-02 the link → photo table is closed to clients: RLS on, no policy, grants revoked', () => {
    expect(sql).toContain('alter table public.recipe_share_link_photos enable row level security');
    expect(sql).toContain(
      'revoke all on table public.recipe_share_link_photos from public, anon, authenticated',
    );
    expect(sql).not.toMatch(/create policy \w+ on public\.recipe_share_link_photos/);
    expect(sql).toContain(
      'share_link_id uuid primary key references public.recipe_share_links (id) on delete cascade',
    );
  });

  it('MIG-SP-03 storage policies: authenticated only, this bucket only, no update and no anon', () => {
    const policies = sql.match(/create policy [^;]*/g) ?? [];
    expect(policies).toHaveLength(3);
    for (const policy of policies) {
      expect(policy).toContain('on storage.objects');
      expect(policy).toContain('to authenticated');
      expect(policy).toContain("bucket_id = 'recipe-share-photos'");
    }
    expect(sql).not.toMatch(/for update/);
    expect(sql).not.toMatch(/\bto anon\b|\bto public\b/);
    expect(sql).toContain(
      'public.gellatti_share_photo_folder_writable_v1((storage.foldername(name))[1])',
    );
    expect(sql).toContain('public.gellatti_share_photo_readable_v1(name)');
  });

  it('MIG-SP-04 reading needs an ACTIVE, unexpired link and sharer, owner or recipient membership', () => {
    const readable = functionStatement(PHOTO_SQL, 'gellatti_share_photo_readable_v1');
    for (const clause of [
      "l.status = 'active'",
      '(l.expires_at is null or l.expires_at > now())',
      'l.shared_by_user_id = auth.uid()',
      'l.owner_user_id = auth.uid()',
      'r.recipient_user_id = auth.uid()',
      'photo.storage_path = p_object_name',
    ]) {
      expect(readable, clause).toContain(clause);
    }
    const writable = functionStatement(PHOTO_SQL, 'gellatti_share_photo_folder_writable_v1');
    expect(writable).toContain('l.shared_by_user_id = auth.uid()');
    expect(writable).toContain("l.status = 'active'");
  });

  it('MIG-SP-05 attaching requires the sharer’s own object inside that link’s folder', () => {
    const attach = functionStatement(PHOTO_SQL, 'gellatti_set_share_photo_v1');
    expect(attach).toContain('where id = p_share_link_id and shared_by_user_id = v_uid');
    expect(attach).toContain(
      "if v_path !~ ('^' || v_link.id::text || '/[A-Za-z0-9-]+\\.(jpg|png|webp)$')",
    );
    expect(attach).toContain("object.bucket_id = 'recipe-share-photos'");
    expect(attach).toContain('object.owner_id = v_uid::text');
    expect(attach).toContain("raise exception 'share_link_inactive'");
  });

  it('MIG-SP-06 the read RPC returns a path and the VERSION profile — never recipe_input', () => {
    const readRpc = functionStatement(PHOTO_SQL, 'gellatti_share_photo_v1');
    expect(readRpc).toContain("select v.recipe_input -> 'category' from public.recipe_versions v");
    expect(readRpc.match(/recipe_input/g)).toHaveLength(1);
    expect(readRpc).toContain("'own_photo_path', v_path");
    expect(readRpc).toContain("'reason', 'revoked'");
    expect(readRpc).toContain("'reason', 'expired'");
  });

  it('MIG-SP-07 every new function is SECURITY DEFINER, pinned search_path, executable by authenticated only', () => {
    const functions = [
      'gellatti_share_photo_folder_writable_v1(text)',
      'gellatti_share_photo_readable_v1(text)',
      'gellatti_set_share_photo_v1(uuid, text)',
      'gellatti_share_photo_v1(uuid)',
    ];
    for (const fn of functions) {
      const name = fn.slice(0, fn.indexOf('('));
      expect(functionStatement(PHOTO_SQL, name)).toMatch(
        /security definer\s+set search_path = pg_catalog, public as \$\$/,
      );
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function public.${fn} to authenticated`);
    }
  });

  it('MIG-SP-08 no existing share object is touched: tokens, expiry, revocation, recipients, paywall', () => {
    expect(sql).not.toMatch(
      /gellatti_(?:create_share_link|resolve_share|open_share|open_received_share|list_received_shares|has_paid_access)_v1/,
    );
    expect(sql).not.toMatch(/alter table public\.recipe_share_(?:links|recipients)\b/);
    expect(sql).not.toMatch(/policy \w+ on public\.recipe_share_(?:links|recipients)\b/);
    expect(sql).not.toMatch(/\b(?:update|delete from) public\.recipe_share_(?:links|recipients)\b/);
  });

  it('MIG-SP-09 the rollback removes exactly what the migration created', () => {
    const rollback = code(PHOTO_ROLLBACK);
    for (const fn of [
      'gellatti_share_photo_v1(uuid)',
      'gellatti_set_share_photo_v1(uuid, text)',
      'gellatti_share_photo_readable_v1(text)',
      'gellatti_share_photo_folder_writable_v1(text)',
    ]) {
      expect(rollback).toContain(`drop function if exists public.${fn}`);
    }
    for (const policy of sql.match(/create policy (\w+) on storage\.objects/g) ?? []) {
      const name = policy.split(' ')[2];
      expect(rollback).toContain(`drop policy if exists ${name} on storage.objects`);
    }
    expect(rollback).toContain('drop table if exists public.recipe_share_link_photos');
    expect(rollback).not.toMatch(/recipe_share_(?:links|recipients)\b/);
  });

  it('MIG-SP-10 both versions are new and sort after every migration already in the repo', () => {
    const versions = readdirSync(join(ROOT, 'supabase/migrations'))
      .filter((file) => file.endsWith('.sql'))
      .map((file) => file.slice(0, 14))
      .sort();
    const others = versions.filter(
      (version) => !['20260917153000', '20260917154000'].includes(version),
    );
    expect(versions.filter((version) => version === '20260917153000')).toHaveLength(1);
    expect(versions.filter((version) => version === '20260917154000')).toHaveLength(1);
    expect(others.at(-1)! < '20260917153000').toBe(true);
  });
});
