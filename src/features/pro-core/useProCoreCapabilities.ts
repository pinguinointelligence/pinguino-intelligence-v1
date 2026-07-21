/**
 * useProCoreCapabilities — the one hook Pro feature components consult for gating.
 *
 * Resolves the runtime persona (entitlement-driven via useProCorePersona) and returns the
 * frozen canonical capability set for it. Components read booleans from here — NEVER a plan
 * price id, an account email, a route name, or a raw `isPro`. This keeps every Pro surface
 * gated on the same single source of truth (`PRO_CORE_CAPABILITIES`).
 */
import { useProCorePersona } from './useProCorePersona';
import { proCoreCapabilitiesFor, type ProCoreCapabilities } from './proCoreCapabilities';

export function useProCoreCapabilities(): ProCoreCapabilities {
  return proCoreCapabilitiesFor(useProCorePersona());
}
