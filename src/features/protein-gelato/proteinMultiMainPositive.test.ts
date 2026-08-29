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
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { parseCsv } from '@/lib/csv';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { mainEnvelopeSearchCeilingGrams } from '@/features/product-intelligence/mainEnvelope';
import { verifyMainIngredientIdentity } from '@/features/formulation/mainIngredientContract';
import { productBehaviorSnapshotFingerprint } from '@/features/product-intelligence';
import {
  bindProductBehaviorToPreview,
  buildBatchRescalePreview,
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
} from '@/features/constraint-studio/applyPipeline';
import { computeOptimizePreviewResult } from '@/features/constraint-studio/optimizePreviewComputation';

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
      if (field === 'verification_date' || field === 'last_reviewed_at')
        return [field, raw || null];
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
const STRAWBERRY = 'PI-ING-001553';
const CRANBERRY = 'PI-ING-001556';
const WATERMELON = 'PI-ING-000405';

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
  const roundingDelta = 1_000 - scaledSupport.reduce((sum, item) => sum + item.planned_grams, 0);
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

const servedOwnerBananaCranberryFixture = (): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'protein',
    servingModeId: 'temp_minus_13',
    formulationStrategy: 'eco',
    targetBatchGrams: 1_000,
  });
  return {
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [
      ...starter.items,
      line('banana-main', BANANA, 352, 'main', 352 / 136),
      line('cranberry-main', CRANBERRY, 136, 'main', 1),
    ],
    goals: {
      formulation_strategy: 'eco',
      direction_targets_active: true,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    },
  };
};

const servedDefaultOwnerBananaCranberryFixture = (): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'protein',
    servingModeId: 'temp_minus_12',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  return {
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [
      ...starter.items,
      line('banana-main', BANANA, 352, 'main', 352 / 136),
      line('cranberry-main', CRANBERRY, 136, 'main', 1),
    ],
    goals: {
      formulation_strategy: 'optimal',
      direction_targets_active: true,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    },
  };
};

const servedFourCrownFixture = (): RecipeInput => {
  const input = servedOwnerBananaCranberryFixture();
  const servedSupportGrams: Record<string, number> = {
    'new-recipe-0-milk_3_5': 522,
    'new-recipe-1-cream_30': 114,
    'new-recipe-2-PI-ING-000264': 81,
    'new-recipe-3-water': 104,
    'new-recipe-4-sucrose': 71,
    'new-recipe-5-dextrose': 106,
    'new-recipe-6-tara_gum': 2,
  };
  return {
    ...input,
    items: [
      ...input.items.map((item) => ({
        ...item,
        planned_grams: servedSupportGrams[item.id] ?? item.planned_grams,
        ...(item.id === 'banana-main'
          ? { main_ratio_weight: 352 }
          : item.id === 'cranberry-main'
            ? { main_ratio_weight: 136 }
            : {}),
      })),
      line('strawberry-main', STRAWBERRY, 50, 'main', 50),
      line('watermelon-main', WATERMELON, 25, 'main', 25),
    ],
  };
};

const snapshotsFor = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snaps = productBehaviorTestSnapshots(input);
  for (const id of input.items.filter((item) => item.lock_type === 'main').map((item) => item.id)) {
    if (snaps[id]) {
      snaps[id] = {
        ...snaps[id]!,
        mainClassification: 'MAIN_CAPABLE_UNCALIBRATED',
      } as ProductBehaviorSnapshot;
    }
  }
  return snaps;
};

const calibratedProteinFruitSnapshots = (
  input: RecipeInput,
): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = snapshotsFor(input);
  for (const [lineId, subfamilyId, ceiling] of [
    ['mainA', 'berry', 49.5],
    ['mainB', 'banana', 17.1],
  ] as const) {
    snapshots[lineId] = {
      ...snapshots[lineId]!,
      familyId: 'fruit',
      subfamilyId,
      formId: 'fresh',
      behaviorRole: 'MAIN_PROFILE_SPECIFIC',
      mainClassification: 'MAIN_PROFILE_SPECIFIC',
      mainCapability: 'MAIN_CAPABLE',
      mainAuthority: 'CALIBRATED',
      mainCalibrationLevel: 'EXACT_PRODUCT',
      mainPolicyId: 'main-protein-fruit-combination-v2',
      mainPolicyVersion: '2',
      ecoFloorPercent: 10,
      optimalCeilingPercent: ceiling,
      hardLimitPercent: ceiling,
      multiMainHardLimitPercent: 20.7,
      mainEquivalentFactor: 1,
      mainBasis: 'FRUIT_EQUIVALENT',
      moduleEligibility: { ...snapshots[lineId]!.moduleEligibility, MAIN: 'eligible' },
    } as ProductBehaviorSnapshot;
  }
  return snapshots;
};

