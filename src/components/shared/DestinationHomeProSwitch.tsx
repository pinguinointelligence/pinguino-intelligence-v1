import { HomeProSwitch } from '@/features/home-creator/ui/HomeProSwitch';
import { useHomeEntitlement } from '@/features/home-creator/useHomeEntitlement';

/**
 * The global HOME | PRO switch as a destination route wears it.
 *
 * This is WIRING ONLY. The switch, its geometry, its always-visible rule and its
 * entitlement gate are the global header authority (PR #76) and are not
 * redefined here — Work With Us consumes them.
 *
 * `activeView={null}` is the neutral state: a destination is neither HOME nor
 * PRO, so neither segment presents as the current page. Passing `'home'` merely
 * to satisfy the type would tell a visitor they are inside HOME while they read
 * a marketing page.
 *
 * Work With Us has NO PRO module strip — `workbenchChrome` is never passed, so
 * the right display column stays empty. Its emptiness cannot move anything: the
 * hamburger, the logo and this switch all sit in the primary column.
 */
export function DestinationHomeProSwitch() {
  const entitlement = useHomeEntitlement();
  return <HomeProSwitch entitlement={entitlement} activeView={null} />;
}
