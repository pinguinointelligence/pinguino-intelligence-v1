/**
 * VEGAN ENGINE v2 — recipe-level structural assessment + the representative
 * recipe matrix (owner §25).
 *
 * The decisive test in this file is the NATURAL EXPERIMENT: the approved
 * toolbox payloads for REFINED COCONUT OIL (PI-ING-000163) and SUNFLOWER OIL
 * (PI-ING-000305) have BYTE-IDENTICAL engine composition. Swapping them can
 * therefore change nothing the Base Engine computes — and must change the
 * derived structural assessment. That is exactly what "additive" means.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type IngredientCategory,
  type RecipeInput,
} from '@/engine';
import { findVerifiedVeganFormulationCandidate } from '@/data/ingredients/verifiedVeganToolbox';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import {
  assessVeganRecipeStructure,
  compareVeganStructuralCandidates,
  compareVeganStructuralPreference,
} from './veganStructureAssessment';

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

/* ── shared payloads ──────────────────────────────────────────────────────── */

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
const SUNFLOWER_OIL = findVerifiedVeganFormulationCandidate('PI-ING-000305')!;
const PEA_PROTEIN = findVerifiedVeganFormulationCandidate('PI-ING-000451')!;
const RICE_PROTEIN = findVerifiedVeganFormulationCandidate('PI-ING-000452')!;
const OAT_DRINK = findVerifiedVeganFormulationCandidate('PI-ING-001565')!;

/** Same 100 % fat composition as the two toolbox oils — only the identity differs. */
const COCOA_BUTTER = verified('PI-ING-TEST-CB', 'COCOA BUTTER · Fat · Dry', 'fat', {
  solids_percent: 100,
  fat_percent: 100,
  kcal_per_100g: 900,
});
const UNKNOWN_FAT = verified('PI-ING-TEST-UF', 'VEGETABLE FAT PREPARATION · Fat', 'fat', {
  solids_percent: 100,
  fat_percent: 100,
  kcal_per_100g: 900,
});
/** Same composition as PEA PROTEIN — only the identity hides the source. */
const UNKNOWN_PROTEIN = verified('PI-ING-TEST-UP', 'PLANT PROTEIN PREPARATION · Protein', 'other', {
  ...PEA_PROTEIN.composition,
});
const SOY_PROTEIN = verified('PI-ING-TEST-SP', 'SOY PROTEIN ISOLATE · Protein · Dry', 'other', {
  ...PEA_PROTEIN.composition,
});
const PISTACHIO = verified('PI-ING-000614', 'PISTACHIO · Aldori Paste · 100% Nut', 'nut_paste', {
  water_percent: 8,
  solids_percent: 92,
  fat_percent: 45,
  protein_percent: 20,
  carbohydrate_percent: 17,
  sugar_percent: 7.7,
  sucrose_percent: 7.7,
  fiber_percent: 10,
  kcal_per_100g: 573,
});
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

interface RecipeOptions {
  temperature?: number;
  strategy?: 'optimal' | 'eco';
  category?: RecipeInput['category'];
}

const recipe = (
  items: ReturnType<typeof line>[],
  { temperature = -13, strategy = 'optimal', category = 'vegan_gelato' }: RecipeOptions = {},
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: temperature,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: strategy },
  items,
});

/** Neutral Vegan base: water / sucrose / dextrose / inulin / tara. */
const base = (fillWaterGrams: number) => [
  line('l-water', WATER, fillWaterGrams),
  line('l-sucrose', SUCROSE, 180),
  line('l-dextrose', DEXTROSE, 70),
  line('l-inulin', INULIN, 40),
  line('l-tara', TARA, 4),
];

const engineProof = (input: RecipeInput) => {
  const result = calculateRecipe(input);
  return {
    batch: result.total_batch_g,
    pod: result.pod_points,
    pac: result.pac_points,
    npac: result.npac_points,
    ice: result.ice_fraction_percent,
    percentages: result.percentages,
    violations: detectViolations(result).map((violation) => violation.metric),
  };
};