const servedOwnerBananaCranberrySnapshots = (
  input: RecipeInput,
): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = snapshotsFor(input);
  snapshots['banana-main'] = {
    ...snapshots['banana-main']!,
    familyId: 'fruit',
    subfamilyId: 'banana',
    formId: 'fresh',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainCapability: 'MAIN_CAPABLE',
    mainAuthority: 'CALIBRATED',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    mainPolicyId: 'main-protein-fruit-combination-v2',
    mainPolicyVersion: '2',
    ecoFloorPercent: 10,
    optimalCeilingPercent: 17.1,
    hardLimitPercent: 17.1,
    multiMainHardLimitPercent: 20.7,
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
  } as ProductBehaviorSnapshot;
  snapshots['cranberry-main'] = {
    ...snapshots['cranberry-main']!,
    familyId: 'fruit',
    subfamilyId: 'berry',
    formId: 'fresh',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
    mainAuthority: 'USER_HELD',
    mainCalibrationLevel: 'NONE',
    mainPolicyId: null,
    mainPolicyVersion: null,
    ecoFloorPercent: null,
    optimalCeilingPercent: null,
    hardLimitPercent: null,
    multiMainHardLimitPercent: null,
    mainEquivalentFactor: null,
    mainBasis: null,
  } as ProductBehaviorSnapshot;
  return snapshots;
};

const servedFourCrownSnapshots = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = servedOwnerBananaCranberrySnapshots(input);
  snapshots['strawberry-main'] = {
    ...snapshots['strawberry-main']!,
    familyId: 'fruit',
    subfamilyId: 'berry',
    formId: 'fresh',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainCapability: 'MAIN_CAPABLE',
    mainAuthority: 'CALIBRATED',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    mainPolicyId: 'main-protein-fruit-combination-v2',
    mainPolicyVersion: '2',
    ecoFloorPercent: 10,
    optimalCeilingPercent: 49.5,
    hardLimitPercent: 49.5,
    multiMainHardLimitPercent: 20.7,
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
  } as ProductBehaviorSnapshot;
  return snapshots;
};

