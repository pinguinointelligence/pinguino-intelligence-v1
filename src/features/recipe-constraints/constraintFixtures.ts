/**
 * Deterministic constraint-layer fixtures — REAL demo-catalog compositions
 * (src/data/demoIngredients) and the REAL studio starter recipe (the
 * 'milk-base' demo preset, asserted fully in-band by the existing
 * demoScenario tests). No invented ingredient data, no external DB.
 */
import { DEMO_PRESETS } from '@/data/demoPresets';
import type { RecipeInput, RecipeItem } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';

/** The studio starter recipe (milk-base preset) as a fresh `RecipeInput`. */
export function starterMilkBase(): RecipeInput {
  const preset = DEMO_PRESETS.find((candidate) => candidate.id === 'milk-base');
  if (!preset) throw new Error('milk-base demo preset missing');
  // Fresh item objects so tests can never cross-contaminate the shared preset.
  const input = buildRecipeInput(preset);
  return { ...input, items: input.items.map((item) => ({ ...item })) };
}

/** Starter with one line's planned grams replaced (batch total follows). */
export function withGrams(input: RecipeInput, lineId: string, grams: number): RecipeInput {
  const items: RecipeItem[] = input.items.map((item) =>
    item.id === lineId ? { ...item, planned_grams: grams } : item,
  );
  return {
    ...input,
    items,
    target_batch_grams: items.reduce((sum, item) => sum + item.planned_grams, 0),
  };
}

/** Line id helper — the demo presets use `${presetId}:${ingredientId}`. */
export const starterLine = (ingredientId: string): string => `milk-base:${ingredientId}`;

/** Over-sweetened starter: sucrose raised far above the balanced 130 g so the
 * engine reports a genuine sweetness violation (asserted in the tests, not
 * assumed). */
export function overSweetStarter(sucroseGrams: number): RecipeInput {
  return withGrams(starterMilkBase(), starterLine('sucrose'), sucroseGrams);
}

/** Like `withGrams` but the target batch stays as-is — used to model a recipe
 * with genuine headroom below its target batch. */
export function withGramsKeepBatch(
  input: RecipeInput,
  lineId: string,
  grams: number,
): RecipeInput {
  return {
    ...input,
    items: input.items.map((item) =>
      item.id === lineId ? { ...item, planned_grams: grams } : item,
    ),
  };
}

/** The jim-beam demo preset pushed far out of balance (whiskey 300 g, sucrose
 * 300 g): alcohol plus sweetness violations that the bounded solver cannot
 * fully fix even released — the honest §18.5 fallback case. */
export function alcoholAndSugarHeavyJimBeam(): RecipeInput {
  const preset = DEMO_PRESETS.find((candidate) => candidate.id === 'jim-beam');
  if (!preset) throw new Error('jim-beam demo preset missing');
  const base = buildRecipeInput(preset);
  const items = base.items.map((item) =>
    item.id === 'jim-beam:whiskey_40'
      ? { ...item, planned_grams: 300 }
      : item.id === 'jim-beam:sucrose'
        ? { ...item, planned_grams: 300 }
        : { ...item },
  );
  return {
    ...base,
    items,
    target_batch_grams: items.reduce((sum, item) => sum + item.planned_grams, 0),
  };
}
