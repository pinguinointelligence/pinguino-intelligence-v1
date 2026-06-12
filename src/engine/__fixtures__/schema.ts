/**
 * Calibration fixture schema (spec §16) — shared by MyGelato and golden fixtures.
 *
 * Pending fixtures carry no data by design: real values arrive from the product
 * owner's screenshots and manual records. The test runner skips 'pending' and
 * fails on 'active' misses. When an active fixture disagrees with the engine,
 * only engine config may change (coefficients/targets) + CONFIG_VERSION bump —
 * never per-recipe hacks.
 */
import type { IndicatorKey, IndicatorStatus, IngredientComponentProfile } from '../types';

export type FixtureKind = 'ingredient' | 'recipe';

interface FixtureBase {
  kind: FixtureKind;
  name: string;
}

/** Placeholder awaiting real MyGelato data. */
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
  input: FixtureRecipeLine[];
  expected: {
    pod?: number;
    pac?: number;
    npac?: number;
    ice_fraction?: number;
    indicators?: Partial<Record<IndicatorKey, IndicatorStatus>>;
  };
  tolerance: number;
}

export type CalibrationFixture = PendingFixture | ActiveIngredientFixture | ActiveRecipeFixture;
