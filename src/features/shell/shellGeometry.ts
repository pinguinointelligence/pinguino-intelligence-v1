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

/** Vertical rhythm for non-workbench sections under the one header. */
export const APP_PAGE_BLOCK = 'pt-8 pb-24 sm:pt-10';
