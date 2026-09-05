/**
 * Below 960 px the intentional mobile composition is more usable than a
 * desktop canvas painted below two-thirds of its accepted reference size.
 * CSS carries the same value as 60rem in `gellatti-v2-1.css`.
 */
export const PRO_DESKTOP_MIN_WIDTH_PX = 960;
export const PRO_DESKTOP_MEDIA_QUERY = `(min-width: ${PRO_DESKTOP_MIN_WIDTH_PX}px)`;
export const PRO_TABLET_MEDIA_QUERY = `(max-width: ${PRO_DESKTOP_MIN_WIDTH_PX - 1}px)`;
