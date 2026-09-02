import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useAuthStore } from '@/stores/authStore';

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const authStatus = useAuthStore((state) => state.status);
  const effectiveAccess = useProCoreAccessStore((state) => state.effectiveAccess);
  if (authStatus === 'loading' || (authStatus === 'authed' && effectiveAccess === null)) {
    return (
      <DestinationSurface
        eyebrow="Administracja"
        title="Kontrola dostępu"
        blurb="Sprawdzamy aktywną sesję i przypisane uprawnienia."
      >
        <ApplicationState kind="loading" title="Sprawdzam uprawnienia…" />
      </DestinationSurface>
    );
  }
  if (authStatus !== 'authed' || !effectiveAccess?.canAdmin) {
    return (
      <DestinationSurface eyebrow="Administracja" title="Dostęp administracyjny">
        <ApplicationState
          kind="empty"
          title="Ta sekcja jest tylko dla administratorów"
          body="Twoje konto nie ma uprawnień administratora. Wróć do aplikacji albo zaloguj się na właściwe konto."
          action={
            <Link to="/" className={applicationSecondaryClasses()}>
              Wróć do aplikacji
            </Link>
          }
        />
      </DestinationSurface>
    );
  }
  return children;
}
