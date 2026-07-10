/**
 * Studio Flow guidance — the PURE state → copy mapper (User-Flow layer).
 *
 * Maps the states Studio already has (optimization decision, tier
 * capabilities, signed-in status, product profile × serving temperature) to
 * the locked PL copy: title, explanation, next recommended action, tier note,
 * save note and the honest disclaimers.
 *
 * Pure and deterministic: no UI side effects, no persistence, no IO, no
 * clock. It never fabricates availability — the save note appears only when
 * the underlying solve is genuinely rerun-verified saveable, and the
 * authoritative gate remains the save control itself.
 */
import type { OptimizationDecision } from '@/spine';
import {
  STUDIO_FLOW_COPY,
  type StudioFlowSituation,
  type StudioFlowSituationCopy,
} from './studioFlowCopy';

export interface StudioFlowOptimizationState {
  finalDecision: OptimizationDecision;
  /** True only when a solve is rerun-verified and carries gram actions. */
  saveableSolve: boolean;
  productProfile: string;
  servingTemperatureC: number;
}

export interface StudioFlowState {
  authStatus: 'authed' | 'anon' | 'loading';
  /** Pro capability — exact correction grams (drives tier wording only). */
  exactCorrectionGrams: boolean;
  /** Signed-in save capability (free + pro). */
  saveRecipes: boolean;
  /** The computed optimization preview, or null before the first run. */
  optimization: StudioFlowOptimizationState | null;
}

export interface StudioFlowGuidanceView {
  situation: StudioFlowSituation;
  title: string;
  body: string;
  nextAction: string;
  /** 'profil · temperatura' context, when an optimization ran. */
  contextLine: string | null;
  tierNote: string;
  /** Save guidance — null when there is nothing truthfully saveable. */
  saveNote: string | null;
  /** The save-vs-apply distinction — shown only alongside a real save note. */
  saveVsApplyNote: string | null;
  disclaimers: readonly string[];
}

const DECISION_TO_SITUATION: Record<OptimizationDecision, StudioFlowSituation> = {
  no_action_needed: 'recipe_in_range',
  optimized: 'recipe_optimized',
  tradeoff: 'recipe_tradeoff',
  impossible: 'recipe_impossible',
  blocked: 'recipe_blocked',
};

const situationCopy = (situation: StudioFlowSituation): StudioFlowSituationCopy =>
  STUDIO_FLOW_COPY.pl.situations[situation];

/** Derive the guidance view for the current Studio state (pure). */
export function studioFlowGuidance(state: StudioFlowState): StudioFlowGuidanceView {
  const copy = STUDIO_FLOW_COPY.pl;
  const situation: StudioFlowSituation = state.optimization
    ? DECISION_TO_SITUATION[state.optimization.finalDecision]
    : 'new_recipe';
  const { title, body, nextAction } = situationCopy(situation);

  const contextLine = state.optimization
    ? `${state.optimization.productProfile} · ${state.optimization.servingTemperatureC}°C`
    : null;

  const tierNote = state.exactCorrectionGrams ? copy.tier.proExactGrams : copy.tier.demoLockedGrams;

  // The save note never overpromises: only a rerun-verified saveable solve on
  // a saveable decision earns it, and only the tiers that can actually save.
  let saveNote: string | null = null;
  const saveableDecision =
    state.optimization !== null &&
    (state.optimization.finalDecision === 'optimized' ||
      state.optimization.finalDecision === 'tradeoff') &&
    state.optimization.saveableSolve;
  if (saveableDecision) {
    if (state.authStatus !== 'authed') saveNote = copy.save.signInToSave;
    else if (state.exactCorrectionGrams && state.saveRecipes) saveNote = copy.save.saveAvailable;
  }
  const saveVsApplyNote = saveNote === copy.save.saveAvailable ? copy.save.saveVsApply : null;

  return {
    situation,
    title,
    body,
    nextAction,
    contextLine,
    tierNote,
    saveNote,
    saveVsApplyNote,
    disclaimers: [copy.disclaimers.previewOnly, copy.disclaimers.noRecipeMutation],
  };
}

/** The static production-flow guidance trio (IF9 / IF10 / substitute) — pure copy. */
export function productionFlowGuidance(): readonly StudioFlowSituationCopy[] {
  const copy = STUDIO_FLOW_COPY.pl.situations;
  return [
    copy.batch_rescue_guidance,
    copy.stock_shortage_guidance,
    copy.verified_substitute_guidance,
  ];
}
