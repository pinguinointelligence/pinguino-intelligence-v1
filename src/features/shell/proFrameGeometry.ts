/**
 * The desktop ↔ narrow handoff. OWNER 2026-09-12 (RESPONSIVE HANDOFF CORRECTION):
 * the account yields before the layout changes mode, down to its compact
 * minimum (112 px); the desktop is never painted below 2/3; the 40 px account
 * lane holds at every desktop width. The handoff is therefore where the compact
 * account — plus one whole pixel of measurement rounding — fits its lane at
 * exactly the floor: ⅔ × (1280 + 2 × (28.8 + 40 + 113)) = 1095.7 → 1096 px =
 * 68.5rem. No account moves it: a longer name is truncated, never the layout.
 * Below it the existing mobile composition is authoritative. CSS carries the
 * same value as 68.5rem (`gellatti-v2-1.css`, `theme-pro-light.css`,
 * `tokens.css` and the `min-[68.5rem]` / `max-[68.5rem]` variants);
 * `applicationScaleAuthority.test.ts` re-derives it.
 */
export const PRO_DESKTOP_MIN_WIDTH_PX = 1096;
export const PRO_DESKTOP_MEDIA_QUERY = `(min-width: ${PRO_DESKTOP_MIN_WIDTH_PX}px)`;
export const PRO_TABLET_MEDIA_QUERY = `(max-width: ${PRO_DESKTOP_MIN_WIDTH_PX - 1}px)`;

/**
 * The frame the header and the body share, mirrored from `tokens.css`
 * (`--pro-frame-max-width`, `--pro-frame-inline-gutter`) for the one scale
 * authority, which needs them to fit the header's account lane beside it.
 * `headerFrameAuthority.test.ts` keeps the two in step.
 */
export const PRO_FRAME_MAX_WIDTH_PX = 1280;
export const PRO_FRAME_INLINE_GUTTER_PX = 28.8;
