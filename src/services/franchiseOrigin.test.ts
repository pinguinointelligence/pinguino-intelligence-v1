/// <reference types="node" />
/**
 * The franchise enquiry does NOT tell the server which app it came from.
 *
 * Staging and production share ONE Supabase project. The live RPC
 * (20260910032351) labelled the admin mail's environment from an `origin` the
 * app wrote into the request body, matched with `ilike '%gellatti.com%'`. Called
 * as anon on the isolated QA branch, 'https://gellatti.com.attacker.example'
 * produced a production-labelled mail with the production admin link. Owner
 * decision 2026-09-17: the environment and the links are decided on the server,
 * never from a value the client sends. 20260917180000 reads the HTTP Origin
 * header PostgREST received and matches it exactly against the closed
 * `app_origins` map.
 *
 * These tests keep the payload free of any environment claim, so nobody quietly
 * brings the trusted-client shape back.
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

const service = readFileSync(join(SRC, 'services/franchise.ts'), 'utf8');

describe('franchise enquiry environment is decided on the server', () => {
  it('exactly ONE file calls the submit RPC', () => {
    const callers = sourceFiles.filter((file) =>
      readFileSync(file, 'utf8').includes('gellatti_submit_franchise_inquiry_v1'),
    );
    expect(callers.map((f) => f.replace(SRC, 'src/'))).toEqual(['src/services/franchise.ts']);
  });

  it('that caller sends the draft as it is, with no origin added', () => {
    const call = service.match(/rpc\('gellatti_submit_franchise_inquiry_v1',\s*\{([\s\S]*?)\}\);/);
    expect(call).toBeTruthy();
    expect(call?.[1] ?? '').toMatch(/^\s*p_inquiry: draft,\s*$/);
    expect(service).not.toMatch(/window\.location\.origin/);
  });

  it('the draft type carries no origin either', () => {
    const draftBlock = service.match(/export interface FranchiseInquiryDraft \{([\s\S]*?)\}/);
    expect(draftBlock).toBeTruthy();
    expect(draftBlock?.[1] ?? '').not.toMatch(/\borigin\b/);
  });
});
