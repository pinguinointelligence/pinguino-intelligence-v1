/**
 * DESKTOP TAB ANCHOR CONTRACT (owner hard override, Gellatti V2.1 §8).
 *
 * `Receptura | Monitor | Produkcja | Etykieta` is geometrically part of the
 * RIGHT workbench display column — never of the viewport. Before this contract
 * the header and the body each declared their own fractional split
 * (`minmax(0,1.62fr) minmax(400px,1fr)`), so the two columns resolved to
 * slightly different widths and the tab strip drifted horizontally as the
 * active module changed the content width underneath it.
 *
 * The repair is a SINGLE explicit column definition shared by the header row
 * and the workbench body:
 *
 *   [ 1fr flexible editor ] [ --g-split-gap ] [ --g-side-width display column ]
 *
 * Because the right track is an explicit length that does not depend on its
 * content, the strip's box is identical in all four modules. Switching tabs
 * therefore produces exactly 0 px of horizontal movement.
 *
 * This module is CLASS RECIPES ONLY. No engine, solver, pricing, persistence,
 * permission or navigation value depends on it, and it must be REUSED rather
 * than re-typed so the header and the body can never drift apart again.
 */

/**
 * The one split. Applied identically to the shell header row and to the
 * workbench body so both resolve to the same two tracks.
 */
export const DESKTOP_WORKBENCH_COLUMNS =
  'xl:grid-cols-[minmax(0,1fr)_var(--g-side-width)] xl:gap-[var(--g-split-gap)]';

/**
 * The tab strip itself. It is right-aligned inside the display column and
 * carries the preview's own 4 × equal-track geometry, so no tab's label length
 * can move any other tab.
 */
export const DESKTOP_TAB_STRIP =
  'xl:col-start-2 xl:row-start-1 xl:w-[calc(var(--g-side-width)+10px)] xl:shrink-0 xl:justify-self-end';

/**
 * The anchor is verified by `desktopTabAnchorContract.test.ts`: the strip's
 * declared width and column count are constants, so the contract can be
 * asserted without a browser while the served proof stays a screenshot.
 */
export const DESKTOP_TAB_ANCHOR = Object.freeze({
  /** The display column the strip is anchored to. */
  anchoredTo: 'right-workbench-column' as const,
  /** Horizontal movement permitted between modules. */
  allowedDriftPx: 0,
  /** Equal tracks — one per module. */
  tracks: 4,
});
