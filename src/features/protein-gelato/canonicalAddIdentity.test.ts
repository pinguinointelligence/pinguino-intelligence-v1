import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { canonicalToolboxComposition } from '@/data/ingredients/canonicalToolboxCompositions';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { approvedFormulationToolboxIngredients } from '@/features/formulation/formulate';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';

/**
 * §7 / §11 — ONE IDENTITY → ONE COMPOSITION.
 *
 * The Engine must use the same composition for the same canonical article no
 * matter how the line entered the recipe. Before this was enforced, a toolbox
 * candidate that the SOLVER added carried the engine REFERENCE payload while
 * the same product already PRESENT in the draft carried the canonical Mapper
 * row — and `engine/pac.ts` prefers a stored `pac_value`, so the two froze
 * differently:
 *
 *   reference  Milk 3.5 %                    pod null   pac null   conf 85  unverified
 *   canonical  MILK 3.5% · Milk · Chilled    pod 0.752  pac 5.285  conf 98  verified
 *
 * That divergence also broke the SERVED app. `technicalFactsMatch` compares
 * every technical fact of a line against the product's frozen server facts to
 * 1e-7, so a reference-payload line can never match its own resolved
 * ProductBehavior snapshot: the served Preview was refused as
 * `behavior_snapshot_missing_or_unresolved` even though the snapshot had
 * resolved perfectly well.
 */

const NONE = { byLineId: {} } as const;
const AT = '2026-08-23T12:00:00.000Z';

const proteinDraft = (sweetness: -2 | -1 | 0 | 1 | 2, temperatureC: -11 | -12 | -13): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'protein',
    servingModeId: `temp_minus_${Math.abs(temperatureC)}` as
      | 'temp_minus_11'
      | 'temp_minus_12'
      | 'temp_minus_13',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1000,
  });
  return {
    items: starter.items,
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: temperatureC,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: {
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      formulation_strategy: 'optimal',
      direction_targets_active: true,
      direction_targets: { sweetness, softness: 0, creaminess: 0, flavor: 0 },
    },
  };
};

describe('§7 — the approved toolbox payload list ends with the canonical Mapper identity', () => {
  it.each([
    'milk_3_5',
    'cream_30',
    'smp',
    'sucrose',
    'dextrose',
    'inulin',
    'water',
    'tara_gum',
  ])('%s hydrates to its Mapper row', (toolboxId) => {
    const payloads = approvedFormulationToolboxIngredients(toolboxId);
    expect(payloads.length).toBeGreaterThanOrEqual(2);
    const canonical = canonicalToolboxComposition(toolboxId)!;
    expect(canonical).toBeDefined();

    const executable = payloads.at(-1)!;
    // The executable payload IS the Mapper row, field for field.
    expect(executable.name).toBe(canonical.displayName);
    expect(canonicalIngredientId(executable)).toBe(canonical.mapperId);
    expect(executable.pod_value).toBe(canonical.pod_value);
    expect(executable.pac_value).toBe(canonical.pac_value);
    expect(executable.confidence_score).toBe(canonical.confidence_score);
    expect(executable.is_verified).toBe(canonical.verified);
    expect(executable.composition).toEqual(canonical.composition);

    // The historical reference payloads are RETAINED ahead of it, because the
    // Apply door re-authorizes an addition by fingerprinting it against this
    // same list. Dropping them would make previously-approved additions
    // unapprovable.
    expect(payloads[0]!.name).not.toBe(canonical.displayName);
  });
});

