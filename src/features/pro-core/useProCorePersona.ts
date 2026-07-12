/**
 * useProCorePersona — the runtime hook the real pro-core surfaces consult for gating.
 *
 * Thin zustand wrapper over the pure `resolveProCorePersona`: a DEV override wins in development,
 * otherwise it maps the resolved EffectiveAccess, honestly falling back to 'demo' when the
 * account-access runtime is not wired. Feed the result into proCoreCapabilitiesFor / its
 * projections to gate saves, versions, Production Mode and exports.
 */
import { useProCoreAccessStore } from './proCoreAccessStore';
import { resolveProCorePersona } from './persona';
import type { ProCorePersona } from './proCoreCapabilities';

export function useProCorePersona(): ProCorePersona {
  const effectiveAccess = useProCoreAccessStore((state) => state.effectiveAccess);
  const devPersona = useProCoreAccessStore((state) => state.devPersona);
  return resolveProCorePersona({ effectiveAccess, devPersona, isDev: import.meta.env.DEV });
}
