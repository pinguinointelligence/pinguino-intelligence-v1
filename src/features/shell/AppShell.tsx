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
import { APP_HEADER_CANVAS, APP_HEADER_ROW, APP_SHELL_MAX_WIDTH_CLASS } from './shellGeometry';

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
          /* OWNER 2026-09-02 (option A): the two-track grid moved OFF the header row
             and into the centred band below. The row itself is the page's full
             width on every route, so the hamburger, the wordmark and the login sit
             on the same pixels everywhere — 32 / 96 / 32 px, measured identically
             on Shop and PRO — instead of being dragged inward by whatever canvas
             the surface beneath happens to use. */
          'xl:relative xl:flex',
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
            // Owner, mobile: the header row is `justify-between` with a single child on
            // a phone, so this slot was content-width and `ml-auto` stopped 74 px short
            // of the edge. Growing it below `sm` lets the switch reach the right gutter.
            // Deliberately NOT applied from `sm` up — the desktop header keeps the
            // geometry it was frozen with.
            'max-sm:flex-1',
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
        </div>

        {/* OWNER 2026-09-02, option A: HOME | PRO stays on the WORKBENCH's column
            edge — the same x on Shop, on HOME and on every destination, not each
            page's own trailing edge. That edge only exists inside the canvas, so
            the two-track grid lives here: a centred band of the canvas width,
            scaled by the same factor as the workbench body beneath it, which is
            also what keeps the module strip on the display column.

            `contents` below the breakpoint, an absolutely centred grid from `xl`
            up — ONE instance of the switch either way. Rendering a second copy and
            hiding it with `xl:hidden` is exactly the trap the note above
            describes: a CSS-hidden control still sits in the accessibility tree.

            `pointer-events-none` on the band with `pointer-events-auto` on its own
            controls: the band spans the row, and without this it would sit over
            the hamburger and the login and swallow their clicks. */}
        <div className={cn('contents', APP_HEADER_CANVAS, `xl:grid ${DESKTOP_WORKBENCH_COLUMNS}`)}>
          <div className="pointer-events-auto ml-auto flex min-w-0 items-center gap-2 sm:gap-3 xl:col-start-1 xl:row-start-1 xl:justify-end">
            {/* Page actions first, the switch LAST: HOME | PRO closes the work
                column, so nothing may sit between it and the column edge. */}
            {!viewportLock ? actions : null}
            {globalSwitch}
          </div>
          {/* OWNER QA 2026-09-03 — REGRESSION FIX. The header canvas is
              `pointer-events-none` so the transparent band cannot swallow
              clicks meant for the page beneath it; every real control inside it
              has to opt back in. The HOME | PRO group did. The module tab strip
              never did, so Receptura / Monitor / Produkcja / Etykieta rendered
              perfectly and were completely dead to the mouse — measured:
              `pointer-events: none`, and `elementFromPoint` on each tab's own
              centre returned the HEADER, not the tab.

              Opting in here rather than inside the strip keeps the rule where
              the canvas is declared: anything placed on this canvas is inert
              until this file says otherwise. */}
          {viewportLock ? (
            <div className="pointer-events-auto contents" data-testid="app-header-workbench-chrome">
              {workbenchChrome}
            </div>
          ) : null}
        </div>

        {/* OWNER 2026-09-02: the login closes the row at the same inset the
            hamburger opens it, so the header reads as one symmetrical band on
            every route. It sits OUTSIDE the centred band on purpose — the band is
            absolutely positioned from `xl` up and would otherwise carry the login
            inward with it. Presentation only for now: no session, no menu, no
            navigation behind it. */}
        <span
          data-testid="app-header-login"
          className="ml-auto hidden shrink-0 items-center rounded-full border border-[var(--g-line)] px-4 py-1.5 text-[12px] font-semibold whitespace-nowrap text-[var(--g-text-secondary)] xl:inline-flex"
        >
          Zaloguj
        </span>
      </header>
      <main
        className={cn(contentClassName, viewportLock && 'xl:min-h-0 xl:flex-1 xl:overflow-hidden')}
      >
        {children}
      </main>
    </div>
  );
}
