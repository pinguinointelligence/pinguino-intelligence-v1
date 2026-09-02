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
  globalSwitch,
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
  /**
   * THE canonical HOME | PRO switch, and nothing else.
   *
   * FROZEN GLOBAL CONTRACT (owner, 2026-09-02): every global product surface
   * renders hamburger + official wordmark + HOME | PRO. The switch had been
   * arriving through `actions`, which the workbench branch places inline and the
   * mobile branch hides — so PRO rendered none at all. It now has its own slot,
   * closing the work column on EVERY route including the workbench, so it cannot
   * disappear on one surface again.
   *
   * `actions` stays what it always was: PAGE controls.
   */
  globalSwitch?: ReactNode;
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
        /* The notch inset stays at every width; its FLOOR is a token so the
           workbench breakpoint can drop it. An inline style outranks every
           class, so the literal 0.5 rem here was silently beating the
           `xl:py-0` in APP_HEADER_ROW and standing the whole header band 8 px
           lower than its own fixed height. See `--app-header-top-floor`. */
        style={{ paddingTop: 'max(env(safe-area-inset-top), var(--app-header-top-floor, 0.5rem))' }}
      >
        {/* The hamburger is the first element of the header on EVERY screen: one
            fixed origin the eye can rely on while moving between sections. */}
        <div
          className={cn(
            'flex min-w-0 items-center gap-3 sm:gap-5',
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
          {/* The workbench's page actions carry `flex-1`, which used to consume the
              header row's free space and drag the switch 135 px off the column edge.
              Containing them here keeps that growth inside their own box, so the
              switch still closes the column. Their internal layout is unchanged.

              `hidden xl:flex`, not a bare `flex`: below the workbench breakpoint every
              child of `ProTopActions` is itself hidden, so this box rendered at zero
              width — but a zero-width FLEX ITEM still takes a gap. Served staging
              measured the authenticated workbench's switch exactly one gap right of
              every destination's: +12 px at 390 (`gap-3`) and +20 px at 768
              (`sm:gap-5`). Removing the empty item removes the gap with it. */}
          {viewportLock ? (
            <div className="hidden min-w-0 items-center xl:flex">{actions}</div>
          ) : null}
          {/* The TRAILING EDGE of the work column — never the viewport edge — so the
              switch keeps one global x whether or not the right display column is
              occupied. Rendered on EVERY route, workbench included: the workbench
              keeps its own accepted inline `actions` placement above, and the switch
              still closes the column beside them. */}
          {/* The review overlay is an OWNER OPT-IN (`?owner-review=1`), not a dev-only
              control, so it can render in production. Placed before the trailing
              group it can no longer sit between the switch and the column edge —
              measured at 167 px of displacement when it rendered after it. */}
          <DesignReviewOverlay />
          {/* ONE instance, every breakpoint. This used to be a responsive PAIR whose
              copies were hidden with `hidden` / `xl:hidden`, but a CSS-hidden control
              still occupies the accessibility tree: served measurement on 8dd11c9b
              found a zero-width tablist, so a screen reader met two HOME and two PRO
              tabs. Visual exclusivity is not exclusivity. */}
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Page actions first, the switch LAST: HOME | PRO closes the work
                column, so nothing may sit between it and the column edge. */}
            {!viewportLock ? actions : null}
            {globalSwitch}
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
