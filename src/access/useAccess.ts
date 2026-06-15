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

  // Pro from a real subscription, or the DEV-only internal override.
  const isPro = subscriptionPlan === 'pro' || (import.meta.env.DEV && devOverridePro);
  const tier: AccessTier = isPro ? 'pro' : isSignedIn ? 'free' : 'demo';

  return {
    plan: isPro ? 'pro' : 'demo',
    tier,
    isSignedIn,
    isPro,
    ...capabilitiesFor(tier),
  };
}
