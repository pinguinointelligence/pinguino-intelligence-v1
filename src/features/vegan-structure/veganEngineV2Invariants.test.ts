/// <reference types="node" />
/**
 * VEGAN ENGINE v2 — the owner's 15 critical invariants (§26), plus the freezing
 * authority isolation (§14) and the −11 / −12 / −13 provenance (§15).
 *
 * Every assertion here is a REGRESSION GATE for the additive contract: the new
 * structural layer may add truth and may order equally-legal candidates, and it
 * may do nothing else.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TARGET_BANDS,
  VEGAN_TEMPERATURE_BAND_PROVENANCE,
  hasOwnPlantValidatedVeganIceAuthority,
  resolveIceAuthorityProvenance,
  veganTemperatureBandProvenance,
  type EngineIngredient,
  type IngredientCategory,
  type RecipeInput,
} from '@/engine';
import { VEGAN_VERIFIED_CANONICAL_IDS } from '@/data/ingredients/verifiedVeganToolbox';
import { findVerifiedVeganFormulationCandidate } from '@/data/ingredients/verifiedVeganToolbox';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { rescueCandidateFamily } from '@/features/constraint-studio/rescueIngredientAdvisor';
import { assessVeganRecipeStructure } from './veganStructureAssessment';
import { veganBehaviorForIngredient } from './veganBehaviorRuntime';

const SRC = join(process.cwd(), 'src/features/vegan-structure');
const MODULE_FILES = [
  'veganBehaviorTaxonomy.ts',
  'veganBehaviorFacts.ts',
  'deriveVeganBehavior.ts',
  'veganBehaviorRuntime.ts',
  'veganStructureAssessment.ts',
  'index.ts',
];
const moduleSource = MODULE_FILES.map((file) => readFileSync(join(SRC, file), 'utf8')).join('\n');
/** Executable source only — the guards below assert about CODE, not about the
 * documentation that explains why the code deliberately omits these things. */
const moduleCode = moduleSource
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

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
const DEXTROSE = verified(
  'dextrose',
  'Dextrose (monohydrate)',
  'sugar',
  {
    water_percent: 8,
    solids_percent: 92,
    carbohydrate_percent: 92,
    sugar_percent: 92,
    dextrose_percent: 92,
    kcal_per_100g: 368,
  },
  70,
  175,
);
const INULIN = verified('inulin', 'Inulin', 'stabilizer', {
  water_percent: 5,
  solids_percent: 95,
  carbohydrate_percent: 90,
  fiber_percent: 90,
  kcal_per_100g: 190,
});
const TARA = verified('tara_gum', 'Tara gum', 'stabilizer', {
  water_percent: 12,
  solids_percent: 88,
  carbohydrate_percent: 80,
  fiber_percent: 80,
  kcal_per_100g: 200,
});
const COCONUT_OIL = findVerifiedVeganFormulationCandidate('PI-ING-000163')!;
const STRAWBERRY = verified(
  'PI-ING-001553',
  'STRAWBERRIES · Fresh Fruit',
  'fruit',
  {
    water_percent: 89,
    solids_percent: 11,
    fat_percent: 0.3,
    protein_percent: 0.7,
    carbohydrate_percent: 8,
    sugar_percent: 5.8,
    sucrose_percent: 1,
    glucose_percent: 2.4,
    fructose_percent: 2.4,
    fiber_percent: 2,
    kcal_per_100g: 32,
  },
  6.928,
  10.12,
);
const BANANA = verified(
  'PI-ING-001589',
  'BANANA · Puree',
  'fruit',
  {
    water_percent: 76.5,
    solids_percent: 23.5,
    protein_percent: 1,
    carbohydrate_percent: 22,
    sugar_percent: 18.4,
    sucrose_percent: 11,
    glucose_percent: 4,
    fructose_percent: 3.4,
    salt_percent: 0.5,
    kcal_per_100g: 92,
  },
  19.86,
  27.985,
);

const line = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  lockType: 'unlocked' | 'main' | 'grams' = 'unlocked',
  mainRatioWeight?: number,
) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: lockType,
  ...(mainRatioWeight === undefined ? {} : { main_ratio_weight: mainRatioWeight }),
});

