/**
 * THE REAL PROTEIN AUTHORITY, APPLIED TO A RESCUE CANDIDATE.
 *
 * Owner decision (NAPRAWA 5): „Do not globally disable Rescue merely because the
 * profile is Protein. Use the real Protein authority." Before this file there
 * were TWO global switches that did exactly that — `starterPackRescueEligibility`
 * returned `blocked_science` for every candidate on any Protein draft, and
 * `shouldRunStarterPackDirectionRescue` refused the whole stage on
 * `category === 'protein_gelato'`. A Protein customer therefore got no Rescue at
 * all, not because a candidate failed a Protein gate but because nobody asked.
 *
 * Asking is what this module does. It is a GATE, not a ranker: it answers
 * whether a simulated candidate is still the same Protein product, and it says
 * no for a specific, reportable reason.
 *
 * WHAT MUST SURVIVE A PROTEIN RESCUE (Owner):
 *   - the exact dairy / plant route;
 *   - Protein qualification;
 *   - the minimum required protein;
 *   - the Protein structural score;
 *   - every Protein hard gate.
 *
 * „SMP or Cream Powder may not be proposed merely because they improve Direction
 * if they damage Protein qualification or structure." That is the whole point of
 * comparing AFTER against BEFORE rather than against a fixed threshold: a draft
 * that was already unqualified is not made worse by being left unqualified, but
 * a qualified one may never be spent.
 */
import type { RecipeInput, RecipeResult } from '@/engine';
import { calculateRecipe } from '@/engine';
import { assessProteinFormulation } from '@/features/protein-gelato/proteinAuthority';
import { rescueBaseRoute } from './rescueBaseRoute';

export type RescueProteinVerdict =
  | 'not_applicable'
  | 'preserved'
  | 'route_changed'
  | 'qualification_lost'
  | 'structure_degraded'
  | 'hard_gate_lost';

export interface RescueProteinGateResult {
  readonly preserved: boolean;
  readonly verdict: RescueProteinVerdict;
  /** Structural score before and after, for diagnostics and for the audit. */
  readonly structureBefore: number | null;
  readonly structureAfter: number | null;
  readonly qualifiedBefore: boolean;
  readonly qualifiedAfter: boolean;
}

const NOT_APPLICABLE: RescueProteinGateResult = Object.freeze({
  preserved: true,
  verdict: 'not_applicable',
  structureBefore: null,
  structureAfter: null,
  qualifiedBefore: false,
  qualifiedAfter: false,
});

/** A structural score may not fall. Scores are integers, so this needs no eps. */
const SCORE_EPS = 1e-9;

export function rescueProteinGate(
  before: RecipeInput,
  after: RecipeInput,
  afterResult: RecipeResult = calculateRecipe(after),
): RescueProteinGateResult {
  if (before.category !== 'protein_gelato') return NOT_APPLICABLE;

  const beforeAssessment = assessProteinFormulation(before);
  const afterAssessment = assessProteinFormulation(after, afterResult);
  const structureBefore = beforeAssessment.structure.score;
  const structureAfter = afterAssessment.structure.score;
  const qualifiedBefore = beforeAssessment.qualification.qualified;
  const qualifiedAfter = afterAssessment.qualification.qualified;
  const base = { structureBefore, structureAfter, qualifiedBefore, qualifiedAfter } as const;

  // THE ROUTE FIRST. A plant Protein recipe that has become a dairy Protein
  // recipe is a different product, and no amount of Direction improvement makes
  // that a better answer to the customer's request.
  if (rescueBaseRoute(after) !== rescueBaseRoute(before)) {
    return { ...base, preserved: false, verdict: 'route_changed' };
  }
  // Qualification may be gained, never spent.
  if (qualifiedBefore && !qualifiedAfter) {
    return { ...base, preserved: false, verdict: 'qualification_lost' };
  }
  // The Engine's own verdict on the candidate, unchanged and not reinterpreted.
  if (beforeAssessment.hardSafe && !afterAssessment.hardSafe) {
    return { ...base, preserved: false, verdict: 'hard_gate_lost' };
  }
  if (
    structureBefore !== null &&
    structureAfter !== null &&
    structureAfter < structureBefore - SCORE_EPS
  ) {
    return { ...base, preserved: false, verdict: 'structure_degraded' };
  }
  return { ...base, preserved: true, verdict: 'preserved' };
}
