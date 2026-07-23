/**
 * Customer `/start` ACCESS-RESOLUTION SEAM (pure) — the single place the shell
 * consults for every plan-dependent presentation decision.
 *
 * HISTORY (audit-proven P0): CustomerShellV1 originally hardcoded
 * `const [persona, setPersona] = useState<CustomerPersona>('demo')`
 * (commit 54d58b1, line 211) — a signed-in paying Home/Pro user could NEVER see
 * exact grams at `/start` and always met the Demo paywall. The runtime chain is
 * now:
 *
 *   auth session (authStore) → user id → RLS-scoped `entitlements` rows
 *   (`liveEffectiveAccess.syncEffectiveAccess`, wired in `AppProviders`) →
 *   `resolveAccountAccess` → `EffectiveAccess` → `proCoreAccessStore` →
 *   `useProCorePersona` (pure `resolveProCorePersona`) → THIS projection →
 *   presentation.
 *
 * This module keeps that last hop PURE and in one place, so the persona matrix
 * (grams visibility, Demo paywall, save availability, machine flow, technical
 * details) is unit-testable without a DOM and no surface can drift back to a
 * hardcoded persona. It projects the CANONICAL capability sources — it never
 * invents a rule of its own:
 *  - grams visibility → `gramVisibilityForPersona` (customer-flow, redaction
 *    at source);
 *  - save availability → `recipeCapabilitiesFor` (pro-core canonical matrix,
 *    incl. `HOME_MAX_SAVED_RECIPES`);
 *  - technical details → `showTechnicalDetails` (owner UX correction §3/§10);
 *  - machine flow → owner hotfix 2026-07-17 §7/§8/§9: everyone is machine-first
 *    EXCEPT `pro`, who picks a serving temperature and never a home device.
 */
import { gramVisibilityForPersona, type CustomerPersona, type GramVisibilityCapability } from '@/features/customer-flow';
import { recipeCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import type { MachinePreferenceStatus } from '@/features/machine-onboarding';
import { showTechnicalDetails } from './resultPresentation';

/** How the serving question is answered: a home machine, or a pro temperature. */
export type CustomerMachineFlow = 'machine_first' | 'temperature_first';

/** Everything plan-dependent the `/start` shell presents, resolved per persona. */
export interface CustomerShellAccess {
  persona: CustomerPersona;
  /** Feeds `buildCustomerRecipeView` — Demo payloads carry no grams at all. */
  gramVisibility: GramVisibilityCapability;
  /** Owner §9: only `pro` answers with a serving temperature (machine gate 'off'). */
  machineFlow: CustomerMachineFlow;
  /** Owner §3/§10: „Dane techniczne” is a professional surface only. */
  showsTechnicalDetails: boolean;
  /** Canonical save capability (Demo: none; Home: HOME_MAX_SAVED_RECIPES; Pro: unlimited). */
  save: RecipeCapabilities;
}

/** Resolve the full `/start` presentation access for the entitlement-derived persona. */
export function customerShellAccessFor(persona: CustomerPersona): CustomerShellAccess {
  return {
    persona,
    gramVisibility: gramVisibilityForPersona(persona),
    machineFlow: persona === 'pro' ? 'temperature_first' : 'machine_first',
    showsTechnicalDetails: showTechnicalDetails(persona),
    save: recipeCapabilitiesFor(persona),
  };
}

/** The machine-first Home gate states (owner hotfix 2026-07-17 §7/§8). */
export type CustomerMachineGate = 'off' | 'loading' | 'onboarding' | 'saved';

/**
 * Machine-first gate resolution. It keys off the FLOW, not off an account: the
 * public customer flow IS machine-first (production serves every visitor as
 * `demo` when unentitled — an anonymous visitor whose machine lives in
 * localStorage is respected exactly like a signed-in one). Only the
 * temperature-first professional flow opts out. The gate keys off the PROFILE
 * record — a recipe-scope override never sends a machine-owning user back to
 * onboarding.
 */
export function resolveCustomerMachineGate(input: {
  machineFlow: CustomerMachineFlow;
  preferenceStatus: MachinePreferenceStatus;
  /** A saved profile record whose catalog id still resolves to a context view. */
  hasUsableProfileMachine: boolean;
  machineChangeOpen: boolean;
}): CustomerMachineGate {
  if (input.machineFlow === 'temperature_first') return 'off';
  if (input.preferenceStatus === 'loading') return 'loading';
  if (!input.hasUsableProfileMachine || input.machineChangeOpen) return 'onboarding';
  return 'saved';
}

/**
 * The Demo paywall (sticky upgrade CTA) shows ONLY on the result phase and ONLY
 * when the built view withheld exact grams — i.e. for the Demo persona. A
 * signed-in Home/Pro user (gramsVisible) NEVER sees it.
 */
export function demoPaywallVisible(input: { isResultPhase: boolean; gramsVisible: boolean }): boolean {
  return input.isResultPhase && !input.gramsVisible;
}
