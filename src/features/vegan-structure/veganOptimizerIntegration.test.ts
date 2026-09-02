/// <reference types="node" />
/**
 * VEGAN ENGINE v2 — optimizer and Rescue integration contract (§12, §17).
 *
 * The derived structure may act as a TIE-BREAK and nothing more. These tests
 * pin both halves of that promise: the semantics of the comparator at the seam,
 * and the fact that the seam itself is subordinate to the technical score and
 * to the Direction evidence rule.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineIngredient, IngredientCategory, RecipeInput } from '@/engine';
import { findVerifiedVeganFormulationCandidate } from '@/data/ingredients/verifiedVeganToolbox';
import { compareVeganStructuralCandidates } from './veganStructureAssessment';

const applyPipelineSource = readFileSync(
  join(process.cwd(), 'src/features/constraint-studio/applyPipeline.ts'),
  'utf8',
);
const rescueSource = readFileSync(
  join(process.cwd(), 'src/features/constraint-studio/rescueIngredientAdvisor.ts'),
  'utf8',
);

const ZERO = {
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
  sugar_percent: 0,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 0,
};

const verified = (
  id: string,
  name: string,
  category: IngredientCategory,
  composition: Partial<typeof ZERO>,
  pod = 0,
  pac = 0,
): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  private_product_id: null,
  identity_provenance: 'mapper',
  name,
  category,
  composition: { ...ZERO, ...composition },
  pod_value: pod,
  pac_value: pac,
  npac_value: null,
  de_value: null,
  cost_per_kg: null,
  confidence_score: 95,
  source_type: 'verified_db',
  is_verified: true,
  flags: {
    vegan_eligibility: 'VEGAN_VERIFIED',
    vegan_eligibility_reasons: ['verified_mapper_vegan_true'],
  },
});

const WATER = verified('water', 'Water', 'water', { water_percent: 100 });
const SUCROSE = verified(
  'sucrose',
  'Sucrose',
  'sugar',
  {
    solids_percent: 100,
    carbohydrate_percent: 100,
    sugar_percent: 100,
    sucrose_percent: 100,
    kcal_per_100g: 400,
  },
  100,
  100,
);
const TARA = verified('tara_gum', 'Tara gum', 'stabilizer', {
  water_percent: 12,
  solids_percent: 88,
  carbohydrate_percent: 80,
  fiber_percent: 80,
  kcal_per_100g: 200,
});
const COCONUT_OIL = findVerifiedVeganFormulationCandidate('PI-ING-000163')!;
const SUNFLOWER_OIL = findVerifiedVeganFormulationCandidate('PI-ING-000305')!;

const line = (id: string, ingredient: EngineIngredient, grams: number) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

const vegan = (fat: EngineIngredient): RecipeInput => ({
  mode: 'classic',
  category: 'vegan_gelato',
  target_temperature_c: -13,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [
    line('l-water', WATER, 736),
    line('l-sucrose', SUCROSE, 180),
    line('l-tara', TARA, 4),
    line('l-fat', fat, 80),
  ],
});

const STRUCTURALLY_STRONG = vegan(COCONUT_OIL);
const STRUCTURALLY_WEAKER = vegan(SUNFLOWER_OIL);
const GELATO: RecipeInput = { ...STRUCTURALLY_STRONG, category: 'milk_gelato' };

describe('§12 — the optimizer tie-break is subordinate to the technical score', () => {
  /** Exactly the comparator expression used in `applyPipeline.ts`. */
  const sortAccepted = (
    accepted: { executableInput: RecipeInput; score: number }[],
  ): { executableInput: RecipeInput; score: number }[] =>
    [...accepted].sort(
      (left, right) =>
        right.score - left.score ||
        compareVeganStructuralCandidates(left.executableInput, right.executableInput),
    );

  it('never lets structure outrank a higher-scoring candidate', () => {
    const ranked = sortAccepted([
      { executableInput: STRUCTURALLY_STRONG, score: 7 },
      { executableInput: STRUCTURALLY_WEAKER, score: 8 },
    ]);
    expect(ranked[0]!.score).toBe(8);
    expect(ranked[0]!.executableInput).toBe(STRUCTURALLY_WEAKER);
  });

  it('prefers the structurally stronger candidate ONLY at an exact score tie', () => {
    const ranked = sortAccepted([
      { executableInput: STRUCTURALLY_WEAKER, score: 8 },
      { executableInput: STRUCTURALLY_STRONG, score: 8 },
    ]);
    expect(ranked[0]!.executableInput).toBe(STRUCTURALLY_STRONG);
  });

  it('is completely inert outside the Vegan profile (stable order preserved)', () => {
    const first = { executableInput: GELATO, score: 8 };
    const second = { executableInput: { ...GELATO }, score: 8 };
    expect(sortAccepted([first, second])).toEqual([first, second]);
    expect(compareVeganStructuralCandidates(GELATO, GELATO)).toBe(0);
  });

  it('is wired at the accepted-candidate seam, after the score, and nowhere else', () => {
    expect(applyPipelineSource).toMatch(
      /right\.score - left\.score \|\|\s*\n\s*compareVeganStructuralCandidates\(/,
    );
    // exactly one call site in the optimizer
    expect(applyPipelineSource.match(/compareVeganStructuralCandidates\(/g)).toHaveLength(1);
  });
});

describe('§17 — the Rescue tie-break never widens eligibility or adds an ingredient', () => {
  it('fires only on an exact tie of the trigger-appropriate primary measure', () => {
    // Direction trigger → tie on reached axes AND remaining distance.
    expect(rescueSource).toMatch(
      /rescue\.reachedAxisCount === best\.rescue\.reachedAxisCount &&\s*\n\s*Math\.abs\(rescue\.severityPoints - best\.rescue\.severityPoints\) <= 1e-9/,
    );
    // Operational trigger → tie on hard-metric count AND engine severity.
    expect(rescueSource).toMatch(
      /rescue\.hardMetricCount === best\.rescue\.hardMetricCount &&\s*\n\s*Math\.abs\(rescue\.engineSeverityPoints - best\.rescue\.engineSeverityPoints\) <= 1e-9/,
    );
    // and the structural comparison is reached ONLY through that tie.
    expect(rescueSource).toMatch(/tieOnPrimary &&\s*\n\s*compareVeganStructuralCandidates\(/);
    // exactly ONE call site in the advisor — the tie-break, nowhere else
    expect(rescueSource.match(/compareVeganStructuralCandidates\(/g)).toHaveLength(1);
  });

  it('leaves the material-improvement evidence rule untouched', () => {
    expect(rescueSource).toMatch(/export function isMaterialRescueImprovement\(/);
    expect(rescueSource).toMatch(/MATERIAL_RELATIVE_SEVERITY_GAIN = 0\.5/);
    expect(rescueSource).toMatch(/MIN_ABSOLUTE_SEVERITY_GAIN = 0\.2/);
  });

  it('still never auto-adds an ingredient — the advisor only simulates', () => {
    expect(rescueSource).toMatch(/RESCUE_LINE_PREFIX = 'rescue-sim:'/);
    expect(rescueSource).toMatch(/MAX_RESCUE_CANDIDATES = 4/);
  });
});