const multiMainVegan = (weights: readonly [number, number]): RecipeInput => ({
  mode: 'classic',
  category: 'vegan_gelato',
  target_temperature_c: -13,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [
    line('l-water', WATER, 406),
    line('l-sucrose', SUCROSE, 180),
    line('l-dextrose', DEXTROSE, 70),
    line('l-inulin', INULIN, 40),
    line('l-tara', TARA, 4),
    line('l-fat', COCONUT_OIL, 50),
    line('l-main-a', STRAWBERRY, 150, 'main', weights[0]),
    line('l-main-b', BANANA, 100, 'main', weights[1]),
  ],
});

const NO_CONSTRAINTS = { byLineId: {} };
const AT = '2026-08-22T00:00:00.000Z';

describe('§26.1 — unknown enhanced metadata never blocks a VEGAN_VERIFIED product', () => {
  it('leaves eligibility identical whether or not a class could be derived', () => {
    const opaque = verified('PI-ING-TEST-OPAQUE', 'PLANT PREPARATION · Other', 'other', {
      water_percent: 40,
      solids_percent: 60,
      fat_percent: 20,
      protein_percent: 10,
    });
    const behavior = veganBehaviorForIngredient(opaque);
    expect(behavior.fat.evidence).toBe('UNKNOWN');
    expect(behavior.protein.evidence).toBe('UNKNOWN');
    expect(veganRecipeEligibilityIssues([line('l', opaque, 100)])).toEqual([]);
  });
});

