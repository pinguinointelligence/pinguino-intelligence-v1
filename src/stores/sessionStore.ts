/**
 * Session store — the access level for the current Studio session.
 *
 * `demo` is the default public level. `pro` is an INTERNAL test/preview toggle
 * (dev only) — NOT a subscription: no payment provider, no auth. Real plan
 * gating arrives in Phase 4. Persisted to localStorage so a reload keeps the
 * chosen level.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Plan } from '@/access/plans';

interface SessionState {
  plan: Plan;
  setPlan: (plan: Plan) => void;
  togglePlan: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      plan: 'demo',
      setPlan: (plan) => set({ plan }),
      togglePlan: () => set((state) => ({ plan: state.plan === 'demo' ? 'pro' : 'demo' })),
    }),
    { name: 'pinguino-session' },
  ),
);
