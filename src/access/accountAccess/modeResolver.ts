/**
 * Application mode resolution (PURE). The allowed-mode list is SERVER-AUTHORIZED (derived
 * from EffectiveAccess); a client-persisted mode is only honoured if it is still allowed.
 * No client-side mode manipulation can widen access — an out-of-list stored mode is rejected
 * and replaced by a safe default.
 */
import type { AppMode, EffectiveAccess } from './contracts';

/** Preference order for the safe default landing mode. */
const MODE_PRIORITY: readonly AppMode[] = ['pro', 'home', 'partner', 'admin'];

/** The safe default mode for this access, or null when no mode is allowed. */
export function defaultMode(access: EffectiveAccess): AppMode | null {
  for (const mode of MODE_PRIORITY) {
    if (access.allowedModes.includes(mode)) return mode;
  }
  return null;
}

export interface ResolvedMode {
  /** The mode to use now (persisted mode if still allowed, else the safe default). */
  mode: AppMode | null;
  /** True when a previously-stored mode was rejected because access was removed. */
  rejectedStored: boolean;
  reason: string;
}

/**
 * Resolve which mode to land in, given a (possibly stale) client-persisted mode. A stored
 * mode that is no longer in the authorized list is rejected — never trusted.
 */
export function resolvePersistedMode(
  access: EffectiveAccess,
  storedMode: AppMode | null,
): ResolvedMode {
  if (storedMode !== null && access.allowedModes.includes(storedMode)) {
    return { mode: storedMode, rejectedStored: false, reason: 'restored persisted mode' };
  }
  const fallback = defaultMode(access);
  if (storedMode !== null) {
    return {
      mode: fallback,
      rejectedStored: true,
      reason: `stored mode '${storedMode}' is no longer authorized — fell back to '${fallback ?? 'none'}'`,
    };
  }
  return { mode: fallback, rejectedStored: false, reason: `default mode '${fallback ?? 'none'}'` };
}

/** Server-side guard: may this identity enter `mode` right now? */
export function canEnterMode(access: EffectiveAccess, mode: AppMode): boolean {
  return access.allowedModes.includes(mode);
}
