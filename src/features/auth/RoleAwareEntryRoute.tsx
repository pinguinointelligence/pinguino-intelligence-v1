import { useEffect } from 'react';
import { Navigate } from 'react-router';
import { CustomerShellV1 } from '@/features/customer-shell/CustomerShellV1';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useHomeViewStore } from '@/features/home-creator/homeViewStore';
import { readDefaultExperience } from '@/services/accountExperience';
import { HomeCreatorPage } from '@/pages/home/HomeCreatorPage';
import { useAuthStore } from '@/stores/authStore';
import { roleAwareEntryDestination, type RoleAwareEntry } from './roleAwareEntry';

/**
 * Role-aware entry without changing the underlying Home, Pro or Admin products.
 * The real server-derived EffectiveAccess is the only authority; email is never
 * inspected. Admin wins because an Admin must not pass through Home onboarding.
 *
 * OWNER SUPERSESSION (HOME Creator V1 §9): the public root renders the HOME CREATOR,
 * not a marketing landing page. `/start` keeps serving the existing customer shell so
 * older links and bookmarks retain their meaning.
 */
export function RoleAwareEntryRoute({ entry }: { entry: RoleAwareEntry }) {
  const authStatus = useAuthStore((state) => state.status);
  const effectiveAccess = useProCoreAccessStore((state) => state.effectiveAccess);
  const defaultExperience = useHomeViewStore((state) => state.defaultExperience);
  const setDefaultExperience = useHomeViewStore((state) => state.setDefaultExperience);

  // §12: hydrate the stated account setting once per signed-in session. A read
  // failure leaves it null, which resolves to the owner default (PRO) — access is
  // never blocked on a settings lookup.
  useEffect(() => {
    if (authStatus !== 'authed' || defaultExperience !== null) return;
    let cancelled = false;
    void readDefaultExperience().then((value) => {
      if (!cancelled && value !== null) setDefaultExperience(value);
    });
    return () => {
      cancelled = true;
    };
  }, [authStatus, defaultExperience, setDefaultExperience]);

  // AppProviders has already resolved auth before rendering routes. For an
  // authenticated identity, wait for the RLS-backed authority read so the
  // page cannot flash or remain in the wrong product before redirecting.
  if (authStatus === 'authed' && effectiveAccess === null) return null;

  const destination = roleAwareEntryDestination({
    entry,
    authStatus,
    effectiveAccess,
    defaultExperience,
  });
  if (destination) return <Navigate to={destination} replace />;
  // §9: the root and `/home` are the creator; `/start` remains the legacy shell.
  return entry === 'start' ? <CustomerShellV1 /> : <HomeCreatorPage />;
}
