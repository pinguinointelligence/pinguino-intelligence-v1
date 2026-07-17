/**
 * PINGÜINO User Monitor — `UserMonitorLayout` (SPEC §14.3, §23.1; UIUX Slice D).
 *
 * The Pro user's Monitor customization: which §14.2 modules are visible, which
 * parameters are pinned to the overview, and the pinned order. Pure layout
 * model + reducers + a DEVICE-LOCAL persistence adapter:
 *
 *  - module ORDER is the fixed §14.2 order — the user reorders PINNED items
 *    („Może zmienić kolejność przypiętych elementów"), not whole modules;
 *  - „Tryb Expert" (module 9) defaults OFF — „tylko gdy potrzebne";
 *  - reset restores the safe default (§14.3);
 *  - persistence is per-device localStorage in this client-only build; the
 *    per-USER server-side `UserMonitorLayout` entity (§23.1) is launch-gated
 *    backend work — the storage adapter is the seam it will replace.
 *
 * Pure reducers never mutate; the storage adapter never throws.
 */
import type { TargetMetric } from '@/engine';

/* ------------------------------------------------------------------------ *
 * Modules (§14.2 fixed order)                                              *
 * ------------------------------------------------------------------------ */

export const USER_MONITOR_MODULE_ORDER = [
  'temperatura',
  'cukry',
  'woda',
  'tluszcze',
  'bialka',
  'ciala_stale',
  'stabilizacja',
  'specjalne',
  'expert',
] as const;

export type UserMonitorModuleId = (typeof USER_MONITOR_MODULE_ORDER)[number];

/* ------------------------------------------------------------------------ *
 * Layout model                                                             *
 * ------------------------------------------------------------------------ */

export interface UserMonitorLayout {
  version: 1;
  /** Module visibility (§14.3 „może włączać/wyłączać moduły"). */
  enabled: Record<UserMonitorModuleId, boolean>;
  /** Metrics pinned to the overview, in the USER'S order (§14.3). */
  pinned: TargetMetric[];
}

/** The safe default (§14.3 reset target): all modules on, Expert off, no pins. */
export function defaultUserMonitorLayout(): UserMonitorLayout {
  const enabled = Object.fromEntries(
    USER_MONITOR_MODULE_ORDER.map((id) => [id, id !== 'expert']),
  ) as Record<UserMonitorModuleId, boolean>;
  return { version: 1, enabled, pinned: [] };
}

/* ------------------------------------------------------------------------ *
 * Pure reducers                                                            *
 * ------------------------------------------------------------------------ */

export function toggleModule(
  layout: UserMonitorLayout,
  moduleId: UserMonitorModuleId,
): UserMonitorLayout {
  return {
    ...layout,
    enabled: { ...layout.enabled, [moduleId]: !layout.enabled[moduleId] },
  };
}

export function pinMetric(layout: UserMonitorLayout, metric: TargetMetric): UserMonitorLayout {
  if (layout.pinned.includes(metric)) return layout;
  return { ...layout, pinned: [...layout.pinned, metric] };
}

export function unpinMetric(layout: UserMonitorLayout, metric: TargetMetric): UserMonitorLayout {
  if (!layout.pinned.includes(metric)) return layout;
  return { ...layout, pinned: layout.pinned.filter((m) => m !== metric) };
}

/** Move a pinned metric one step up/down its list (no-op at the edges). */
export function movePinned(
  layout: UserMonitorLayout,
  metric: TargetMetric,
  direction: 'up' | 'down',
): UserMonitorLayout {
  const index = layout.pinned.indexOf(metric);
  if (index === -1) return layout;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= layout.pinned.length) return layout;
  const pinned = [...layout.pinned];
  const swapped = pinned[target];
  if (swapped === undefined) return layout; // unreachable (bounds checked)
  pinned[target] = metric;
  pinned[index] = swapped;
  return { ...layout, pinned };
}

export function resetUserMonitorLayout(): UserMonitorLayout {
  return defaultUserMonitorLayout();
}

/* ------------------------------------------------------------------------ *
 * Validation + device-local persistence                                    *
 * ------------------------------------------------------------------------ */

const MODULE_IDS = new Set<string>(USER_MONITOR_MODULE_ORDER);

/** Parse an untrusted stored value into a valid layout, or null. Unknown module
 * ids / non-string pins are dropped (a stale layout never breaks the monitor). */
export function parseUserMonitorLayout(raw: unknown): UserMonitorLayout | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as { version?: unknown; enabled?: unknown; pinned?: unknown };
  if (candidate.version !== 1) return null;
  if (typeof candidate.enabled !== 'object' || candidate.enabled === null) return null;
  if (!Array.isArray(candidate.pinned)) return null;

  const layout = defaultUserMonitorLayout();
  for (const [key, value] of Object.entries(candidate.enabled as Record<string, unknown>)) {
    if (MODULE_IDS.has(key) && typeof value === 'boolean') {
      layout.enabled[key as UserMonitorModuleId] = value;
    }
  }
  const pins = (candidate.pinned as unknown[]).filter((p): p is string => typeof p === 'string');
  layout.pinned = [...new Set(pins)] as TargetMetric[];
  return layout;
}

export const USER_MONITOR_LAYOUT_STORAGE_KEY = 'pinguino.user-monitor-layout.v1';

/** Load the device-local layout; any failure yields the safe default. */
export function loadUserMonitorLayout(
  storage: Pick<Storage, 'getItem'> | null = typeof window !== 'undefined' ? window.localStorage : null,
): UserMonitorLayout {
  if (storage === null) return defaultUserMonitorLayout();
  try {
    const raw = storage.getItem(USER_MONITOR_LAYOUT_STORAGE_KEY);
    if (raw === null) return defaultUserMonitorLayout();
    return parseUserMonitorLayout(JSON.parse(raw)) ?? defaultUserMonitorLayout();
  } catch {
    return defaultUserMonitorLayout();
  }
}

/** Persist the device-local layout (best-effort; never throws). */
export function saveUserMonitorLayout(
  layout: UserMonitorLayout,
  storage: Pick<Storage, 'setItem'> | null = typeof window !== 'undefined' ? window.localStorage : null,
): void {
  if (storage === null) return;
  try {
    storage.setItem(USER_MONITOR_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Quota/privacy-mode failures are silent — the layout simply stays in memory.
  }
}
