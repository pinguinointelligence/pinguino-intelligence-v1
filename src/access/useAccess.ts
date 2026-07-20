/**
 * useAccess — the one hook the UI consults for gating (masterplan §5).
 *
 * Access is derived from REAL state: auth (signed in?) + subscription (Pro?).
 * The internal DEV override (sessionStore) can force Pro ONLY in development —
 * it is ignored in production builds, where Pro comes solely from the subscription.
 */
import { capabilitiesFor, type AccessTier, type Capabilities, type Plan } from '@/access/plans';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';

export interface Access extends Capabilities {
  /** Chip-level plan for the StatusChip ('pro' when Pro, else 'demo'). */
  plan: Plan;
  tier: AccessTier;
  isSignedIn: boolean;
  isPro: boolean;
}

export function useAccess(): Access {
  const isSignedIn = useAuthStore((state) => state.status === 'authed');
  const subscriptionPlan = useSubscriptionStore((state) => state.plan);
  const devOverridePro = useSessionStore((state) => state.plan === 'pro');
  // The CANONICAL paid signal is the account-access entitlement (public.entitlements,
  // written by the billing webhook). The subscription-cache plan is the legacy
  // fallback (a separate webhook that may not be wired). Either → paid. Additive:
  // this only ever GRANTS Pro, never removes it.
  const proFromEntitlement = useProCoreAccessStore((state) => state.effectiveAccess?.canPro ?? false);

  // Pro from a real entitlement (canonical) or subscription cache, or the DEV override.
  const isPro = proFromEntitlement || subscriptionPlan === 'pro' || (import.meta.env.DEV && devOverridePro);
  const tier: AccessTier = isPro ? 'pro' : isSignedIn ? 'free' : 'demo';

  return {
    plan: isPro ? 'pro' : 'demo',
    tier,
    isSignedIn,
    isPro,
    ...capabilitiesFor(tier),
  };
}
