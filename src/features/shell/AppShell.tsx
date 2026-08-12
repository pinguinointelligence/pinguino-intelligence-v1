import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { copy } from '@/copy/en';
import { DesignReviewOverlay } from '@/features/design-review/ReviewOverlay';
import { proCoreCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { AppNavDrawer } from './AppNavDrawer';
import { navigationAudience } from './appNav';

/**
 * THE ONE canonical application shell.
 *
 * A single light header on every primary page: the PINGÜINO wordmark top-LEFT (links home) and the
 * canonical AppNavDrawer hamburger top-RIGHT (one right-side drawer, one nav config). An optional
 * `actions` slot holds PAGE-specific controls (e.g. „Zapisz recepturę") — never global navigation.
 * Page content is the children; a page may render its own dark/technical body inside (e.g. the
 * Studio lab) while still wearing this one header + menu.
 */
export function AppShell({
  actions,
  brand,
  children,
  maxWidthClass = 'max-w-6xl',
  contentClassName,
  viewportLock = false,
}: {
  actions?: ReactNode;
  /** Optional page-owned official lockup. The default shell mark remains unchanged
   * for routes outside an explicitly approved redesign scope. */
  brand?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  contentClassName?: string;
  /** One-screen workbench (owner 2026-07-24): on desktop the shell locks to the viewport
   * height (`h-dvh`, no BODY scroll) and `main` becomes the ONE intentional scroll
   * surface — the workbench fills it exactly; only the below-fold review zone extends
   * it. ADDITIVE prop; default shell behavior unchanged; mobile flows normally. */
  viewportLock?: boolean;
}) {
  const persona = useProCorePersona();
  const capabilities = proCoreCapabilitiesFor(persona);
  const authStatus = useAuthStore((state) => state.status);
  const devMemberPreview = import.meta.env.DEV && persona !== 'demo';
  const audience = navigationAudience({
    authenticated: authStatus === 'authed' || devMemberPreview,
    canSaveRecipes: capabilities.canSaveRecipe,
    canUseProductionMode: capabilities.canUseProductionMode,
  });
  const brandDestination = audience === 'pro' ? '/pro/recipe' : audience === 'home' ? '/home' : '/';

  return (
    <div
      className={cn(
        'min-h-screen bg-paper text-ink',
        viewportLock && 'lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden',
      )}
    >
      <header
        className={cn(
          'mx-auto flex items-center justify-between gap-4 px-6 py-4 2xl:px-0',
          maxWidthClass,
          viewportLock &&
            'max-sm:grid max-sm:grid-cols-1 max-sm:items-stretch max-sm:gap-2 max-sm:px-3 max-sm:py-2 lg:h-[136px] lg:w-full lg:shrink-0 lg:items-start lg:overflow-visible lg:py-0',
        )}
        style={{
          paddingTop: viewportLock
            ? 'max(env(safe-area-inset-top), 0.5rem)'
            : 'max(env(safe-area-inset-top), 1rem)',
        }}
      >
        <Link
          to={brandDestination}
          aria-label={copy.shell.brand}
          className={cn(
            'flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
            viewportLock && 'lg:z-20 lg:mt-7 2xl:mt-[46px] 2xl:ml-[3px]',
          )}
        >
          {brand ?? (
            <>
              <IvoryLogoMark size={22} tone="ink" />
              <span className="text-sm font-light tracking-wordmark">{copy.shell.brand}</span>
            </>
          )}
        </Link>
        {/* min-w-0 + wrap: page actions may shrink/wrap on narrow screens — the header must
            never force horizontal page overflow (owner P0 responsive rule). */}
        <div
          className={cn(
            'flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3',
            viewportLock && 'max-sm:w-full max-sm:flex-nowrap max-sm:justify-between lg:mt-6',
          )}
        >
          {actions}
          {/* Owner/QA only. Kept in normal header flow so review tooling can
              never cover an ingredient control or another primary action. */}
          <DesignReviewOverlay />
          <AppNavDrawer />
        </div>
      </header>
      <main
        className={cn(contentClassName, viewportLock && 'lg:min-h-0 lg:flex-1 lg:overflow-hidden')}
      >
        {children}
      </main>
    </div>
  );
}
