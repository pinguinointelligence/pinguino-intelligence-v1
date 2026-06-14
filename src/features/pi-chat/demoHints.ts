/**
 * Redacted directional engine hints for the AI-first demo (Step 6A.2).
 *
 * The demo routes the guided intake through the REAL correction solver, but only
 * ever in REDACTED mode: it maps `RedactedCorrectionProposal` — a type with NO
 * numeric and NO ingredient-name fields — into broad directional hints
 * (area + direction + confidence). It never calls `calculateRecipe`, so no
 * indicator values, scores, costs or before/after numbers can reach the demo.
 *
 * The only number in the returned view is the user's own chosen batch size.
 * Exact grams stay exclusively in the PI Pro → Advanced Studio path.
 */
import {
  proposeCorrections,
  type CorrectionConfidence,
  type RedactedCorrectionProposal,
  type RedactedDirection,
} from '@/engine';
import { ACTIVE_ENGINE } from '@/data/engines';
import { findProductProfile, type ProductProfileId } from '@/data/productProfiles';
import { findServingProfile, isServingProfileConnected } from '@/data/servingProfiles';
import type { IntakeState } from './conversation';
import { intakeToRecipeInput } from './intakeToRecipe';

export type HintArea =
  | 'sweetness'
  | 'freezing_stability'
  | 'texture'
  | 'alcohol'
  | 'main_ingredient'
  | 'profile_fit';

export type HintDirection = 'improve' | 'rebalance' | 'protect' | 'reduce_risk';

export interface DirectionalHint {
  area: HintArea;
  direction: HintDirection;
  confidence: CorrectionConfidence;
}

export interface DemoHintsView {
  /** Always the active engine — '−11°C Engine'. */
  engineLabel: string;
  productProfileId: ProductProfileId | null;
  /** Calm note when the engine has no dedicated band for this direction yet. */
  productPendingNote: string | null;
  /** False → the chosen serving profile is a preview (still computed on −11°C). */
  servingConnected: boolean;
  /** No corrections → the recipe already balances on the −11°C Engine. */
  balanced: boolean;
  hints: DirectionalHint[];
  /** The ONLY number — the user's own chosen batch size. */
  batchGrams: number;
}

/** Broad area per target metric (a label, never a value). */
const AREA_BY_METRIC: Record<string, HintArea> = {
  pod: 'sweetness',
  npac: 'freezing_stability',
  ice_fraction: 'texture',
  alcohol: 'alcohol',
  fat: 'texture',
  total_solids: 'texture',
  aerating_protein: 'texture',
  protein_in_solids: 'texture',
  lactose: 'profile_fit',
  lactose_sandiness_risk: 'texture',
  water: 'profile_fit',
};

function mapDirection(
  kind: RedactedCorrectionProposal['kind'],
  direction: RedactedDirection,
): HintDirection {
  if (kind !== 'correction') return 'protect';
  if (direction === 'add') return 'improve';
  if (direction === 'reduce') return 'reduce_risk';
  return 'rebalance';
}

function mapProposalToHint(
  proposal: RedactedCorrectionProposal,
  heroProtected: boolean,
): DirectionalHint {
  const isTradeoff = proposal.kind !== 'correction';
  const area: HintArea =
    isTradeoff && heroProtected
      ? 'main_ingredient'
      : (AREA_BY_METRIC[proposal.affected_metrics[0] ?? ''] ?? 'profile_fit');
  return {
    area,
    direction: mapDirection(proposal.kind, proposal.direction),
    confidence: proposal.confidence,
  };
}

/** PURE: redacted proposals → deduped directional hints (number-free, name-free). */
export function mapProposalsToHints(
  proposals: readonly RedactedCorrectionProposal[],
  heroProtected: boolean,
): DirectionalHint[] {
  const hints: DirectionalHint[] = [];
  const seenAreas = new Set<HintArea>();
  for (const proposal of proposals) {
    const hint = mapProposalToHint(proposal, heroProtected);
    if (!seenAreas.has(hint.area)) {
      seenAreas.add(hint.area);
      hints.push(hint);
    }
  }
  return hints;
}

/**
 * Build the demo's directional hints from the SAME recipe the Pro handoff would
 * load. Calls the solver in REDACTED mode only; throws if the result is somehow
 * not redacted (defensive — the demo must never receive unredacted data).
 */
export function buildDemoHints(state: IntakeState): DemoHintsView {
  const product = state.productProfileId !== null ? findProductProfile(state.productProfileId) : null;
  const serving = state.servingProfileId !== null ? findServingProfile(state.servingProfileId) : null;

  const base: DemoHintsView = {
    engineLabel: ACTIVE_ENGINE.label,
    productProfileId: state.productProfileId,
    productPendingNote: product?.pendingNote ?? null,
    servingConnected: serving !== null && isServingProfileConnected(serving),
    balanced: true,
    hints: [],
    batchGrams: state.batchGrams,
  };

  const input = intakeToRecipeInput(state);
  if (!input) return base;

  const result = proposeCorrections({ input, context: 'planning', redact: true });
  if (!result.redacted) {
    throw new Error('demo hints require a redacted correction result');
  }

  return {
    ...base,
    balanced: result.proposals.length === 0,
    hints: mapProposalsToHints(result.proposals, product?.heroProtected ?? false),
  };
}
