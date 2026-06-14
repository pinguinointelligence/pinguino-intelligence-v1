/**
 * PI Chat conversation — a PURE, deterministic state machine (Step 6A.1).
 *
 * No LLM, no IO, no engine math. It drives a guided intake:
 *   flavor → product type → serving profile → batch → demo summary → pro handoff.
 * The free-text flavor is captured VERBATIM (no NL parsing yet — that is 6B).
 *
 * Invariants enforced here:
 *  - a product type must be chosen before any recipe is summarized or handed off;
 *  - batch defaults to 1000 g; the user keeps or scales it;
 *  - the demo summary carries NO engine numbers (only the user's own batch size).
 */
import { findProductProfile, type ProductProfileId } from '@/data/productProfiles';
import {
  findServingProfile,
  isServingProfileConnected,
  type ServingProfileId,
} from '@/data/servingProfiles';

export type ConversationStep =
  | 'flavor'
  | 'product_type'
  | 'serving_profile'
  | 'batch'
  | 'demo_summary'
  | 'pro_handoff';

export interface IntakeState {
  step: ConversationStep;
  /** Captured verbatim from the prompt (no parsing in 6A.1). */
  flavorIdea: string | null;
  productProfileId: ProductProfileId | null;
  servingProfileId: ServingProfileId | null;
  batchGrams: number;
}

export type IntakeEvent =
  | { type: 'submitFlavor'; text: string }
  | { type: 'chooseProductType'; id: ProductProfileId }
  | { type: 'chooseServingProfile'; id: ServingProfileId }
  | { type: 'setBatch'; keep: boolean; grams?: number }
  | { type: 'unlockPro' }
  | { type: 'reset' };

export const DEFAULT_BATCH_GRAMS = 1000;

export const INITIAL_INTAKE: IntakeState = {
  step: 'flavor',
  flavorIdea: null,
  productProfileId: null,
  servingProfileId: null,
  batchGrams: DEFAULT_BATCH_GRAMS,
};

const clampGrams = (grams: number): number =>
  Number.isFinite(grams) && grams > 0 ? Math.round(grams) : DEFAULT_BATCH_GRAMS;

/** Pure, total transition function — same (state, event) always yields the same next state. */
export function advance(state: IntakeState, event: IntakeEvent): IntakeState {
  switch (event.type) {
    case 'submitFlavor': {
      const flavorIdea = event.text.trim() || null;
      return { ...state, flavorIdea, step: 'product_type' };
    }
    case 'chooseProductType':
      return { ...state, productProfileId: event.id, step: 'serving_profile' };
    case 'chooseServingProfile':
      return { ...state, servingProfileId: event.id, step: 'batch' };
    case 'setBatch': {
      // A summary requires a product type (invariant) — never skip the flow.
      if (state.productProfileId === null) return state;
      const batchGrams = event.keep ? state.batchGrams : clampGrams(event.grams ?? state.batchGrams);
      return { ...state, batchGrams, step: 'demo_summary' };
    }
    case 'unlockPro':
      // Handoff requires a product type AND a serving profile (invariant).
      if (state.productProfileId === null || state.servingProfileId === null) return state;
      return { ...state, step: 'pro_handoff' };
    case 'reset':
      return { ...INITIAL_INTAKE };
    default:
      return state;
  }
}

/** Redacted demo summary — DATA only (components map ids → copy). Carries no
 * engine numbers; the only number is the user's own chosen batch size. */
export interface DemoSummaryView {
  heroText: string | null;
  productProfileId: ProductProfileId | null;
  servingProfileId: ServingProfileId | null;
  /** True only when the chosen serving profile's engine is active today. */
  servingConnected: boolean;
  /** Calm note when the engine has no dedicated band for this direction yet. */
  productPendingNote: string | null;
  /** The user's own batch choice — input, never a computed recipe gram. */
  batchGrams: number;
}

export function demoSummaryView(state: IntakeState): DemoSummaryView {
  const product = state.productProfileId !== null ? findProductProfile(state.productProfileId) : null;
  const serving = state.servingProfileId !== null ? findServingProfile(state.servingProfileId) : null;
  return {
    heroText: state.flavorIdea,
    productProfileId: state.productProfileId,
    servingProfileId: state.servingProfileId,
    servingConnected: serving !== null && isServingProfileConnected(serving),
    productPendingNote: product?.pendingNote ?? null,
    batchGrams: state.batchGrams,
  };
}
