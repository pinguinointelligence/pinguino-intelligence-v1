/**
 * OWNER REGRESSION MATRIX 2026-09-03 — the UNLOCKED Crown-OFF manual Main target.
 *
 * The served story: turn the Crown off, type an amount above the safe maximum,
 * press Przelicz. What the user got was a Preview/Apply round trip for a result
 * that was not in dispute — and, measured here on the baseline, a recipe the
 * product's OWN `verifyMainEnvelope` refuses. WATERMELON at a certified Crown
 * MAX SAFE of 450 g (45.0 % hard limit) came back at 571 g = 57.10 % with a
 * clean score, because the whole Main envelope only runs inside the Crown
 * frontier and Crown OFF never entered it. Requests BELOW the maximum were not
 * honoured either: 600 → 571, 500 → 498, 300 → 298.
 *
 * The fix reuses the Crown authority instead of adding a second search — the
 * cap moves down to the request — so the answers below are the same authority's
 * answers, not a new opinion. Cases A–G are the owner's matrix.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { verifyMainEnvelope } from '@/features/product-intelligence';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { buildOptimizePreview, projectCrownOffMainTarget } from './applyPipeline';

vi.setConfig({ testTimeout: 60_000 });

const MAPPER_SOURCE = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const NUMERIC = new Set(
  HEADER.filter((field) =>
    /_percent$|_value$|_factor$|_days$|^brix$|^kcal_per_100g$|^cost_per_kg$|_activity$/.test(field),
  ),
);
const mapperRow = (ingredientId: string): IngredientRow => {
  const record = RECORDS.find((row) => row[INDEX.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return Object.fromEntries(
    HEADER.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      )
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      if (field === 'verification_date' || field === 'last_reviewed_at')
        return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};
const ingredient = (id: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(id)),
  cost_per_kg: 1,
  cost_currency: 'EUR',
});
const IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  tara: 'PI-ING-000492',
  inulin: 'PI-ING-000455',
  watermelon: 'PI-ING-000405',
} as const;

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  lockType: RecipeInput['items'][number]['lock_type'] = 'unlocked',
  extra: Record<string, unknown> = {},
): RecipeInput['items'][number] =>
  ({
    id,
    ingredient: ingredient(ingredientId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: lockType,
    ...extra,
  }) as RecipeInput['items'][number];

const BATCH = 1000;
/** Published `main-fruit-fresh-dairy` v2 numbers used by the Watermelon fixture. */
const POLICY = { ecoFloorPercent: 20, optimalCeilingPercent: 35, hardLimitPercent: 45 } as const;
/** 45 % of 1000 g — the certified Crown MAX SAFE this matrix is written against. */
const CROWN_MAX_SAFE = 450;

const fixture = (grams: number, role: 'main' | 'unlocked'): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: BATCH,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'optimal' },
  items: [
    line('milk', IDS.milk, 670),
    line('cream', IDS.cream, 130),
    line('smp', IDS.smp, 35),
    line('sucrose', IDS.sucrose, 130),
    line('dextrose', IDS.dextrose, 30),
    line('tara', IDS.tara, 5),
    line('inulin', IDS.inulin, 5),
    line('watermelon', IDS.watermelon, grams, role),
  ],
});

const snaps = (
  input: RecipeInput,
  policy: Partial<ProductBehaviorSnapshot> = {},
): Record<string, ProductBehaviorSnapshot | undefined> => {
  const built = productBehaviorTestSnapshots(input);
  if (built.watermelon) {
    built.watermelon = {
      ...built.watermelon,
      productId: 'e3264816-1050-d2a6-cc55-149e0d363bbf',
      productVersionId: '009d5b8a-f0bd-4c19-958b-3feec2f045f9',
      mapperIngredientId: IDS.watermelon,
      verificationState: 'estimated',
      mainClassification: 'MAIN_PROFILE_SPECIFIC',
      mainPolicyId: 'main-fruit-fresh-dairy',
      mainPolicyVersion: 'v2',
      mainEquivalentFactor: 1,
      mainBasis: 'FRUIT_EQUIVALENT',
      ...POLICY,
      ...policy,
    } as ProductBehaviorSnapshot;
  }
  return built;
};

const wm = (input: RecipeInput) =>
  input.items.find((item) => item.id === 'watermelon')!.planned_grams;

