/**
 * PINGÜINO design-review mode — PURE gating resolver (Masterpiece UX/UI Phase 3).
 *
 * Owner rule: red `DO PRZEGLĄDU` markers are visible ONLY on staging in an authenticated
 * owner/QA review session — NEVER to public customers, never in the production product.
 *
 * Encoding (no new capability logic — reuses the EXISTING ProCorePersona resolution):
 *  - environment gate: a local dev build (`isDev`) OR an explicit staging opt-in flag
 *    (`VITE_DESIGN_REVIEW === '1'`, set only on the staging deploy target). Production
 *    deploys never set the flag, so customers can never see review markers.
 *  - capability gate: the resolved persona must be 'pro' (the owner/QA capability tier).
 *    Demo/Home customers on staging still see NOTHING.
 */
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

export interface ReviewModeInputs {
  /** import.meta.env.DEV — local development build. */
  isDev: boolean;
  /** import.meta.env.VITE_DESIGN_REVIEW — staging-only opt-in flag ('1' enables). */
  envFlag: string | undefined;
  /** The EXISTING resolved pro-core persona (owner/QA sessions resolve to 'pro'). */
  persona: ProCorePersona;
}

/** True only for owner/QA sessions in dev or on the flagged staging deploy. */
export function isReviewModeEnabled(inputs: ReviewModeInputs): boolean {
  const environmentAllows = inputs.isDev || inputs.envFlag === '1';
  const capabilityAllows = inputs.persona === 'pro';
  return environmentAllows && capabilityAllows;
}
