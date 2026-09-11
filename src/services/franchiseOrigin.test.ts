/// <reference types="node" />
/**
 * The franchise enquiry must always tell the server which app it came from.
 *
 * Staging and production share ONE Supabase project, so the database cannot
 * work out which app called it. The RPC classifies the caller's origin and uses
 * the result to label the admin email's subject — a submission that arrives
 * without an origin is labelled `[STAGING]`, which in production means a real
 * lead lands in the real mailbox marked as a test.
 *
 * That makes "every caller passes origin" a correctness property, not a style
 * preference, so it is pinned here:
 *
 *   ONE service owns the RPC call, and it adds the origin itself, so no
 *   submission path can forget it. A second caller reaching for the RPC
 *   directly would bypass that, and this test is what makes such a caller
 *   visible.
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

describe('franchise enquiry origin', () => {
  it('exactly ONE file calls the submit RPC', () => {
    const callers = sourceFiles.filter((file) =>
      readFileSync(file, 'utf8').includes('gellatti_submit_franchise_inquiry_v1'),
    );
    expect(callers.map((f) => f.replace(SRC, 'src/'))).toEqual(['src/services/franchise.ts']);
  });

  it('that one caller adds the origin itself', () => {
    // Inside the rpc payload, not left to whoever calls the service.
    expect(service).toMatch(
      /rpc\('gellatti_submit_franchise_inquiry_v1'[\s\S]{0,300}origin:\s*typeof window/,
    );
  });

  it('a non-browser caller sends an empty origin rather than crashing', () => {
    // SSR, tests and any script have no window. An empty origin is classified
    // as staging by the RPC, which is the safe direction.
    expect(service).toContain("typeof window === 'undefined' ? ''");
  });

  it('the draft type carries no origin, so a caller cannot spoof it', () => {
    // If FranchiseInquiryDraft had an `origin` field a caller could pass its
    // own. The service supplies it, always, from the real window.
    const draftBlock = service.match(/export interface FranchiseInquiryDraft \{([\s\S]*?)\}/);
    expect(draftBlock).toBeTruthy();
    expect(draftBlock?.[1] ?? '').not.toMatch(/\borigin\b/);
  });
});
