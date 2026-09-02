/**
 * E3 — cost keying + the three presentation states (data-layer contract, no UI).
 *
 * ROOT CAUSE UNDER TEST: cost entries are keyed by ONE ingredient id, but the same physical
 * ingredient is known by SEVERAL ids across the product vertical — a picked product enters the
 * recipe as PR-ING-* (productEngineHandoff uses the product identity) while a formulation-added
 * toolbox line carries the canonical basement/toolbox id (PI-ING-* / 'sucrose'). Strict
 * single-key equality made the lookup return nothing for such lines, and the whole-recipe cost
 * then collapsed to null instead of degrading to an explicit partial state.
 *
 * Proven here:
 *   1. the three presentation states — complete / partial (explicit missing list) / no_prices;
 *   2. a formulation-added line WITHOUT a price degrades the recipe to 'partial', never to a
 *      collapsed nothing, and never invents or averages a price;
 *   3. alias-aware keying — an entry recorded under the product id prices the canonical line
 *      (and the primary id always wins over aliases; failures are reported, not shopped around).
 */
import { describe, expect, it } from 'vitest';
import type { CostEntry } from './costContracts';
import {
  buildRecipeCostSnapshot,
  presentRecipeCost,
  resolveCostsForLines,
  type SnapshotLineInput,
} from './costing';
import { InMemoryCosts, type NewCostEntry } from '@/services/proCore/inMemoryCosts';
import { inMemoryCostsRepository } from '@/services/proCore/costsRepository';

const OPTS = { targetCurrency: 'EUR', basis: 'net', asOf: '2026-07-01' } as const;

