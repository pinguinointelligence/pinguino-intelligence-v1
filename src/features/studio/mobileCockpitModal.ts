/**
 * Tablets use the same modal cockpit as phones. The side-by-side workbench only
 * starts once both the ingredient editor and the technical cockpit have enough
 * room to remain independently readable.
 */
export const MOBILE_COCKPIT_QUERY = '(max-width: 1279px)';

export function shouldActivateMobileCockpitModal(open: boolean, mobileViewport: boolean): boolean {
  return open && mobileViewport;
}

export interface MobileCockpitState<Tab extends string = string> {
  activeTab: Tab;
  open: boolean;
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
