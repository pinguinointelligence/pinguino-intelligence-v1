/// <reference types="node" />
/**
 * The partner application must always tell the server which app it came from.
 *
 * Staging and production share ONE Supabase project, so the database cannot
 * work out which app called it. The application e-mail (C-APP-08) labels its
 * environment from the origin recorded at submit time; a submission without one
 * is labelled `[STAGING]`, which in production means a real applicant receives
 * a mail marked as a test, with a link to staging.
 *
 * The same shape as `franchiseOrigin.test.ts`: ONE service owns the RPC call and
 * adds the origin itself, so no submission path can forget it or spoof it.
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

describe('partner application origin', () => {
  it('exactly ONE file calls the submit RPC', () => {
    const callers = sourceFiles.filter((file) =>
      readFileSync(file, 'utf8').includes('gellatti_submit_partner_application_v1'),
    );
    expect(callers.map((f) => f.replace(SRC, 'src/'))).toEqual(['src/services/partner.ts']);
  });

  it('that one caller adds the origin itself, inside the RPC payload', () => {
    expect(service).toMatch(
      /rpc\('gellatti_submit_partner_application_v1'[\s\S]{0,300}origin:\s*typeof window/,
    );
  });

  it('a non-browser caller sends an empty origin rather than crashing', () => {
    expect(service).toContain("origin: typeof window === 'undefined' ? '' : window.location.origin");
  });

  it('the draft type carries no origin, so a caller cannot spoof it', () => {
    const draftBlock = service.match(/export interface PartnerApplicationDraft \{([\s\S]*?)\n\}/);
    expect(draftBlock).toBeTruthy();
    expect(draftBlock?.[1] ?? '').not.toMatch(/\borigin\b/);
  });

  it('the origin is spread AFTER the draft, so nothing in the draft can override it', () => {
    expect(service).toMatch(/\.\.\.draft,\s*origin:/);
  });
});
