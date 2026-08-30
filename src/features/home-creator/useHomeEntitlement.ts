/**
 * The entitlement facts the HOME presentation needs, read from the canonical
 * account-access authority. No price id, no billing SDK, no email inspection — the
 * server-derived `EffectiveAccess` is the only source (§11).
 */
import { useAuthStore } from '@/stores/authStore';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { viewEntitlementFrom, type ViewEntitlement } from './homeViewMode';

export function useHomeEntitlement(): ViewEntitlement {
  const authed = useAuthStore((state) => state.status === 'authed');
  const effectiveAccess = useProCoreAccessStore((state) => state.effectiveAccess);
  return viewEntitlementFrom(authed, effectiveAccess);
}

/**
 * §71/§72: may this viewer see exact grams?
 *
 * Deliberately derived from the SAME `canHome || canPro` entitlement the header uses,
 * so the header and the recipe can never disagree about whether someone has paid.
 */
export function useCanSeeExactGrams(): boolean {
  const entitlement = useHomeEntitlement();
  return entitlement.canHome || entitlement.canPro;
}
