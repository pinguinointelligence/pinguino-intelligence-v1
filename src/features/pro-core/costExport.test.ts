import { describe, expect, it } from 'vitest';
import type { RecipeResult } from '@/engine';
import type { ExportCapabilities, RecipeCostSnapshot } from './costContracts';
import { buildCostSnapshotCsv, buildRecipeLabelCsv } from './costExport';

const PRO: ExportCapabilities = { canExport: true, canViewExactGrams: true };
const REDACTED: ExportCapabilities = { canExport: true, canViewExactGrams: false }; // synthetic: proves the invariant
const DEMO: ExportCapabilities = { canExport: false, canViewExactGrams: false };

const snapshot: RecipeCostSnapshot = {
  snapshotId: 's1', recipeId: 'r', recipeVersionId: 'v1', productionRunId: null,
  currency: 'EUR', basis: 'net',
  lines: [
    { ingredientId: 'milk', ingredientName: 'Milk', grams: 600, costPerKg: 5, lineCost: 3, state: 'known' },
    { ingredientId: 'sugar', ingredientName: 'Sugar', grams: 400, costPerKg: 1, lineCost: 0.4, state: 'known' },
  ],
  totalCost: 3.4, costPerKg: 3.4, complete: true, missingIngredientIds: [],
  engineVersion: 'e1', configVersion: 'c1', resolvedAt: '2026-07-12T00:00:00.000Z', createdBy: 'u1',
};

describe('buildCostSnapshotCsv — capability-gated', () => {
  it('refuses a plan without export capability (Demo)', () => {
    expect(() => buildCostSnapshotCsv(snapshot, DEMO)).toThrow(/cannot export/i);
  });

  it('exports exact grams + line costs for a plan with exact-grams capability', () => {
    const csv = buildCostSnapshotCsv(snapshot, PRO);
    expect(csv).toContain('Milk,600,5.0000,3.0000,known');
    expect(csv).toContain('Total cost,3.4000');
    expect(csv).toContain('Cost per kg (EUR),3.4000');
  });

  it('NEVER leaks exact grams without the exact-grams capability (redacted)', () => {
    const csv = buildCostSnapshotCsv(snapshot, REDACTED);
    expect(csv).not.toContain('600'); // grams redacted
    expect(csv).not.toContain('3.0000'); // batch-tied line cost redacted
    expect(csv).toContain('Milk,—,5.0000,—,known'); // unit price + currency remain
    expect(csv).toContain('Total cost,—');
  });
});

describe('buildRecipeLabelCsv — reuses the canonical recipe CSV, gated', () => {
  const result = {
    items: [{ ingredient: { name: 'Milk' }, effective_grams: 600 }],
    total_batch_g: 1000,
    nutrition_per_100g: null,
    costs: null,
  } as unknown as RecipeResult;

  it('refuses Demo and any non-exact plan', () => {
    expect(() => buildRecipeLabelCsv(result, DEMO)).toThrow(/cannot export/i);
    expect(() => buildRecipeLabelCsv(result, REDACTED)).toThrow(/exact-gram/i);
  });

  it('delegates to buildRecipeCsv for an exact plan', () => {
    const csv = buildRecipeLabelCsv(result, PRO);
    expect(csv).toContain('Ingredient,Grams,Percent');
    expect(csv).toContain('Milk');
  });
});
