import { Navigate } from 'react-router';
import { CustomerShellV1 } from '@/features/customer-shell/CustomerShellV1';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { LandingPage } from '@/pages/landing/LandingPage';
import { useAuthStore } from '@/stores/authStore';
import { roleAwareEntryDestination, type RoleAwareEntry } from './roleAwareEntry';

/**
 * Role-aware entry without changing the underlying Home, Pro or Admin products.
 * The real server-derived EffectiveAccess is the only authority; email is never
 * inspected. Admin wins because an Admin must not pass through Home onboarding.
 */
export function RoleAwareEntryRoute({ entry }: { entry: RoleAwareEntry }) {
  const authStatus = useAuthStore((state) => state.status);
  const effectiveAccess = useProCoreAccessStore((state) => state.effectiveAccess);

  // AppProviders has already resolved auth before rendering routes. For an
  // authenticated identity, wait for the RLS-backed authority read so the
  // page cannot flash or remain in the wrong product before redirecting.
  if (authStatus === 'authed' && effectiveAccess === null) return null;

  const destination = roleAwareEntryDestination({ entry, authStatus, effectiveAccess });
  if (destination) return <Navigate to={destination} replace />;
  return entry === 'root' ? <LandingPage /> : <CustomerShellV1 />;
}
