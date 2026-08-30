import type { EffectiveAccess } from '@/access/accountAccess/contracts';
import {
  resolveDefaultLandingView,
  type DefaultExperience,
  type ViewEntitlement,
} from '@/features/home-creator/homeViewMode';

export const ADMIN_OVERVIEW_PATH = '/admin/overview';

export type RoleAwareEntry = 'root' | 'start' | 'home';
type AuthStatus = 'loading' | 'authed' | 'anon';

/**
 * Pure role priority for the three ordinary app entrypoints.
 *
 * OWNER SUPERSESSION (HOME Creator V1 §9, 2026-08-30): the public root is now the
 * HOME Creator itself — "opening Gellatti should feel as direct as opening ChatGPT".
 * The previous rule sent an anonymous visitor to a marketing landing page and a HOME
 * subscriber onward to `/home`; both now simply RENDER at `/`, so this function
 * returns null for them rather than a redirect.
 *
 * What did NOT change: Admin still wins outright (an Admin must not pass through HOME
 * onboarding), and the real server-derived EffectiveAccess is still the only authority
 * — email is never inspected and no price id reaches here.
 *
 * §12: a PRO subscriber lands in PRO unless their stated account setting says HOME.
 * The setting is passed in (null = not loaded yet) and never inferred from history.
 */
export function roleAwareEntryDestination(input: {
  entry: RoleAwareEntry;
  authStatus: AuthStatus;
  effectiveAccess: EffectiveAccess | null;
  /** §12 account setting; null when unknown, which falls back to the owner default. */
  defaultExperience?: DefaultExperience | null;
}): string | null {
  if (input.authStatus !== 'authed' || input.effectiveAccess === null) return null;
  if (input.effectiveAccess.canAdmin) return ADMIN_OVERVIEW_PATH;

  const entitlement: ViewEntitlement = {
    authed: true,
    canHome: input.effectiveAccess.canHome,
    canPro: input.effectiveAccess.canPro,
  };

  if (input.effectiveAccess.canPro) {
    const landing = resolveDefaultLandingView({
      entitlement,
      defaultExperience: input.defaultExperience ?? null,
    });
    // A PRO subscriber who asked to start in HOME stays on the root creator.
    return landing === 'pro' ? '/pro/recipe' : null;
  }

  // §9/§11B: a HOME subscriber's product IS the root creator — no hop to /home.
  return null;
}
