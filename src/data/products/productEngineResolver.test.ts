/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProductEngineValues } from './productEngineResolver';

describe('resolveProductEngineValues — confirmed match links the reference (no copy)', () => {
  const ref = { ingredient_id: 'PI-ING-000180', ingredient_name_display: 'Cream 30% UHT', pac_value: 3.668, pod_value: 0.512 };

  it('a matched product resolves via the reference, flagged not-independently-measured', () => {
    const r = resolveProductEngineValues(
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', pac_value: null, pod_value: null },
      ref,
    );
    expect(r.resolvable).toBe(true);
    expect(r.provenance).toBe('reference_linked');
    expect(r.pac_value).toBe(3.668);
    expect(r.pod_value).toBe(0.512);
    expect(r.basement_id).toBe('PI-ING-000180');
    expect(r.not_independently_measured).toBe(true);
    expect(r.reason).toMatch(/NOT an independent measurement/i);
  });

  it('coerces reference values that arrive as numeric strings (PostgREST)', () => {
    const r = resolveProductEngineValues(
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180' },
      { ...ref, pac_value: '3.668', pod_value: '0.512' },
    );
    expect(r.resolvable).toBe(true);
    expect(r.pac_value).toBe(3.668);
  });
});

describe('resolveProductEngineValues — gates (never claims engine-readiness early)', () => {
  const ref = { ingredient_id: 'PI-ING-000180', pac_value: 3.668, pod_value: 0.512 };

  it('does NOT resolve a non-matched product (needs_review / ambiguous / rejected / null)', () => {
    for (const status of ['needs_review', 'ambiguous', 'rejected', null]) {
      const r = resolveProductEngineValues({ mapper_status: status, matched_basement_id: 'PI-ING-000180' }, ref);
      expect(r.resolvable, String(status)).toBe(false);
      expect(r.provenance).toBe('unresolved');
    }
  });

  it('does NOT resolve when the reference is missing or lacks pac/pod', () => {
    expect(resolveProductEngineValues({ mapper_status: 'matched', matched_basement_id: 'PI-ING-000180' }, null).resolvable).toBe(false);
    const noVals = resolveProductEngineValues(
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180' },
      { ingredient_id: 'PI-ING-000180', pac_value: null, pod_value: null },
    );
    expect(noVals.resolvable).toBe(false);
    expect(noVals.reason).toMatch(/lacks pac\/pod/i);
  });

  it('never invents pac/pod from a single value — needs BOTH', () => {
    const r = resolveProductEngineValues(
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180' },
      { ingredient_id: 'PI-ING-000180', pac_value: 3.668, pod_value: null },
    );
    expect(r.resolvable).toBe(false);
  });
});

describe("resolveProductEngineValues — a product's own measured values win", () => {
  it('uses product_measured provenance when the product carries its own pac AND pod', () => {
    const r = resolveProductEngineValues(
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', pac_value: 5, pod_value: 5 },
      { ingredient_id: 'PI-ING-000180', pac_value: 3.668, pod_value: 0.512 },
    );
    expect(r.provenance).toBe('product_measured');
    expect(r.pac_value).toBe(5); // the product's own value, not the reference's
    expect(r.not_independently_measured).toBe(false);
  });
});

describe('productEngineResolver — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = stripComments(readFileSync(join(SRC, 'data', 'products', 'productEngineResolver.ts'), 'utf8'));

  it('is pure + non-mutating: no Supabase / service / engine / DB write, no npac_value', () => {
    expect(/supabase/i.test(MOD)).toBe(false);
    expect(/@\/services\//.test(MOD)).toBe(false);
    expect(/@\/engine/.test(MOD)).toBe(false);
    expect(/npac_value/i.test(MOD)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MOD.includes(verb), verb).toBe(false);
    }
  });
});
