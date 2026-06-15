/**
 * Subscription store (Phase 2B.1) — the current user's PI Pro plan, read via the
 * billing service. Vendor-free (no client import here).
 *
 * Loaded after sign-in and cleared on sign-out (wired in providers). Reflects the
 * REAL subscription only — the DEV override lives in sessionStore and is applied
 * by useAccess in development.
 */
import { create } from 'zustand';
import { planFromSubscription, type Subscription, type SubscriptionPlan } from '@/access/subscription';
import { getMySubscription } from '@/services/billing';

interface SubscriptionState {
  status: 'idle' | 'loading' | 'ready';
  subscription: Subscription | null;
  /** Derived real plan ('pro' only when an active/grace subscription exists). */
  plan: SubscriptionPlan;
  load: () => Promise<void>;
  clear: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  status: 'idle',
  subscription: null,
  plan: 'free',

  load: async () => {
    set({ status: 'loading' });
    try {
      const subscription = await getMySubscription();
      set({ subscription, plan: planFromSubscription(subscription), status: 'ready' });
    } catch {
      // On any read failure, fail safe to free (never accidentally grant Pro).
      set({ subscription: null, plan: 'free', status: 'ready' });
    }
  },

  clear: () => set({ status: 'idle', subscription: null, plan: 'free' }),
}));
