import { describe, expect, it } from 'vitest';
import type { CostEntry, CostResolution } from './costContracts';
import {
  buildRecipeCostSnapshot,
  resolveEntryCostPerKg,
  resolveIngredientCosts,
  selectCurrentEntry,
  toKilograms,
} from './costing';

const entry = (over: Partial<CostEntry> = {}): CostEntry => ({
  entryId: 'e1', ownerUserId: 'u1', ingredientId: 'milk', ingredientName: 'Milk',
  supplier: null, purchaseQuantity: 2, purchaseUnit: 'kg',
  densityGPerMl: null, unitWeightG: null, unitsPerPackage: null,
  price: 10, currency: 'EUR', priceIncludesTax: false, taxRatePercent: null,
  effectiveFrom: '2026-01-01', expiresAt: null, note: null, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('toKilograms — safe conversions only', () => {
  it('mass conversions are exact', () => {
    expect(toKilograms(1000, 'g')).toEqual({ ok: true, kg: 1 });
    expect(toKilograms(2.5, 'kg')).toEqual({ ok: true, kg: 2.5 });
  });
  it('volume needs an explicit density (no mass↔volume assumption)', () => {
    expect(toKilograms(1000, 'ml')).toEqual({ ok: false, missing: 'needs_density' });
    expect(toKilograms(1000, 'ml', { densityGPerMl: 1.03 })).toEqual({ ok: true, kg: 1.03 });
    expect(toKilograms(1, 'l', { densityGPerMl: 1.03 })).toEqual({ ok: true, kg: 1.03 });
  });
  it('unit / package need an explicit unit weight (and count)', () => {
    expect(toKilograms(5, 'unit')).toEqual({ ok: false, missing: 'needs_unit_weight' });
    expect(toKilograms(5, 'unit', { unitWeightG: 200 })).toEqual({ ok: true, kg: 1 });
    expect(toKilograms(2, 'package', { unitWeightG: 200 })).toEqual({ ok: false, missing: 'needs_units_per_package' });
    expect(toKilograms(2, 'package', { unitWeightG: 200, unitsPerPackage: 6 })).toEqual({ ok: true, kg: 2.4 });
  });
  it('non-positive quantity is invalid', () => {
    expect(toKilograms(0, 'kg')).toEqual({ ok: false, missing: 'invalid' });
  });
});

describe('resolveEntryCostPerKg — currency + tax honesty', () => {
  it('resolves a same-currency net entry', () => {
    const r = resolveEntryCostPerKg(entry(), { targetCurrency: 'EUR', basis: 'net' });
    expect(r).toMatchObject({ state: 'known', costPerKg: 5, currency: 'EUR', basis: 'net' });
  });
  it('never converts currencies', () => {
    const r = resolveEntryCostPerKg(entry({ currency: 'USD' }), { targetCurrency: 'EUR', basis: 'net' });
    expect(r).toMatchObject({ state: 'currency_mismatch', costPerKg: null });
  });
  it('strips/adds tax only with an explicit rate; never guesses', () => {
    // gross entry, want net, no rate → refuse
    expect(resolveEntryCostPerKg(entry({ priceIncludesTax: true }), { targetCurrency: 'EUR', basis: 'net' }))
      .toMatchObject({ state: 'needs_tax_rate' });
    // gross 10 for 2kg with 25% → net 8 → 4/kg
    expect(resolveEntryCostPerKg(entry({ priceIncludesTax: true, taxRatePercent: 25 }), { targetCurrency: 'EUR', basis: 'net' }))
      .toMatchObject({ state: 'known', costPerKg: 4 });
    // net 10 for 2kg want gross with 25% → gross 12.5 → 6.25/kg
    expect(resolveEntryCostPerKg(entry({ taxRatePercent: 25 }), { targetCurrency: 'EUR', basis: 'gross' }))
      .toMatchObject({ state: 'known', costPerKg: 6.25 });
  });
  it('refuses to cost a volume purchase without a density', () => {
    expect(resolveEntryCostPerKg(entry({ purchaseUnit: 'l', purchaseQuantity: 1 }), { targetCurrency: 'EUR', basis: 'net' }))
      .toMatchObject({ state: 'needs_density' });
  });
});

describe('selectCurrentEntry — effective/expiry aware, deterministic', () => {
  const base = { ownerUserId: 'u1', ingredientId: 'milk' } as const;
  it('picks the newest effective, non-expired entry', () => {
    const old = entry({ entryId: 'old', effectiveFrom: '2026-01-01', ...base });
    const cur = entry({ entryId: 'cur', effectiveFrom: '2026-06-01', ...base });
    const future = entry({ entryId: 'fut', effectiveFrom: '2026-12-01', ...base });
    const expired = entry({ entryId: 'exp', effectiveFrom: '2026-05-01', expiresAt: '2026-05-15', ...base });
    expect(selectCurrentEntry([old, cur, future, expired], 'milk', '2026-07-01')?.entryId).toBe('cur');
    expect(selectCurrentEntry([old, expired], 'milk', '2026-05-20')?.entryId).toBe('old'); // exp is expired
    expect(selectCurrentEntry([future], 'milk', '2026-07-01')).toBeNull(); // not yet effective
  });
});

describe('buildRecipeCostSnapshot — completeness + immutability', () => {
  const resolutions = (over: Partial<CostResolution>[] = []): CostResolution[] => [
    { ingredientId: 'milk', costPerKg: 5, currency: 'EUR', basis: 'net', state: 'known', reason: 'ok', entryId: 'e1', ...over[0] },
    { ingredientId: 'sugar', costPerKg: 1, currency: 'EUR', basis: 'net', state: 'known', reason: 'ok', entryId: 'e2', ...over[1] },
  ];
  const lines = [
    { ingredientId: 'milk', ingredientName: 'Milk', grams: 600 },
    { ingredientId: 'sugar', ingredientName: 'Sugar', grams: 400 },
  ];
  const build = (res: CostResolution[]) => buildRecipeCostSnapshot({
    snapshotId: 's1', recipeId: 'r', recipeVersionId: 'v1', currency: 'EUR', basis: 'net',
    lines, resolutions: res, engineVersion: 'e1', configVersion: 'c1', resolvedAt: '2026-07-12T00:00:00.000Z', createdBy: 'u1',
  });

  it('computes complete totals (milk 600g@5/kg=3, sugar 400g@1/kg=0.4 → 3.4)', () => {
    const snap = build(resolutions());
    expect(snap.complete).toBe(true);
    expect(snap.lines.map((l) => l.lineCost)).toEqual([3, 0.4]);
    expect(snap.totalCost).toBeCloseTo(3.4, 10);
    expect(snap.costPerKg).toBeCloseTo(3.4, 10); // 1000g total → per kg == total
  });

  it('is incomplete (money null) when any line is unknown; missing listed', () => {
    const snap = build(resolutions([{}, { costPerKg: null, state: 'unknown' }]));
    expect(snap.complete).toBe(false);
    expect(snap.totalCost).toBeNull();
    expect(snap.costPerKg).toBeNull();
    expect(snap.missingIngredientIds).toEqual(['sugar']);
  });

  it('is frozen: mutating the resolutions afterward never changes the snapshot', () => {
    const res = resolutions();
    const snap = build(res);
    const before = JSON.stringify(snap);
    res[0]!.costPerKg = 999; // change the source afterwards
    expect(JSON.stringify(snap)).toBe(before);
  });
});

describe('resolveIngredientCosts — unknown ingredients are honest', () => {
  it('returns unknown for an ingredient with no entry', () => {
    const res = resolveIngredientCosts([entry()], ['milk', 'sugar'], { targetCurrency: 'EUR', basis: 'net', asOf: '2026-07-01' });
    expect(res.find((r) => r.ingredientId === 'milk')?.state).toBe('known');
    expect(res.find((r) => r.ingredientId === 'sugar')?.state).toBe('unknown');
  });
});
