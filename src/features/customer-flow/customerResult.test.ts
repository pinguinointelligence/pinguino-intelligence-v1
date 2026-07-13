import { describe, expect, it } from 'vitest';
import { buildCustomerResult } from './customerResult';
import { createCustomerFlow, setProductType, selectServingMode, setBatchGrams } from './customerFlow';

const flow = (text: string, type: 'gelato' | 'sorbet', mode: 'ninja_gelato' | 'temp_minus_12', batch?: number) => {
  let s = createCustomerFlow({ text });
  s = setProductType(s, type);
  s = selectServingMode(s, mode);
  if (batch !== undefined) s = setBatchGrams(s, batch);
  return s;
};

describe('customer result — real engine base, honest states', () => {
  it('a standard gelato yields a CALCULATED result with real base grams + real metrics', () => {
    const r = buildCustomerResult(flow('lody waniliowe', 'gelato', 'temp_minus_12', 1000));
    expect(r.calculated).toBe(true);
    expect(['calculated', 'calculated_out_of_band']).toContain(r.state);
    const base = r.lines.filter((l) => l.role === 'base');
    expect(base.length).toBeGreaterThan(0);
    // Real engine grams on base lines (NOT the old fixture 620/110/150/35/5 skeleton).
    expect(base.every((l) => typeof l.grams === 'number' && (l.grams as number) > 0)).toBe(true);
    expect(r.recipeInput).not.toBeNull();
    expect(typeof r.metrics?.pod === 'number' || r.metrics?.pod === null).toBe(true);
  });

  it('a chocolate intent realizes chocolate in the base and does NOT repeat it as a flavor line', () => {
    const r = buildCustomerResult(flow('gelato czekoladowe z whisky', 'gelato', 'ninja_gelato'));
    expect(r.calculated).toBe(true);
    const flavorIds = r.lines.filter((l) => l.role === 'flavor').map((l) => l.id);
    expect(flavorIds).toContain('flavor:whisky'); // whisky stays an unresolved flavor requirement
    expect(flavorIds).not.toContain('flavor:chocolate'); // chocolate is in the base
  });

  it('unresolved flavors are flavor requirement lines with NO grams', () => {
    const r = buildCustomerResult(flow('lody waniliowe z whisky', 'gelato', 'temp_minus_12', 1000));
    const whisky = r.lines.find((l) => l.id === 'flavor:whisky');
    expect(whisky?.grams).toBeNull();
    expect(whisky?.resolution).not.toBe('resolved');
  });

  it('sorbet has no safe base template → structure_only with NO base grams (never fixture numbers)', () => {
    const r = buildCustomerResult(flow('sorbet malinowy', 'sorbet', 'temp_minus_12', 1000));
    expect(r.calculated).toBe(false);
    expect(r.state).toBe('structure_only');
    expect(r.reason).toBe('no_template');
    expect(r.lines.filter((l) => l.role === 'base').every((l) => l.grams === null)).toBe(true);
    expect(r.recipeInput).toBeNull();
  });

  it('an incomplete flow is structure_only, not a fabricated recipe', () => {
    let s = createCustomerFlow({ text: 'lody waniliowe' });
    s = setProductType(s, 'gelato'); // no mode, no batch
    const r = buildCustomerResult(s);
    expect(r.calculated).toBe(false);
    expect(r.state).toBe('structure_only');
  });
});
