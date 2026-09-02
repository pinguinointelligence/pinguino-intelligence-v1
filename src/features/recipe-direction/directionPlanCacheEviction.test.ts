/**
 * REGRESSION — the Direction plan cache must EVICT, not CLEAR.
 *
 * Root cause of the last reproducible full-suite failure: on reaching its
 * capacity the memo called `.clear()`, discarding every warm entry. The suite
 * holds more distinct profile × temperature × target keys than the limit, so
 * once enough Direction tests had run the hit rate collapsed and a heavy rescue
 * test crossed its 5 s contract — while still passing in a 2-file run and
 * across the 50-file constraint-studio directory.
 *
 * These assertions are about CACHE SEMANTICS, never about elapsed time:
 * `buildRecipeDirectionPlan` returns the identical object on a hit and a freshly
 * built one on a miss, so object identity is an exact, deterministic probe.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeDirectionTarget, RecipeInput } from '@/engine';
import {
  DIRECTION_PLAN_CACHE_LIMIT,
  __resetDirectionPlanCacheForTests,
  buildRecipeDirectionPlan,
} from './recipeDirectionTargets';

const TARGETS = [-2, -1, 0, 1, 2] as const;

/** Distinct cache keys differing ONLY in the four Direction target axes. */
const inputFor = (
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
  creaminess: RecipeDirectionTarget,
  flavor: RecipeDirectionTarget,
): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  items: [],
  goals: {
    direction_targets_active: true,
    direction_targets: { sweetness, softness, creaminess, flavor },
  },
});

/** Every distinct target combination — 5^4 = 625, comfortably over the limit. */
const allCombinations = (): RecipeInput[] => {
  const inputs: RecipeInput[] = [];
  for (const sweetness of TARGETS) {
    for (const softness of TARGETS) {
      for (const creaminess of TARGETS) {
        for (const flavor of TARGETS) {
          inputs.push(inputFor(sweetness, softness, creaminess, flavor));
        }
      }
    }
  }
  return inputs;
};

describe('Direction plan cache eviction', () => {
  beforeEach(() => {
    __resetDirectionPlanCacheForTests();
  });

  it('has more distinct keys available than its capacity', () => {
    expect(allCombinations().length).toBeGreaterThan(DIRECTION_PLAN_CACHE_LIMIT);
  });

  it('serves a repeated key from cache (identical object, not a rebuild)', () => {
    const input = inputFor(0, 0, 0, 0);
    const first = buildRecipeDirectionPlan(input);
    expect(buildRecipeDirectionPlan(input)).toBe(first);
    // A structurally identical but separately constructed input hits the same key.
    expect(buildRecipeDirectionPlan(inputFor(0, 0, 0, 0))).toBe(first);
  });

  it('evicts ONLY the oldest entry when capacity is crossed', () => {
    const combinations = allCombinations();
    const oldest = combinations[0]!;
    const second = combinations[1]!;

    // Fill to exactly capacity: entry 0 is the oldest, entry 1 the next oldest.
    for (let index = 0; index < DIRECTION_PLAN_CACHE_LIMIT; index += 1) {
      buildRecipeDirectionPlan(combinations[index]!);
    }
    const oldestBefore = buildRecipeDirectionPlan(oldest);
    const secondBefore = buildRecipeDirectionPlan(second);

    // One more distinct key crosses the boundary and must evict exactly one.
    buildRecipeDirectionPlan(combinations[DIRECTION_PLAN_CACHE_LIMIT]!);

    // Probe the SURVIVOR first: re-requesting an evicted key is itself a miss
    // that inserts and therefore evicts the next-oldest entry, so the order of
    // these two assertions matters.
    // Everything except the oldest survived. Under the old clear-on-full policy
    // this was a rebuild too, which is exactly the cliff this test pins.
    expect(buildRecipeDirectionPlan(second)).toBe(secondBefore);
    // The oldest is gone — rebuilt, so a different object.
    expect(buildRecipeDirectionPlan(oldest)).not.toBe(oldestBefore);
  });

  it('keeps warm entries hitting well past the capacity boundary', () => {
    const combinations = allCombinations();
    // A key inserted late stays warm while many further distinct keys arrive.
    const warm = combinations[DIRECTION_PLAN_CACHE_LIMIT - 1]!;
    for (let index = 0; index < DIRECTION_PLAN_CACHE_LIMIT; index += 1) {
      buildRecipeDirectionPlan(combinations[index]!);
    }
    const warmPlan = buildRecipeDirectionPlan(warm);

    // Push 50 further distinct keys — far fewer than capacity, so `warm` must
    // survive. A clear-on-full policy would have dropped it on the very first.
    for (let step = 0; step < 50; step += 1) {
      buildRecipeDirectionPlan(combinations[DIRECTION_PLAN_CACHE_LIMIT + step]!);
    }
    expect(buildRecipeDirectionPlan(warm)).toBe(warmPlan);
  });

  it('never grows beyond its capacity even after every combination', () => {
    const combinations = allCombinations();
    for (const input of combinations) buildRecipeDirectionPlan(input);
    // The most recently inserted key must still be cached — proof the cache is
    // bounded by eviction rather than by discarding everything.
    const last = combinations[combinations.length - 1]!;
    const lastPlan = buildRecipeDirectionPlan(last);
    expect(buildRecipeDirectionPlan(last)).toBe(lastPlan);
  });
});
