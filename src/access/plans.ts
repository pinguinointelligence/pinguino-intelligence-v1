/**
 * Capability matrix — the single source of plan gating truth (masterplan §5).
 *
 * Step 5A scope: `demo` is the default public session; `pro` is an INTERNAL
 * test/preview level only (no payment provider, no auth — those are Phase 4).
 * `exactCorrectionGrams` drives BOTH the correction-panel branch and the
 * solver `redact` flag, so they can never disagree.
 */
export type Plan = 'demo' | 'pro';

export interface StudioCapabilities {
  /** Pro sees exact correction grams; demo gets redacted teasers only. */
  exactCorrectionGrams: boolean;
  /** Full ingredient database (Phase 2) — never in 5A. */
  fullIngredientDatabase: boolean;
  /** Recipe saving (Phase 2) — never in 5A. */
  saveRecipes: boolean;
  /** Label / PDF export (Phase 4) — never in 5A. */
  exportLabels: boolean;
}

export const PLAN_CAPABILITIES: Record<Plan, StudioCapabilities> = {
  demo: {
    exactCorrectionGrams: false,
    fullIngredientDatabase: false,
    saveRecipes: false,
    exportLabels: false,
  },
  pro: {
    exactCorrectionGrams: true,
    fullIngredientDatabase: false, // still not wired in 5A
    saveRecipes: false,
    exportLabels: false,
  },
};

export const capabilitiesFor = (plan: Plan): StudioCapabilities => PLAN_CAPABILITIES[plan];
