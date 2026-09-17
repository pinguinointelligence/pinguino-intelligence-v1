/// <reference types="node" />
/**
 * The partner application does NOT tell the server which app it came from.
 *
 * Staging and production share ONE Supabase project. An earlier draft of the
 * application e-mail (C-APP-08) labelled the environment from an `origin` the
 * app wrote into the request body and matched it with `ilike '%gellatti.com%'`;
 * on the isolated QA branch 'https://gellatti.com.attacker.example' produced a
 * production-labelled mail with production links. Owner decision: the
 * environment and the links are decided on the server, never from a value the
 * client sends. The migration now asks gellatti_request_app_origin_v1()
 * (20260910175900), which reads the HTTP Origin header PostgREST received and
 * matches it exactly against the closed `app_origins` map.
 *
 * These tests keep the body free of any environment claim, so nobody quietly
 * reintroduces the trusted-client shape.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = new URL('..', import.meta.url).pathname;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const sourceFiles = walk(SRC).filter(
  (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file),
);

const service = readFileSync(join(SRC, 'services/partner.ts'), 'utf8');

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/20260910180000_partner_application_lifecycle_email.sql',
    import.meta.url,
  ),
  'utf8',
);
const executable = migration.replace(/--[^\n]*/g, '');

describe('partner application environment is decided on the server', () => {
  it('exactly ONE file calls the submit RPC', () => {
    const callers = sourceFiles.filter((file) =>
      readFileSync(file, 'utf8').includes('gellatti_submit_partner_application_v1'),
    );
    expect(callers.map((f) => f.replace(SRC, 'src/'))).toEqual(['src/services/partner.ts']);
  });

  it('that caller sends the draft as it is, with no origin added', () => {
    const call = service.match(/rpc\('gellatti_submit_partner_application_v1',\s*\{([\s\S]*?)\}\);/);
    expect(call).toBeTruthy();
    expect(call?.[1] ?? '').toMatch(/^\s*p_application: draft,\s*$/);
    expect(call?.[1] ?? '').not.toMatch(/\borigin\b/);
  });

  it('the draft type carries no origin either', () => {
    const draftBlock = service.match(/export interface PartnerApplicationDraft \{([\s\S]*?)\n\}/);
    expect(draftBlock).toBeTruthy();
    expect(draftBlock?.[1] ?? '').not.toMatch(/\borigin\b/);
  });

  it('the migration reads no environment from the application body', () => {
    expect(executable).not.toMatch(/application_data\s*->>?\s*'origin'/);
    expect(executable).not.toMatch(/ilike\s*'%gellatti/i);
    expect(executable).not.toMatch(/gellatti_submit_partner_application_v1/);
  });

  it('the migration asks the server-side resolver, which matches the request Origin header exactly', () => {
    expect(executable).toContain('public.gellatti_request_app_origin_v1()');
    const foundation = readFileSync(
      new URL('../../supabase/migrations/20260910175900_mail_origin_and_escaping.sql', import.meta.url),
      'utf8',
    ).replace(/--[^\n]*/g, '');
    expect(foundation).toContain("current_setting('request.headers', true)");
    expect(foundation).toMatch(/where o\.origin = v_origin;/);
  });
});
