/**
 * Protein Multi-Main POSITIVE fixtures — 1:1 and 2:1 through Preview and Apply (owner v1.4 §4/§5).
 *
 * These are not hand-guessed recipes. They come out of the deterministic sweep in
 * `proteinMultiMainSearch.test.ts` (7 legitimate Main-capable pairs × 3 serving temperatures ×
 * OPTIMAL/ECO × 6 Main loads = 252 candidates per ratio), which finds **203 legal 1:1** and
 * **201 legal 2:1** executable fixtures. The two pinned below are the first hit of each.
 *
 * The earlier "Protein Multi-Main 2:1 looks infeasible" reading was a FIXTURE defect, not science:
 * `main_ratio_weight ?? 1` means an undeclared weight already *is* a 1:1 declaration, so a 2:1 gram
 * split with no weight was correctly renormalised back to equal grams. The ratio has to be STATED.
 * That one line is the whole difference between 0/252 and 201/252.
 *
 * Both Mains here are USER-HELD (`MAIN_CAPABLE_UNCALIBRATED` under the Global Main Authority): the
 * owner's grams and declared ratio are held exactly and the supporting ingredients are optimised
 * around them, so no percentage envelope is invented for them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { buildOptimizePreview, commitPreview } from '@/features/constraint-studio/applyPipeline';

const MAPPER = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER);
const INDEX = new Map(HEADER.map((name, i) => [name, i]));
const NUMERIC = new Set(
  HEADER.filter((h) =>
    /_percent$|_value$|^brix$|^kcal_per_100g$|^cost_per_kg$|^shelf_life_days$|^data_confidence_percent$|_factor$|_activity$/.test(
      h,
    ),
  ),
);

const mapperRow = (id: string): IngredientRow => {
  const rec = RECORDS.find((r) => r[INDEX.get('ingredient_id')!] === id);
  if (!rec) throw new Error(`missing mapper row ${id}`);
  return Object.fromEntries(
    HEADER.map((field, i) => {
      const raw = rec[i]?.trim() ?? '';
      if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (['approved_for_base', 'approved_for_engines', 'is_active'].includes(field)) {
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      }
      if (field === 'verification_date' || field === 'last_reviewed_at') return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};

const ing = (id: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(id)),
  cost_per_kg: 5,
  cost_currency: 'EUR',
});

/** COCOA ALKALIZED 100 % + VANILLA paste — the sweep's first legal pair, at −11 OPTIMAL. */
const COCOA = 'PI-ING-001578';
const VANILLA = 'PI-ING-000334';

const line = (
  id: string,
  mapperId: string,
  grams: number,
  lock: 'main' | 'unlocked' = 'unlocked',
  ratioWeight?: number,
) =>
  ({
    id,
    ingredient: ing(mapperId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: lock,
    ...(ratioWeight === undefined ? {} : { main_ratio_weight: ratioWeight }),
  }) as RecipeInput['items'][number];

/** The exact shape the sweep pinned: total Main 60 g, support scaled into the remaining 940 g. */
const fixture = (ratio: number): RecipeInput => {
  const totalMain = 60;
  const gramsA = Math.round((totalMain * ratio) / (ratio + 1));
  const gramsB = totalMain - gramsA;
  const support = 1000 - totalMain;
  const share = (x: number) => Math.round((x / 870) * support);
  const milk = share(470);
  const cream = share(150);
  const wpc = share(95);
  const sucrose = share(60);
  const dextrose = share(90);
  const tara = 3;
  const water = support - milk - cream - wpc - sucrose - dextrose - tara;
  return {
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { formulation_strategy: 'optimal' },
    items: [
      line('milk', 'PI-ING-000236', milk),
      line('cream', 'PI-ING-000180', cream),
      line('wpc', 'PI-ING-000264', wpc),
      line('water', 'PI-ING-001409', Math.max(1, water)),
      line('sucrose', 'PI-ING-000514', sucrose),
      line('dextrose', 'PI-ING-000494', dextrose),
      line('tara', 'PI-ING-000492', tara),
      line('mainA', COCOA, gramsA, 'main', ratio),
      line('mainB', VANILLA, gramsB, 'main', 1),
    ],
  } as unknown as RecipeInput;
};

const snapshotsFor = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snaps = productBehaviorTestSnapshots(input);
  for (const id of ['mainA', 'mainB']) {
    if (snaps[id]) {
      snaps[id] = {
        ...snaps[id]!,
        mainClassification: 'MAIN_CAPABLE_UNCALIBRATED',
      } as ProductBehaviorSnapshot;
    }
  }
  return snaps;
};

const AT = '2026-08-23T12:00:00.000Z';
const NONE = { byLineId: {} };

const previewOf = (ratio: number) => {
  const input = fixture(ratio);
  const snapshots = snapshotsFor(input);
  const built = buildOptimizePreview(input, NONE, AT, {
    productBehaviorSnapshots: snapshots,
    technicalOnlyMainLineIds: [],
  });
  return { input, snapshots, built };
};

