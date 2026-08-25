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
 * Both Mains here are user-declared (`MAIN_CAPABLE_UNCALIBRATED` under the Global Main Authority):
 * their identities and declared ratio are preserved as one group while their absolute grams may
 * move together through the Engine-safe frontier. No percentage envelope is invented for them.
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
import { verifyMainIngredientIdentity } from '@/features/formulation/mainIngredientContract';
import {
  buildBatchRescalePreview,
  buildOptimizePreview,
  commitPreview,
} from '@/features/constraint-studio/applyPipeline';

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
const COFFEE = 'PI-ING-000167';
const BANANA = 'PI-ING-000345';
const CRANBERRY = 'PI-ING-001556';

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

const ownerBananaCranberryFixture = (): RecipeInput => {
  const base = fixture(1);
  const support = base.items.filter((item) => item.lock_type !== 'main');
  const supportTotal = support.reduce((sum, item) => sum + item.planned_grams, 0);
  const scaledSupport = support.map((item) => ({
    ...item,
    planned_grams: Math.round((item.planned_grams * 1_000) / supportTotal),
  }));
  const roundingDelta =
    1_000 - scaledSupport.reduce((sum, item) => sum + item.planned_grams, 0);
  scaledSupport[0] = {
    ...scaledSupport[0]!,
    planned_grams: scaledSupport[0]!.planned_grams + roundingDelta,
  };
  return {
    ...base,
    items: [
      ...scaledSupport,
      line('banana-main', BANANA, 352, 'main', 352 / 136),
      line('cranberry-main', CRANBERRY, 136, 'main', 1),
    ],
  };
};