describe('§11 — a solver-ADDED line is identical to the same product already PRESENT', () => {
  it('Milk 3.5 % converges on both paths', () => {
    // PATH B: milk absent, the solver adds it (Protein −11 at Sweetness +2).
    const pathB = buildOptimizePreview(proteinDraft(2, -11), NONE, AT, {});
    expect(pathB.ok).toBe(true);
    if (!pathB.ok) return;
    const added = pathB.preview.proposedInput.items.find((item) =>
      canonicalIngredientId(item.ingredient) === 'PI-ING-000236',
    );
    expect(added, 'the solver adds Milk 3.5 % on this cell').toBeDefined();

    // PATH A: milk already present in the draft (the −13 starter carries it).
    const present = proteinDraft(0, -13).items.find((item) =>
      canonicalIngredientId(item.ingredient) === 'PI-ING-000236',
    );
    expect(present, 'the −13 starter carries Milk 3.5 %').toBeDefined();

    const a = present!.ingredient;
    const b = added!.ingredient;
    // Same article, same name, same physics inputs, same authority.
    expect(canonicalIngredientId(b)).toBe(canonicalIngredientId(a));
    expect(b.name).toBe(a.name);
    expect(b.pod_value).toBe(a.pod_value);
    expect(b.pac_value).toBe(a.pac_value);
    expect(b.confidence_score).toBe(a.confidence_score);
    expect(b.is_verified).toBe(a.is_verified);
    expect(b.composition).toEqual(a.composition);
    // And specifically NOT the reference payload's null freezing values.
    expect(b.pod_value).not.toBeNull();
    expect(b.pac_value).not.toBeNull();
  }, 900_000);

  it('no executable 0 g row and the batch still sums to target after a canonical ADD', () => {
    const input = proteinDraft(2, -11);
    const built = buildOptimizePreview(input, NONE, AT, {});
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const items = built.preview.proposedInput.items;
    expect(items.filter((item) => item.planned_grams <= 0)).toHaveLength(0);
    expect(items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
    expect(items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(1000);
    // The Preview's metrics describe the canonical candidate, not a reference one.
    const result = calculateRecipe(built.preview.proposedInput);
    expect(result.indicators.find((entry) => entry.key === 'pod')!.value).not.toBeNull();
  }, 900_000);
});

describe('§5 / §23 — hydration reports authority, it never invents it', () => {
  it('never upgrades an ESTIMATED Mapper product into a verified one', () => {
    // The canonical payload must carry the product's OWN authority. Raspberry
    // and Banana are `Estimated` in the Mapper, so their executable payload has
    // to stay unverified — hydration is a faithful copy of the row, never a
    // promotion. If this ever flips, "a Mapper row exists" would silently start
    // meaning "this product is trusted", which is exactly the fail-closed rule
    // the binding gate depends on.
    for (const toolboxId of ['raspberry', 'banana']) {
      const canonical = canonicalToolboxComposition(toolboxId)!;
      // Both are `Estimated` in the Mapper, and the generated authority says so
      // rather than rounding it up.
      expect(canonical.verified).toBe(false);
      // And the fail-closed rule is stronger than merely reporting it: neither
      // is an addable formulation candidate at all, so no amount of canonical
      // hydration can turn "a Mapper row exists" into "the solver may add this".
      expect(approvedFormulationToolboxIngredients(toolboxId)).toEqual([]);
    }
  });

  it('a VERIFIED ordinary product keeps its verified authority', () => {
    const canonical = canonicalToolboxComposition('milk_3_5')!;
    expect(canonical.verified).toBe(true);
    const executable = approvedFormulationToolboxIngredients('milk_3_5').at(-1)!;
    expect(executable.is_verified).toBe(true);
    expect(executable.source_type).toBe('verified_db');
    expect(executable.confidence_score).toBe(98);
  });

  it('hydration never invents a composition the Mapper does not carry', () => {
    // Every hydrated field must be traceable to the generated Mapper authority;
    // nothing may be synthesised to make a product look usable.
    for (const toolboxId of ['milk_3_5', 'cream_30', 'smp', 'tara_gum', 'inulin']) {
      const canonical = canonicalToolboxComposition(toolboxId)!;
      const executable = approvedFormulationToolboxIngredients(toolboxId).at(-1)!;
      expect(executable.composition).toEqual(canonical.composition);
      expect(executable.pod_value).toBe(canonical.pod_value);
      expect(executable.pac_value).toBe(canonical.pac_value);
      expect(executable.cost_per_kg).toBe(canonical.cost_per_kg);
    }
  });
});
