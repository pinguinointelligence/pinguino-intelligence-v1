/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSourcedField, withinTolerance, type SourcedValue } from './productSourceRanking';

describe('resolveSourcedField', () => {
  it('a single source wins with its base confidence and no conflict', () => {
    const r = resolveSourcedField([{ value: 3.6, source: 'retailer' }]);
    expect(r.value).toBe(3.6);
    expect(r.source).toBe('retailer');
    expect(r.conflict).toBe(false);
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('agreeing sources → highest-priority source wins, no conflict, high confidence', () => {
    const cands: SourcedValue<number>[] = [
      { value: 3.6, source: 'retailer' },
      { value: 3.6, source: 'producer_tech_sheet' },
    ];
    const r = resolveSourcedField(cands);
    expect(r.source).toBe('producer_tech_sheet');
    expect(r.conflict).toBe(false);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('a disagreeing source is a conflict: the stronger source still wins, confidence drops, reason recorded', () => {
    const r = resolveSourcedField([
      { value: 3.6, source: 'producer_tech_sheet' },
      { value: 9.9, source: 'retailer' },
    ]);
    expect(r.value).toBe(3.6); // stronger source wins
    expect(r.conflict).toBe(true);
    expect(r.conflict_reasons[0]).toMatch(/retailer.*disagrees.*producer_tech_sheet/);
    expect(r.confidence).toBeLessThan(0.95);
  });

  it('never lets a weaker source overwrite a stronger one', () => {
    const r = resolveSourcedField([
      { value: 'A', source: 'weak' },
      { value: 'B', source: 'producer_official' },
      { value: 'C', source: 'public_composition_db' },
    ]);
    expect(r.value).toBe('B');
    expect(r.source).toBe('producer_official');
    expect(r.conflict).toBe(true);
  });

  it('empty input → null at zero confidence', () => {
    expect(resolveSourcedField([])).toEqual({ value: null, source: null, conflict: false, conflict_reasons: [], confidence: 0 });
  });

  it('a tolerance comparator treats near-equal numbers as agreement (no conflict)', () => {
    const r = resolveSourcedField(
      [{ value: 3.6, source: 'producer_official' }, { value: 3.7, source: 'retailer' }],
      withinTolerance(0.5),
    );
    expect(r.conflict).toBe(false);
  });
});

describe('productSourceRanking — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = stripComments(readFileSync(join(SRC, 'data', 'products', 'productSourceRanking.ts'), 'utf8'));

  it('is pure: no Supabase / service / engine / network / DB write, no npac_value', () => {
    expect(/supabase/i.test(MOD)).toBe(false);
    expect(/@\/services\//.test(MOD)).toBe(false);
    expect(/@\/engine/.test(MOD)).toBe(false);
    expect(/\bfetch\(|XMLHttpRequest|axios/.test(MOD)).toBe(false);
    expect(/npac_value/i.test(MOD)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MOD.includes(verb), verb).toBe(false);
    }
  });
});
