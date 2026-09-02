/**
 * PINGÜINO — Protein product qualification (Protein Engine v2, HARD authority).
 *
 * WHAT REPLACED WHAT
 * ------------------
 * v1 gated Protein Gelato on `target_protein_percent`, defaulting to 20 %
 * protein BY MASS of the mix, with a 0.1 pp tolerance. That number has no
 * provenance anywhere in the repository or in the frozen-dessert literature —
 * no controlled study goes above 10 % protein — and it is almost certainly a
 * unit confusion with the EU "HIGH PROTEIN" claim, which is 20 % of ENERGY.
 *
 * v2 keeps a hard qualification, because a product profile called "Protein"
 * must be able to carry the claim its name makes, but sources it correctly:
 *
 *   Regulation (EC) No 1924/2006, Annex:
 *     SOURCE OF PROTEIN — at least 12 % of the energy value from protein
 *     HIGH PROTEIN      — at least 20 % of the energy value from protein
 *
 * The user never selects this. It is not a target, it has no tolerance band,
 * and the optimizer does not try to exceed it — exceeding it costs measured
 * structure and buys nothing (see proteinStructureQuality.ts).
 *
 * RELAXATION PROOF (why this cannot invalidate an existing recipe): the energy
 * rule requires protein >= 0.5625 x fat + 0.25 x carbohydrate. Inside the
 * Protein profile's own fat band (5-12 %), a recipe at the old 20 %-by-mass
 * gate would need more than 35 % fat to fail the energy rule, which the profile
 * forbids. Every recipe legal under the old gate is legal under the new one.
 */
import { calculateRecipe, type RecipeInput, type RecipeResult } from '@/engine';
import { PROTEIN_QUALIFICATION } from './proteinScienceAuthority';

export type ProteinClaimLevel = 'high_protein' | 'source_of_protein' | 'none';

export interface ProteinQualificationAssessment {
  /** False for every non-Protein profile — this authority never leaks sideways. */
  applicable: boolean;
  /** Actual protein of the finished BASE, mass %. The number the UI shows. */
  actualPercent: number | null;
  /** Share of the recipe's energy provided by protein, %. */
  energySharePercent: number | null;
  /** Lowest protein mass % at which THIS composition earns HIGH PROTEIN. */
  requiredPercent: number | null;
  /** actualPercent - requiredPercent. Protein bought beyond the claim. */
  excessPp: number | null;
  claim: ProteinClaimLevel;
  /** The one hard verdict: is this a Protein product at all? */
  qualified: boolean;
}

const NOT_APPLICABLE: ProteinQualificationAssessment = {
  applicable: false,
  actualPercent: null,
  energySharePercent: null,
  requiredPercent: null,
  excessPp: null,
  claim: 'none',
  qualified: false,
};

/**
 * Minimum protein mass % that earns the claim for a given non-protein energy
 * load. Solving `4P / (4P + nonProteinKcal) = share` for P gives
 * `P = nonProteinKcal x share / (4 x (1 - share))`; at share = 0.20 that is
 * `nonProteinKcal / 16`.
 */
export function requiredProteinPercentFor(
  nonProteinKcalPer100g: number,
  energySharePercent: number = PROTEIN_QUALIFICATION.highProteinEnergySharePercent,
): number {
  const share = energySharePercent / 100;
  if (share <= 0) return 0;
  if (share >= 1) return Number.POSITIVE_INFINITY;
  return (
    (nonProteinKcalPer100g * share) / (PROTEIN_QUALIFICATION.kcalPerProteinGram * (1 - share))
  );
}

/**
 * Pure, deterministic. Reads only values the Base Engine already computes —
 * no new science, no new coefficient, no Mapper dependency.
 */
export function assessProteinQualification(
  input: RecipeInput,
  result: RecipeResult = calculateRecipe(input),
): ProteinQualificationAssessment {
  if (input.category !== 'protein_gelato') return NOT_APPLICABLE;

  const nutrition = result.nutrition_per_100g;
  const actualPercent = result.percentages.protein_percent;
  if (nutrition === null || !(nutrition.kcal > 0)) {
    return {
      applicable: true,
      actualPercent,
      energySharePercent: null,
      requiredPercent: null,
      excessPp: null,
      claim: 'none',
      qualified: false,
    };
  }

  const proteinKcal = nutrition.protein_g * PROTEIN_QUALIFICATION.kcalPerProteinGram;
  const energySharePercent = (proteinKcal / nutrition.kcal) * 100;
  const nonProteinKcal = Math.max(0, nutrition.kcal - proteinKcal);
  const requiredPercent = requiredProteinPercentFor(nonProteinKcal);

  const claim: ProteinClaimLevel =
    energySharePercent >= PROTEIN_QUALIFICATION.highProteinEnergySharePercent - 1e-9
      ? 'high_protein'
      : energySharePercent >= PROTEIN_QUALIFICATION.sourceOfProteinEnergySharePercent - 1e-9
        ? 'source_of_protein'
        : 'none';

  return {
    applicable: true,
    actualPercent,
    energySharePercent,
    requiredPercent,
    excessPp: actualPercent - requiredPercent,
    claim,
    qualified: claim === 'high_protein',
  };
}
