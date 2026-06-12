/**
 * Correction candidates — the spec §13 canonical correction set as
 * engine-reference ingredients.
 *
 * Compositions are literature values (same provenance as the Appendix A
 * fixture, confidence 85) and reference costs are business-pending estimates
 * used only for ECO candidate ordering — both flagged, both CONFIGURABLE:
 * every solver call may override the catalog via `CorrectionRequest.candidates`
 * (future home: app_config). No business assumption is hardcoded forever.
 */
import type { CandidateRanking, EngineIngredient, IngredientComponentProfile, ProductCategory, TargetMetric } from '../types';
import type { CorrectionCandidate } from './types';

const ZERO_PROFILE: IngredientComponentProfile = {
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

const reference = (
  id: string,
  name: string,
  category: EngineIngredient['category'],
  composition: Partial<IngredientComponentProfile>,
  cost_per_kg: number,
): EngineIngredient => ({
  id,
  name,
  category,
  composition: { ...ZERO_PROFILE, ...composition },
  pod_value: null,
  pac_value: null,
  npac_value: null,
  de_value: null,
  cost_per_kg, // reference estimate — ECO ordering only, business-pending
  confidence_score: 85,
  source_type: 'manual',
  is_verified: false,
});

export const DEFAULT_CORRECTION_CANDIDATES: readonly CorrectionCandidate[] = [
  {
    id: 'sucrose',
    name: 'Sucrose',
    roles: ['sweetness_up', 'freezing_up', 'solids_up'],
    ingredient: reference('sucrose', 'Sucrose', 'sugar', {
      solids_percent: 100,
      carbohydrate_percent: 100,
      sugar_percent: 100,
      sucrose_percent: 100,
      kcal_per_100g: 400,
    }, 1.1),
  },
  {
    id: 'dextrose',
    name: 'Dextrose',
    roles: ['freezing_up', 'sweetness_up', 'solids_up'],
    ingredient: reference('dextrose', 'Dextrose (monohydrate)', 'sugar', {
      water_percent: 8,
      solids_percent: 92,
      carbohydrate_percent: 92,
      sugar_percent: 92,
      dextrose_percent: 92,
      kcal_per_100g: 368,
    }, 1.6),
  },
  {
    id: 'milk_3_5',
    name: 'Milk 3.5 %',
    roles: ['dilution'],
    ingredient: reference('milk_3_5', 'Milk 3.5 %', 'dairy', {
      water_percent: 87.5,
      solids_percent: 12.5,
      fat_percent: 3.5,
      protein_percent: 3.3,
      carbohydrate_percent: 4.8,
      sugar_percent: 4.8,
      lactose_percent: 4.8,
      salt_percent: 0.1,
      kcal_per_100g: 64,
    }, 0.9),
  },
  {
    id: 'cream_30',
    name: 'Cream 30 %',
    roles: ['fat_up'],
    ingredient: reference('cream_30', 'Cream 30 %', 'dairy', {
      water_percent: 63.4,
      solids_percent: 36.6,
      fat_percent: 30,
      protein_percent: 2.3,
      carbohydrate_percent: 3.3,
      sugar_percent: 3.3,
      lactose_percent: 3.3,
      salt_percent: 0.1,
      kcal_per_100g: 292,
    }, 4),
  },
  {
    id: 'smp',
    name: 'Skimmed milk powder',
    roles: ['solids_up', 'protein_up'],
    ingredient: reference('smp', 'Skimmed milk powder', 'dairy', {
      water_percent: 3.5,
      solids_percent: 96.5,
      fat_percent: 0.8,
      protein_percent: 35,
      carbohydrate_percent: 52,
      sugar_percent: 52,
      lactose_percent: 52,
      salt_percent: 1,
      kcal_per_100g: 360,
    }, 7),
  },
  {
    id: 'inulin',
    name: 'Inulin',
    roles: ['solids_up', 'stabilizer'],
    ingredient: reference('inulin', 'Inulin', 'stabilizer', {
      water_percent: 5,
      solids_percent: 95,
      carbohydrate_percent: 90,
      fiber_percent: 90,
      kcal_per_100g: 190,
    }, 9),
  },
  {
    id: 'water',
    name: 'Water',
    roles: ['dilution'],
    allowed_categories: ['sorbet', 'vegan_gelato', 'fruit_gelato'], // spec §13
    ingredient: reference('water', 'Water', 'water', { water_percent: 100 }, 0),
  },
  {
    id: 'tara_gum',
    name: 'Tara gum',
    roles: ['stabilizer'],
    ingredient: reference('tara_gum', 'Tara gum', 'stabilizer', {
      water_percent: 12,
      solids_percent: 88,
      carbohydrate_percent: 80,
      fiber_percent: 80,
      kcal_per_100g: 200,
    }, 18),
  },
];

/** Spec §13 canonical correction table: (metric, direction) → candidate ids,
 * in rule order. Ice fraction maps to the NPAC proxy candidates. */
const SELECTION_RULES: Partial<
  Record<`${TargetMetric}_${'low' | 'high'}`, readonly string[]>
> = {
  pod_low: ['sucrose', 'dextrose'],
  pod_high: ['milk_3_5', 'water'], // dilution — never more sugar
  npac_low: ['dextrose', 'sucrose'],
  npac_high: ['smp', 'cream_30', 'milk_3_5'], // solids/dilution — never high-PAC sugars
  ice_fraction_high: ['dextrose', 'sucrose'], // too hard → raise NPAC
  ice_fraction_low: ['smp', 'cream_30', 'milk_3_5'], // too soft → dilute depression
  fat_low: ['cream_30'],
  fat_high: ['milk_3_5', 'water', 'smp'],
  total_solids_low: ['smp', 'inulin'],
  total_solids_high: ['milk_3_5', 'water'],
  water_high: ['smp', 'inulin'],
  water_low: ['milk_3_5', 'water'],
  aerating_protein_low: ['smp'],
  aerating_protein_high: ['cream_30', 'milk_3_5'],
  protein_in_solids_low: ['smp'],
  protein_in_solids_high: ['cream_30'],
  lactose_low: ['smp'],
  lactose_high: ['inulin'], // lactose-free solids dilution
  lactose_sandiness_risk_high: ['inulin'],
  alcohol_high: ['milk_3_5'], // dilution; alcohol_unfixable tradeoff otherwise
};

/** Mode-dependent ordering (config/modes.ts candidate_ranking). */
function orderCandidates(
  candidates: CorrectionCandidate[],
  ranking: CandidateRanking,
): CorrectionCandidate[] {
  const byId = (a: CorrectionCandidate, b: CorrectionCandidate) => a.id.localeCompare(b.id);
  switch (ranking) {
    case 'cheapest_first':
      return [...candidates].sort(
        (a, b) =>
          (a.ingredient.cost_per_kg ?? Number.POSITIVE_INFINITY) -
            (b.ingredient.cost_per_kg ?? Number.POSITIVE_INFINITY) || byId(a, b),
      );
    case 'mouthfeel_first': {
      const bump = new Set(['cream_30', 'inulin']);
      return [
        ...candidates.filter((c) => bump.has(c.id)),
        ...candidates.filter((c) => !bump.has(c.id)),
      ];
    }
    case 'flavor_first':
      // least added mass dilutes flavor least → densest (highest solids) first
      return [...candidates].sort(
        (a, b) =>
          b.ingredient.composition.solids_percent - a.ingredient.composition.solids_percent ||
          byId(a, b),
      );
    case 'balanced':
      return candidates; // spec §13 rule order
  }
}

/**
 * Candidates for one violation: rule lookup → category gate → mode ordering.
 * Custom catalogs participate via matching ids (configurable by design).
 */
export function selectCandidates(
  metric: TargetMetric,
  direction: 'low' | 'high',
  category: ProductCategory,
  ranking: CandidateRanking,
  candidates: readonly CorrectionCandidate[] = DEFAULT_CORRECTION_CANDIDATES,
): CorrectionCandidate[] {
  const ruleIds = SELECTION_RULES[`${metric}_${direction}`] ?? [];
  const pool = new Map(candidates.map((c) => [c.id, c]));
  const selected: CorrectionCandidate[] = [];
  for (const id of ruleIds) {
    const candidate = pool.get(id);
    if (!candidate) continue;
    if (candidate.allowed_categories && !candidate.allowed_categories.includes(category)) continue;
    selected.push(candidate);
  }
  return orderCandidates(selected, ranking);
}
