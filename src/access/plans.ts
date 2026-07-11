/**
 * Capability matrix — the single source of gating truth (masterplan §5).
 *
 * Phase 2B.1: access is driven by REAL subscription state (see useAccess):
 *  - `demo` — anonymous public session (redacted; no save).
 *  - `free` — signed in, no active subscription (redacted exact values, but may
 *     save / use My Recipes).
 *  - `pro`  — signed in with an active/grace subscription (exact values).
 *
 * `exactCorrectionGrams` drives BOTH the correction-panel branch and the solver
 * `redact` flag, so they can never disagree.
 */

/** Chip-level plan kept for the StatusChip + the DEV override (sessionStore). */
export type Plan = 'demo' | 'pro';

/** Real access tier derived from auth + subscription. */
export type AccessTier = 'demo' | 'free' | 'pro';

export interface Capabilities {
  /** Pro: exact correction grams (redaction off). */
  exactCorrectionGrams: boolean;
  /** Pro: full scaled formula / exact recipe values. */
  fullFormula: boolean;
  /** Pro: full technical engine view (numeric PI / nutrition / scores). */
  technicalView: boolean;
  /**
   * Paid tier (= ANY active subscription — Home AND Pro both resolve here):
   * exact gram amounts in the assistant starter preview. Explicit name so the
   * starter UI never gates on `isPro` or a price id.
   */
  canViewExactGrams: boolean;
  /**
   * Paid tier (Home AND Pro): apply a `ready` starter draft into the LOCAL
   * Studio draft state (never a save, never a DB write).
   */
  canApplyStarterToStudio: boolean;
  /** Signed-in (free + pro): save recipes. */
  saveRecipes: boolean;
  /** Signed-in (free + pro): My Recipes. */
  myRecipes: boolean;
  /** Reserved — later phases (not implemented). */
  productionMode: boolean;
  rescueMode: boolean;
}

export const CAPABILITIES: Record<AccessTier, Capabilities> = {
  demo: {
    exactCorrectionGrams: false,
    fullFormula: false,
    technicalView: false,
    canViewExactGrams: false,
    canApplyStarterToStudio: false,
    saveRecipes: false,
    myRecipes: false,
    productionMode: false,
    rescueMode: false,
  },
  free: {
    exactCorrectionGrams: false,
    fullFormula: false,
    technicalView: false,
    // `free` (signed in, no subscription) follows the existing redaction model
    // (`fullFormula: false` → no exact grams, no starter apply). The locked
    // plan matrix only names Demo/Home/Pro; free is the signed-in-unpaid state.
    canViewExactGrams: false,
    canApplyStarterToStudio: false,
    saveRecipes: true,
    myRecipes: true,
    productionMode: false,
    rescueMode: false,
  },
  pro: {
    exactCorrectionGrams: true,
    fullFormula: true,
    technicalView: true,
    // the paid tier: Home- AND Pro-priced subscriptions both resolve to 'pro'
    // (planFromSubscription is price-id-agnostic in v0.1).
    canViewExactGrams: true,
    canApplyStarterToStudio: true,
    saveRecipes: true,
    myRecipes: true,
    productionMode: false, // later phase
    rescueMode: false, // later phase
  },
};

export const capabilitiesFor = (tier: AccessTier): Capabilities => CAPABILITIES[tier];