/** The Crown-ON answer: one clean, on-batch recipe at the certified maximum. */
const crownOnBaseline = (): RecipeInput => {
  const input = fixture(300, 'main');
  const built = buildOptimizePreview(input, { byLineId: {} }, '2026-08-16T12:00:00.000Z', {
    productBehaviorSnapshots: snaps(input),
    technicalOnlyMainLineIds: [],
  });
  expect(built.ok, JSON.stringify(built).slice(0, 400)).toBe(true);
  if (!built.ok) throw new Error('crown baseline unavailable');
  return built.preview.proposedInput;
};

/** The served gesture: Crown OFF, then type `typed` grams on that line. */
const typedOnBaseline = (base: RecipeInput, typed: number): RecipeInput => ({
  ...base,
  items: base.items.map((item) =>
    item.id === 'watermelon'
      ? {
          ...item,
          lock_type: 'unlocked' as const,
          planned_grams: typed,
          user_target_grams: typed,
          user_intent_anchor_grams: typed,
        }
      : item,
  ),
});

const recalc = (
  input: RecipeInput,
  byLineId: Record<string, { mode: 'locked'; grams: number }> = {},
  policy: Partial<ProductBehaviorSnapshot> = {},
) =>
  buildOptimizePreview(input, { byLineId }, '2026-08-16T12:00:00.000Z', {
    productBehaviorSnapshots: snaps(input, policy),
    technicalOnlyMainLineIds: [],
  });

