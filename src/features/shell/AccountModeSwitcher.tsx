import { Link, useLocation } from 'react-router';
import type { AppMode } from '@/access/accountAccess/contracts';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { cn } from '@/lib/cn';

const MODE_META: Readonly<Record<AppMode, { label: string; to: string }>> = {
  home: { label: 'Home', to: '/home' },
  pro: { label: 'Pro', to: '/pro/recipe' },
  partner: { label: 'Partner', to: '/partner' },
  admin: { label: 'Admin', to: '/admin' },
};

// Zustand selectors used through useSyncExternalStore must return a stable
// snapshot while the access projection is still loading. An inline `?? []`
// creates a new array on every read and React 19 correctly rejects that as an
// update loop when the drawer mounts before effectiveAccess is available.
const NO_ALLOWED_MODES: readonly AppMode[] = [];

const activeMode = (pathname: string): AppMode | null => {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/partner' || pathname.startsWith('/partner/')) return 'partner';
  if (pathname === '/pro' || pathname.startsWith('/pro/')) return 'pro';
  if (pathname === '/home' || pathname === '/start') return 'home';
  return null;
};

/** Navigation between server-authorized account modes; never an authorization check. */
export function AccountModeSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const allowed = useProCoreAccessStore(
    (state) => state.effectiveAccess?.allowedModes ?? NO_ALLOWED_MODES,
  );
  const { pathname } = useLocation();
  if (allowed.length === 0) return null;
  const active = activeMode(pathname);
  return (
    <nav aria-label="Tryb konta" className="border-b border-ink/10 px-4 pb-4">
      <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        Tryb konta
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-sm border border-ink/10 bg-white p-1">
        {allowed.map((mode) => {
          const meta = MODE_META[mode];
          return (
            <Link
              key={mode}
              to={meta.to}
              onClick={onNavigate}
              aria-current={active === mode ? 'page' : undefined}
              className={cn(
                'min-h-10 rounded-sm px-3 py-2 text-center text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
                active === mode ? 'bg-ink text-white' : 'text-stone-600 hover:bg-ink/5 hover:text-ink',
              )}
            >
              {meta.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
