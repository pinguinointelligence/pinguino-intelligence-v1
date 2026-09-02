/**
 * CROWN-OFF MAIN SAFETY BAND — owner decision 2026-09-02 (option 1).
 *
 * Crown expresses OPTIMISATION INTENT. It must not decide whether safety rules
 * exist. A MAIN_CAPABLE product whose canonical equivalent share has reached the
 * published `eco_floor_percent` is acting as the Main, so its hard limit and its
 * approved liquid-dairy-carrier floor apply whether or not it is crowned.
 * Below that threshold the product is a garnish and the Main policy stays out.
 *
 * Served repro (owner, staging): Gelato / Ninja CREAMi Deluxe / 670 g / OPTIMAL /
 * STRAWBERRIES. Crown OFF proposed STRAWBERRIES 400 g → 391 g (58.36%) with
 * MILK 3.5% 201 g → 2 g (0.30% carrier against a 30% floor), and Preview
 * ACCEPTED it, because the whole envelope was scoped to `lock_type === 'main'`.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { verifyMainEnvelope } from './mainEnvelope';
import type { ProductBehaviorSnapshot } from './contracts';

const BATCH = 670;
/** Published `main-berry-fresh-dairy` v2 for milk_gelato. */
const POLICY = {
  ecoFloorPercent: 25,
  optimalCeilingPercent: 35,
  hardLimitPercent: 45,
  liquidDairyCarrierFloorPercent: 30,
} as const;
const FLOOR_G = (BATCH * POLICY.ecoFloorPercent) / 100; // 167.5 — engagement threshold
const HARD_G = (BATCH * POLICY.hardLimitPercent) / 100; // 301.5
const CARRIER_G = (BATCH * POLICY.liquidDairyCarrierFloorPercent) / 100; // 201

