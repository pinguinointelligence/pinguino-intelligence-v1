/**
 * §13 — an ACTIVE HOME subscriber who opens a legacy `/pro/...` URL is taken to the
 * corresponding HOME location, never shown an upgrade wall.
 *
 * Wrapped around the Pro workspace route rather than baked into it, so the Pro
 * workspace itself is untouched: a PRO subscriber and a demo visitor exploring the
 * read-only PRO presentation (§73) both fall straight through.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { proUrlRedirectForHomeSubscriber } from './homeViewMode';
import { useHomeEntitlement } from './useHomeEntitlement';

export function HomeSubscriberProRedirect({ children }: { children: ReactNode }) {
  const entitlement = useHomeEntitlement();
  const location = useLocation();
  const redirect = proUrlRedirectForHomeSubscriber({
    entitlement,
    pathname: location.pathname,
  });
  return redirect ? <Navigate to={redirect} replace /> : <>{children}</>;
}
