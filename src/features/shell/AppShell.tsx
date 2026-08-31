import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { OfficialProLogo } from '@/components/shared/OfficialProLogo';
import { copy } from '@/copy/en';
import { DesignReviewOverlay } from '@/features/design-review/ReviewOverlay';
import { proCoreCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { AppNavDrawer } from './AppNavDrawer';
import { navigationAudience } from './appNav';
import { DESKTOP_WORKBENCH_COLUMNS } from './desktopTabAnchorContract';
import { APP_HEADER_ROW, APP_SHELL_MAX_WIDTH_CLASS } from './shellGeometry';

/**
 * THE ONE canonical application shell.
 *
 * ONE header on every authenticated page, measured from the Pro workbench
 * (`/pro/production`) — the owner's visual master. The canonical AppNavDrawer
 * hamburger sits FIRST, immediately left of the PINGÜINO wordmark, in the exact
 * same place on every screen (owner, 2026-08-23: „the shell must not jump").
 *
 * OWNER OVERRIDE (Gellatti V2.1 §6): the hamburger is on the LEFT and the
 * drawer opens from the LEFT on EVERY shell — global desktop, global mobile and
 * the Pro workbench. Any right-side hamburger in the approved preview is
 * superseded by this correction. `navigationPosition` now selects only the
 * TRAILING PLAN BADGE placement; the drawer never moves side, because a control
 * that opens a panel away from itself reads as two unrelated things.
 *
 * An optional `actions` slot holds PAGE-specific controls (e.g. „Zapisz
 * recepturę") — never global navigation. Page content is the children; a page
 * may render its own technical body inside while still wearing this one header.
 */
export function AppShell({
  actions,
  brand,
  workbenchChrome,
  children,
  maxWidthClass = APP_SHELL_MAX_WIDTH_CLASS,
  contentClassName,
  viewportLock = false,
  navigationPosition = 'leading',
  stickyHeader = false,
}: {
  actions?: ReactNode;
  /** Optional page-owned lockup. The shared Gellatti wordmark is the default. */
  brand?: ReactNode;
  /** Route-controlled intelligence status and module tabs for the Pro workbench. */
  workbenchChrome?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  contentClassName?: string;
  /** One-screen workbench (owner 2026-07-24): on desktop the shell locks to the viewport
   * height (`h-dvh`, no BODY scroll) and `main` becomes the ONE intentional scroll
   * surface — the workbench fills it exactly; only the below-fold review zone extends
   * it. ADDITIVE prop; default shell behavior unchanged; mobile flows normally. */
  viewportLock?: boolean;
  /** Destination pages place the same drawer at the trailing edge; the frozen
   * Pro workbench keeps its accepted leading geometry. */
  navigationPosition?: 'leading' | 'trailing';
  /**
   * HOME Creator §10: "the header must remain stable while HOME progresses". HOME is
   * one long sequential document, so its header pins to the top instead of scrolling
   * away with the first section. OPT-IN and default `false`, so every existing page —
   * including the frozen Pro workbench — keeps its accepted geometry untouched.
   */
  stickyHeader?: boolean;
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
        'gellatti-application pro-studio-radius-system theme-pro-light min-h-screen bg-paper text-ink',
        navigationPosition === 'trailing' && 'gellatti-destination-shell',
        viewportLock && 'xl:flex xl:h-dvh xl:min-h-0 xl:flex-col xl:overflow-hidden',
      )}
    >
      <header
        className={cn(
          APP_HEADER_ROW,
          maxWidthClass,
          /* OWNER OVERRIDE (2026-09-01) — ONE global header geometry.
             The workbench split is now applied on EVERY route, not only under
             `viewportLock`. The primary (left) column is the global column: the
             hamburger and the wordmark open it and HOME | PRO closes it, so the
             three land on identical pixels on HOME, PRO, Sklep and Współpraca.
             A route without a module strip simply leaves the display column
             empty — the absence must never pull the primary column wider. */
          `xl:grid ${DESKTOP_WORKBENCH_COLUMNS}`,
          stickyHeader && 'sticky top-0 z-40 bg-paper',
        )}
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        {/* The hamburger is the first element of the header on EVERY screen: one
            fixed origin the eye can rely on while moving between sections. */}
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5 xl:col-start-1 xl:row-start-1">
          <AppNavDrawer />
          <Link
            to={brandDestination}
            aria-label={copy.shell.brand}
            className="flex min-w-0 items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          >
            {brand ?? <OfficialProLogo />}
          </Link>
          {viewportLock ? actions : null}
          <DesignReviewOverlay />
          {/* The trailing edge of the primary column — NOT the viewport edge.
              min-w-0 + wrap: page actions may shrink on narrow screens; the
              header must never force horizontal page overflow. */}
          <div
            className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3"
            data-testid="app-shell-trailing"
          >
            {!viewportLock ? actions : null}
            {!viewportLock &&
            navigationPosition === 'trailing' &&
            (audience === 'pro' || audience === 'home') ? (
              <span
                className="inline-flex h-7 items-center rounded-full border border-ink/15 bg-white px-3.5 text-[9px] font-bold tracking-[0.14em] text-ink"
                data-testid="app-shell-plan-badge"
              >
                {audience === 'pro' ? 'PRO' : 'HOME'}
              </span>
            ) : null}
          </div>
        </div>
        {viewportLock ? workbenchChrome : null}
      </header>
      <main
        className={cn(contentClassName, viewportLock && 'xl:min-h-0 xl:flex-1 xl:overflow-hidden')}
      >
        {children}
      </main>
    </div>
  );
}
