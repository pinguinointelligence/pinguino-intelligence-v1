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
 * ONE physical PRO frame. The header canvas and workbench body both consume
 * this class, whose real dimensions live in `gellatti-v2-1.css`. The complete
 * AppShell is painted through `applicationScaleAuthority`; portals convert
 * viewport measurements through that same authority.
 */
export const PRO_WORKBENCH_FRAME_CLASS = 'pro-workbench-frame';

/** Centred band inside the global header: HOME | PRO and the PRO module strip. */
export const APP_HEADER_CANVAS = `pro-workbench-header-canvas ${PRO_WORKBENCH_FRAME_CLASS}`;

/**
 * The one header row. Identical geometry with and without `viewportLock`, so
 * the hamburger, the wordmark and the page origin land on the same pixels on
 * every screen. The semantic CSS class on the row resolves the shared desktop
 * frame from the workbench breakpoint while these utility classes preserve older page contracts.
 */
export const APP_HEADER_ROW =
  'mx-auto flex w-full shrink-0 items-center justify-between gap-4 border-b border-ink/8 bg-white ' +
  'px-[var(--pro-mobile-gutter)] py-2 sm:px-6 sm:py-3 ' +
  'xl:h-[var(--pro-header-height)] xl:w-[calc(100%-var(--pro-page-gutter))] xl:px-0 xl:py-0';

/**
 * The one page workspace: same origin and same gutters as the workbench.
 * Text-first sections stay LEFT-aligned inside it (see `APP_PAGE_MEASURE`) so a
 * narrower reading measure never moves the page origin.
 *
 * OWNER 2026-09-12 — from the workbench breakpoint up it IS the workbench
 * frame (`.pro-workbench-frame`: min(1280 px, viewport − 57.6 px), centred),
 * the same box the global header row resolves to, so a page's content and the
 * header share one rigid width system. It used to follow the page gutter to a
 * 1776 px ceiling: at 1602 px /pro/versions opened at x = 32 under a header
 * that opens at 161. Destinations already nest the 1280 `APP_PAGE_CANVAS`
 * inside it, so they do not move. Touch widths keep their 16 / 24 px gutters.
 */
export const APP_PAGE_WORKSPACE =
  `${PRO_WORKBENCH_FRAME_CLASS} mx-auto w-full px-[var(--pro-mobile-gutter)] sm:px-6 ` +
  'min-[68.5rem]:px-0';

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