const AT = '2026-08-23T12:00:00.000Z';
const NONE = { byLineId: {} };
const LOCAL_SERVED_RESULT_BUDGET_MS = 15_000;

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
  it('repairs Protein support before searching the exact -13 ECO 2:1 Main envelope', () => {
    const starter = buildCanonicalNewRecipeStarter({
      visibleProductType: 'protein',
      servingModeId: 'temp_minus_13',
      formulationStrategy: 'eco',
      targetBatchGrams: 2_000,
    });
    const input: RecipeInput = {
      mode: 'classic',
      category: 'protein_gelato',
      target_temperature_c: starter.targetTemperatureC,
      target_batch_grams: 2_000,
      machine_capacity_grams: null,
      items: [
        ...starter.items,
        {
          ...line('mainA', STRAWBERRY, 300, 'main', 300),
          user_intent_anchor_grams: 300,
        },
        {
          ...line('mainB', BANANA, 150, 'main', 150),
          user_intent_anchor_grams: 150,
        },
      ],
      goals: {
        formulation_strategy: 'eco',
        direction_targets_active: true,
        direction_targets: { sweetness: -2, softness: 2, creaminess: 0, flavor: 0 },
      },
    };
    const snapshots = calibratedProteinFruitSnapshots(input);
    const dairyIds = new Set(['PI-ING-000180', 'PI-ING-000203', 'PI-ING-000236', 'PI-ING-000237']);
    for (const item of input.items) {
      if (dairyIds.has(canonicalIngredientId(item.ingredient))) {
        snapshots[item.id] = { ...snapshots[item.id]!, approvedLiquidDairyCarrier: true };
      }
    }

    const raw = buildOptimizePreview(input, NONE, AT, {
      productBehaviorSnapshots: snapshots,
      technicalOnlyMainLineIds: [],
    });
    expect(raw.ok, JSON.stringify(raw)).toBe(true);
    if (!raw.ok) return;
    const proposalSnapshots = calibratedProteinFruitSnapshots(raw.preview.proposedInput);
    for (const item of raw.preview.proposedInput.items) {
      if (dairyIds.has(canonicalIngredientId(item.ingredient))) {
        proposalSnapshots[item.id] = {
          ...proposalSnapshots[item.id]!,
          approvedLiquidDairyCarrier: true,
        };
      }
    }
    const built = bindProductBehaviorToPreview(raw, proposalSnapshots, snapshots, []);
    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const mains = ['mainA', 'mainB'].map(
      (lineId) => built.preview.proposedInput.items.find((item) => item.id === lineId)!,
    );
    expect(built.preview.mainObjective?.attempts).toBeGreaterThan(0);
    expect(mains[0]!.planned_grams + mains[1]!.planned_grams).toBeLessThanOrEqual(414);
    expect(mains[0]!.planned_grams / mains[1]!.planned_grams).toBeCloseTo(2, 6);
    expect(verifyMainIngredientIdentity(input, built.preview.proposedInput)).toMatchObject({
      ok: true,
    });
    const directionConsent = {
      baseFingerprint: built.preview.baseFingerprint,
      targetFingerprint: directionTargetFingerprint(input),
      candidateFingerprint: workingStateFingerprint(
        built.preview.proposedInput,
        built.preview.nextConstraints,
      ),
    };
    const proposalAuthorization = {
      baseFingerprint: built.preview.baseFingerprint,
      proposedFingerprint: workingStateFingerprint(
        built.preview.proposedInput,
        built.preview.nextConstraints,
      ),
      baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(snapshots),
      proposedProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(proposalSnapshots),
      snapshots: structuredClone(proposalSnapshots),
    };
    const committed = commitPreview(
      input,
      NONE,
      built.preview,
      '2026-08-23T12:01:00.000Z',
      'apply-protein-stage-ordered-main-envelope',
      [],
      undefined,
      null,
      null,
      directionConsent,
      null,
      snapshots,
      [],
      proposalAuthorization,
    );
    expect(committed, JSON.stringify(committed)).toMatchObject({ ok: true });
  });

  it('reduces an above-ceiling 2:1 Crown group to the safe 20.7% envelope', () => {
    const base = fixture(2);
    const input: RecipeInput = {
      ...base,
      items: base.items.map((item) =>
        item.id === 'mainA'
          ? { ...item, ingredient: ing(STRAWBERRY), planned_grams: 300, main_ratio_weight: 2 }
          : item.id === 'mainB'
            ? { ...item, ingredient: ing(BANANA), planned_grams: 150, main_ratio_weight: 1 }
            : item.id === 'milk'
              ? { ...item, planned_grams: item.planned_grams - 390 }
              : item,
      ),
    };
    const snapshots = calibratedProteinFruitSnapshots(input);
    expect(mainEnvelopeSearchCeilingGrams({ recipe: input, snapshots, mode: 'optimal' })).toBe(207);
    const raw = buildOptimizePreview(input, NONE, AT, {
      productBehaviorSnapshots: snapshots,
      technicalOnlyMainLineIds: [],
    });
    expect(raw.ok, JSON.stringify(raw)).toBe(true);
    if (!raw.ok) return;
    const rawMainGrams = raw.preview.proposedInput.items
      .filter((item) => item.lock_type === 'main')
      .reduce((sum, item) => sum + item.planned_grams, 0);
    expect(
      rawMainGrams,
      JSON.stringify({ proof: raw.preview.mainObjective, rawMainGrams }),
    ).toBeLessThanOrEqual(207);
    const built = bindProductBehaviorToPreview(raw, snapshots);

    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const strawberry = built.preview.proposedInput.items.find((item) => item.id === 'mainA')!;
    const banana = built.preview.proposedInput.items.find((item) => item.id === 'mainB')!;
    expect(strawberry.planned_grams + banana.planned_grams).toBeLessThanOrEqual(207);
    expect(strawberry.planned_grams).toBeCloseTo(banana.planned_grams * 2, 0);
    expect(strawberry.planned_grams + banana.planned_grams).toBeLessThan(450);
    expect(
      commitPreview(
        input,
        NONE,
        built.preview,
        '2026-08-23T12:01:00.000Z',
        'apply-protein-above-envelope',
        [],
        undefined,
        null,
        null,
        null,
        null,
        snapshots,
      ),
    ).toMatchObject({ ok: true });
  });

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

  it('publishes the exact served -13 ECO Banana 352 g + Cranberry 136 g domain result before the UI watchdog', () => {
    const input = servedOwnerBananaCranberryFixture();
    const snapshots = servedOwnerBananaCranberrySnapshots(input);
    expect(input.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(1_488);

    const started = performance.now();
    const built = computeOptimizePreviewResult({
      input,
      constraints: NONE,
      createdAt: AT,
      options: {
        productBehaviorSnapshots: snapshots,
        technicalOnlyMainLineIds: [],
      },
    });
    const runtimeMs = performance.now() - started;

    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (built.ok) {
      expect(built.preview.directionAssessment).toMatchObject({
        active: true,
        reached: false,
        score: 9,
      });
      expect(verifyMainIngredientIdentity(input, built.preview.proposedInput)).toMatchObject({
        ok: true,
      });
    }
    expect(runtimeMs).toBeLessThan(LOCAL_SERVED_RESULT_BUDGET_MS);
    console.info(
      'SERVED_OWNER_PROTEIN ' +
        JSON.stringify({
          runtimeMs: Math.round(runtimeMs),
          result: built,
        }),
    );
  }, 120_000);

  it('publishes the default served -12 OPTIMAL Banana 352 g + Cranberry 136 g result without a worker exception', () => {
    const input = servedDefaultOwnerBananaCranberryFixture();
    const snapshots = servedOwnerBananaCranberrySnapshots(input);
    expect(input.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(1_488);

    const started = performance.now();
    const built = computeOptimizePreviewResult({
      input,
      constraints: NONE,
      createdAt: AT,
      options: {
        productBehaviorSnapshots: snapshots,
        technicalOnlyMainLineIds: [],
      },
    });
    const runtimeMs = performance.now() - started;

    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    expect(
      built.preview.proposedInput.items
        .filter((item) => item.lock_type === 'main')
        .map((item) => [item.id, item.planned_grams, item.main_ratio_weight]),
    ).toEqual([
      ['banana-main', 359, 352 / 136],
      ['cranberry-main', 139, 1],
    ]);
    expect(built.preview.mainObjective).toMatchObject({
      status: 'best_achievable',
      executableMainGrams: 498,
      provenMaximum: false,
    });
    expect(built.preview.directionAssessment).toMatchObject({ active: true, score: 10 });
    expect(() => structuredClone(built)).not.toThrow();
    expect(runtimeMs).toBeLessThan(LOCAL_SERVED_RESULT_BUDGET_MS);
  }, 120_000);

  it('publishes the served four-Crown 352/136/50/25 domain result before the UI watchdog', () => {
    const input = servedFourCrownFixture();
    const started = performance.now();
    const built = computeOptimizePreviewResult({
      input,
      constraints: NONE,
      createdAt: AT,
      options: {
        productBehaviorSnapshots: servedFourCrownSnapshots(input),
        technicalOnlyMainLineIds: [],
      },
    });
    const runtimeMs = performance.now() - started;

    expect(built.ok || built.code !== undefined).toBe(true);
    expect(runtimeMs).toBeLessThan(LOCAL_SERVED_RESULT_BUDGET_MS);
    console.info(
      'SERVED_FOUR_CROWN_PROTEIN ' +
        JSON.stringify({ runtimeMs: Math.round(runtimeMs), result: built }),
    );
  }, 120_000);

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
    expect(
      built.preview.proposedInput.items.filter((item) => item.lock_type === 'main'),
    ).toHaveLength(1);
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
    expect(signature(second.preview.proposedInput)).toEqual(signature(first.preview.proposedInput));
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