/* ── the representative matrix (owner §25 A–N) ────────────────────────────── */

const MATRIX = {
  A_neutral_baseline: recipe(base(706), { temperature: -13 }),
  B_coconut_fat: recipe([...base(626), line('l-fat', COCONUT_OIL, 80)], { temperature: -13 }),
  C_liquid_sunflower: recipe([...base(626), line('l-fat', SUNFLOWER_OIL, 80)], {
    temperature: -13,
  }),
  D_cocoa_butter: recipe([...base(626), line('l-fat', COCOA_BUTTER, 80)], { temperature: -12 }),
  E_soy_protein: recipe(
    [...base(626), line('l-fat', COCONUT_OIL, 50), line('l-protein', SOY_PROTEIN, 30)],
    { temperature: -13 },
  ),
  F_pea_protein: recipe(
    [...base(626), line('l-fat', COCONUT_OIL, 50), line('l-protein', PEA_PROTEIN, 30)],
    { temperature: -12 },
  ),
  G_rice_protein: recipe(
    [...base(626), line('l-fat', COCONUT_OIL, 50), line('l-protein', RICE_PROTEIN, 30)],
    { temperature: -11 },
  ),
  H_oat_matrix: recipe([...base(326), line('l-oat', OAT_DRINK, 380)], { temperature: -11 }),
  I_pistachio_nut: recipe([...base(506), line('l-main', PISTACHIO, 200, 'main')], {
    temperature: -13,
  }),
  J_mixed_fat: recipe(
    [...base(626), line('l-fat-a', COCONUT_OIL, 40), line('l-fat-b', SUNFLOWER_OIL, 40)],
    { temperature: -12, strategy: 'eco' },
  ),
  K_unknown_fat_class: recipe([...base(626), line('l-fat', UNKNOWN_FAT, 80)], { temperature: -13 }),
  L_unknown_protein_class: recipe(
    [...base(626), line('l-fat', COCONUT_OIL, 50), line('l-protein', UNKNOWN_PROTEIN, 30)],
    { temperature: -13, strategy: 'eco' },
  ),
  M_multi_main_1_1: recipe(
    [
      ...base(406),
      line('l-main-a', STRAWBERRY, 150, 'main', 1),
      line('l-main-b', BANANA, 150, 'main', 1),
    ],
    { temperature: -11 },
  ),
  N_multi_main_2_1: recipe(
    [
      ...base(406),
      line('l-main-a', STRAWBERRY, 200, 'main', 2),
      line('l-main-b', BANANA, 100, 'main', 1),
    ],
    { temperature: -12, strategy: 'eco' },
  ),
} as const;

