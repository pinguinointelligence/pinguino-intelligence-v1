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
          /* GLOBAL HEADER PARITY (owner, 2026-09-01). The two-track grid is the GLOBAL
             geometry, not a workbench detail: it is what puts the hamburger, the logo
             and the HOME|PRO switch on the same pixels in HOME and PRO. It is applied
             independently of `viewportLock`, because that prop also locks the BODY to
             the viewport (`h-dvh`, no page scroll) — correct for the workbench, wrong
             for HOME's long sequential document. Geometry is shared; scroll behaviour
             stays each page's own. */
          `xl:grid ${DESKTOP_WORKBENCH_COLUMNS}`,
          stickyHeader && 'sticky top-0 z-40 bg-paper',
        )}
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        {/* The hamburger is the first element of the header on EVERY screen: one
            fixed origin the eye can rely on while moving between sections. */}
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 sm:gap-5',
            'xl:col-start-1 xl:row-start-1',
          )}
        >
          <AppNavDrawer />
          <Link
            to={brandDestination}
            aria-label={copy.shell.brand}
            className="flex min-w-0 items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          >
            {brand ?? <OfficialProLogo />}
          </Link>
          {viewportLock ? actions : null}
          {/* Non-workbench pages put their actions at the TRAILING EDGE of this same
              work column — never at the viewport edge — so the HOME|PRO switch keeps
              one global x whether or not the right display column is occupied. The
              workbench keeps its own accepted inline placement above, untouched. */}
          {!viewportLock ? (
            /* Rendered ONCE at every breakpoint. A second copy hidden with `hidden`
               stayed in the accessibility tree as a zero-width duplicate tablist, so a
               screen reader met two HOME and two PRO tabs (served 8dd11c9b). */
            <div className="ml-auto flex items-center gap-2 sm:gap-3">{actions}</div>
          ) : null}
          <DesignReviewOverlay />
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
