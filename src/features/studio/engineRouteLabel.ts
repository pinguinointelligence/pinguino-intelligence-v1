/**
 * The ACTIVE Engine route label for the canonical Pro recipe surface (owner P0 repair).
 *
 * The header must derive from the CURRENT resolved route — never a hardcoded engine name.
 * Contract (owner): a professional −11/−12/−13 selection shows exactly that temperature
 * everywhere; „Świeże" stays visibly „Świeże" while the internal −11°C profile appears only
 * as an optional technical detail, never as a contradictory main heading.
 *
 * Pure formatting over the recipe store's routing state (servingModeId + target_temperature_c)
 * — the SAME values buildRecipeInput hands to calculateRecipe, so the label can never disagree
 * with the Engine input. Negative temperatures use U+2212 (−), per the typography rule.
 */
import { temperatureForMode } from '@/features/customer-flow/servingMode';

export interface EngineRouteLabel {
  /** The main heading suffix (e.g. „Silnik −13°C" or „Świeże"). */
  main: string;
  /** Optional technical detail (e.g. „wewnętrzny profil −11°C" for Świeże), or null. */
  detail: string | null;
}

const formatTempPl = (celsius: number): string =>
  `${celsius < 0 ? '−' : ''}${Math.abs(celsius)}°C`;

export function engineRouteLabel(
  servingModeId: string | null,
  temperatureC: number,
): EngineRouteLabel {
  if (servingModeId === 'fresh') {
    const internal = temperatureForMode('fresh') ?? temperatureC;
    return { main: 'Świeże', detail: `wewnętrzny profil ${formatTempPl(internal)}` };
  }
  return { main: `Silnik ${formatTempPl(temperatureC)}`, detail: null };
}
