/**
 * PINGÜINO PRO CORE — runtime access store for persona resolution.
 *
 * Holds the resolved account-access EffectiveAccess (populated by the launch-time account-access
 * wiring; null until then, so pro-core features stay honestly gated off) plus a DEV-only persona
 * override used by local acceptance to exercise demo/home/pro without a live subscription.
 * Authorization data only ever flows IN here from the entitlement resolver — never a price id.
 */
import { create } from 'zustand';
import type { EffectiveAccess } from '@/access/accountAccess/contracts';
import type { ProCorePersona } from './proCoreCapabilities';

interface ProCoreAccessState {
  /** The resolved effective access (from resolveAccountAccess), or null when not wired. */
  effectiveAccess: EffectiveAccess | null;
  /** DEV-only explicit persona override; ignored in production by useProCorePersona. */
  devPersona: ProCorePersona | null;
  setEffectiveAccess: (access: EffectiveAccess | null) => void;
  setDevPersona: (persona: ProCorePersona | null) => void;
}

export const useProCoreAccessStore = create<ProCoreAccessState>((set) => ({
  effectiveAccess: null,
  devPersona: null,
  setEffectiveAccess: (effectiveAccess) => set({ effectiveAccess }),
  setDevPersona: (devPersona) => set({ devPersona }),
}));
