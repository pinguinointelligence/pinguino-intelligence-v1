/**
 * DESIGN V3.0 Version 9 §12 — the Monitor panel's height, as pure arithmetic.
 *
 * §12 in the owner's words: Monitor slides down from the top and starts at its full
 * height; a grip on its BOTTOM edge sets how much of it you see (one finger, pointer
 * events, its own gesture — the indicators scroll inside it); the keyboard arrows do
 * the same; the smallest Monitor is 132 px; the recipe stays underneath it and there
 * is NO scrim; with an ingredient panel open Monitor gives way only as far as needed,
 * leaving a 56 px strip of the recipe between the two, and the user's own height
 * returns when the panel closes.
 *
 * The measured phone numbers from the frozen reference (Monitor 139 px, strip 57 px
 * with the keyboard up) are RESULTS of the rule below, not constants: the editor sits
 * higher when the keyboard is up, so the room left for Monitor shrinks. Writing 139
 * down anywhere would freeze one device's arithmetic into the product.
 *
 * PURE: no DOM, no React. The surface measures, this file decides.
 */

/** §12: „Minimalna wysokość to 132 px.” */
export const MONITOR_MIN_HEIGHT_PX = 132;

/** §12: the strip of the recipe that stays visible between Monitor and an open panel. */
export const MONITOR_RECIPE_STRIP_PX = 56;

/** One arrow press. Home/End jump to the two ends. */
export const MONITOR_KEY_STEP_PX = 40;

/**
 * Below this a pointer move is a tap, not a drag — it keeps a tap on the grip from
 * nudging the height by a pixel, and it is what separates this gesture from the
 * content's own one-finger scroll.
 */
export const MONITOR_DRAG_THRESHOLD_PX = 3;

/**
 * The height Monitor may actually take: never below the §12 minimum, never past the
 * room its own container gives it (which already ends above the bottom navigation and
 * starts below the pinned header).
 */
export function clampMonitorHeight(height: number, available: number): number {
  if (!Number.isFinite(height)) return MONITOR_MIN_HEIGHT_PX;
  return Math.max(MONITOR_MIN_HEIGHT_PX, Math.min(height, available));
}

/**
 * The keyboard half of the grip. `null` for a key the grip does not own, so the caller
 * leaves the event alone instead of swallowing it.
 *
 * Down grows Monitor and Up shrinks it, because the panel hangs from the top: the grip
 * the finger drags downward is the same edge the arrow moves.
 */
export function monitorHeightForKey(
  key: string,
  current: number,
  available: number,
): number | null {
  switch (key) {
    case 'ArrowDown':
      return clampMonitorHeight(current + MONITOR_KEY_STEP_PX, available);
    case 'ArrowUp':
      return clampMonitorHeight(current - MONITOR_KEY_STEP_PX, available);
    case 'Home':
      return clampMonitorHeight(MONITOR_MIN_HEIGHT_PX, available);
    case 'End':
      return clampMonitorHeight(available, available);
    default:
      return null;
  }
}

/**
 * The temporary height for an open ingredient panel: Monitor gives way only as far as
 * needed, and only downward — three areas stay on screen (Monitor, a strip of the
 * recipe, the panel).
 *
 * `null` means „nothing to do”: there is already room, so the user's own height stands.
 * The caller must keep this value SEPARATE from the user's height — closing the panel
 * restores theirs, it does not re-run this.
 */
export function monitorHeightForEditor({
  panelTop,
  editorTop,
  current,
  available,
}: {
  panelTop: number;
  editorTop: number;
  current: number;
  available: number;
}): number | null {
  if (![panelTop, editorTop, current, available].every(Number.isFinite)) return null;
  const room = editorTop - panelTop - MONITOR_RECIPE_STRIP_PX;
  if (current <= room) return null;
  return clampMonitorHeight(Math.floor(room), available);
}