const snapshotsFor = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snaps = productBehaviorTestSnapshots(input);
  for (const id of input.items
    .filter((item) => item.lock_type === 'main')
    .map((item) => item.id)) {
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

describe('Protein Crown group authority regressions', () => {
  it('recalculates the exact off-batch Banana 352 g + Cranberry 136 g owner vector identically three times', () => {
    const input = ownerBananaCranberryFixture();
    const snapshots = snapshotsFor(input);
    expect(input.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(1_488);

    const runs = Array.from({ length: 3 }, () =>
      buildOptimizePreview(input, NONE, AT, {
        productBehaviorSnapshots: snapshots,
        technicalOnlyMainLineIds: [],
      }),
    );
    for (const built of runs) {
      expect(built.ok, JSON.stringify(built)).toBe(true);
      if (!built.ok) continue;
      expect(verifyMainIngredientIdentity(input, built.preview.proposedInput)).toMatchObject({
        ok: true,
      });
      expect(
        built.preview.proposedInput.items.reduce((sum, item) => sum + item.planned_grams, 0),
      ).toBe(1_000);
      expect(built.preview.mainObjective?.attempts).toBeGreaterThan(0);
      expect(built.preview.mainObjective?.technicalScore).toBe(10);
    }
    const successful = runs.filter(
      (run): run is Extract<(typeof runs)[number], { ok: true }> => run.ok,
    );
    expect(successful).toHaveLength(3);
    if (successful.length !== 3) return;
    const signature = (run: (typeof successful)[number]) =>
      run.preview.proposedInput.items
        .filter((item) => item.lock_type === 'main')
        .map((item) => [item.id, item.planned_grams, item.main_ratio_weight]);
    expect(signature(successful[1]!)).toEqual(signature(successful[0]!));
    expect(signature(successful[2]!)).toEqual(signature(successful[0]!));
  });

  it('runs a single Crown through the shared Main frontier instead of the Protein shortcut', () => {
    const base = fixture(1);
    const removedMain = base.items.find((item) => item.id === 'mainB')!;
    const input: RecipeInput = {
      ...base,
      items: base.items
        .filter((item) => item.id !== 'mainB')
        .map((item) =>
          item.id === 'water'
            ? { ...item, planned_grams: item.planned_grams + removedMain.planned_grams }
            : item,
        ),
    };
    const built = buildOptimizePreview(input, NONE, AT, {
      productBehaviorSnapshots: snapshotsFor(input),
      technicalOnlyMainLineIds: [],
    });

    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    expect(built.preview.proposedInput.items.filter((item) => item.lock_type === 'main')).toHaveLength(
      1,
    );
    expect(built.preview.mainObjective?.attempts).toBeGreaterThan(0);
  });

  it('keeps three Crowns as one 3:2:1 group', () => {
    const base = fixture(1);
    const input: RecipeInput = {
      ...base,
      items: [
        ...base.items.map((item) =>
          item.id === 'mainA'
            ? { ...item, planned_grams: 30, main_ratio_weight: 3 }
            : item.id === 'mainB'
              ? { ...item, planned_grams: 20, main_ratio_weight: 2 }
              : item,
        ),
        line('mainC', COFFEE, 10, 'main', 1),
      ],
    };
    const built = buildOptimizePreview(input, NONE, AT, {
      productBehaviorSnapshots: snapshotsFor(input),
      technicalOnlyMainLineIds: [],
    });

    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const grams = ['mainA', 'mainB', 'mainC'].map(
      (id) => built.preview.proposedInput.items.find((item) => item.id === id)!.planned_grams,
    );
    expect(grams.every((value) => value > 0)).toBe(true);
    expect(verifyMainIngredientIdentity(input, built.preview.proposedInput)).toMatchObject({
      ok: true,
    });
  });

  it('preserves a 2:1 Protein Crown group through a batch change', () => {
    const input = fixture(2);
    const built = buildBatchRescalePreview(input, NONE, 1_200, AT);

    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const a = built.preview.proposedInput.items.find((item) => item.id === 'mainA')!;
    const b = built.preview.proposedInput.items.find((item) => item.id === 'mainB')!;
    expect(a.planned_grams / b.planned_grams).toBeCloseTo(2, 2);
    expect(verifyMainIngredientIdentity(input, built.preview.proposedInput)).toMatchObject({
      ok: true,
    });
  });

  it('returns the same coupled 1:1 vector on repeated Recalculate', () => {
    const input = fixture(1);
    const options = {
      productBehaviorSnapshots: snapshotsFor(input),
      technicalOnlyMainLineIds: [] as string[],
    };
    const first = buildOptimizePreview(input, NONE, AT, options);
    const second = buildOptimizePreview(input, NONE, AT, options);

    expect(first.ok, JSON.stringify(first)).toBe(true);
    expect(second.ok, JSON.stringify(second)).toBe(true);
    if (!first.ok || !second.ok) return;
    const signature = (recipe: RecipeInput) =>
      recipe.items
        .filter((item) => item.lock_type === 'main')
        .map((item) => [item.id, item.planned_grams, item.main_ratio_weight]);
    expect(signature(second.preview.proposedInput)).toEqual(
      signature(first.preview.proposedInput),
    );
    expect(verifyMainIngredientIdentity(input, second.preview.proposedInput)).toMatchObject({
      ok: true,
    });
  });

  it('rejects a materially broken Protein Multi-Main vector at the final Apply door', () => {
    const input = fixture(1);
    const snapshots = snapshotsFor(input);
    const built = buildOptimizePreview(input, NONE, AT, {
      productBehaviorSnapshots: snapshots,
      technicalOnlyMainLineIds: [],
    });
    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;

    const forged = structuredClone(built.preview);
    forged.proposedInput = {
      ...forged.proposedInput,
      items: forged.proposedInput.items.map((item) =>
        item.id === 'mainA'
          ? { ...item, planned_grams: item.planned_grams + 1 }
          : item.id === 'mainB'
            ? { ...item, planned_grams: item.planned_grams - 1 }
            : item,
      ),
    };
    delete forged.practicalization;

    const committed = commitPreview(
      input,
      NONE,
      forged,
      '2026-08-23T12:01:00.000Z',
      'forged-protein-multi-main',
      [],
      undefined,
      null,
      null,
      null,
      null,
      snapshots,
    );
    expect(committed.ok).toBe(false);
    if (committed.ok) return;
    expect(committed.code).toBe('main_identity_violated');
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
