import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AppShell } from '@/features/shell/AppShell';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useAuthStore } from '@/stores/authStore';

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const authStatus = useAuthStore((state) => state.status);
  const effectiveAccess = useProCoreAccessStore((state) => state.effectiveAccess);
  if (authStatus === 'loading' || (authStatus === 'authed' && effectiveAccess === null)) {
    return (
      <AppShell>
        <p className="mx-auto max-w-7xl px-6 py-16 text-sm text-stone-500">
          Sprawdzam uprawnienia…
        </p>
      </AppShell>
    );
  }
  if (authStatus !== 'authed' || !effectiveAccess?.canAdmin) {
    return (
      <AppShell>
        <section className="mx-auto max-w-3xl px-6 py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            Brak dostępu
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
            Ta sekcja jest tylko dla administratorów
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-stone-600">
            Twoje konto nie ma uprawnień administratora. Wróć do aplikacji albo zaloguj się na
            właściwe konto.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex min-h-11 items-center border border-ink/15 px-4 text-sm font-semibold text-ink"
          >
            Wróć do aplikacji
          </Link>
        </section>
      </AppShell>
    );
  }
  return children;
}
