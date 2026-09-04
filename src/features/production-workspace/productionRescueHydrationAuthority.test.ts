/**
 * OWNER REPRO 2026-09-04 — the rescued batch that can never be recovered.
 *
 * Served staging `e2e1a61a`, run `2fc85403-2394-4582-a211-4736bfc4ef8e`: BANANA
 * planned 300 g, weighed 345 g. Rescue activated, was authorized, was accepted
 * and stored (`rescue_accepted_at` set, `rescue_revision` 1). From that moment
 * every reload of Production ends in „Nie udało się odzyskać partii".
 *
 * The stored candidate, read back from the durable run:
 *
 *   MILK 492.2  CREAM 129.9  SMP 46  SUCROSE 69  DEXTROSE 63.2  TARA 4.6
 *   BANANA 345                                            total 1149.9 g
 *
 * The support lines were scaled by k = 1.15 (700 g -> 805 g) so BANANA would sit
 * at exactly 30 % — its published hard limit. But two of them land on a half
 * tenth and JS rounds them DOWN (`(113*1.15).toFixed(1)` is "129.9", not
 * "130.0"; `(55*1.15).toFixed(1)` is "63.2"), so the support sum is 804.9, the
 * denominator is 1149.9 instead of 1150.0, and BANANA becomes
 *
 *   345 / 1149.9 = 30.0026 %   >   30 % hard limit
 *
 * The candidate was solved to sit EXACTLY on the limit, leaving no headroom for
 * the 0.1 g the rounding gives away.
 *
 * Nothing rejects it at build time: `assessProductionHardSafety` — the gate the
 * rescue candidate loop actually uses — checks engine violations, machine
 * capacity and the native profile, and never consults the Main envelope. But
 * `hydrateProductionSessionFromRun` -> `applyVerifiedRescueInput` re-validates
 * the stored candidate through `evaluateRecipeConstraintAuthority`, which DOES
 * run the envelope. So the run is written in a state its own recovery path
 * refuses, and the refusal is swallowed by the durable-recovery catch and shown
 * as the generic „nie udało się połączyć" sentence.
 *
 * These cases pin the exact boundary rather than the story.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { verifyMainEnvelope } from '@/features/product-intelligence';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints/recipeConstraintAuthority';
import { assessProductionHardSafety } from './productionRescue';
import { applyVerifiedRescueInput, createProductionSession } from './productionSession';

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
  banana: 'PI-ING-000345',
} as const;

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  lockType: RecipeInput['items'][number]['lock_type'] = 'unlocked',
) =>
  ({
    id,
    ingredient: ingredient(ingredientId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: lockType,
  }) as RecipeInput['items'][number];

/** The rescue candidate exactly as the durable run stores it. */
const candidate = (support: readonly number[], banana: number): RecipeInput => {
  const items = [
    line('new-recipe-0-milk_3_5', IDS.milk, support[0]!),
    line('new-recipe-1-cream_30', IDS.cream, support[1]!),
    line('new-recipe-2-smp', IDS.smp, support[2]!),
    line('new-recipe-3-sucrose', IDS.sucrose, support[3]!),
    line('new-recipe-4-dextrose', IDS.dextrose, support[4]!),
    line('new-recipe-5-tara_gum', IDS.tara, support[5]!),
    line('line-mtn5pdnv-1', IDS.banana, banana, 'main'),
  ];
  const total = items.reduce((sum, item) => sum + item.planned_grams, 0);
  return {
    mode: 'classic',
    category: 'milk_gelato',
    target_batch_grams: total,
    target_temp_c: -11,
    machine_capacity_grams: null,
    items,
  } as unknown as RecipeInput;
};

/** What Rescue stored. */
const STORED = candidate([492.2, 129.9, 46, 69, 63.2, 4.6], 345);
/** The same intent without the 0.1 g the rounding gives away. */
const EXACT = candidate([492.2, 129.95, 46, 69, 63.25, 4.6], 345);

/**
 * The published `main-banana-fresh-dairy` v2 policy, copied from the durable
 * run's own `rescue_product_composition.behaviorSnapshots['line-mtn5pdnv-1']`.
 * The generic test fixture resolves BANANA with `hardLimitPercent: null`, which
 * cannot express the limit this defect turns on.
 */
const BANANA_POLICY = {
  mainCapability: 'MAIN_CAPABLE',
  behaviorRole: 'MAIN_PROFILE_SPECIFIC',
  mainClassification: 'MAIN_PROFILE_SPECIFIC',
  mainAuthority: 'CALIBRATED',
  mainCalibrationLevel: 'FAMILY',
  mainBasis: 'FRUIT_EQUIVALENT',
  mainEquivalentFactor: 1,
  mainPolicyId: 'main-banana-fresh-dairy',
  mainPolicyVersion: '2',
  ecoFloorPercent: 10,
  optimalCeilingPercent: 20,
  hardLimitPercent: 30,
  multiMainHardLimitPercent: null,
  requiresLiquidDairyCarrier: true,
  approvedLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: 30,
} as const;

