/**
 * useAccess — derives the current session's capabilities from the session plan.
 * The one hook the UI consults for gating decisions (masterplan §5).
 */
import { capabilitiesFor, type Plan, type StudioCapabilities } from '@/access/plans';
import { useSessionStore } from '@/stores/sessionStore';

export interface Access extends StudioCapabilities {
  plan: Plan;
  isPro: boolean;
}

export function useAccess(): Access {
  const plan = useSessionStore((state) => state.plan);
  return { plan, isPro: plan === 'pro', ...capabilitiesFor(plan) };
}
