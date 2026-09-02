/**
 * ONE application geometry (owner „global UI unification", 2026-08-23).
 *
 * The Pro workbench at `/pro/production` is the visual master. Before this
 * module every screen re-declared its own page origin, gutters and width, so
 * navigating between Receptura / Monitor / Produkcja / Etykieta and the other
 * authenticated destinations visibly shifted the whole instrument.
 *
 * These constants are the shared source of those numbers. They are class
 * recipes only — no engine, pricing, persistence or gating value depends on
 * them, and they must be REUSED rather than re-typed inside a page.
 */

/** The one authenticated workspace width — the Production master's own value. */
export const APP_SHELL_MAX_WIDTH_CLASS = 'max-w-[1776px]';

/**
 * THE ONE CANVAS (owner, 2026-09-02).
 *
 * Shop's content sits in a 1280 px canvas; the workbench is laid out at the
 * approved 1440 px authority and rendered at that same 1280 px through `zoom`,
 * so both surfaces occupy identical space. 1280 / 1440 = 0.8889.
 *
 * The header does NOT scale with it. The hamburger, the wordmark and the login
 * are the page's fixed origins and keep the full page width on every route —
 * only the band carrying HOME | PRO and the module strip is scaled, because
 * that band has to line up with the workbench columns underneath it.
 */
export const APP_CANVAS_SCALE = 0.8889;
export const APP_CANVAS_LAYOUT_WIDTH = 1440;

/** Centred, scaled band inside the header: HOME | PRO and the module strip. */
export const APP_HEADER_CANVAS =
  'xl:pointer-events-none xl:absolute xl:inset-x-0 xl:mx-auto xl:w-[calc(100%-var(--pro-page-gutter))] ' +
  'xl:max-w-[1440px] xl:[zoom:0.8889]';

/**
 * The one header row. Identical geometry with and without `viewportLock`, so
 * the hamburger, the wordmark and the page origin land on the same pixels on
 * every screen. `xl:w-[calc(100%-var(--pro-page-gutter))]` + `xl:px-0` is the
 * Production master's own gutter contract.
 */
export const APP_HEADER_ROW =
  'mx-auto flex w-full shrink-0 items-center justify-between gap-4 border-b border-ink/8 bg-white ' +
  'px-[var(--pro-mobile-gutter)] py-2 sm:px-6 sm:py-3 ' +
  'xl:h-[var(--pro-header-height)] xl:w-[calc(100%-var(--pro-page-gutter))] xl:px-0 xl:py-0';

/**
 * The one page workspace: same origin and same gutters as the workbench.
 * Text-first sections stay LEFT-aligned inside it (see `APP_PAGE_MEASURE`) so a
 * narrower reading measure never moves the page origin.
 */
export const APP_PAGE_WORKSPACE =
  'mx-auto w-full max-w-[1776px] px-[var(--pro-mobile-gutter)] sm:px-6 ' +
  'xl:w-[calc(100%-var(--pro-page-gutter))] xl:px-0';

/** Reading measure for text-first content, anchored to the workspace origin. */
export const APP_PAGE_MEASURE = 'w-full max-w-[var(--pro-content-measure)]';

/**
 * Approved Gellatti V2 destination canvas. It is intentionally wider than the
 * reading measure: library grids, catalog master/detail and admin queues need
 * the full 1280 px owner-preview geometry while prose can still opt into
 * `APP_PAGE_MEASURE` inside it.
 */
export const APP_PAGE_CANVAS = 'mx-auto w-full max-w-[1280px]';

/**
 * Vertical rhythm for non-workbench sections under the one header.
 *
 * V2.1: measured on the authority as 26 px on mobile and 42 px from ≥ 640 —
 * the page block used to open at 32 / 40, so every destination started 6 px too
 * low on a phone and 2 px too high on a desktop.
 */
export const APP_PAGE_BLOCK = 'pt-[26px] pb-24 sm:pt-[42px]';
