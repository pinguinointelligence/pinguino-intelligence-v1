/**
 * PINGÜINO design-review mode — PURE gating resolver (Masterpiece UX/UI Phase 3).
 *
 * Owner rule: red `DO PRZEGLĄDU` markers are visible ONLY on staging in an authenticated
 * owner/QA review session — NEVER to public customers, never in the production product.
 *
 * Encoding (no new capability logic — reuses the EXISTING ProCorePersona resolution):
 *  - environment gate: a local dev build (`isDev`), the exact canonical staging host,
 *    OR an explicit staging opt-in flag (`VITE_DESIGN_REVIEW === '1'`) for preview URLs.
 *    Production never matches the canonical staging host, so customers can never see
 *    review markers there even when the same bundle is built by another Vercel project.
 *  - capability gate: the resolved persona must be 'pro' (the owner/QA capability tier).
 *    Demo/Home customers on staging still see NOTHING.
 */
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

export interface ReviewModeInputs {
  /** import.meta.env.DEV — local development build. */
  isDev: boolean;
  /** import.meta.env.VITE_DESIGN_REVIEW — staging-only opt-in flag ('1' enables). */
  envFlag: string | undefined;
  /** Runtime host. Exact matching keeps lookalike and production hosts fail-closed. */
  hostname?: string;
  /** The EXISTING resolved pro-core persona (owner/QA sessions resolve to 'pro'). */
  persona: ProCorePersona;
  /** Explicit per-session owner/QA opt-in. Commercial Pro entitlement alone
   * must never expose internal review surfaces on staging. */
  ownerOptIn?: boolean;
}

export function ownerReviewStorageKey(ownerUserId: string | null): string {
  return `pinguino-owner-review:${ownerUserId ?? 'anonymous'}`;
}

/** True only for owner/QA sessions in dev or on an explicitly recognised staging deploy. */
export function isReviewModeEnabled(inputs: ReviewModeInputs): boolean {
  const isProductionHost =
    inputs.hostname === 'pinguinoai.com' || inputs.hostname === 'www.pinguinoai.com';
  const stagingAllows =
    inputs.hostname === 'staging.pinguinoai.com' || inputs.envFlag === '1';
  const environmentAllows =
    !isProductionHost && (inputs.isDev || (stagingAllows && inputs.ownerOptIn === true));
  const capabilityAllows = inputs.persona === 'pro';
  return environmentAllows && capabilityAllows;
}
