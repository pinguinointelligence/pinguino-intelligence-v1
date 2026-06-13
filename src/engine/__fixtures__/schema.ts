/**
 * Calibration fixture schema (spec §16) — shared by external reference and golden fixtures.
 *
 * Pending fixtures carry no data by design: real values arrive from the product
 * owner's screenshots and manual records. The test runner skips 'pending' and
 * fails on 'active' misses. When an active fixture disagrees with the engine,
 * only engine config may change (coefficients/targets) + CONFIG_VERSION bump —
 * never per-recipe hacks.
 */
import type {
  IndicatorKey,
  IndicatorStatus,
  IngredientComponentProfile,
  ProductCategory,
  TargetMetric,
} from '../types';

export type FixtureKind = 'ingredient' | 'recipe';

interface FixtureBase {
  kind: FixtureKind;
  name: string;
}

/** Placeholder awaiting real external reference data. */
export interface PendingFixture extends FixtureBase {
  status: 'pending';
  notes?: string;
}

/** One line of a recipe fixture; composition data is required once activated. */
export interface FixtureRecipeLine {
  ingredient_name: string;
  grams: number;
  composition: IngredientComponentProfile;
  de_value?: number | null;
  /** Stored, verified-first per-ingredient values (spec §7–§8, optional). When a
   * reference supplies them, the runner feeds them straight into the engine's
   * stored slots instead of deriving from the sugar breakdown — identical to a
   * real `EngineIngredient`. Absent ⇒ the engine derives the value. */
  pod_value?: number | null;
  pac_value?: number | null;
  npac_value?: number | null;
}

/** Asserts per-ingredient POD/PAC/NPAC derivation matches known values. */
export interface ActiveIngredientFixture extends FixtureBase {
  kind: 'ingredient';
  status: 'active';
  input: IngredientComponentProfile;
  de_value?: number | null;
  expected: { pod?: number; pac?: number; npac?: number };
  tolerance: number;
}

/** Asserts full-mix indicator outcomes within tolerance. */
export interface ActiveRecipeFixture extends FixtureBase {
  kind: 'recipe';
  status: 'active';
  /** Optional run context — when present the runner prefers these over its
   * defaults so a fixture is self-describing (existing fixtures are unaffected). */
  category?: ProductCategory;
  temperature_c?: number;
  batch_grams?: number;
  input: FixtureRecipeLine[];
  expected: {
    pod?: number;
    pac?: number;
    npac?: number;
    ice_fraction?: number;
    /** Reference component percentages of total batch mass (optional). */
    water?: number;
    total_solids?: number;
    fat?: number;
    lactose?: number;
    aerating_protein?: number;
    protein_in_solids?: number;
    lactose_sandiness_risk?: number;
    /** Reference cost values (optional, informational — never blocks). */
    cost_per_kg?: number;
    cost_per_serving_80g?: number;
    indicators?: Partial<Record<IndicatorKey, IndicatorStatus>>;
  };
  /** Verified reference target bands as `[min, max]` (optional, recorded only). */
  bands?: Partial<Record<TargetMetric, readonly [number, number]>>;
  tolerance: number;
}

export type CalibrationFixture = PendingFixture | ActiveIngredientFixture | ActiveRecipeFixture;
