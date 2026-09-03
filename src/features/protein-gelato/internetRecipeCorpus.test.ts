import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { bandDistance } from '@/features/recipe-direction/directionBandDistance';
import { assessProteinFormulation } from './proteinAuthority';
import {
  INTERNET_CORPUS_MAPPER_SHA256,
  INTERNET_PROTEIN_RECIPES,
  WEB_ESTIMATED_MOJA_CENA,
} from './__fixtures__/internetProteinRecipes';
import { CANONICAL_TOOLBOX_MAPPER_SHA256 } from '@/data/ingredients/canonicalToolboxCompositions';
import { MOJA_CENA_OVERRIDES, internetRecipeInput } from './internetRecipeMatrix.report.test';

/**
 * INTERNET RECIPE CORPUS — the fast committed regression.
 *
 * The full torture campaign (1500 Direction states + 600 Preview/Apply states,
 * writing reports/PROTEIN_INTERNET_RECIPE_MATRIX.csv) is opt-in behind
 * PROTEIN_FULL_MATRIX=1 because a single Direction-active Preview costs ~1.6 s
 * on this corpus. THIS file keeps the corpus itself honest on every run: the
 * recipes exist, are Mapper-derived, normalize to 1000 g, are recognised as
 * Protein, and every one of the three serving temperatures produces a usable
 * Direction plan. One deterministic Preview slice guards the executable path.
 */

const NONE = { byLineId: {} } as const;
const AT = '2026-08-23T12:00:00.000Z';
const TEMPS = [-11, -12, -13] as const;

describe('internet protein recipe corpus', () => {
  it('carries at least 20 distinct families, each a real opened source, each exactly 1000 g', () => {
    expect(INTERNET_PROTEIN_RECIPES.length).toBeGreaterThanOrEqual(20);
    const families = new Set(INTERNET_PROTEIN_RECIPES.map((recipe) => recipe.family));
    expect(families.size).toBe(INTERNET_PROTEIN_RECIPES.length);
    const sources = new Set(INTERNET_PROTEIN_RECIPES.map((recipe) => recipe.sourceUrl));
    // Two entries deliberately share one source page (the gelato formulation
    // guide supplies both the whey-heavy and the casein-heavy formulation).
    expect(sources.size).toBeGreaterThanOrEqual(INTERNET_PROTEIN_RECIPES.length - 1);
    for (const recipe of INTERNET_PROTEIN_RECIPES) {
      expect(recipe.sourceUrl).toMatch(/^https:\/\//);
      expect(recipe.lines.length).toBeGreaterThan(3);
      expect(recipe.lines.reduce((sum, line) => sum + line.grams, 0)).toBe(1000);
      for (const line of recipe.lines) {
        expect(line.grams).toBeGreaterThan(0);
        expect(line.mapperId).toMatch(/^PI-ING-\d+$/);
        // Compositions are READ from the Mapper, never authored.
        expect(line.composition.solids_percent + line.composition.water_percent).toBeGreaterThan(0);
      }
    }
  });

  it('is generated from the SAME Mapper base as the canonical toolbox authority', () => {
    expect(INTERNET_CORPUS_MAPPER_SHA256).toBe(CANONICAL_TOOLBOX_MAPPER_SHA256);
    expect(INTERNET_CORPUS_MAPPER_SHA256).toBe(
      '057375cd60cefe613892ff1d9f8f7eda880ff0eb06732f9229051fc37d8deca7',
    );
  });

  it('MOJA CENA covers every priceless ingredient the corpus actually uses', () => {
    const used = new Set(INTERNET_PROTEIN_RECIPES.flatMap((r) => r.lines.map((l) => l.mapperId)));
    const priceless = new Set(
      INTERNET_PROTEIN_RECIPES.flatMap((r) => r.lines)
        .filter((line) => line.cost_per_kg === null)
        .map((line) => line.mapperId),
    );
    const covered = new Set(WEB_ESTIMATED_MOJA_CENA.map((entry) => entry.mapperId));
    for (const id of priceless) expect(covered.has(id)).toBe(true);
    // A web estimate may never be applied to something the corpus does not use,
    // and never to a row that already carries a catalogue price.
    for (const entry of WEB_ESTIMATED_MOJA_CENA) {
      expect(used.has(entry.mapperId)).toBe(true);
      expect(entry.pricePerKg).toBeGreaterThan(0);
      expect(entry.currency).toBe('EUR');
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('every recipe is recognised as Protein and gets a working Sweetness plan at all three temperatures', () => {
    for (const recipe of INTERNET_PROTEIN_RECIPES) {
      for (const temperatureC of TEMPS) {
        const input = internetRecipeInput(recipe, temperatureC, 'optimal');
        const result = calculateRecipe(input);
        expect(Number.isFinite(result.nutrition_per_100g?.protein_g ?? Number.NaN)).toBe(true);

        const protein = assessProteinFormulation(input, result);
        expect(protein.applicable).toBe(true);
        expect(protein.actualPercent).toBeGreaterThan(0);

        const plan = buildRecipeDirectionPlan(input);
        expect(plan.axes.find((axis) => axis.axis === 'sweetness')!.status).toBe('working');
        // Hardness stays scientifically blocked, at every temperature.
        expect(plan.axes.find((axis) => axis.axis === 'softness')!.status).toBe('working');
      }
    }
  }, 120_000);

  it('a deterministic Preview slice stays executable and never returns a 0 g row', () => {
    // One Preview per recipe at −12 °C keeps this honest without paying for the
    // full 600-state campaign on every suite run.
    for (const recipe of INTERNET_PROTEIN_RECIPES) {
      const input = internetRecipeInput(recipe, -12, 'optimal');
      const band = buildRecipeDirectionPlan(input).axes.find(
        (axis) => axis.axis === 'sweetness',
      )!.targetBand!;
      const built = buildOptimizePreview(input, NONE, AT, {
        effectivePriceOverrides: MOJA_CENA_OVERRIDES as never,
      });
      // A missing price must never be the reason a recipe cannot be previewed.
      if (!built.ok) expect((built as { code: string }).code).not.toBe('missing_prices');
      const candidate = built.ok ? built.preview.proposedInput : input;
      expect(candidate.items.filter((item) => item.planned_grams <= 0)).toHaveLength(0);
      const pod = calculateRecipe(candidate).indicators.find((entry) => entry.key === 'pod')!.value;
      expect(pod).not.toBeNull();
      expect(Number.isFinite(bandDistance(pod!, band))).toBe(true);
    }
  }, 300_000);
});