describe.each([
  ['1:1', 1],
  ['2:1', 2],
])('Protein Multi-Main %s — positive Preview and Apply', (label, ratio) => {
  const { input, snapshots, built } = previewOf(ratio);

  it('produces a real, appliable Preview (not diagnostic-only)', () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.preview.diagnosticOnly).toBeFalsy();
  });

  it('keeps both lines Main, above zero, with the declared ratio exact', () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const p = built.preview.proposedInput;
    const a = p.items.find((i) => i.id === 'mainA')!;
    const b = p.items.find((i) => i.id === 'mainB')!;
    expect(a.lock_type).toBe('main');
    expect(b.lock_type).toBe('main');
    expect(a.planned_grams).toBeGreaterThan(0);
    expect(b.planned_grams).toBeGreaterThan(0);
    expect(a.planned_grams / b.planned_grams).toBeCloseTo(ratio, 2);
  });

  it('is technically legal and exactly on batch, with no zero-gram row', () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const p = built.preview.proposedInput;
    expect(p.items.reduce((s, i) => s + i.planned_grams, 0)).toBeCloseTo(1000, 3);
    expect(p.items.filter((i) => i.planned_grams <= 0)).toHaveLength(0);
    expect(detectViolations(calculateRecipe(p))).toEqual([]);
  });

  it('APPLIES through the real Apply door', () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const committed = commitPreview(
      input,
      NONE,
      built.preview,
      '2026-08-23T12:01:00.000Z',
      `apply-protein-multimain-${label}`,
      [],
      undefined,
      null,
      null,
      null,
      null,
      snapshots,
    );
    expect(committed.ok, JSON.stringify(committed)).toBe(true);
    if (!committed.ok) return;
    const applied = committed.verified.input;
    const a = applied.items.find((i) => i.id === 'mainA')!;
    const b = applied.items.find((i) => i.id === 'mainB')!;
    // Apply must not quietly renegotiate the Main group it just accepted.
    expect(a.lock_type).toBe('main');
    expect(b.lock_type).toBe('main');
    expect(a.planned_grams / b.planned_grams).toBeCloseTo(ratio, 2);
    expect(applied.items.filter((i) => i.planned_grams <= 0)).toHaveLength(0);
    expect(applied.items.reduce((s, i) => s + i.planned_grams, 0)).toBeCloseTo(1000, 3);
  });
});

describe('§9 — order independence', () => {
  it('listing the second Main first yields the same grams and ratio', () => {
    const forward = previewOf(2);
    expect(forward.built.ok).toBe(true);
    if (!forward.built.ok) return;

    // Same declaration, the two Main rows swapped in the item list.
    const base = fixture(2);
    const items = [...base.items];
    const ia = items.findIndex((i) => i.id === 'mainA');
    const ib = items.findIndex((i) => i.id === 'mainB');
    [items[ia], items[ib]] = [items[ib]!, items[ia]!];
    const swapped: RecipeInput = { ...base, items };
    const built = buildOptimizePreview(swapped, NONE, AT, {
      productBehaviorSnapshots: snapshotsFor(swapped),
      technicalOnlyMainLineIds: [],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const grams = (r: typeof built) =>
      r.ok
        ? {
            a: r.preview.proposedInput.items.find((i) => i.id === 'mainA')!.planned_grams,
            b: r.preview.proposedInput.items.find((i) => i.id === 'mainB')!.planned_grams,
          }
        : null;
    expect(grams(built)).toEqual(grams(forward.built));
  });
});

describe('§15 — the declared ratio must be stated, never implied', () => {
  it('a 2:1 gram split with NO declared weight is renormalised to 1:1', () => {
    // This is exactly why an earlier sweep found 0/252 legal 2:1 fixtures. `main_ratio_weight ?? 1`
    // means every Main defaults to weight 1, so undeclared 2:1 grams are not a 2:1 declaration.
    const base = fixture(2);
    const undeclared: RecipeInput = {
      ...base,
      items: base.items.map((i) => {
        if (i.id !== 'mainA' && i.id !== 'mainB') return i;
        const rest = { ...(i as typeof i & { main_ratio_weight?: number }) };
        delete rest.main_ratio_weight;
        return rest as typeof i;
      }),
    };
    const built = buildOptimizePreview(undeclared, NONE, AT, {
      productBehaviorSnapshots: snapshotsFor(undeclared),
      technicalOnlyMainLineIds: [],
    });
    // Equal weights ⇒ the 40/20 grams are NOT a legal expression of a 1:1 declaration, so the
    // system does not quietly rewrite them into one: it either returns an equal-grams candidate
    // or refuses. What it must never do is accept 40/20 as though 2:1 had been declared.
    if (built.ok) {
      const p = built.preview.proposedInput;
      const a = p.items.find((i) => i.id === 'mainA')!;
      const b = p.items.find((i) => i.id === 'mainB')!;
      expect(a.planned_grams / b.planned_grams).toBeCloseTo(1, 2);
    } else {
      expect(built.code).toBeTruthy();
    }
  });
});
