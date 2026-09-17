/// <reference types="node" />
/**
 * 20260910175900_mail_origin_and_escaping — the server-side answer to "which app
 * called?" and the escape every mail body uses, verified STATICALLY.
 *
 * Written and NOT applied: staging and production share one Supabase project.
 * Its behaviour is exercised on the isolated Growth QA branch; these contracts
 * keep the shape that makes that behaviour hold.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const strip = (sql: string) => sql.replace(/--[^\n]*/g, '');

const migration = strip(read('supabase/migrations/20260910175900_mail_origin_and_escaping.sql'));
const rollback = strip(read('supabase/rollbacks/20260910175900_mail_origin_and_escaping.rollback.sql'));

const fn = (sql: string, name: string): string => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`${name} is not defined here`);
  return sql.slice(start, sql.indexOf('$function$;', start));
};

const RESOLVER = fn(migration, 'gellatti_request_app_origin_v1');
const ESCAPE = fn(migration, 'gellatti_html_escape_v1');

describe('it only adds', () => {
  it('creates the map, the resolver and the escape, and touches nothing else', () => {
    const created = [...migration.matchAll(/create (?:or replace function|table if not exists) public\.([a-z0-9_]+)/g)].map(
      (m) => m[1],
    );
    expect(created.sort()).toEqual(['app_origins', 'gellatti_html_escape_v1', 'gellatti_request_app_origin_v1']);
    expect(migration).not.toMatch(/\bdrop\b/i);
    expect([...migration.matchAll(/alter table public\.([a-z0-9_]+)/g)].map((m) => m[1])).toEqual(['app_origins']);
    expect(migration).not.toMatch(/\bgrant\b/i);
  });

  it('is closed to clients', () => {
    expect(migration).toContain('alter table public.app_origins enable row level security;');
    expect(migration).toContain('revoke all on table public.app_origins from public, anon, authenticated;');
    expect(migration).toContain('revoke all on function public.gellatti_request_app_origin_v1() from public, anon, authenticated;');
    expect(migration).toContain('revoke all on function public.gellatti_html_escape_v1(text) from public, anon, authenticated;');
  });
});

describe('gellatti_request_app_origin_v1', () => {
  it('reads only the Origin header PostgREST received — no parameter, no body', () => {
    expect(RESOLVER).toMatch(/gellatti_request_app_origin_v1\(\)\s*\n\s*returns jsonb/);
    expect(RESOLVER).toContain("nullif(current_setting('request.headers', true), '')::jsonb ->> 'origin'");
    expect(RESOLVER).not.toMatch(/referer|x-forwarded|host'/i);
  });

  it('matches exactly: equality on the normalised origin, nothing fuzzy', () => {
    expect(RESOLVER).toContain("v_origin := lower(rtrim(btrim(coalesce(");
    expect(RESOLVER).toMatch(/where o\.origin = v_origin;/);
    expect(RESOLVER).not.toMatch(/\blike\b|similar to|~|position\(|strpos\(|split_part\(/i);
  });

  it('an unparsable header is an absent one, and unknown is staging', () => {
    expect(RESOLVER).toMatch(/exception when others then\s*\n\s*v_origin := '';/);
    expect(RESOLVER).toMatch(
      /if v_result is null then[\s\S]*?jsonb_build_object\('environment', 'staging', 'baseUrl', o\.base_url, 'matched', false\)[\s\S]*?where o\.environment = 'staging'/,
    );
  });

  it('is STABLE and SECURITY DEFINER with a pinned search_path', () => {
    expect(RESOLVER).toMatch(/\bstable\b/);
    expect(RESOLVER).toContain('security definer');
    expect(RESOLVER).toContain("set search_path to 'pg_catalog', 'public'");
  });
});

describe('gellatti_html_escape_v1', () => {
  it('escapes & first, then < > " and the single quote', () => {
    const order = ["'&', '&amp;'", "'<', '&lt;'", "'>', '&gt;'", `'"', '&quot;'`, "'''', '&#39;'"].map((pair) =>
      ESCAPE.indexOf(pair),
    );
    expect(order.every((position) => position > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('is strict and immutable, so null stays null and an optional part still disappears', () => {
    expect(ESCAPE).toMatch(/\bimmutable\b/);
    expect(ESCAPE).toMatch(/\bstrict\b/);
    expect(ESCAPE).not.toMatch(/coalesce/);
  });
});

describe('its dependants and its rollback', () => {
  it('every dependant refuses to apply without it', () => {
    for (const file of [
      'supabase/migrations/20260910180000_partner_application_lifecycle_email.sql',
      'supabase/migrations/20260917180000_franchise_inquiry_server_environment.sql',
      'supabase/migrations/20260918090000_audit_environment_server_decided.sql',
    ]) {
      expect(read(file), file).toContain("raise exception 'apply 20260910175900_mail_origin_and_escaping.sql first';");
    }
  });

  it('the rollback refuses while a dependant is applied, then drops exactly what it added', () => {
    expect(rollback).toContain(
      "raise exception 'rollback refused: roll back 20260910180000_partner_application_lifecycle_email first';",
    );
    expect(rollback).toContain(
      "raise exception 'rollback refused: roll back 20260917180000_franchise_inquiry_server_environment first';",
    );
    expect(rollback).toContain(
      "raise exception 'rollback refused: roll back 20260918090000_audit_environment_server_decided first';",
    );
    const guard = rollback.indexOf('rollback refused');
    for (const statement of [
      'drop function if exists public.gellatti_html_escape_v1(text);',
      'drop function if exists public.gellatti_request_app_origin_v1();',
      'drop table if exists public.app_origins;',
    ]) {
      expect(rollback.indexOf(statement), statement).toBeGreaterThan(guard);
    }
    expect([...rollback.matchAll(/\bdrop\b/g)]).toHaveLength(3);
  });
});
