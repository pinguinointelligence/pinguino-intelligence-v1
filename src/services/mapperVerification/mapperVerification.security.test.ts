/// <reference types="node" />
/**
 * Verification workflow boundary guard. Proves the workflow COMPOSES the existing product
 * architecture and never bypasses it: it does NOT write public.products directly, never
 * touches mapper_basement, holds no privileged key, and reuses the shared status policy +
 * red-flag detector rather than re-implementing them. Static source-text guard.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CODE = readFileSync(join(import.meta.dirname, 'inMemoryVerification.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('mapper-verification — boundaries', () => {
  it('reuses the shared policy + detector (never re-implements them)', () => {
    expect(CODE.includes('decideProductStatus') || CODE.includes('evaluateSignoffGate')).toBe(true);
    expect(CODE.includes('detectRedFlags')).toBe(true);
  });

  it('never writes public.products directly and never touches mapper_basement', () => {
    expect(/\.from\((['"])products('|")\)/.test(CODE)).toBe(false);
    expect(/mapper_basement/.test(CODE)).toBe(false);
    // PI Verified persistence is delegated to the existing guarded write path
    expect(CODE.includes('setProductLifecycleStatus')).toBe(true);
  });

  it('holds no privileged key and no payment/engine internals', () => {
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
    expect(/npac_value|@\/engine/.test(CODE)).toBe(false);
  });
});