const snapshotsFor = (input: RecipeInput) => {
  const base = productBehaviorTestSnapshots(input) as Record<string, ProductBehaviorSnapshot>;
  return {
    ...base,
    'line-mtn5pdnv-1': {
      ...base['line-mtn5pdnv-1'],
      ...BANANA_POLICY,
    } as ProductBehaviorSnapshot,
  } as Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
};

const violationCodes = (input: RecipeInput): string[] => {
  const verdict = verifyMainEnvelope({
    recipe: input,
    snapshots: snapshotsFor(input),
    mode: 'optimal',
  });
  return verdict.ok ? [] : verdict.violations.map((violation) => violation.code);
};

describe('rescued Production run is written in a state its own recovery refuses', () => {
  it('the stored candidate puts BANANA over its own hard limit by rounding alone', () => {
    const banana = STORED.items.find((item) => item.id === 'line-mtn5pdnv-1')!;
    const total = STORED.items.reduce((sum, item) => sum + item.planned_grams, 0);
    expect(total).toBeCloseTo(1149.9, 6);
    // 30.0026 % — over 30 % by 0.0026 pp, which is 0.03 g of BANANA.
    expect((banana.planned_grams / total) * 100).toBeGreaterThan(30);
    expect((banana.planned_grams / total) * 100).toBeLessThan(30.01);
  });

  it('the Main envelope — the authority hydration uses — REFUSES the stored candidate', () => {
    expect(violationCodes(STORED)).toContain('main_above_hard_limit');
  });

  it('the 0.1 g the rounding gave away is the whole difference', () => {
    expect(violationCodes(EXACT)).not.toContain('main_above_hard_limit');
  });

  it('names the EXACT exception the durable-recovery catch swallows', () => {
    // This is the call `applyVerifiedRescueInput` makes, and the message it
    // throws is what the UI replaces with „Nie udało się połączyć bieżącej
    // partii z jej zapisem."
    const authority = evaluateRecipeConstraintAuthority({
      recipe: STORED,
      snapshots: snapshotsFor(STORED),
      module: 'BATCH_RESCUE',
    });
    expect(authority.valid).toBe(false);
    const thrown =
      authority.issues[0]?.messagePl ??
      'Production Rescue requires a fully verified recipe candidate.';
    expect(thrown).toBe('Grupa Main przekracza twardy limit 30.0%.');
  });

  it('the gate the rescue candidate loop actually uses does NOT see the violation', () => {
    // This is the inconsistency: build time says safe, recovery says refused.
    const assessment = assessProductionHardSafety(STORED, calculateRecipe(STORED));
    expect(assessment.violationMetrics).toEqual([]);
    expect(assessment.capacityExceeded).toBe(false);
  });

  /**
   * THE FIX'S CONTRACT. A rescue that is already durably accepted is a physical
   * fact in the vessel: recovery reconstructs it, it does not re-decide it. A
   * brand-new rescue is still fully re-validated.
   */
  describe('recovery reconstructs, it does not re-decide', () => {
    const sessionFor = (input: RecipeInput) =>
      createProductionSession({
        sessionId: 'owner-repro-2fc85403',
        ownerUserId: 'owner-1',
        source: {
          recipeId: 'recipe-1',
          recipeVersionId: 'version-1',
          recipeVersionNumber: 1,
          recipeName: 'QA RESCUE COMPLETE BANANA',
        },
        plannedInput: input,
        plannedComposition: {
          schemaVersion: 1,
          baseScope: 'BASE_FORMULATION',
          baseOrder: input.items.map((item) => item.id),
          toppings: [],
          behaviorSnapshots: snapshotsFor(input),
          migrationAmbiguities: [],
        },
        startedAt: '2026-09-04T16:18:36.000Z',
      } as unknown as Parameters<typeof createProductionSession>[0]);

    it('a NEW rescue carrying the over-limit candidate is still refused', () => {
      expect(() => applyVerifiedRescueInput(sessionFor(STORED), STORED, 1)).toThrow(
        'Grupa Main przekracza twardy limit 30.0%.',
      );
    });

    it('an ALREADY AUTHORIZED rescue reopens instead of stranding the batch', () => {
      expect(() =>
        applyVerifiedRescueInput(sessionFor(STORED), STORED, 1, { alreadyAuthorized: true }),
      ).not.toThrow();
    });
  });
});
