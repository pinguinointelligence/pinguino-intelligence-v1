/// <reference types="node" />
/**
 * Phase 2B.1 billing guards — the frontend must contain NO Stripe SDK/secret
 * usage and no privileged-server key; users must have no write path to billing
 * state (no self-promotion). Stripe lives only in server-side Edge Functions.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const REPO = resolve(SRC, '..');

function shippedSourceFiles(): string[] {
  const entries = readdirSync(SRC, { recursive: true }) as string[];
  return entries
    .map((rel) => join(SRC, String(rel)))
    .filter(
      (full) =>
        /\.(ts|tsx)$/.test(full) &&
        !/\.test\.(ts|tsx)$/.test(full) &&
        !full.includes('__snapshots__'),
    );
}

const FILES = shippedSourceFiles();

describe('Phase 2B.1 billing security', () => {
  it('frontend contains no Stripe secret/SDK usage', () => {
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      expect(/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/.test(text), `stripe secret in ${file}`).toBe(false);
      expect(/from\s+['"](stripe|@stripe\/)/.test(text), `stripe import in ${file}`).toBe(false);
      expect(/new\s+Stripe\s*\(/.test(text), `Stripe() in ${file}`).toBe(false);
    }
  });

  it('frontend never references a service_role key', () => {
    for (const file of FILES) {
      expect(/service[_-]?role/i.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });

  it('the billing service is read-only (no self-promotion write path)', () => {
    const billing = readFileSync(join(SRC, 'services', 'billing.ts'), 'utf8');
    for (const write of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(billing.includes(write), `billing.ts must not ${write}`).toBe(false);
    }
  });

  it('keeps .env.local gitignored', () => {
    const gitignore = readFileSync(join(REPO, '.gitignore'), 'utf8');
    expect(gitignore.includes('.env.local') || gitignore.includes('*.local')).toBe(true);
  });
});
