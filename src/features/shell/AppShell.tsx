import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { AppNavDrawer } from './AppNavDrawer';

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
  children,
  maxWidthClass = 'max-w-6xl',
  contentClassName,
  viewportLock = false,
}: {
  actions?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  contentClassName?: string;
  /** One-screen workbench (owner 2026-07-24): on desktop the shell locks to the viewport
   * height (`h-dvh`, no BODY scroll) and `main` becomes the ONE intentional scroll
   * surface — the workbench fills it exactly; only the below-fold review zone extends
   * it. ADDITIVE prop; default shell behavior unchanged; mobile flows normally. */
  viewportLock?: boolean;
}) {
  return (
    <div
      className={cn(
        'min-h-screen bg-paper text-ink',
        viewportLock && 'lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden',
      )}
    >
      <header
        className={cn(
          'mx-auto flex items-center justify-between gap-4 px-6 py-4',
          maxWidthClass,
          viewportLock && 'max-sm:grid max-sm:grid-cols-1 max-sm:items-stretch max-sm:gap-2 max-sm:px-3 max-sm:py-2 lg:w-full lg:shrink-0',
        )}
        style={{ paddingTop: viewportLock ? 'max(env(safe-area-inset-top), 0.5rem)' : 'max(env(safe-area-inset-top), 1rem)' }}
      >
        <Link
          to="/"
          aria-label={copy.shell.brand}
          className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          <IvoryLogoMark size={22} tone="ink" />
          <span className="text-sm font-light tracking-wordmark">{copy.shell.brand}</span>
        </Link>
        {/* min-w-0 + wrap: page actions may shrink/wrap on narrow screens — the header must
            never force horizontal page overflow (owner P0 responsive rule). */}
        <div className={cn(
          'flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3',
          viewportLock && 'max-sm:w-full max-sm:flex-nowrap max-sm:justify-between',
        )}>
          {actions}
          <AppNavDrawer />
        </div>
      </header>
      <main
        className={cn(
          contentClassName,
          viewportLock && 'lg:min-h-0 lg:flex-1 lg:overflow-hidden',
        )}
      >
        {children}
      </main>
    </div>
  );
}
