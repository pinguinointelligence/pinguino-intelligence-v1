/**
 * TRUE INFEASIBLE — the word CORE is not allowed to use lightly.
 *
 * Owner decision (NAPRAWA 5): „GELLATTI may only tell a customer that a target
 * or ideal result is genuinely unreachable after it has checked, through one
 * shared CORE" — the current ingredients in their normal ranges, the same
 * ingredients under approved controlled relaxation, the compatible canonical
 * profile toolbox, the compatible Starter Pack candidates, the allowed
 * customer-constraint what-ifs, and a bounded compatible pair Rescue.
 *
 * And: „A missing dosage or compatibility authority is not proof of physical
 * impossibility. Do not collapse everything into `no_proposal`."
 *
 * THIS MODULE IS THE ARITHMETIC OF THAT SENTENCE. It does not search. It reads
 * what each stage RECORDED and answers one question: may the product say the
 * target is genuinely unreachable? The answer is yes only when every stage was
 * actually attempted and every one of them came back empty for a reason that is
 * about physics rather than about administration.
 *
 * The deliberate consequence: a stage that could not run — because a dosage
 * window was never published, because a base route could not be resolved,
 * because a composition is unverified — makes the honest answer
 * `missing_authority`, NOT `genuinely_infeasible`. That is the whole point.
 */

/** The six stages of the Owner's Rescue chain, in the order they must run. */
export const RESCUE_STAGES = [
  'current_normal',
  'current_controlled',
  'profile_toolbox',
  'starter_pack',
  'constraint_what_if',
  'bounded_pair',
] as const;

export type RescueStage = (typeof RESCUE_STAGES)[number];

/** Why a stage produced nothing. Only `no_improvement` is about physics. */
export type RescueStageOutcome =
  /** Found something materially better. */
  | 'improved'
  /** Ran in full, found nothing materially better. */
  | 'no_improvement'
  /** Could not run: an authority it needs does not exist. */
  | 'missing_authority'
  /** Every candidate was refused because it would change the product. */
  | 'profile_identity_blocked'
  /** A structural, safety, machine or process limit stopped it. */
  | 'structural_limit_blocked'
  /** Only a change to a rule the CUSTOMER owns would unlock it. */
  | 'customer_constraint_blocked'
  /** Not attempted. A chain with one of these can never be called exhausted. */
  | 'not_attempted';

export interface RescueStageRecord {
  readonly stage: RescueStage;
  readonly outcome: RescueStageOutcome;
  readonly candidatesEvaluated: number;
  /** Free-form detail for the audit trail. Never shown to a customer as-is. */
  readonly detail?: string;
}

export type RescueClassification =
  | 'improved'
  | 'no_material_improvement'
  | 'customer_constraint_blocked'
  | 'profile_identity_blocked'
  | 'structural_limit_blocked'
  | 'missing_authority'
  | 'genuinely_infeasible';

export interface RescueOutcomeClassification {
  readonly classification: RescueClassification;
  /** True only when every stage in `RESCUE_STAGES` actually ran. */
  readonly chainExhausted: boolean;
  /** Stages that never ran, named. `genuinely_infeasible` requires this empty. */
  readonly stagesNotAttempted: readonly RescueStage[];
  readonly candidatesEvaluated: number;
  readonly stages: readonly RescueStageRecord[];
}

/**
 * Classify a completed Rescue chain.
 *
 * ORDER OF PRECEDENCE, and it is deliberate:
 *  1. anything improved  → `improved`. There is a better answer; say so.
 *  2. a missing authority → `missing_authority`. We did not finish looking, and
 *     pretending otherwise would turn a data gap into a physical claim.
 *  3. a customer rule blocked it → `customer_constraint_blocked`. The customer
 *     can unlock this themselves, so it is never impossibility.
 *  4. profile identity blocked it → `profile_identity_blocked`. The answer
 *     exists; it is just not this product.
 *  5. a structural limit blocked it → `structural_limit_blocked`.
 *  6. every stage ran and found nothing → `genuinely_infeasible`, but ONLY if
 *     the chain is exhausted.
 *  7. otherwise → `no_material_improvement`, the honest "we looked, there is
 *     nothing better, and we are not claiming more than that".
 */
export function classifyRescueOutcome(
  stages: readonly RescueStageRecord[],
): RescueOutcomeClassification {
  const byStage = new Map(stages.map((record) => [record.stage, record] as const));
  const stagesNotAttempted = RESCUE_STAGES.filter((stage) => {
    const record = byStage.get(stage);
    return record === undefined || record.outcome === 'not_attempted';
  });
  const chainExhausted = stagesNotAttempted.length === 0;
  const candidatesEvaluated = stages.reduce(
    (sum, record) => sum + Math.max(0, record.candidatesEvaluated),
    0,
  );
  const has = (outcome: RescueStageOutcome) =>
    stages.some((record) => record.outcome === outcome);

  const base = { chainExhausted, stagesNotAttempted, candidatesEvaluated, stages } as const;

  if (has('improved')) return { ...base, classification: 'improved' };
  if (has('missing_authority')) return { ...base, classification: 'missing_authority' };
  if (has('customer_constraint_blocked')) {
    return { ...base, classification: 'customer_constraint_blocked' };
  }
  if (has('profile_identity_blocked')) {
    return { ...base, classification: 'profile_identity_blocked' };
  }
  if (has('structural_limit_blocked')) {
    return { ...base, classification: 'structural_limit_blocked' };
  }
  // THE ONLY ROUTE TO „genuinely unreachable". Every stage ran, every stage
  // came back empty, and nothing administrative was in the way.
  if (chainExhausted) return { ...base, classification: 'genuinely_infeasible' };
  return { ...base, classification: 'no_material_improvement' };
}

/**
 * May the product tell the customer the target is genuinely unreachable?
 *
 * One function so no surface has to re-derive the rule, and so the answer is
 * never "we returned no_proposal, therefore it is impossible".
 */
export const mayClaimGenuinelyInfeasible = (
  classification: RescueOutcomeClassification,
): boolean =>
  classification.classification === 'genuinely_infeasible' && classification.chainExhausted;
