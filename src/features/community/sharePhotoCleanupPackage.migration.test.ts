/// <reference types="node" />
/**
 * Share photo CLEANUP package — a contract over a migration that is PREPARED,
 * NOT APPLIED (owner decision 2026-09-17: prepare now, apply only after a
 * separate approval of this exact package).
 *
 *   20260917170000_share_photo_cleanup — delete, through the Storage API, only
 *   (1) the previous photo after a confirmed replacement, (2) the photo after a
 *   confirmed detach, (3) a completed upload never attached, after 24 h.
 *
 * These read the SQL (shape and scope). Behaviour, the race rules, the tick and
 * the rollback are executed in isolation (PGlite, CLN-QA-01..27, 9/9 mutants).
 */
import { readFileSync } from 'node:fs';
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

const CLEANUP = '20260917170000_share_photo_cleanup';
const SQL = read(`supabase/migrations/${CLEANUP}.sql`);
const ROLLBACK = read(`supabase/rollbacks/${CLEANUP}.rollback.sql`);
const PHOTO_SQL = read('supabase/migrations/20260917103413_direct_share_own_photo.sql');
const EMAIL_TICK_SHAPE = {
  vault: ["name = 'gellatti_edge_functions_base_url'", "name = 'gellatti_share_photo_cleanup_key'"],
  inert: "return jsonb_build_object('skipped', 'not_configured');",
};

/** The `create or replace function public.<name>( … $$;` statement, verbatim. */
function functionStatement(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start === -1) throw new Error(`no ${name} in SQL`);
  const bodyStart = sql.indexOf('$$', start);
  const bodyEnd = sql.indexOf('$$;', bodyStart + 2);
  return sql.slice(start, bodyEnd + 3);
}
const NEW_FUNCTIONS = [
  'gellatti_share_photo_object_lock_v1',
  'gellatti_share_photo_link_lock_v1',
  'gellatti_share_photo_cleanup_is_due_v1',
  'gellatti_share_photo_cleanup_sweep_v1',
  'gellatti_share_photo_cleanup_claim_v1',
  'gellatti_share_photo_cleanup_settle_v1',
  'gellatti_share_photo_cleanup_tick_v1',
];

