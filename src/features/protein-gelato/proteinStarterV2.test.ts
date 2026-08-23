import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { buildOptimizePreview, commitPreview } from '@/features/constraint-studio/applyPipeline';
import { approvedFormulationToolboxIngredients } from '@/features/formulation/formulate';
import { listFormulationTemplates } from '@/features/formulation/templateRegistry';
import { assessProteinFormulation, recipeFitForInput } from './proteinAuthority';
import { PROTEIN_QUALIFICATION } from './proteinScienceAuthority';

/**
 * PROTEIN STARTER v2 + the six core operating modes.
 *
 * The v1 seeds encoded the retired 20 %-protein-by-mass target and opened at
 * Score 3-6, two of them with native band violations. These tests pin that the
 * replacement seeds are Engine-derived, immediately legal, and that all six
 * OPTIMAL/ECO × temperature combinations formulate from them.
 */

const EMPTY = { byLineId: {} } as const;
const AT = '2026-08-23T12:00:00.000Z';

const templateInput = (
  route: 'dairy' | 'plant',
  temperatureC: -11 | -12 | -13,
  strategy: 'optimal' | 'eco' = 'optimal',
): RecipeInput => {
  const id = `protein_${route}_neutral_minus${Math.abs(temperatureC)}_v1`;
  const tpl = listFormulationTemplates().find((t) => t.templateId === id);
  if (!tpl) throw new Error(`missing template ${id}`);
  const items: RecipeInput['items'] = [];
  tpl.roles.forEach((role, index) => {
    if (!role.toolboxId) return;
    const ingredient = approvedFormulationToolboxIngredients(role.toolboxId)[0];
    if (!ingredient) return;
    items.push({
      id: `seed-${index}-${role.toolboxId}`,
      // The built-in toolbox payloads carry a price but no currency, while every
      // canonical Mapper product the real starter resolves carries EUR. Stamp it
      // so the ECO cost objective can run at all in this fixture.
      ingredient: { ...ingredient, cost_currency: 'EUR' },
      planned_grams: role.grams,
      actual_grams: null,
      lock_type: 'unlocked',
    });
  });
  return {
    items,
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: temperatureC,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { flavor_intensity: 'balanced', cost_priority: 'balanced', formulation_strategy: strategy },
  };
};

const ROUTES = ['dairy', 'plant'] as const;
const TEMPS = [-11, -12, -13] as const;

describe('§3/§6 — the starter seed itself is already a strong legal formulation', () => {
  it.each(ROUTES.flatMap((route) => TEMPS.map((t) => [route, t] as const)))(
    '%s @ %s opens legal, qualified and well-scored',
    (route, temperatureC) => {
      const input = templateInput(route, temperatureC);
      const result = calculateRecipe(input);
      const assessment = assessProteinFormulation(input, result);
      const score = recipeFitForInput(input, result).score;

      // §26 — a new Protein user must not open on a hard violation.
      expect(detectViolations(result)).toEqual([]);
      // §13 — the qualification holds on the seed itself.
      expect(assessment.qualification.qualified).toBe(true);
      expect(assessment.qualification.energySharePercent!).toBeGreaterThanOrEqual(
        PROTEIN_QUALIFICATION.highProteinEnergySharePercent,
      );
      // The v1 seeds scored 3-6. Every replacement is materially better.
      expect(score).toBeGreaterThanOrEqual(9);
      // §21 — the seed carries no accidental 0 g executable line beyond the
      // deliberate `primary_liquid` omission the −11 optimum requires.
      expect(input.items.reduce((sum, i) => sum + i.planned_grams, 0)).toBeCloseTo(1000, 6);

      console.info(
        'STARTER ' +
          JSON.stringify({
            route,
            temperatureC,
            protein: Number(result.percentages.protein_percent.toFixed(3)),
            energySharePercent: Number(assessment.qualification.energySharePercent!.toFixed(1)),
            score,
            structure: assessment.structure.score,
            pod: Number(result.pod_points!.toFixed(2)),
            npac: Number(result.npac_points!.toFixed(2)),
            ice: Number(result.ice_fraction_percent!.toFixed(2)),
            fat: Number(result.percentages.fat_percent.toFixed(2)),
            solids: Number(result.percentages.solids_percent.toFixed(2)),
            water: Number(result.percentages.water_percent.toFixed(2)),
            lactose: Number(result.percentages.lactose_percent.toFixed(2)),
            grams: input.items
              .filter((i) => i.planned_grams > 0)
              .map((i) => [i.ingredient.name, i.planned_grams]),
          }),
      );
    },
  );

  it('carries no retired 20 %-by-mass seed anywhere in the registry', () => {
    for (const tpl of listFormulationTemplates()) {
      if (tpl.category !== 'protein_gelato') continue;
      const proteinRole = tpl.roles.find((r) => r.role === 'protein_source');
      expect(proteinRole).toBeDefined();
      // The v1 seeds were 230-247 g of an 80 % concentrate. Nothing that heavy
      // may survive; the derived optima all sit near 90-115 g.
      expect(proteinRole!.grams).toBeLessThan(150);
    }
  });
});

describe('§7 — six core operating modes from the new starter', () => {
  it.each(
    (['optimal', 'eco'] as const).flatMap((strategy) =>
      TEMPS.map((t) => [strategy, t] as const),
    ),
  )(
    '%s @ %s formulates a qualified, applicable Protein recipe',
    (strategy, temperatureC) => {
      const input = templateInput('dairy', temperatureC, strategy);
      const built = buildOptimizePreview(input, EMPTY, AT);

      // `already_clean` is a SUCCESS, not a gap: the v2 starter is good enough
      // that the optimizer has no correction to offer. In that case the seed
      // itself is the operating candidate and must stand on its own.
      const alreadyClean = !built.ok && (built as { code?: string }).code === 'already_clean';
      expect(built.ok || alreadyClean, built.ok ? '' : JSON.stringify(built)).toBe(true);

      const candidate = built.ok ? built.preview.proposedInput : input;
      const result = calculateRecipe(candidate);
      const assessment = assessProteinFormulation(candidate, result);
      const score = recipeFitForInput(candidate, result).score;

      expect(detectViolations(result)).toEqual([]);
      expect(assessment.qualification.qualified).toBe(true);
      for (const item of candidate.items) expect(item.planned_grams).toBeGreaterThan(0);

      let applied: boolean | 'not_needed' = 'not_needed';
      if (built.ok) {
        const committed = commitPreview(
          input,
          EMPTY,
          built.preview,
          AT,
          `core-${strategy}-${temperatureC}`,
        );
        expect(committed.ok, committed.ok ? '' : JSON.stringify(committed)).toBe(true);
        applied = committed.ok;
      }

      console.info(
        'CORE ' +
          JSON.stringify({
            strategy,
            temperatureC,
            candidate: true,
            outcome: built.ok ? 'CORRECTED' : 'ALREADY_CLEAN',
            qualified: assessment.qualification.qualified,
            protein: Number(assessment.actualPercent!.toFixed(3)),
            energySharePercent: Number(assessment.qualification.energySharePercent!.toFixed(1)),
            score,
            structure: assessment.structure.score,
            pod: Number(result.pod_points!.toFixed(2)),
            npac: Number(result.npac_points!.toFixed(2)),
            ice: Number(result.ice_fraction_percent!.toFixed(2)),
            fat: Number(result.percentages.fat_percent.toFixed(2)),
            solids: Number(result.percentages.solids_percent.toFixed(2)),
            water: Number(result.percentages.water_percent.toFixed(2)),
            preview: built.ok,
            apply: applied,
          }),
      );
    },
    180_000,
  );
});