const mainSnapshot = (over: Partial<ProductBehaviorSnapshot> = {}): ProductBehaviorSnapshot =>
  ({
    lineId: 'straw',
    resolutionState: 'RESOLVED',
    processScope: 'BASE_FORMULATION',
    moduleEligibility: { BASE_RECIPE: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible' },
    mainCapability: 'MAIN_CAPABLE',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-berry-fresh-dairy',
    mainPolicyVersion: '2',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
    familyId: 'fruit',
    subfamilyId: 'berry',
    formId: 'fresh',
    requiresLiquidDairyCarrier: true,
    approvedLiquidDairyCarrier: false,
    multiMainHardLimitPercent: POLICY.hardLimitPercent,
    ...POLICY,
    ...over,
  }) as unknown as ProductBehaviorSnapshot;

const support = (lineId: string, approvedCarrier: boolean): ProductBehaviorSnapshot =>
  mainSnapshot({
    lineId,
    mainCapability: 'MAIN_TECHNICAL_BLOCKED',
    behaviorRole: 'STANDARD_ONLY',
    mainClassification: 'STANDARD_ONLY',
    approvedLiquidDairyCarrier: approvedCarrier,
    requiresLiquidDairyCarrier: false,
  } as Partial<ProductBehaviorSnapshot>);

type Line = { id: string; grams: number; lock?: 'main' | 'unlocked' };

const recipe = (lines: readonly Line[]): RecipeInput =>
  ({
    category: 'milk_gelato',
    target_batch_grams: BATCH,
    goals: { formulation_strategy: 'optimal' },
    items: lines.map(({ id, grams, lock }) => ({
      id,
      planned_grams: grams,
      lock_type: lock ?? 'unlocked',
      actual_grams: null,
      ingredient: { id: `PI-${id}`, name: id, category: 'fruit' },
    })),
  }) as unknown as RecipeInput;

/** One Main-capable fruit, MILK 3.5% as the only approved carrier, rest filler. */
const scene = (mainG: number, milkG: number, lock?: 'main' | 'unlocked') => ({
  recipe: recipe([
    { id: 'straw', grams: mainG, lock },
    { id: 'milk', grams: milkG },
    { id: 'rest', grams: BATCH - mainG - milkG },
  ]),
  snapshots: { straw: mainSnapshot(), milk: support('milk', true), rest: support('rest', false) },
});

const codesOf = (v: ReturnType<typeof verifyMainEnvelope>) => (v.ok ? [] : v.violations.map((x) => x.code));

describe('Crown-OFF Main safety band', () => {
  // ---- A. below the engagement threshold ------------------------------------
  it('does not demand a dairy carrier for a garnish-sized Main-capable amount', () => {
    // 5 g = 0.75%, and 100 g = 14.9% — both below the 25% floor (167.5 g).
    for (const grams of [5, 100]) {
      const { recipe: r, snapshots } = scene(grams, 2);
      expect(verifyMainEnvelope({ recipe: r, snapshots, mode: 'optimal' }).ok, `${grams} g`).toBe(true);
    }
    expect(FLOOR_G).toBe(167.5);
  });

  // ---- B. safe anchor above the threshold -----------------------------------
  it('accepts a safe user anchor above the threshold without rewriting it', () => {
    // 200 g = 29.9% (>= floor, <= hard limit) with the carrier exactly at 201 g.
    const { recipe: r, snapshots } = scene(200, CARRIER_G);
    expect(verifyMainEnvelope({ recipe: r, snapshots, mode: 'optimal' }).ok).toBe(true);
  });

  // ---- C. unsafe high Main cannot destroy the carrier floor ------------------
  it('fails closed when an uncrowned Main starves the approved carrier', () => {
    // Main 250 g = 37.3% (legal on its own), carrier 100 g = 14.9% < 30%.
    const { recipe: r, snapshots } = scene(250, 100);
    expect(codesOf(verifyMainEnvelope({ recipe: r, snapshots, mode: 'optimal' }))).toContain(
      'liquid_dairy_carrier_below_floor',
    );
  });

  // ---- D. hard limit ---------------------------------------------------------
  it('fails closed above the hard limit in both modes, uncrowned', () => {
    const { recipe: r, snapshots } = scene(310, CARRIER_G); // 46.3% > 45%
    for (const mode of ['optimal', 'eco'] as const) {
      expect(codesOf(verifyMainEnvelope({ recipe: r, snapshots, mode })), mode).toContain(
        'main_above_hard_limit',
      );
    }
    expect(HARD_G).toBe(301.5);
  });

  // ---- E. the served repro ---------------------------------------------------
  it('no longer accepts the served Crown-OFF proposal (391 g Main / 2 g carrier)', () => {
    const { recipe: r, snapshots } = scene(391, 2); // 58.36% Main, 0.30% carrier
    const verdict = verifyMainEnvelope({ recipe: r, snapshots, mode: 'optimal' });
    expect(verdict.ok).toBe(false);
    const codes = codesOf(verdict);
    expect(codes).toContain('main_above_hard_limit');
    expect(codes).toContain('liquid_dairy_carrier_below_floor');
  });

  it('is decided by capability, not by the Crown toggle', () => {
    // The SAME vector must fail with lock_type 'main' and with 'unlocked'.
    for (const lock of ['main', 'unlocked'] as const) {
      const { recipe: r, snapshots } = scene(391, 2, lock);
      expect(verifyMainEnvelope({ recipe: r, snapshots, mode: 'optimal' }).ok, lock).toBe(false);
    }
  });

  // ---- Multi-Main: split lines cannot bypass the threshold --------------------
  it('engages on the canonical GROUP share, so split Main lines cannot bypass it', () => {
    // Two uncrowned Main-capable lines at 160 g each: individually 23.9% (under
    // the 25% floor), together 47.8% — over the 45% hard limit.
    const r = recipe([
      { id: 'straw', grams: 160 },
      { id: 'berry2', grams: 160 },
      { id: 'milk', grams: CARRIER_G },
      { id: 'rest', grams: BATCH - 160 - 160 - CARRIER_G },
    ]);
    const snapshots = {
      straw: mainSnapshot(),
      berry2: mainSnapshot({ lineId: 'berry2' }),
      milk: support('milk', true),
      rest: support('rest', false),
    };
    expect(160 / BATCH).toBeLessThan(POLICY.ecoFloorPercent / 100);
    expect(codesOf(verifyMainEnvelope({ recipe: r, snapshots, mode: 'optimal' }))).toContain(
      'main_above_hard_limit',
    );
  });
});
