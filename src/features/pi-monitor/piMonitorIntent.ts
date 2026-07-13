/**
 * PINGÜINO PI Recipe Monitor — pure intent mapping.
 *
 * Translates the customer's STEPPED per-axis wishes onto the locked
 * `NormalizedRecipeIntent` preference levers the recalculation pipeline genuinely
 * consumes (`designRecipe` carries `sweetnessPreference` / `texturePreference`
 * into `optimizerConstraints`). Two axes have a direct spine lever; the other two
 * are recorded as advisory wishes — the recalc still targets the golden band for
 * them, reported honestly and never faked. Pure: returns a NEW intent, mutates
 * nothing.
 */
import type {
  NormalizedRecipeIntent,
  SweetnessPreference,
  TexturePreference,
} from '@/spine';
import type { AxisIntentStep, PiAxisId, PiAxisIntents } from './piMonitorContracts';

const SWEETNESS_FOR: Record<AxisIntentStep, SweetnessPreference | null> = {
  decrease: 'low',
  keep: null, // keep the recipe's existing preference
  increase: 'high',
};

const TEXTURE_FOR: Record<AxisIntentStep, TexturePreference | null> = {
  decrease: 'soft', // "bardziej miękkie"
  keep: null,
  increase: 'firm', // "twardsze"
};

export interface AppliedAxisIntents {
  /** The base intent with the mapped stepped wishes applied. */
  intent: NormalizedRecipeIntent;
  /** Axes whose wish was translated onto a real spine preference lever. */
  mappedAxes: PiAxisId[];
  /** Axes the customer nudged that have no direct spine lever (advisory only). */
  advisoryWishAxes: PiAxisId[];
}

/**
 * Apply the customer's stepped per-axis wishes onto a base intent. `slodycz` maps
 * to `sweetnessPreference`, `miekkosc_twardosc` to `texturePreference`;
 * `kremowosc_tluszcz` and `pelnia_body` have no dedicated lever, so a non-neutral
 * choice on them is surfaced as an advisory wish (the recalc still aims at the
 * golden band). A `keep` choice leaves the recipe's existing preference untouched.
 */
export function applyAxisIntentsToIntent(
  base: NormalizedRecipeIntent,
  axisIntents: PiAxisIntents,
): AppliedAxisIntents {
  const mappedAxes: PiAxisId[] = [];
  const advisoryWishAxes: PiAxisId[] = [];

  const sweetness = SWEETNESS_FOR[axisIntents.slodycz];
  if (sweetness !== null) mappedAxes.push('slodycz');

  const texture = TEXTURE_FOR[axisIntents.miekkosc_twardosc];
  if (texture !== null) mappedAxes.push('miekkosc_twardosc');

  if (axisIntents.kremowosc_tluszcz !== 'keep') advisoryWishAxes.push('kremowosc_tluszcz');
  if (axisIntents.pelnia_body !== 'keep') advisoryWishAxes.push('pelnia_body');

  const intent: NormalizedRecipeIntent = {
    ...base,
    sweetnessPreference: sweetness ?? base.sweetnessPreference,
    texturePreference: texture ?? base.texturePreference,
  };

  return { intent, mappedAxes, advisoryWishAxes };
}
