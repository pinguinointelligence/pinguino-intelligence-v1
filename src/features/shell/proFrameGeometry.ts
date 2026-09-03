/**
 * The structural PRO breakpoint is derived from the real minimum tracks:
 * 700 px editor + 360 px intelligence pane + 9 px gap + 2 × 22 px gutters
 * = 1113 px. 1120 px leaves a small rounding reserve without abandoning the
 * two-column workbench while it still fits.
 *
 * CSS carries the same value as 70rem in `gellatti-v2-1.css`. JavaScript must
 * import these queries instead of recreating a 1280 px breakpoint locally.
 */
export const PRO_DESKTOP_MIN_WIDTH_PX = 1120;
export const PRO_DESKTOP_MEDIA_QUERY = `(min-width: ${PRO_DESKTOP_MIN_WIDTH_PX}px)`;
export const PRO_TABLET_MEDIA_QUERY = `(max-width: ${PRO_DESKTOP_MIN_WIDTH_PX - 1}px)`;