describe('representative Vegan v2 recipe matrix (§25)', () => {
  it('covers −11 / −12 / −13 and both OPTIMAL and ECO strategies', () => {
    const temperatures = new Set(Object.values(MATRIX).map((input) => input.target_temperature_c));
    const strategies = new Set(
      Object.values(MATRIX).map((input) => input.goals?.formulation_strategy),
    );
    expect([...temperatures].sort((a, b) => a - b)).toEqual([-13, -12, -11]);
    expect([...strategies].sort()).toEqual(['eco', 'optimal']);
    expect(Object.keys(MATRIX)).toHaveLength(14);
  });

  it('produces a deterministic assessment for every case', () => {
    for (const [name, input] of Object.entries(MATRIX)) {
      const first = assessVeganRecipeStructure(input);
      const second = assessVeganRecipeStructure({ ...input, items: [...input.items] });
      expect(second, name).toEqual(first);
      expect(first.applicable, name).toBe(true);
    }
  });

  it('never blocks a VEGAN_VERIFIED product because enhanced metadata is unknown', () => {
    for (const [name, input] of Object.entries(MATRIX)) {
      expect(veganRecipeEligibilityIssues(input.items), name).toEqual([]);
    }
  });

  it('records the expected structural systems per case', () => {
    expect(assessVeganRecipeStructure(MATRIX.B_coconut_fat).fat).toMatchObject({
      functionalClass: 'lauric_solid_fat',
      source: 'coconut',
      known: true,
    });
    expect(assessVeganRecipeStructure(MATRIX.C_liquid_sunflower).fat).toMatchObject({
      functionalClass: 'liquid_vegetable_oil',
      source: 'sunflower',
    });
    expect(assessVeganRecipeStructure(MATRIX.D_cocoa_butter).fat.functionalClass).toBe(
      'cocoa_butter_fat',
    );
    expect(assessVeganRecipeStructure(MATRIX.J_mixed_fat).fat).toMatchObject({
      functionalClass: 'mixed_plant_fat',
      source: 'mixed',
    });
    expect(assessVeganRecipeStructure(MATRIX.I_pistachio_nut).fat.functionalClass).toBe(
      'nut_fat_matrix',
    );
    expect(assessVeganRecipeStructure(MATRIX.E_soy_protein).protein).toMatchObject({
      source: 'soy',
      functionalClass: 'functional_plant_protein_isolate',
    });
    expect(assessVeganRecipeStructure(MATRIX.F_pea_protein).protein.source).toBe('pea');
    expect(assessVeganRecipeStructure(MATRIX.G_rice_protein).protein.source).toBe('rice');
    expect(assessVeganRecipeStructure(MATRIX.H_oat_matrix).structuralCarbClasses).toContain(
      'oat_matrix',
    );
  });

  it('keeps Multi-Main lines, ratios and grams untouched — the assessment is read-only', () => {
    for (const key of ['M_multi_main_1_1', 'N_multi_main_2_1'] as const) {
      const input = MATRIX[key];
      const before = JSON.stringify(input);
      assessVeganRecipeStructure(input);
      expect(JSON.stringify(input), key).toBe(before);
      const mains = input.items.filter((item) => item.lock_type === 'main');
      expect(
        mains.map((item) => item.main_ratio_weight),
        key,
      ).toEqual(key === 'M_multi_main_1_1' ? [1, 1] : [2, 1]);
    }
  });
});

describe('additivity — the derived layer changes NO engine number', () => {
  it('coconut vs sunflower: identical engine result, different structural assessment', () => {
    // The two toolbox payloads are composition-identical by construction.
    expect(COCONUT_OIL.composition).toEqual(SUNFLOWER_OIL.composition);
    expect(engineProof(MATRIX.B_coconut_fat)).toEqual(engineProof(MATRIX.C_liquid_sunflower));

    const coconut = assessVeganRecipeStructure(MATRIX.B_coconut_fat);
    const sunflower = assessVeganRecipeStructure(MATRIX.C_liquid_sunflower);
    expect(coconut.fat.functionalClass).not.toBe(sunflower.fat.functionalClass);
    // Audit §3.1: at equal fat %, the solid-fat system aerates and bodies more.
    expect(coconut.structuralEvidencePoints).toBeGreaterThan(sunflower.structuralEvidencePoints);
  });

  it('an UNKNOWN fat class costs nothing the Engine can see and never adds a violation', () => {
    expect(engineProof(MATRIX.K_unknown_fat_class)).toEqual(engineProof(MATRIX.B_coconut_fat));
    const unknown = assessVeganRecipeStructure(MATRIX.K_unknown_fat_class);
    expect(unknown.fat.known).toBe(false);
    expect(unknown.fat.functionalClass).toBe('unknown');
    expect(unknown.reasons.map((reason) => reason.code)).toContain(
      'structural_evidence_incomplete',
    );
    // still a legal, assessable recipe — the baseline simply answers
    expect(unknown.applicable).toBe(true);
    expect(veganRecipeEligibilityIssues(MATRIX.K_unknown_fat_class.items)).toEqual([]);
  });

  it('an UNKNOWN protein class falls back to baseline without any Engine difference', () => {
    expect(UNKNOWN_PROTEIN.composition).toEqual(PEA_PROTEIN.composition);
    const known = assessVeganRecipeStructure(MATRIX.F_pea_protein);
    const unknown = assessVeganRecipeStructure(MATRIX.L_unknown_protein_class);
    expect(known.protein.known).toBe(true);
    expect(unknown.protein.known).toBe(false);
    expect(unknown.applicable).toBe(true);
  });

  it('is temperature-independent — structure is never an ice or NPAC modifier', () => {
    const at = (temperature: number) =>
      assessVeganRecipeStructure({ ...MATRIX.B_coconut_fat, target_temperature_c: temperature });
    const minus13 = at(-13);
    expect(at(-12)).toEqual(minus13);
    expect(at(-11)).toEqual(minus13);
  });
});

