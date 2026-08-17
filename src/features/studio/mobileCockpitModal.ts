/**
 * Tablets use the same modal cockpit as phones. The side-by-side workbench only
 * starts once both the ingredient editor and the technical cockpit have enough
 * room to remain independently readable.
 */
export const MOBILE_COCKPIT_QUERY = '(max-width: 1279px)';

export function shouldActivateMobileCockpitModal(open: boolean, mobileViewport: boolean): boolean {
  return open && mobileViewport;
}
