/**
 * §61–§64 — HOME's three-way Sweetness, over the existing Direction axis. PURE.
 *
 * HOME shows three choices; PRO's axis is −2…+2. The owner rule has a sharp edge that
 * is easy to get wrong:
 *
 *   §62 — VIEWING HOME must NOT change the stored value. A PRO recipe sitting at +2
 *         DISPLAYS as "Sweeter" and STAYS +2. Only a TAP writes, and a tap writes the
 *         exact HOME value (−1, 0 or +1) with no memory of the previous ±2.
 *
 * That is why projection and write are two separate functions with two separate
 * types: a single "normalise" helper would inevitably get called on render and would
 * silently flatten every Pro user's ±2 the moment they glanced at HOME.
 *
 * §63/§64: nothing here reads or returns any other axis. Hardness (`softness`),
 * creaminess and flavor are not parameters of these functions, so a HOME sweetness
 * edit is structurally incapable of moving them.
 */
import type { RecipeDirectionTarget } from '@/engine';

/** The three choices HOME exposes (§61). */
export type HomeSweetness = 'less' | 'balanced' | 'sweeter';

/** The exact Direction values a HOME tap writes (§62). Never ±2. */
export const HOME_SWEETNESS_VALUE: Readonly<Record<HomeSweetness, -1 | 0 | 1>> = Object.freeze({
  less: -1,
  balanced: 0,
  sweeter: 1,
});

export const HOME_SWEETNESS_ORDER: readonly HomeSweetness[] = ['less', 'balanced', 'sweeter'];

/**
 * §62 — DISPLAY ONLY. Project the stored Direction sweetness onto the three HOME
 * choices. This function returns a label; it can write nothing.
 *
 *   −2, −1 → less        0 → balanced        +1, +2 → sweeter
 */
export function projectSweetnessForDisplay(stored: RecipeDirectionTarget): HomeSweetness {
  if (stored < 0) return 'less';
  if (stored > 0) return 'sweeter';
  return 'balanced';
}

/**
 * §62 — the value a HOME tap WRITES. Always the exact HOME value, never a restored ±2.
 *
 * Takes only the tapped choice on purpose: given no access to the previous value, it
 * cannot "remember" it, which is precisely what the owner rule forbids.
 */
export function sweetnessValueForTap(choice: HomeSweetness): -1 | 0 | 1 {
  return HOME_SWEETNESS_VALUE[choice];
}

/**
 * Would tapping this choice actually change the stored value?
 *
 * Used to skip a no-op write: a PRO recipe at +2 displayed as "Sweeter" must not be
 * quietly rewritten to +1 by a tap on the already-active segment.
 */
export function tapChangesStoredValue(
  stored: RecipeDirectionTarget,
  choice: HomeSweetness,
): boolean {
  // Compare what HOME is SHOWING with what was tapped — not the value a tap
  // would write. `stored !== sweetnessValueForTap(choice)` looks equivalent and
  // is not: at +2 the displayed segment is already "sweeter", yet the write
  // value is +1, so the guard reported a change and the tap silently degraded a
  // PRO +2 to +1. That is the precision loss §62 exists to prevent.
  return projectSweetnessForDisplay(stored) !== choice;
}