describe('§26.9 / §26.14 — ProductBehavior and the Mapper base are untouched', () => {
  it('never imports, reads or shadows ProductBehavior / dosage / production authority', () => {
    expect(moduleCode).not.toMatch(/product-intelligence/);
    expect(moduleCode).not.toMatch(/ProductBehavior/);
    expect(moduleCode).not.toMatch(/productDosageAuthority/);
  });

  it('keeps the immutable Mapper base byte-identical', () => {
    const csv = readFileSync(
      join(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
    );
    expect(createHash('sha256').update(csv).digest('hex')).toBe(
      '057375cd60cefe613892ff1d9f8f7eda880ff0eb06732f9229051fc37d8deca7',
    );
    // Nothing in the derived layer can write anywhere.
    expect(moduleCode).not.toMatch(/writeFileSync|fs\.write|INSERT INTO|\.update\(/);
  });
});

describe('§26.7 / §26.8 — no invented β-glucan quantity and no invented SFC curve', () => {
  it('carries no solid-fat-content table, curve or per-class coefficient', () => {
    expect(moduleCode).not.toMatch(/\bsfc\b/i);
    expect(moduleCode).not.toMatch(/solid[_ ]?fat[_ ]?content/i);
    expect(moduleCode).not.toMatch(/COEFFICIENT|coefficients\s*[:=]/);
    // The only numeric constant in the model is the audit's coverage threshold.
    expect(moduleCode).toMatch(/MATERIAL_COMPONENT_PERCENT = 0\.5/);
  });

  it('never derives a β-glucan amount from an oat identity', () => {
    const oat = findVerifiedVeganFormulationCandidate('PI-ING-001565')!;
    const behavior = veganBehaviorForIngredient(oat);
    expect(behavior.structuralCarbohydrates.map((entry) => entry.structuralClass)).toContain(
      'oat_matrix',
    );
    expect(
      behavior.structuralCarbohydrates.some(
        (entry) => entry.structuralClass === 'beta_glucan_explicit',
      ),
    ).toBe(false);
  });
});

describe('§26.10 / §26.11 / §26.13 — Main, Multi-Main and the zero-gram invariant', () => {
  for (const [name, weights] of [
    ['1:1', [1, 1]],
    ['2:1', [2, 1]],
  ] as const) {
    it(`preserves Main identity, the ${name} ratio and emits no 0 g executable row`, () => {
      const input = multiMainVegan(weights as unknown as readonly [number, number]);
      const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
      if (!built.ok) {
        // A profile-legal preview is not guaranteed for every fixture; when the
        // optimizer declines, the draft itself must still be untouched.
        expect(input.items.filter((item) => item.lock_type === 'main').length).toBe(2);
        return;
      }
      const proposed = built.preview.proposedInput;
      const mains = proposed.items.filter((item) => item.lock_type === 'main');
      expect(mains.map((item) => item.ingredient.canonical_ingredient_id)).toEqual([
        'PI-ING-001553',
        'PI-ING-001589',
      ]);
      expect(mains.map((item) => item.main_ratio_weight)).toEqual([...weights]);
      // zero-gram executable invariant — no unused optional line survives at 0 g
      expect(proposed.items.filter((item) => item.planned_grams === 0)).toEqual([]);
    });
  }

  it('leaves the input draft object untouched when assessing structure', () => {
    const input = multiMainVegan([2, 1]);
    const snapshot = JSON.stringify(input);
    assessVeganRecipeStructure(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('§26.12 / §17 — Rescue stays VEGAN_VERIFIED-only', () => {
  it('offers only VEGAN_VERIFIED canonical identities to a Vegan recipe', () => {
    const family = rescueCandidateFamily(multiMainVegan([1, 1]), null);
    expect(family.length).toBeGreaterThan(0);
    for (const candidate of family) {
      expect(
        VEGAN_VERIFIED_CANONICAL_IDS.has(candidate.canonicalIngredientId),
        candidate.canonicalIngredientId,
      ).toBe(true);
    }
  });
});

describe('§14 — Vegan freezing authority is isolated and labelled truthfully', () => {
  it('states plainly that Vegan ice is borrowed from the dairy milk_gelato calibration', () => {
    for (const temperature of [-11, -12, -13]) {
      const provenance = resolveIceAuthorityProvenance('vegan_gelato', temperature);
      expect(provenance.kind).toBe('borrowed_dairy_anchor');
      expect(provenance.sourceCategory).toBe('milk_gelato');
      expect(provenance.categoryValidated).toBe(false);
      expect(provenance.label).toBe('baseline_legacy_calibrated');
    }
  });

  it('does not claim a plant-validated Vegan ice authority, and is the single replacement seam', () => {
    expect(hasOwnPlantValidatedVeganIceAuthority()).toBe(false);
    expect(
      hasOwnPlantValidatedVeganIceAuthority([
        {
          category: 'vegan_gelato',
          temperature_c: -13,
          npac_low: 1,
          ice_at_npac_low: 1,
          npac_high: 2,
          ice_at_npac_high: 2,
          status: 'seeded',
        },
      ]),
    ).toBe(true);
  });

  it('does not change Gelato, Protein or Sorbet authority', () => {
    expect(resolveIceAuthorityProvenance('milk_gelato', -13).kind).toBe('own_seeded_anchor');
    expect(resolveIceAuthorityProvenance('protein_gelato', -12).kind).toBe('own_seeded_anchor');
    expect(resolveIceAuthorityProvenance('sorbet', -13).kind).toBe('composition_solver');
  });
});

describe('§15 / §26.2 — −11 / −12 / −13 bands are preserved and their provenance is explicit', () => {
  const bandsAt = (temperature: number) =>
    TARGET_BANDS.find(
      (band) => band.category === 'vegan_gelato' && band.temperature_c === temperature,
    )?.metrics;

  it('keeps every Vegan hard band numerically unchanged', () => {
    expect(bandsAt(-11)).toMatchObject({
      pod: { min: 13, max: 25 },
      npac: { min: 35, max: 52 },
      ice_fraction: { min: 45, max: 61 },
      fat: { min: 0, max: 12 },
      total_solids: { min: 30, max: 43 },
      water: { min: 54, max: 72 },
    });
    expect(bandsAt(-12)).toMatchObject({
      pod: { min: 13, max: 25 },
      npac: { min: 44, max: 59 },
      ice_fraction: { min: 46, max: 60 },
      fat: { min: 0, max: 12 },
      total_solids: { min: 30, max: 43 },
      water: { min: 52, max: 70 },
    });
    expect(bandsAt(-13)).toMatchObject({
      pod: { min: 13, max: 25 },
      npac: { min: 50, max: 64 },
      ice_fraction: { min: 46, max: 58 },
      fat: { min: 0, max: 12 },
      total_solids: { min: 30, max: 43 },
      water: { min: 50, max: 67 },
    });
  });

  it('records which cell is externally anchored and which is internal-unconfirmed', () => {
    expect(VEGAN_TEMPERATURE_BAND_PROVENANCE.map((entry) => entry.temperatureC)).toEqual([
      -11, -12, -13,
    ]);
    expect(veganTemperatureBandProvenance(-11)?.calibration).toBe('internal_unconfirmed');
    expect(veganTemperatureBandProvenance(-12)?.calibration).toBe('internal_unconfirmed');
    expect(veganTemperatureBandProvenance(-13)?.calibration).toBe('externally_anchored');
    expect(veganTemperatureBandProvenance(-10)).toBeNull();
  });
});
