import { beforeEach, describe, expect, it } from 'vitest';
import type { CostEntry } from '@/features/pro-core/costContracts';
import { InMemoryCosts, type NewCostEntry } from './inMemoryCosts';

const newEntry = (over: Partial<NewCostEntry> = {}): NewCostEntry => ({
  ownerUserId: 'u1', ingredientId: 'milk', ingredientName: 'Milk', supplier: 'Dairy Co',
  purchaseQuantity: 2, purchaseUnit: 'kg', densityGPerMl: null, unitWeightG: null, unitsPerPackage: null,
  price: 10, currency: 'EUR', priceIncludesTax: false, taxRatePercent: null,
  effectiveFrom: '2026-01-01', expiresAt: null, note: null, createdBy: 'u1',
  ...over,
});

const lines = [
  { ingredientId: 'milk', ingredientName: 'Milk', grams: 600 },
  { ingredientId: 'sugar', ingredientName: 'Sugar', grams: 400 },
];

describe('InMemoryCosts — entries', () => {
  let svc: InMemoryCosts;
  beforeEach(() => { let k = 0; svc = new InMemoryCosts(() => '2026-07-12T00:00:00.000Z', () => `id-${(k += 1)}`); });

  it('validates and stores entries; lists them owner-scoped', () => {
    expect(() => svc.addEntry(newEntry({ purchaseQuantity: 0 }))).toThrow(/greater than zero/i);
    expect(() => svc.addEntry(newEntry({ price: -1 }))).toThrow(/negative/i);
    expect(() => svc.addEntry(newEntry({ currency: 'eur' }))).toThrow(/ISO/i);
    svc.addEntry(newEntry());
    svc.addEntry(newEntry({ ownerUserId: 'u2' }));
    expect(svc.listEntries('u1')).toHaveLength(1);
    expect(svc.listEntries('u2')).toHaveLength(1);
    expect(svc.listEntries('u1', 'sugar')).toHaveLength(0);
  });
});

describe('InMemoryCosts — snapshots are immutable & owner-scoped', () => {
  let svc: InMemoryCosts;
  beforeEach(() => { let k = 0; svc = new InMemoryCosts(() => '2026-07-12T00:00:00.000Z', () => `id-${(k += 1)}`); });

  const build = (owner: string, asOf: string) => svc.buildSnapshot({
    ownerUserId: owner, recipeId: 'r', recipeVersionId: 'v1', lines, currency: 'EUR', basis: 'net', asOf,
    engineVersion: 'e1', configVersion: 'c1', by: owner,
  });

  it('freezes historical cost — a later price change produces a NEW snapshot', () => {
    svc.addEntry(newEntry({ ingredientId: 'milk', price: 10, effectiveFrom: '2026-01-01' })); // 5/kg
    svc.addEntry(newEntry({ ingredientId: 'sugar', price: 2, effectiveFrom: '2026-01-01' })); // 1/kg
    const first = build('u1', '2026-03-01');
    expect(first.complete).toBe(true);
    expect(first.totalCost).toBeCloseTo(3.4, 10);
    const firstJson = JSON.stringify(first);

    // milk price rises later
    svc.addEntry(newEntry({ ingredientId: 'milk', price: 20, effectiveFrom: '2026-06-01' })); // 10/kg
    const second = build('u1', '2026-07-01');
    expect(second.totalCost).toBeCloseTo(6.4, 10); // 600g@10 + 400g@1
    expect(second.snapshotId).not.toBe(first.snapshotId);

    // the historical snapshot is unchanged
    expect(JSON.stringify(svc.getSnapshot(first.snapshotId, 'u1'))).toBe(firstJson);
  });

  it('is incomplete when a cost is unknown; missing listed honestly', () => {
    svc.addEntry(newEntry({ ingredientId: 'milk', price: 10 })); // sugar has no entry
    const snap = build('u1', '2026-03-01');
    expect(snap.complete).toBe(false);
    expect(snap.totalCost).toBeNull();
    expect(snap.missingIngredientIds).toEqual(['sugar']);
  });

  it('owner isolation on snapshots', () => {
    svc.addEntry(newEntry({ ingredientId: 'milk', price: 10 }));
    svc.addEntry(newEntry({ ingredientId: 'sugar', price: 2 }));
    const mine = build('u1', '2026-03-01');
    build('u2', '2026-03-01');
    expect(svc.getSnapshot(mine.snapshotId, 'u2')).toBeNull();
    expect(svc.getSnapshot(mine.snapshotId, 'u1')).not.toBeNull();
    expect(svc.listSnapshots('u1')).toHaveLength(1);
    expect(svc.listSnapshots('u2')).toHaveLength(1);
  });
});

// A resolved entry keeps its provenance so a snapshot can point back at the source price.
describe('InMemoryCosts — resolution provenance', () => {
  it('carries the entry id through resolution', () => {
    let k = 0;
    const svc = new InMemoryCosts(() => '2026-07-12T00:00:00.000Z', () => `id-${(k += 1)}`);
    const e: CostEntry = svc.addEntry(newEntry({ ingredientId: 'milk', price: 10 }));
    const [res] = svc.resolveCosts('u1', ['milk'], { targetCurrency: 'EUR', basis: 'net', asOf: '2026-03-01' });
    expect(res).toMatchObject({ state: 'known', costPerKg: 5, entryId: e.entryId });
  });
});