describe('Crown-OFF manual Main target', () => {
  it('D — Crown ON still returns the canonical MAX SAFE', () => {
    // Anchors the whole matrix: every number below is measured against THIS.
    expect(wm(crownOnBaseline())).toBe(CROWN_MAX_SAFE);
    expect(CROWN_MAX_SAFE).toBe((BATCH * POLICY.hardLimitPercent) / 100);
  });

  it('A — an unlocked request above the maximum returns the highest safe amount', () => {
    const base = crownOnBaseline();
    // Every request above the ceiling lands on the SAME safe maximum: the answer
    // is a property of the recipe, not of how far the user overshot.
    for (const typed of [451, 460, 500, 520, 600, 900]) {
      const built = recalc(typedOnBaseline(base, typed));
      expect(built.ok, `${typed} g: ${JSON.stringify(built).slice(0, 300)}`).toBe(true);
      if (!built.ok) continue;
      expect(wm(built.preview.proposedInput), `${typed} g`).toBe(CROWN_MAX_SAFE);
      expect(built.preview.crownOffMainCorrection, `${typed} g`).toMatchObject({
        lineId: 'watermelon',
        requestedGrams: typed,
        selectedGrams: CROWN_MAX_SAFE,
        requestPreserved: false,
      });
    }
  });

  it('A — the corrected recipe passes the SAME envelope that refused the old one', () => {
    const base = crownOnBaseline();
    const built = recalc(typedOnBaseline(base, 600));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // The regression this locks: 571 g / 57.10 % used to ship as a clean
    // Preview while `verifyMainEnvelope` called the very same vector
    // `main_above_hard_limit`.
    const verdict = verifyMainEnvelope({
      recipe: built.preview.proposedInput,
      snapshots: snaps(typedOnBaseline(base, 600)),
      mode: 'optimal',
      technicalOnlyMainLineIds: [],
    });
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
    expect(wm(built.preview.proposedInput)).toBeLessThanOrEqual(CROWN_MAX_SAFE);
  });

  it('B — a safe request below the maximum is preserved exactly', () => {
    const base = crownOnBaseline();
    for (const typed of [250, 300, 400]) {
      const built = recalc(typedOnBaseline(base, typed));
      expect(built.ok, `${typed} g`).toBe(true);
      if (!built.ok) continue;
      expect(wm(built.preview.proposedInput), `${typed} g`).toBe(typed);
      expect(built.preview.crownOffMainCorrection, `${typed} g`).toMatchObject({
        requestedGrams: typed,
        selectedGrams: typed,
        requestPreserved: true,
      });
    }
  });

  it('B — a garnish-sized amount below the sensory floor is left alone', () => {
    // 100 g = 10 % against a 20 % floor. Under the floor the Main policy
    // deliberately does not engage, so nothing here may crown the line and
    // manufacture a `main_below_floor` refusal.
    const base = crownOnBaseline();
    const built = recalc(typedOnBaseline(base, 100));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.preview.crownOffMainCorrection).toBeUndefined();
  });

  it('C — a LOCKED request above the maximum is refused, never silently rewritten', () => {
    const base = crownOnBaseline();
    for (const typed of [500, 600]) {
      const input = typedOnBaseline(base, typed);
      const built = recalc(input, { watermelon: { mode: 'locked', grams: typed } });
      expect(built.ok, `${typed} g must not produce a proposal`).toBe(false);
      if (built.ok) continue;
      expect(built.code).toBe('impossible_under_constraints');
      if (built.code !== 'impossible_under_constraints') continue;
      // The refusal has to NAME the safe maximum — that is the whole advisory.
      expect(built.nearestFeasibleGrams).toBe(CROWN_MAX_SAFE);
      expect(built.conflict).toMatchObject({ lineId: 'watermelon', grams: typed, kind: 'locked' });
    }
  });

  it('C — a locked amount is refused whether or not the line still holds the Crown', () => {
    // A lock must be a hard requirement in BOTH roles. While the uncrowned lane
    // accepted it, turning the Crown off was a one-click bypass of the very
    // limit the crowned lane enforced.
    const base = crownOnBaseline();
    for (const role of ['unlocked', 'main'] as const) {
      const input: RecipeInput = {
        ...base,
        items: base.items.map((item) =>
          item.id === 'watermelon'
            ? { ...item, lock_type: role, planned_grams: 600, user_target_grams: 600 }
            : item,
        ),
      };
      const built = recalc(input, { watermelon: { mode: 'locked', grams: 600 } });
      expect(built.ok, `role=${role}`).toBe(false);
      if (!built.ok) expect(built.code, `role=${role}`).toBe('impossible_under_constraints');
    }
  });

  it('G — the corrected recipe keeps every positive line and the batch invariant', () => {
    const base = crownOnBaseline();
    const built = recalc(typedOnBaseline(base, 600));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const proposed = built.preview.proposedInput;
    expect(proposed.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(BATCH);
    expect(proposed.items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
    // No positive Main disappears, and the Main line itself stays positive.
    expect(wm(proposed)).toBeGreaterThan(0);
    for (const before of base.items.filter((item) => item.planned_grams > 0)) {
      const after = proposed.items.find((item) => item.id === before.id);
      if (before.id === 'watermelon') continue;
      // A support line may move — it is what absorbs the correction — but it
      // may not be silently deleted from the recipe.
      expect(after, `${before.id} disappeared`).toBeDefined();
    }
  });

  it('the correction is bounded by whatever the PUBLISHED policy says', () => {
    // The Crown/Main code carries no product-category branch: profiles differ
    // only through published policy DATA (see `mainSafetyProfileMatrix`). This
    // drives the correction with each profile's real published ceiling and
    // proves the cap follows the DATA, not a milk_gelato constant.
    //
    // Engine bodies still differ per category, so this is policy coverage, not
    // a substitute for a served Sorbet/Vegan/Protein run.
    const base = crownOnBaseline();
    const profiles = [
      { name: 'GELATO', ecoFloorPercent: 25, hardLimitPercent: 45 },
      { name: 'SORBET', ecoFloorPercent: 60, hardLimitPercent: 60 },
      { name: 'VEGAN', ecoFloorPercent: 30, hardLimitPercent: 74.7 },
      { name: 'PROTEIN', ecoFloorPercent: 10, hardLimitPercent: 49.5 },
    ] as const;
    for (const profile of profiles) {
      const policy = {
        ecoFloorPercent: profile.ecoFloorPercent,
        optimalCeilingPercent: profile.hardLimitPercent,
        hardLimitPercent: profile.hardLimitPercent,
      };
      const input = typedOnBaseline(base, 900);
      const projected = projectCrownOffMainTarget(
        input,
        { byLineId: {} },
        {
          productBehaviorSnapshots: snaps(input, policy),
          technicalOnlyMainLineIds: [],
        },
      );
      if (projected.proof === null) continue;
      const ceiling = (BATCH * profile.hardLimitPercent) / 100;
      expect(projected.proof.selectedGrams, profile.name).toBeLessThanOrEqual(ceiling);
      expect(projected.proof.selectedGrams, profile.name).toBeLessThanOrEqual(900);
    }
  });
});