describe(`${CLEANUP} — deletes only share photos nothing uses`, () => {
  it('CLN-MIG-01 touches only the private share-photo bucket and never deletes from storage tables in SQL', () => {
    const executable = code(SQL);
    const buckets = [...executable.matchAll(/bucket_id = '([^']+)'/g)].map((match) => match[1]);
    expect(new Set(buckets)).toEqual(new Set(['recipe-share-photos']));
    expect(executable).not.toMatch(/community-recipe-images|brand\/profile|storage\.buckets/);
    expect(executable).not.toMatch(/delete from storage\.|update storage\.|truncate/i);
    // The only deletes are the attachment row on a confirmed detach — nothing else.
    expect([...executable.matchAll(/delete from ([a-z_.]+)/g)].map((match) => match[1])).toEqual([
      'public.recipe_share_link_photos',
    ]);
  });

  it('CLN-MIG-02 closed ledger; only claim and settle are executable, and only by the worker role', () => {
    const executable = code(SQL);
    expect(executable).toContain(
      'alter table public.recipe_share_photo_cleanup enable row level security; revoke all on table public.recipe_share_photo_cleanup from public, anon, authenticated, service_role;',
    );
    for (const name of NEW_FUNCTIONS) {
      expect(executable, name).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role;`,
        ),
      );
      expect(functionStatement(SQL, name), name).toMatch(/set search_path/);
    }
    const grants = [
      ...executable.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to (\w+);/g),
    ].map((match) => `${match[1]} → ${match[2]}`);
    expect(grants).toEqual([
      'gellatti_set_share_photo_v1 → authenticated',
      'gellatti_share_photo_cleanup_claim_v1 → service_role',
      'gellatti_share_photo_cleanup_settle_v1 → service_role',
    ]);
    expect(executable).not.toMatch(/create policy|to anon/);
  });

  it('CLN-MIG-03 attach keeps its contract and queues only what a COMMITTED change released', () => {
    const next = functionStatement(SQL, 'gellatti_set_share_photo_v1');
    const live = functionStatement(PHOTO_SQL, 'gellatti_set_share_photo_v1');
    // Same signature, errors and return shape as the applied v1.
    for (const unchanged of [
      'p_share_link_id uuid, p_storage_path text default null',
      "raise exception 'authentication required' using errcode = '42501';",
      "raise exception 'share_link_not_found' using errcode = '42501';",
      "raise exception 'share_link_inactive' using errcode = '22023';",
      "raise exception 'share_photo_not_owned' using errcode = '42501';",
      "return jsonb_build_object('share_link_id', v_link.id, 'own_photo', false);",
      "return jsonb_build_object('share_link_id', v_link.id, 'own_photo', true);",
    ]) {
      expect(live, unchanged).toContain(unchanged);
      expect(next, unchanged).toContain(unchanged);
    }
    // The detach queue insert follows the row delete; the replacement queue insert follows the upsert.
    expect(next.indexOf("'detached')")).toBeGreaterThan(
      next.indexOf('delete from public.recipe_share_link_photos'),
    );
    expect(next.indexOf("'replaced')")).toBeGreaterThan(
      next.indexOf('on conflict (share_link_id) do update set'),
    );
    expect(next).toContain('if v_previous is not null and v_previous <> v_path then');
  });

  it('CLN-MIG-04 race: attach and claim/sweep share the per-object lock, in ascending name order; a queued path is never attachable', () => {
    const attach = functionStatement(SQL, 'gellatti_set_share_photo_v1');
    const claim = functionStatement(SQL, 'gellatti_share_photo_cleanup_claim_v1');
    const sweep = functionStatement(SQL, 'gellatti_share_photo_cleanup_sweep_v1');
    expect(attach.indexOf('gellatti_share_photo_link_lock_v1(v_link.id)')).toBeLessThan(
      attach.indexOf('select ph.storage_path into v_previous'),
    );
    expect(attach).toContain('gellatti_share_photo_object_lock_v1(least(v_path, v_previous))');
    expect(attach).toContain('gellatti_share_photo_object_lock_v1(greatest(v_path, v_previous))');
    expect(code(attach)).toContain(
      'or exists ( select 1 from public.recipe_share_photo_cleanup queued where queued.object_name = v_path )',
    );
    expect(code(claim)).toContain('order by queued.object_name');
    expect(code(claim)).toContain('for update skip locked');
    expect(code(sweep)).toContain('order by object.name');
    for (const statement of [claim, sweep]) {
      expect(statement).toContain('gellatti_share_photo_object_lock_v1(');
    }
    expect(code(SQL)).toContain(
      "pg_advisory_xact_lock(hashtextextended('recipe-share-photos/' || p_object_name, 20260917))",
    );
  });

  it('CLN-MIG-05 claim re-checks under the lock: attached → kept, link gone or other sharer → kept, other owner → kept', () => {
    const claim = code(functionStatement(SQL, 'gellatti_share_photo_cleanup_claim_v1'));
    expect(claim.indexOf('gellatti_share_photo_object_lock_v1(v_row.object_name)')).toBeLessThan(
      claim.indexOf("then 'in_use'"),
    );
    for (const keep of [
      "then 'in_use'",
      "then 'link_gone_or_other_sharer'",
      "then 'other_owner'",
    ]) {
      expect(claim).toContain(keep);
    }
    expect(claim).toContain("set status = 'kept'");
    expect(claim).toContain("set status = 'claimed', claim_token = v_token");
  });

  it('CLN-MIG-06 sweep: 24 h minimum grace, own-folder uploads of the sharer, never attached, never queued', () => {
    const sweep = code(functionStatement(SQL, 'gellatti_share_photo_cleanup_sweep_v1'));
    expect(sweep).toContain("p_grace interval default interval '24 hours'");
    expect(sweep).toContain("if p_grace is null or p_grace < interval '24 hours' then");
    for (const rule of [
      "on link.id::text = split_part(object.name, '/', 1)",
      'and object.created_at < now() - p_grace',
      'and object.owner_id = link.shared_by_user_id::text',
      'and not exists (select 1 from public.recipe_share_link_photos ph where ph.storage_path = object.name)',
      'and not exists (select 1 from public.recipe_share_photo_cleanup queued where queued.object_name = object.name)',
    ]) {
      expect(sweep, rule).toContain(rule);
    }
    expect(sweep).toContain("'unattached')");
  });

  it('CLN-MIG-07 settle counts a deletion only when Storage no longer has the file; the rest returns to the queue', () => {
    const settle = code(functionStatement(SQL, 'gellatti_share_photo_cleanup_settle_v1'));
    const deleted = settle.slice(
      settle.indexOf("set status = 'deleted'"),
      settle.indexOf('get diagnostics v_deleted'),
    );
    expect(deleted).toContain("and queued.status = 'claimed'");
    expect(deleted).toContain(
      "and not exists ( select 1 from storage.objects object where object.bucket_id = 'recipe-share-photos' and object.name = queued.object_name )",
    );
    expect(settle).toContain("set status = 'failed'");
  });

  it('CLN-MIG-08 tick is the email-dispatch tick for this worker: Vault by name, inert until configured, no call when nothing is due', () => {
    const tick = functionStatement(SQL, 'gellatti_share_photo_cleanup_tick_v1');
    for (const vault of EMAIL_TICK_SHAPE.vault) expect(tick).toContain(vault);
    // Its own key: switching the cleanup on must never switch on email dispatch.
    expect(tick).not.toContain('gellatti_edge_dispatch_key');
    expect(tick).toContain(EMAIL_TICK_SHAPE.inert);
    expect(tick.indexOf(EMAIL_TICK_SHAPE.inert)).toBeLessThan(
      tick.indexOf('gellatti_share_photo_cleanup_sweep_v1()'),
    );
    expect(tick.indexOf("'nothing_due'")).toBeLessThan(tick.indexOf('net.http_post('));
    expect(tick).toContain("url     => rtrim(v_base_url, '/') || '/share-photo-cleanup'");
    expect(code(SQL)).toContain(
      "select cron.schedule( 'gellatti-share-photo-cleanup', '*/15 * * * *', $cron$select public.gellatti_share_photo_cleanup_tick_v1()$cron$ );",
    );
    expect(SQL).not.toMatch(
      /eyJ[A-Za-z0-9_-]{10,}|sb_secret_|https:\/\/[a-z0-9]{20}\.supabase\.co/,
    );
  });

  it('CLN-MIG-09 rollback: unschedule first, restore the applied attach byte for byte, keep photos and the ledger', () => {
    const restored = functionStatement(ROLLBACK, 'gellatti_set_share_photo_v1');
    expect(restored).toBe(functionStatement(PHOTO_SQL, 'gellatti_set_share_photo_v1'));
    expect(ROLLBACK.indexOf("cron.unschedule('gellatti-share-photo-cleanup')")).toBeLessThan(
      ROLLBACK.indexOf('drop function'),
    );
    const executable = code(ROLLBACK);
    // Outside the restored v1 statement (which has its own detach delete), nothing removes data.
    const aroundRestore = code(ROLLBACK.replace(restored, ''));
    expect(aroundRestore).not.toMatch(/drop table|delete from|truncate|storage\./);
    for (const name of NEW_FUNCTIONS)
      expect(executable, name).toContain(`drop function if exists public.${name}(`);
  });
});
