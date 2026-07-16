/**
 * PINGÜINO Machine Catalog — technology → EXISTING visible mode routing (§10).
 *
 * This mapping is PURE ROUTING plus UX/capacity configuration. It creates no
 * engine, no temperature cell and no recipe modifier (owner rule / §10.1):
 *
 *   respin               → 'ninja_gelato'  (existing mode; validate per model)
 *   respin_soft          → 'ninja_swirl'   (existing mode; Ninja Swirl is
 *                                           respin_soft, NEVER a professional
 *                                           continuous soft-serve machine)
 *   compressor           → 'fresh'         (existing −11 °C cell, unchanged)
 *   frozen_bowl          → 'fresh'         (neutral base; capacity/UX profile
 *                                           only — modifiers ONLY after
 *                                           physical tests, behind a flag)
 *   continuous_soft_serve → null           (Pro / future — NOT selectable in
 *                                           Home; never mixed with respin_soft)
 *
 * Default-neutral guarantee: a machine's technology changes WHICH existing
 * mode handles the recipe and what capacity/UX facts apply — nothing else.
 */
import type { HomeVisibleModeId, MachineTechnology } from './types';

/** Technologies a HOME machine profile may use (continuous soft serve excluded). */
export type HomeSupportedTechnology = Exclude<MachineTechnology, 'continuous_soft_serve'>;

/**
 * §10 routing table. `null` = no Home mode exists for the technology (it is a
 * Pro / future path), so it can never resolve to a visible Home mode.
 */
export const HOME_TECHNOLOGY_TO_VISIBLE_MODE: Readonly<
  Record<MachineTechnology, HomeVisibleModeId | null>
> = {
  respin: 'ninja_gelato',
  respin_soft: 'ninja_swirl',
  compressor: 'fresh',
  frozen_bowl: 'fresh',
  continuous_soft_serve: null,
};

/** The existing visible mode for a technology, or null (not Home-supported). */
export function visibleModeForTechnology(technology: MachineTechnology): HomeVisibleModeId | null {
  return HOME_TECHNOLOGY_TO_VISIBLE_MODE[technology];
}

/** True when the technology has a Home mode (everything except continuous soft serve). */
export function isHomeSupportedTechnology(
  technology: MachineTechnology,
): technology is HomeSupportedTechnology {
  return HOME_TECHNOLOGY_TO_VISIBLE_MODE[technology] !== null;
}
