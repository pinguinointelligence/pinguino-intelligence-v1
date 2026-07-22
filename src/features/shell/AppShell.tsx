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
}: {
  actions?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  contentClassName?: string;
}) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header
        className={cn('mx-auto flex items-center justify-between gap-4 px-6 py-4', maxWidthClass)}
        style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}
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
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          {actions}
          <AppNavDrawer />
        </div>
      </header>
      <main className={contentClassName}>{children}</main>
    </div>
  );
}
