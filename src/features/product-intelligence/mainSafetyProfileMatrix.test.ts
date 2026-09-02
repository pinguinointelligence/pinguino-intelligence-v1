/**
 * PROFILE COVERAGE MATRIX — Gelato / Sorbet / Vegan / Protein.
 *
 * The Crown/Main authorities changed on 2026-09-02 (GEL-P0-027 #72, safety band
 * #93) contain NO product-category branch. Profiles differ only through the
 * published policy DATA. This matrix therefore re-proves both fixes against the
 * REAL published numbers of all four profiles, so neither can be accepted on
 * `milk_gelato` evidence alone.
 *
 * Published values (staging `product_behavior_policy_versions`, status=published):
 *   milk_gelato     main-berry-fresh-dairy v2      25 / 35   / 45   dairy floor 30
 *   sorbet          main-sorbet-strawberry-1553 v1 60 / 60   / 60   no dairy carrier
 *   vegan_gelato    main-vegan-strawberry-1553 v2  30 / 74.7 / 74.7 no dairy carrier
 *   protein_gelato  main-protein-strawberry-1553 v2 10 / 49.5 / 49.5 no dairy carrier
 *
 * Data fact this matrix pins: every non-dairy published policy has
 * `optimal_ceiling === hard_limit` (16/16), so #72's frontier move is a proven
 * no-op outside dairy gelato — while #93's hard limit binds in all four.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput, ProductCategory } from '@/engine';
import { verifyMainEnvelope, mainEnvelopeSearchCeilingGrams } from './mainEnvelope';
import type { ProductBehaviorSnapshot } from './contracts';

const BATCH = 670;

type Profile = {
  name: string;
  category: ProductCategory;
  policyId: string;
  ecoFloorPercent: number;
  optimalCeilingPercent: number;
  hardLimitPercent: number;
  liquidDairyCarrierFloorPercent: number | null;
  requiresLiquidDairyCarrier: boolean;
};

const PROFILES: readonly Profile[] = [
  {
    name: 'GELATO',
    category: 'milk_gelato',
    policyId: 'main-berry-fresh-dairy',
    ecoFloorPercent: 25,
    optimalCeilingPercent: 35,
    hardLimitPercent: 45,
    liquidDairyCarrierFloorPercent: 30,
    requiresLiquidDairyCarrier: true,
  },
  {
    name: 'SORBET',
    category: 'sorbet',
    policyId: 'main-sorbet-strawberry-fresh-1553',
    ecoFloorPercent: 60,
    optimalCeilingPercent: 60,
    hardLimitPercent: 60,
    liquidDairyCarrierFloorPercent: null,
    requiresLiquidDairyCarrier: false,
  },
  {
    name: 'VEGAN',
    category: 'vegan_gelato',
    policyId: 'main-vegan-strawberry-fresh-1553',
    ecoFloorPercent: 30,
    optimalCeilingPercent: 74.7,
    hardLimitPercent: 74.7,
    liquidDairyCarrierFloorPercent: null,
    requiresLiquidDairyCarrier: false,
  },
  {
    name: 'PROTEIN',
    category: 'protein_gelato',
    policyId: 'main-protein-strawberry-1553',
    ecoFloorPercent: 10,
    optimalCeilingPercent: 49.5,
    hardLimitPercent: 49.5,
    liquidDairyCarrierFloorPercent: null,
    requiresLiquidDairyCarrier: false,
  },
];

const snapshotFor = (
  p: Profile,
  over: Partial<ProductBehaviorSnapshot> = {},
): ProductBehaviorSnapshot =>
  ({
    lineId: 'main',
    resolutionState: 'RESOLVED',
    processScope: 'BASE_FORMULATION',
    moduleEligibility: { BASE_RECIPE: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible' },
    mainCapability: 'MAIN_CAPABLE',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: p.policyId,
    mainPolicyVersion: '2',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
    familyId: 'fruit',
    subfamilyId: 'berry',
    formId: 'fresh',
    requiresLiquidDairyCarrier: p.requiresLiquidDairyCarrier,
    liquidDairyCarrierFloorPercent: p.liquidDairyCarrierFloorPercent,
    approvedLiquidDairyCarrier: false,
    ecoFloorPercent: p.ecoFloorPercent,
    optimalCeilingPercent: p.optimalCeilingPercent,
    hardLimitPercent: p.hardLimitPercent,
    multiMainHardLimitPercent: p.hardLimitPercent,
    ...over,
  }) as unknown as ProductBehaviorSnapshot;

const support = (p: Profile, lineId: string, carrier: boolean): ProductBehaviorSnapshot =>
  snapshotFor(p, {
    lineId,
    mainCapability: 'MAIN_TECHNICAL_BLOCKED',
    behaviorRole: 'STANDARD_ONLY',
    mainClassification: 'STANDARD_ONLY',
    approvedLiquidDairyCarrier: carrier,
    requiresLiquidDairyCarrier: false,
  } as Partial<ProductBehaviorSnapshot>);

const scene = (p: Profile, mainG: number, carrierG: number, lock: 'main' | 'unlocked') => ({
  recipe: {
    category: p.category,
    target_batch_grams: BATCH,
    goals: { formulation_strategy: 'optimal' },
    items: [
      { id: 'main', planned_grams: mainG, lock_type: lock },
      { id: 'carrier', planned_grams: carrierG, lock_type: 'unlocked' },
      { id: 'rest', planned_grams: BATCH - mainG - carrierG, lock_type: 'unlocked' },
    ].map((i) => ({
      ...i,
      actual_grams: null,
      ingredient: { id: `PI-${i.id}`, name: i.id, category: 'fruit' },
    })),
  } as unknown as RecipeInput,
  snapshots: {
    main: snapshotFor(p),
    carrier: support(p, 'carrier', true),
    rest: support(p, 'rest', false),
  },
});

const codes = (v: ReturnType<typeof verifyMainEnvelope>) =>
  v.ok ? [] : v.violations.map((x) => x.code);
const g = (pct: number) => Math.round((BATCH * pct) / 100);
/** A carrier share that satisfies the dairy floor where one exists. */
const okCarrier = (p: Profile) => g(p.liquidDairyCarrierFloorPercent ?? 0);