const entry = (over: Partial<CostEntry>): CostEntry => ({
  entryId: 'e1', ownerUserId: 'u1', ingredientId: 'milk', ingredientName: 'Milk', supplier: null,
  purchaseQuantity: 1, purchaseUnit: 'kg', densityGPerMl: null, unitWeightG: null,
  unitsPerPackage: null, price: 1, currency: 'EUR', priceIncludesTax: false, taxRatePercent: null,
  effectiveFrom: '2026-01-01', expiresAt: null, note: null, createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const snapshotOf = (lines: SnapshotLineInput[], entries: CostEntry[]) =>
  buildRecipeCostSnapshot({
    snapshotId: 's1', recipeId: 'r1', recipeVersionId: 'v1', currency: 'EUR', basis: 'net',
    lines,
    resolutions: resolveCostsForLines(entries, lines, OPTS),
    engineVersion: 'e1', configVersion: 'c1', resolvedAt: '2026-07-01T00:00:00.000Z', createdBy: 'u1',
  });

describe('E3 — three presentation states', () => {
  const MILK = { ingredientId: 'PR-ING-000010', ingredientName: 'Leche entera', grams: 600 };
  const SUGAR = { ingredientId: 'sucrose', ingredientName: 'Sucrose', grams: 300 };
  /** A line FORMULATION added from the toolbox — canonical PI-ING-* id, no user price yet. */
  const PI_ADDED = { ingredientId: 'PI-ING-000123', ingredientName: 'Inulina', grams: 100 };

  const priced = [
    entry({ entryId: 'e-milk', ingredientId: 'PR-ING-000010', ingredientName: 'Leche entera', price: 1 }), // 1 €/kg
    entry({ entryId: 'e-sugar', ingredientId: 'sucrose', ingredientName: 'Sucrose', price: 2 }), // 2 €/kg
  ];

  it('COMPLETE: every line priced → real totalCost + costPerKg, empty missing list', () => {
    const p = presentRecipeCost(snapshotOf([MILK, SUGAR], priced));
    expect(p.state).toBe('complete');
    expect(p.totalCost).toBeCloseTo(0.6 * 1 + 0.3 * 2, 10);
    expect(p.costPerKg).toBeCloseTo((1.2 / 900) * 1000, 10);
    expect(p.missing).toEqual([]);
    expect(p.knownCost).toBeCloseTo(p.totalCost!, 10);
    expect(p.pricedGrams).toBe(900);
  });

  it('PARTIAL: a formulation-added line without a price DEGRADES the cost — never collapses it', () => {
    const p = presentRecipeCost(snapshotOf([MILK, SUGAR, PI_ADDED], priced));
    expect(p.state).toBe('partial');
    // the known subtotal is explicit…
    expect(p.knownCost).toBeCloseTo(1.2, 10);
    expect(p.pricedGrams).toBe(900);
    expect(p.totalGrams).toBe(1000);
    expect(p.pricedLineCount).toBe(2);
    expect(p.lineCount).toBe(3);
    // …the missing-price ingredient is LISTED by id + name + honest reason…
    expect(p.missing).toEqual([
      { ingredientId: 'PI-ING-000123', ingredientName: 'Inulina', state: 'unknown', reason: 'No cost entry for this ingredient.' },
    ]);
    // …and whole-recipe money is NEVER invented or averaged around the gap.
    expect(p.totalCost).toBeNull();
    expect(p.costPerKg).toBeNull();
  });

  it('NO_PRICES: nothing priced → zero subtotal, every line in the missing list', () => {
    const p = presentRecipeCost(snapshotOf([MILK, SUGAR], []));
    expect(p.state).toBe('no_prices');
    expect(p.knownCost).toBe(0);
    expect(p.pricedGrams).toBe(0);
    expect(p.missing.map((m) => m.ingredientId)).toEqual(['PR-ING-000010', 'sucrose']);
    expect(p.totalCost).toBeNull();
    expect(p.costPerKg).toBeNull();
  });

  it('an empty snapshot (no lines) presents as no_prices, not as a fake complete', () => {
    const p = presentRecipeCost(snapshotOf([], priced));
    expect(p.state).toBe('no_prices');
    expect(p.lineCount).toBe(0);
    expect(p.totalCost).toBeNull();
  });

  it('a line that fails for a stated reason (needs_density) is listed with that reason', () => {
    const oil = entry({ entryId: 'e-oil', ingredientId: 'oil', ingredientName: 'Oil', purchaseUnit: 'l', price: 3 });
    const p = presentRecipeCost(
      snapshotOf([MILK, { ingredientId: 'oil', ingredientName: 'Oil', grams: 100 }], [...priced, oil]),
    );
    expect(p.state).toBe('partial');
    expect(p.missing).toEqual([
      { ingredientId: 'oil', ingredientName: 'Oil', state: 'needs_density', reason: 'Costing a volume purchase needs an explicit density (g/ml).' },
    ]);
  });
});

describe('E3 — alias-aware cost keying (the lookup fix)', () => {
  it('an entry recorded under the PRODUCT id prices the line carrying the CANONICAL id', () => {
    // The user priced the product they bought (PR-ING-000010); formulation re-introduced the same
    // physical ingredient under its canonical basement id (PI-ING-000180, via matched_basement_id).
    const entries = [entry({ entryId: 'e-nata', ingredientId: 'PR-ING-000010', ingredientName: 'Nata para montar', price: 4 })];
    const [res] = resolveCostsForLines(
      entries,
      [{ ingredientId: 'PI-ING-000180', aliasIds: ['PR-ING-000010'] }],
      OPTS,
    );
    expect(res).toMatchObject({ state: 'known', costPerKg: 4, entryId: 'e-nata' });
    // the resolution stays keyed to the LINE's primary id (the recipe line identity)
    expect(res!.ingredientId).toBe('PI-ING-000180');
  });

  it('the PRIMARY id always wins over aliases when both have entries', () => {
    const entries = [
      entry({ entryId: 'e-primary', ingredientId: 'PI-ING-000180', price: 5 }),
      entry({ entryId: 'e-alias', ingredientId: 'PR-ING-000010', price: 4 }),
    ];
    const [res] = resolveCostsForLines(
      entries,
      [{ ingredientId: 'PI-ING-000180', aliasIds: ['PR-ING-000010'] }],
      OPTS,
    );
    expect(res).toMatchObject({ costPerKg: 5, entryId: 'e-primary' });
  });

  it('a FAILING primary entry is reported honestly — aliases are not shopped for a better price', () => {
    const entries = [
      entry({ entryId: 'e-primary-usd', ingredientId: 'PI-ING-000180', currency: 'USD', price: 3 }),
      entry({ entryId: 'e-alias-eur', ingredientId: 'PR-ING-000010', currency: 'EUR', price: 4 }),
    ];
    const [res] = resolveCostsForLines(
      entries,
      [{ ingredientId: 'PI-ING-000180', aliasIds: ['PR-ING-000010'] }],
      OPTS,
    );
    expect(res).toMatchObject({ state: 'currency_mismatch', costPerKg: null, entryId: 'e-primary-usd' });
  });

  it('alias order is deterministic — the first alias with an applicable entry decides', () => {
    const entries = [
      entry({ entryId: 'e-a2', ingredientId: 'alias-2', price: 9 }),
      entry({ entryId: 'e-a1', ingredientId: 'alias-1', price: 7 }),
    ];
    const [res] = resolveCostsForLines(
      entries,
      [{ ingredientId: 'main', aliasIds: ['alias-1', 'alias-2'] }],
      OPTS,
    );
    expect(res).toMatchObject({ costPerKg: 7, entryId: 'e-a1' });
  });

  it('without aliases, behaviour is EXACTLY the strict single-key lookup (back-compat)', () => {
    const entries = [entry({ entryId: 'e-milk', ingredientId: 'milk', price: 2 })];
    const [hit, miss] = resolveCostsForLines(entries, [{ ingredientId: 'milk' }, { ingredientId: 'PI-ING-000123' }], OPTS);
    expect(hit).toMatchObject({ state: 'known', costPerKg: 2 });
    expect(miss).toMatchObject({ state: 'unknown', costPerKg: null, entryId: null });
  });
});

describe('E3 — repository round-trip (in-memory port, snapshot + presentation)', () => {
  const newEntry = (over: Partial<NewCostEntry>): NewCostEntry => ({
    ownerUserId: 'u1', ingredientId: 'milk', ingredientName: 'Milk', supplier: null,
    purchaseQuantity: 1, purchaseUnit: 'kg', densityGPerMl: null, unitWeightG: null,
    unitsPerPackage: null, price: 1, currency: 'EUR', priceIncludesTax: false, taxRatePercent: null,
    effectiveFrom: '2026-01-01', expiresAt: null, note: null, createdBy: 'u1',
    ...over,
  });

  it('buildSnapshot resolves through aliases and presents PARTIAL for a PI-added line', async () => {
    let k = 0;
    const repo = inMemoryCostsRepository(new InMemoryCosts(() => '2026-07-01T00:00:00.000Z', () => `id-${(k += 1)}`));
    // priced under the PRODUCT identity only
    await repo.addEntry(newEntry({ ingredientId: 'PR-ING-000010', ingredientName: 'Nata', price: 4 }));

    const snap = await repo.buildSnapshot({
      ownerUserId: 'u1', recipeId: 'r1', recipeVersionId: 'v1',
      lines: [
        // canonical line, priced via the product alias
        { ingredientId: 'PI-ING-000180', ingredientName: 'Nata (canonical)', grams: 500, aliasIds: ['PR-ING-000010'] },
        // formulation-added toolbox line without any price
        { ingredientId: 'PI-ING-000123', ingredientName: 'Inulina', grams: 100 },
      ],
      currency: 'EUR', basis: 'net', asOf: '2026-07-01', engineVersion: 'e1', configVersion: 'c1', by: 'u1',
    });

    expect(snap.complete).toBe(false);
    expect(snap.missingIngredientIds).toEqual(['PI-ING-000123']);
    // aliasIds are lookup-only — never stored on the frozen snapshot line
    expect('aliasIds' in (snap.lines[0] as object)).toBe(false);
    expect(snap.lines[0]).toMatchObject({ ingredientId: 'PI-ING-000180', costPerKg: 4, lineCost: 2, state: 'known' });

    const p = presentRecipeCost(snap);
    expect(p.state).toBe('partial');
    expect(p.knownCost).toBeCloseTo(2, 10);
    expect(p.missing.map((m) => m.ingredientId)).toEqual(['PI-ING-000123']);
    expect(p.totalCost).toBeNull(); // never invented
  });
});
