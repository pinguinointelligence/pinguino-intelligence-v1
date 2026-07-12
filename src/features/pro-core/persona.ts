/**
 * PINGÜINO PRO CORE — the Access → ProCorePersona bridge (PURE, deterministic, no IO/SDK).
 *
 * The ONLY correct persona source is the Account Access entitlement resolver's EffectiveAccess,
 * which distinguishes Home from Pro by entitlement SCOPE ('home'|'pro'|'partner') — never by a
 * plan price id and never by email. The runtime `useAccess`/subscription layer deliberately
 * collapses Home into 'pro', so it can NOT be used to gate Production Mode (Pro-only); this bridge
 * consumes EffectiveAccess instead.
 *
 * When no EffectiveAccess is available (the account-access runtime + backend entitlement rows are
 * a launch-gated dependency), the honest resolution is 'demo' — pro-core features stay gated off
 * rather than guessing a paid user's Home/Pro scope and risking an over-grant of Production Mode.
 */
import type { EffectiveAccess } from '@/access/accountAccess/contracts';
import type { ProCorePersona } from './proCoreCapabilities';

/**
 * Map a resolved EffectiveAccess to a ProCorePersona. Pro wins over Home (mirrors the account-
 * access MODE_PRIORITY), and both come from entitlement scopes — a Pro-scope subscriber is 'pro',
 * a Home-only subscriber is 'home', everyone else (incl. signed-in-but-unentitled) is 'demo'. An
 * approved partner surfaces here only through the scope its entitlement grants (canPro/canHome).
 */
export function personaFromEffectiveAccess(access: EffectiveAccess): ProCorePersona {
  if (access.canPro) return 'pro';
  if (access.canHome) return 'home';
  return 'demo';
}

export interface ProCorePersonaInputs {
  /** The resolved account-access effective access, when the runtime has it (else null). */
  effectiveAccess: EffectiveAccess | null;
  /** DEV-only explicit override (for local acceptance); ignored outside development. */
  devPersona: ProCorePersona | null;
  /** import.meta.env.DEV, passed in so this stays pure/testable. */
  isDev: boolean;
}

/**
 * Resolve the effective ProCorePersona for the current session. In DEV an explicit override wins
 * (so acceptance can exercise demo/home/pro). Otherwise it maps a real EffectiveAccess, and falls
 * back to an honest 'demo' when none is wired — never inventing a paid scope.
 */
export function resolveProCorePersona(inputs: ProCorePersonaInputs): ProCorePersona {
  if (inputs.isDev && inputs.devPersona) return inputs.devPersona;
  if (inputs.effectiveAccess) return personaFromEffectiveAccess(inputs.effectiveAccess);
  return 'demo';
}