describe.each(PROFILES)('Main safety authority — $name', (p) => {
  const belowFloor = g(p.ecoFloorPercent) - 20;
  const overHard = Math.min(g(p.hardLimitPercent) + 20, BATCH - okCarrier(p));

  // ---- #93 safety band, uncrowned (Crown OFF) --------------------------------
  it('below the published eco floor the Main policy stays out', () => {
    const { recipe, snapshots } = scene(p, belowFloor, okCarrier(p), 'unlocked');
    expect(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' }).ok).toBe(true);
  });

  it('above the published hard limit an UNCROWNED Main is refused', () => {
    const { recipe, snapshots } = scene(p, overHard, okCarrier(p), 'unlocked');
    expect(codes(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' }))).toContain(
      'main_above_hard_limit',
    );
  });

  it('the hard limit binds in ECO as well as OPTIMAL', () => {
    const { recipe, snapshots } = scene(p, overHard, okCarrier(p), 'unlocked');
    for (const mode of ['optimal', 'eco'] as const)
      expect(codes(verifyMainEnvelope({ recipe, snapshots, mode })), mode).toContain(
        'main_above_hard_limit',
      );
  });

  it('a CROWNED Main is refused at the same boundary — Crown is not what creates safety', () => {
    const { recipe, snapshots } = scene(p, overHard, okCarrier(p), 'main');
    expect(codes(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' }))).toContain(
      'main_above_hard_limit',
    );
  });

  // ---- carrier band is dairy-only BY DATA ------------------------------------
  it(`carrier floor ${p.requiresLiquidDairyCarrier ? 'binds' : 'cannot fire'} for this profile`, () => {
    const inBand = g((p.ecoFloorPercent + p.hardLimitPercent) / 2);
    const { recipe, snapshots } = scene(p, inBand, 0, 'unlocked'); // zero approved carrier
    const found = codes(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' })).includes(
      'liquid_dairy_carrier_below_floor',
    );
    expect(found).toBe(p.requiresLiquidDairyCarrier);
  });

  // ---- #72 Crown frontier ----------------------------------------------------
  it('the Crown search frontier is the HARD limit, never the preference target', () => {
    const { recipe, snapshots } = scene(p, g(p.ecoFloorPercent), okCarrier(p), 'main');
    expect(mainEnvelopeSearchCeilingGrams({ recipe, snapshots })).toBeCloseTo(
      (BATCH * p.hardLimitPercent) / 100,
      6,
    );
  });

  it('the preference ceiling stays opt-in and never invalidates an active Crown', () => {
    const between = g((p.optimalCeilingPercent + p.hardLimitPercent) / 2);
    if (p.optimalCeilingPercent === p.hardLimitPercent) {
      // Non-dairy data: opt === hard, so #72 is a provable no-op here.
      expect(p.requiresLiquidDairyCarrier).toBe(false);
      return;
    }
    const { recipe, snapshots } = scene(p, between, okCarrier(p), 'main');
    expect(codes(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' }))).not.toContain(
      'main_above_optimal_ceiling',
    );
    expect(
      codes(
        verifyMainEnvelope({
          recipe,
          snapshots,
          mode: 'optimal',
          enforceOptimalPreferenceCeiling: true,
        }),
      ),
    ).toContain('main_above_optimal_ceiling');
  });
});

/**
 * MULTI-MAIN — the #93 complete-or-nothing guard, on every profile.
 *
 * The guard exists because #93's first version judged a partially-resolved group
 * against ONE member's single-product limit and regressed the protein Multi-Main
 * contract. It was proven on protein only; this re-proves it on all four.
 */
describe.each(PROFILES)('Multi-Main capability group — $name', (p) => {
  const twoMains = (aG: number, bG: number, secondResolved: boolean) => ({
    recipe: {
      category: p.category,
      target_batch_grams: BATCH,
      goals: { formulation_strategy: 'optimal' },
      items: [
        { id: 'main', planned_grams: aG, lock_type: 'unlocked' },
        { id: 'main2', planned_grams: bG, lock_type: 'unlocked' },
        { id: 'carrier', planned_grams: okCarrier(p), lock_type: 'unlocked' },
        { id: 'rest', planned_grams: BATCH - aG - bG - okCarrier(p), lock_type: 'unlocked' },
      ].map((i) => ({
        ...i,
        actual_grams: null,
        ingredient: { id: `PI-${i.id}`, name: i.id, category: 'fruit' },
      })),
    } as unknown as RecipeInput,
    snapshots: {
      main: snapshotFor(p),
      // An UNCALIBRATED second Main has no policy envelope, so the group is
      // incomplete and the safety band must stay out entirely.
      main2: snapshotFor(
        p,
        secondResolved
          ? { lineId: 'main2' }
          : ({
              lineId: 'main2',
              mainPolicyId: null,
              mainPolicyVersion: null,
            } as Partial<ProductBehaviorSnapshot>),
      ),
      carrier: support(p, 'carrier', true),
      rest: support(p, 'rest', false),
    },
  });

  it('a COMPLETE capability group is judged against the shared multi-Main limit', () => {
    const over = g(p.hardLimitPercent) + 20;
    const { recipe, snapshots } = twoMains(
      Math.round(over / 2) + 10,
      Math.round(over / 2) + 10,
      true,
    );
    expect(codes(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' }))).toContain(
      'main_above_hard_limit',
    );
  });

  it("an INCOMPLETE group is never judged against one member's single-product limit", () => {
    const over = g(p.hardLimitPercent) + 20;
    const { recipe, snapshots } = twoMains(
      Math.round(over / 2) + 10,
      Math.round(over / 2) + 10,
      false,
    );
    expect(codes(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' }))).not.toContain(
      'main_above_hard_limit',
    );
  });
});
