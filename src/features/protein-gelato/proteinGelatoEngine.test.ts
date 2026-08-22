import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findVerifiedProteinFormulationCandidate } from '@/data/ingredients/verifiedProteinToolbox';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  buildOptimizePreview,
  commitPreview,
} from '@/features/constraint-studio/applyPipeline';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { assessProteinFormulation, recipeFitForInput } from './proteinAuthority';
import { PROTEIN_EVIDENCE_WINDOW } from './proteinScienceAuthority';

/**
 * PROTEIN ENGINE v2 CONTRACT.
 *
 * REPLACES the v1 suite in this file. Every removed v1 test asserted the
 * behaviour the owner explicitly ordered removed on 2026-08-22 — that the user
 * picks a protein percentage, that the Engine drives the recipe to it, and that
 * hitting it scores 10/10. Specifically retired, with the reason:
 *
 *   "builds native-safe Preview at T for 19/20/21 %"  — probed a USER TARGET.
 *   "reports the exact requested target"              — same.
 *   "frontier monotonicity for 25/30 %"               — guaranteed that a higher
 *                                                       REQUEST never returns
 *                                                       less protein; there is
 *                                                       no request any more.
 *   "fingerprints target-only changes"                — a target-only change is
 *                                                       no longer expressible.
 *
 * What is preserved verbatim: Main identity/ratio, Main unavailability, the
 * Main-over-batch hard conflict, the food-first Skyr preference and native
 * hard-safety. Those are profile contracts, not target contracts.
 */

const EMPTY = { byLineId: {} } as const;

/** No target argument exists any more — a Protein draft is just a Protein draft. */
const proteinDraft = (temperatureC: -11 | -12 | -13): RecipeInput => ({
  items: [
    {
      id: 'main-raspberry',
      ingredient: findDemoIngredient('raspberry')!,
      planned_grams: 100,
      actual_grams: null,
      lock_type: 'main',
    },
  ],
  mode: 'signature',
  category: 'protein_gelato',
  target_temperature_c: temperatureC,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: {
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
  },
});

describe('Protein Gelato v2 — protein % is an OUTPUT', () => {
  it('never reads a protein target, even when a legacy recipe still carries one', () => {
    const plain = proteinDraft(-12);
    const legacy: RecipeInput = {
      ...plain,
      goals: { ...plain.goals, target_protein_percent: 30 },
    };
    // The deprecated goal field is inert: identical composition ⇒ identical verdict.
    expect(assessProteinFormulation(legacy)).toEqual(assessProteinFormulation(plain));
  });

  for (const temperatureC of [-11, -12, -13] as const) {
    it(`formulates a claim-qualified, natively safe Protein recipe at ${temperatureC}°C`, () => {
      const input = proteinDraft(temperatureC);
      const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
      expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
      if (!built.ok) return;

      const proposed = built.preview.proposedInput;
      const result = calculateRecipe(proposed);
      const assessment = assessProteinFormulation(proposed, result);

      expect(detectViolations(result)).toEqual([]);
      expect(assessment.applicable).toBe(true);
      expect(assessment.hardSafe).toBe(true);
      // The one hard Protein rule: the product earns its own claim.
      expect(assessment.qualification.qualified).toBe(true);
      expect(assessment.qualification.energySharePercent).toBeGreaterThanOrEqual(20);
      // …and it does so WITHOUT leaving the window every controlled study
      // covers. The v1 engine put 20 % protein by mass in this slot.
      expect(assessment.actualPercent).toBeLessThanOrEqual(
        PROTEIN_EVIDENCE_WINDOW.evidenceCeilingPercent,
      );
      expect(built.preview.proteinFormulation?.applicable).toBe(true);

      const committed = commitPreview(
        input,
        EMPTY,
        built.preview,
        '2026-08-09T10:01:00.000Z',
        `protein-v2-${temperatureC}`,
      );
      expect(committed.ok, committed.ok ? '' : JSON.stringify(committed)).toBe(true);
    });
  }

  it('keeps the qualified candidate when ProductBehavior snapshots make the draft managed', () => {
    const input = proteinDraft(-12);
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z', {
      productBehaviorSnapshots: productBehaviorTestSnapshots(input),
    });
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    expect(assessProteinFormulation(built.preview.proposedInput)).toMatchObject({
      applicable: true,
      hardSafe: true,
    });
    expect(assessProteinFormulation(built.preview.proposedInput).qualification.qualified).toBe(true);
  });
});