describe('inulin is not a hydrocolloid replacement (§26.5)', () => {
  const withTara = recipe([...base(626), line('l-fat', COCONUT_OIL, 80)]);
  const inulinOnly = recipe([
    line('l-water', WATER, 626),
    line('l-sucrose', SUCROSE, 180),
    line('l-dextrose', DEXTROSE, 70),
    line('l-inulin', INULIN, 44),
    line('l-fat', COCONUT_OIL, 80),
  ]);

  it('treats a hydrocolloid system as structurally distinct from high inulin', () => {
    const stabilised = assessVeganRecipeStructure(withTara);
    const unstabilised = assessVeganRecipeStructure(inulinOnly);
    expect(stabilised.hydrocolloidClasses).toEqual(['tara']);
    expect(unstabilised.hydrocolloidClasses).toEqual([]);
    expect(unstabilised.structuralCarbClasses).toContain('inulin');
    expect(unstabilised.reasons.map((reason) => reason.code)).toContain(
      'inulin_is_not_a_hydrocolloid_system',
    );
    expect(stabilised.structuralEvidencePoints).toBeGreaterThan(
      unstabilised.structuralEvidencePoints,
    );
  });
});

describe('quality levels and the tie-break comparator', () => {
  it('reports UNKNOWN — never a penalty — when no structural class resolves at all', () => {
    const opaque = recipe([
      line('l-water', WATER, 700),
      line('l-sucrose', SUCROSE, 180),
      line('l-dextrose', DEXTROSE, 70),
      line('l-fat', UNKNOWN_FAT, 50),
    ]);
    const assessment = assessVeganRecipeStructure(opaque);
    expect(assessment.quality).toBe('UNKNOWN');
    expect(assessment.enhancement).toBe('BASELINE_FALLBACK');
    expect(assessment.structuralEvidencePoints).toBe(0);
  });

  it('is not applicable outside the Vegan profile', () => {
    const gelato = recipe(base(706), { category: 'milk_gelato' });
    expect(assessVeganRecipeStructure(gelato).applicable).toBe(false);
    expect(compareVeganStructuralCandidates(gelato, gelato)).toBe(0);
  });

  it('never lets an UNKNOWN side lose the tie-break', () => {
    const known = assessVeganRecipeStructure(MATRIX.B_coconut_fat);
    const opaque = assessVeganRecipeStructure(
      recipe([
        line('l-water', WATER, 700),
        line('l-sucrose', SUCROSE, 180),
        line('l-dextrose', DEXTROSE, 70),
        line('l-fat', UNKNOWN_FAT, 50),
      ]),
    );
    expect(opaque.quality).toBe('UNKNOWN');
    expect(compareVeganStructuralPreference(known, opaque)).toBe(0);
    expect(compareVeganStructuralPreference(opaque, known)).toBe(0);
  });

  it('prefers the structurally stronger of two known systems, and is antisymmetric', () => {
    const coconut = MATRIX.B_coconut_fat;
    const sunflower = MATRIX.C_liquid_sunflower;
    expect(compareVeganStructuralCandidates(coconut, sunflower)).toBeLessThan(0);
    expect(compareVeganStructuralCandidates(sunflower, coconut)).toBeGreaterThan(0);
    expect(compareVeganStructuralCandidates(coconut, coconut)).toBe(0);
  });
});
