export const MOBILE_COCKPIT_QUERY = '(max-width: 1023px)';

export function shouldActivateMobileCockpitModal(open: boolean, mobileViewport: boolean): boolean {
  return open && mobileViewport;
}