describe('Protein Gelato v2 — more protein is not a better score', () => {
  /** Same batch, same lines — only the whey-concentrate/milk split moves. */
  const withProtein = (grams: number): RecipeInput => {
    const draft = proteinDraft(-12);
    return {
      ...draft,
      items: [
        ...draft.items,
        {
          id: 'user-milk',
          ingredient: findDemoIngredient('milk_3_5')!,
          planned_grams: 750 - grams,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'user-wpc',
          ingredient: findVerifiedProteinFormulationCandidate('PI-ING-000264')!,
          planned_grams: grams,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'user-sucrose',
          ingredient: findDemoIngredient('sucrose')!,
          planned_grams: 150,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ],
    };
  };

  it('scores a leaner qualified recipe at least as high as a protein-heavier one', () => {
    const lean = assessProteinFormulation(withProtein(90));
    const heavy = assessProteinFormulation(withProtein(220));
    expect(heavy.actualPercent!).toBeGreaterThan(lean.actualPercent!);
    // The v1 engine scored the heavier recipe higher (closer to a 20 % target).
    // v2 must never do that: excess protein above the claim only costs structure.
    expect(heavy.structure.score!).toBeLessThanOrEqual(lean.structure.score!);
  });

  it('charges the excess-protein penalty with an explicit, citable reason', () => {
    const heavy = assessProteinFormulation(withProtein(260));
    expect(heavy.structure.penalties.proteinExcess).toBeGreaterThan(0);
    expect(
      heavy.structure.warnings.some((warning) => warning.code === 'protein_excess_over_claim'),
    ).toBe(true);
  });

  it('is deterministic — the same input always yields the same verdict', () => {
    const input = withProtein(140);
    expect(assessProteinFormulation(input)).toEqual(assessProteinFormulation(input));
    expect(recipeFitForInput(input).score).toBe(recipeFitForInput(input).score);
  });
});

describe('Protein Gelato v2 — preserved profile contracts', () => {
  it('retains selected Skyr and uses its natural protein before added concentrate', () => {
    const highProtein = proteinDraft(-12);
    highProtein.items.push({
      id: 'user-skyr',
      ingredient: findVerifiedProteinFormulationCandidate('PI-ING-001395')!,
      planned_grams: 180,
      actual_grams: null,
      lock_type: 'unlocked',
    });
    const ordinaryMilk = proteinDraft(-12);
    ordinaryMilk.items.push({
      id: 'user-milk',
      ingredient: findDemoIngredient('milk_3_5')!,
      planned_grams: 180,
      actual_grams: null,
      lock_type: 'unlocked',
    });
    expect(calculateRecipe(highProtein).totals.protein_g).toBeGreaterThan(
      calculateRecipe(ordinaryMilk).totals.protein_g,
    );

    const highBuilt = buildOptimizePreview(highProtein, EMPTY, '2026-08-09T10:00:00.000Z');
    const lowBuilt = buildOptimizePreview(ordinaryMilk, EMPTY, '2026-08-09T10:00:00.000Z');
    expect(highBuilt.ok, highBuilt.ok ? '' : JSON.stringify(highBuilt)).toBe(true);
    expect(lowBuilt.ok, lowBuilt.ok ? '' : JSON.stringify(lowBuilt)).toBe(true);
    if (!highBuilt.ok || !lowBuilt.ok) return;

    const retainedSkyr = highBuilt.preview.proposedInput.items.find(
      (item) => item.id === 'user-skyr',
    );
    expect(retainedSkyr?.planned_grams).toBeGreaterThan(0);
    const wpc = (input: RecipeInput) =>
      input.items.find((item) => canonicalIngredientId(item.ingredient) === 'PI-ING-000264')
        ?.planned_grams ?? 0;
    expect(wpc(highBuilt.preview.proposedInput)).toBeLessThanOrEqual(
      wpc(lowBuilt.preview.proposedInput),
    );
    expect(
      assessProteinFormulation(highBuilt.preview.proposedInput).qualification.qualified,
    ).toBe(true);
  });

  it('maximizes the Main group without changing either identity or the 2:1 ratio', () => {
    const input = proteinDraft(-12);
    input.items = [
      {
        ...input.items[0]!,
        id: 'main-raspberry',
        planned_grams: 120,
        main_ratio_weight: 2,
      },
      {
        id: 'main-banana',
        ingredient: findDemoIngredient('banana')!,
        planned_grams: 60,
        actual_grams: null,
        lock_type: 'main',
        main_ratio_weight: 1,
      },
    ];
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const raspberry = built.preview.proposedInput.items.find(
      (item) => item.id === 'main-raspberry',
    );
    const banana = built.preview.proposedInput.items.find((item) => item.id === 'main-banana');
    expect(raspberry?.planned_grams).toBeGreaterThanOrEqual(120);
    expect(banana?.planned_grams).toBeGreaterThanOrEqual(60);
    expect((raspberry?.planned_grams ?? 0) / (banana?.planned_grams ?? 1)).toBe(2);
  });

  it('refuses to formulate when Protein Main is unavailable', () => {
    const input = proteinDraft(-12);
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z', {
      unavailableMainIngredientIds: ['raspberry'],
    });
    expect(built).toMatchObject({ ok: false, code: 'main_ingredient_unavailable' });
    expect(input.items[0]?.planned_grams).toBe(100);
  });

  it('returns an honest hard conflict when Main alone exceeds the batch', () => {
    const input = proteinDraft(-12);
    input.items = [{ ...input.items[0]!, planned_grams: 1200 }];
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
    expect(built).toMatchObject({ ok: false, code: 'main_ratio_conflict' });
    expect(input.items[0]?.planned_grams).toBe(1200);
  });

  it('keeps 0 g lines out of an executable Protein recipe', () => {
    const input = proteinDraft(-12);
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    for (const item of built.preview.proposedInput.items) {
      expect(item.planned_grams).toBeGreaterThan(0);
    }
  });
});
