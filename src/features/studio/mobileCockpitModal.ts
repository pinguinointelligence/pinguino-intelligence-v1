/**
 * Tablets use the same modal cockpit as phones. The side-by-side workbench only
 * starts once both the ingredient editor and the technical cockpit have enough
 * room to remain independently readable.
 */
import { PRO_TABLET_MEDIA_QUERY } from '@/features/shell/proFrameGeometry';

export const MOBILE_COCKPIT_QUERY = PRO_TABLET_MEDIA_QUERY;

export function shouldActivateMobileCockpitModal(open: boolean, mobileViewport: boolean): boolean {
  return open && mobileViewport;
}

export interface MobileCockpitState<Tab extends string = string> {
  activeTab: Tab;
  open: boolean;
  /**
   * Set when this state was chosen OPTIMISTICALLY just before navigating away
   * from this route: React Router 7 delivers the new location in a transition,
   * so for a render or two the route still names where we came from.
   */
  awaitingRouteFrom?: Tab | null;
}

/**
 * What the bottom module bar does when a module is tapped.
 *
 * Open / collapse / switch, as one pure decision. It exists because deriving
 * „open" from the active module silently broke Receptura: its route IS the
 * default (`/pro/recipe`), so `open = activeTab !== 'profile'` could never be
 * true for it and the recipe settings were unreachable on a phone, while
 * Monitor, Produkcja and Etykieta all worked. Module identity and openness are
 * two facts and are now decided as two.
 */
export function nextMobileCockpitState<Tab extends string>(
  current: MobileCockpitState<Tab>,
  tapped: Tab,
): MobileCockpitState<Tab> {
  if (current.open && tapped === current.activeTab) return { activeTab: tapped, open: false };
  return { activeTab: tapped, open: true };
}

/** The state to set just before navigating from `routeTab` to `next.activeTab`. */
export function optimisticMobileCockpitState<Tab extends string>(
  next: MobileCockpitState<Tab>,
  routeTab: Tab,
): MobileCockpitState<Tab> {
  return next.activeTab === routeTab
    ? { activeTab: next.activeTab, open: next.open }
    : { activeTab: next.activeTab, open: next.open, awaitingRouteFrom: routeTab };
}

/**
 * The state to adopt for the current route, or null when nothing changes.
 *
 * PRO MOBILE UX v2 · A3. A module states its intent before it navigates, but
 * React Router 7 delivers the route later, in a transition. Treating the
 * in-between render as an external route change reverted the intent: tapping
 * Receptura from an open Monitor, or „Otwórz ustawienia" sent from any open
 * module, closed the sheet instead of opening the recipe module. Only a route
 * that is neither the one we left nor the one we asked for is an external
 * change (a deep link, the back button), and only that one re-derives the
 * state from the route — exactly as before.
 */
export function reconcileMobileCockpitRoute<Tab extends string>(
  state: MobileCockpitState<Tab>,
  routeTab: Tab,
  defaultTab: Tab,
): MobileCockpitState<Tab> | null {
  if (state.activeTab === routeTab) {
    return state.awaitingRouteFrom == null
      ? null
      : { activeTab: state.activeTab, open: state.open };
  }
  if (state.awaitingRouteFrom != null && state.awaitingRouteFrom === routeTab) return null;
  return { activeTab: routeTab, open: routeTab !== defaultTab };
}

/**
 * Collapsing a read-only cockpit normally returns to the recipe route. During
 * an in-progress Production run, however, the ingredient workspace itself is
 * the active route and must stay mounted so a narrow operator can weigh and
 * confirm rows after closing the summary sheet.
 */
export function collapsedMobileCockpitRoute<Tab extends string>(
  activeTab: Tab,
  defaultTab: Tab,
  keepActiveModule: boolean,
): Tab {
  return keepActiveModule ? activeTab : defaultTab;
}

/**
 * A freshly created mobile Production run must reveal the existing operational
 * weighing workspace. Existing/reloaded runs stay where the operator put them,
 * and desktop never adopts mobile sheet state.
 */
export function shouldRevealProductionWeighingOnNarrowViewport({
  previousSessionId,
  currentSessionId,
  currentStatus,
  activeTab,
  cockpitOpen,
  mobileViewport,
}: {
  previousSessionId: string | null;
  currentSessionId: string | null;
  currentStatus: string | null;
  activeTab: string;
  cockpitOpen: boolean;
  mobileViewport: boolean;
}): boolean {
  return (
    mobileViewport &&
    cockpitOpen &&
    activeTab === 'production' &&
    currentStatus === 'in_progress' &&
    currentSessionId !== null &&
    currentSessionId !== previousSessionId
  );
}
