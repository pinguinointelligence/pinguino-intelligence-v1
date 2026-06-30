/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const SVC = strip(readFileSync(join(SRC, 'services', 'productEnrichment.ts'), 'utf8'));
const MOD = strip(readFileSync(join(SRC, 'data', 'products', 'productEnrichment.ts'), 'utf8'));
const ALL = `${SVC}\n${MOD}`;

describe('enrichment write — boundaries', () => {
  it('never references the locked reference base', () => {
    expect(/mapper_basement/i.test(ALL)).toBe(false);
  });

  it('never writes pac/pod and never reintroduces npac', () => {
    expect(/pac_value\s*[:=]/.test(ALL)).toBe(false);
    expect(/pod_value\s*[:=]/.test(ALL)).toBe(false);
    expect(/npac_value/i.test(ALL)).toBe(false);
  });

  it('the only product mutation is the RLS-gated updateProduct (no raw table write, no privileged key)', () => {
    // the service delegates to updateProduct; it does not open its own supabase write
    expect(SVC.includes('updateProduct(')).toBe(true);
    for (const verb of ['.insert(', '.upsert(', '.delete(']) {
      expect(SVC.includes(verb), verb).toBe(false);
    }
    expect(/service_role|SUPABASE_SERVICE/i.test(ALL)).toBe(false);
  });

  it('writes are restricted to the ENRICHABLE_FIELDS allowlist', () => {
    expect(SVC.includes('ENRICHABLE_FIELDS')).toBe(true);
    expect(SVC.includes('narrowToEnrichable')).toBe(true);
  });

  it('a PI Verified product is not silently overwritten', () => {
    expect(SVC.includes('pi_verified')).toBe(true);
    expect(SVC.includes('allowPiVerifiedOverride')).toBe(true);
  });
});
