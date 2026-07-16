/// <reference types="node" />
/**
 * Phase 2A security guards — the frontend must use ONLY the public Supabase env,
 * never the service_role key, and `.env.local` must stay gitignored.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const REPO = resolve(SRC, '..');

function allSourceFiles(): string[] {
  const entries = readdirSync(SRC, { recursive: true }) as string[];
  return entries
    .map((rel) => join(SRC, String(rel)))
    .filter(
      (full) =>
        /\.(ts|tsx)$/.test(full) &&
        !/\.test\.(ts|tsx)$/.test(full) && // guards scan shipped code, not the guards themselves
        !full.includes('__snapshots__'),
    );
}

const FILES = allSourceFiles();
// The COMPLETE frontend env allowlist. VITE_SENTRY_DSN is a Sentry DSN — public
// by design (ingest-only; it cannot read events). Anything else is disallowed.
const ALLOWED_ENV = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SENTRY_DSN']);

describe('Phase 2A security guards', () => {
  it('never references a service_role key anywhere in the frontend', () => {
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      expect(/service[_-]?role/i.test(text), `service_role referenced in ${file}`).toBe(false);
    }
  });

  it('references only allowlisted public frontend env vars (ANY VITE_* is policed)', () => {
    const referenced = new Set<string>();
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      // Widened from VITE_SUPABASE_* to ALL VITE_* vars so a new env var can never
      // slip into the shipped bundle without an explicit allowlist decision here.
      // Lookbehind excludes identifiers merely CONTAINING the substring (INVITE_…).
      for (const match of text.matchAll(/(?<![A-Z0-9_])VITE_[A-Z_]+/g)) {
        referenced.add(match[0]);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(ALLOWED_ENV.has(name), `disallowed frontend env var: ${name}`).toBe(true);
    }
  });

  it('keeps .env.local gitignored', () => {
    const gitignore = readFileSync(join(REPO, '.gitignore'), 'utf8');
    const lines = gitignore.split(/\r?\n/).map((line) => line.trim());
    const ignored =
      lines.includes('.env.local') || lines.includes('.env.*.local') || lines.includes('*.local');
    expect(ignored, '.env.local must be gitignored').toBe(true);
  });
});
