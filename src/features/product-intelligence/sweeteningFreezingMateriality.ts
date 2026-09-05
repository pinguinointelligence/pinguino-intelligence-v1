/**
 * Materiality authority for a product's remaining sweetening/freezing
 * uncertainty.
 *
 * It does not invent a POD/PAC model. Plausible endpoints come from the same
 * Engine coefficient tables used at recipe runtime, maximum admissible product
 * share comes from the existing category target bands, NPAC keeps the Engine's
 * per-water normalization, and the final comparison uses the existing ±0.5
 * active-reference acceptance tolerance.
 */
import { COEFFICIENTS } from '../../engine/config/coefficients.ts';
import { ENGINE_RESULT_ACCEPTANCE_TOLERANCE } from '../../engine/config/acceptance.ts';
import { ICE_ANCHOR_ROWS, resolveIceAnchorRows } from '../../engine/config/iceAnchors.ts';
import { TARGET_BANDS } from '../../engine/config/targets.ts';
import { SORBET_UNSUPPORTED_FREEZE_ACTIVE_TRACE_FRACTION } from '../../engine/sorbetFreezingPhysics.ts';
import type { ProductCategory, TargetBand } from '../../engine/types.ts';
import type { ProductFieldTruthMap, WorkingNumericField } from './productFieldTruth.ts';
import type { ProductSemanticClassification, ProductSemanticFamily } from './productRecognition.ts';

export type SweeteningFreezingMaterialityVerdict = 'NON_MATERIAL' | 'MATERIAL';

export interface SweeteningFreezingMateriality {
  verdict: SweeteningFreezingMaterialityVerdict;
  unresolvedSugarPercent: number;
  unresolvedPolyolPercent: number;
  alcoholAuthorityUnresolved: boolean;
  profileEstimatedPowers: boolean;
  plausiblePodValue: { low: number; high: number; nominal: number };
  plausiblePacValue: { low: number; high: number; nominal: number };
  maxRecipeShare: number;
  maxPodEffect: number;
  maxNpacEffect: number;
  maxIceFractionEffect: number | null;
  maxSorbetUnsupportedFreezeActiveFraction: number;
  engineAcceptanceTolerance: number;
  engineCategories: ProductCategory[];
  reasonCodes: string[];
}

const round4 = (value: number): number => Math.round((value + Number.EPSILON) * 1e4) / 1e4;
const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const sugarFields = [
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
] as const satisfies readonly WorkingNumericField[];

const sugarPodCoefficient: Readonly<Record<(typeof sugarFields)[number], number>> = {
  sucrose_percent: COEFFICIENTS.pod.sucrose,
  dextrose_percent: COEFFICIENTS.pod.dextrose,
  glucose_percent: COEFFICIENTS.pod.glucose,
  fructose_percent: COEFFICIENTS.pod.fructose,
  lactose_percent: COEFFICIENTS.pod.lactose,
};

const sugarPacCoefficient: Readonly<Record<(typeof sugarFields)[number], number>> = {
  sucrose_percent: COEFFICIENTS.pac.sucrose,
  dextrose_percent: COEFFICIENTS.pac.dextrose,
  glucose_percent: COEFFICIENTS.pac.glucose,
  fructose_percent: COEFFICIENTS.pac.fructose,
  lactose_percent: COEFFICIENTS.pac.lactose,
};

const coefficientBounds = (values: readonly number[]): { min: number; max: number } => ({
  min: Math.min(...values),
  max: Math.max(...values),
});

const sugarPodBounds = coefficientBounds(Object.values(sugarPodCoefficient));
const sugarPacBounds = coefficientBounds(Object.values(sugarPacCoefficient));
const polyolPodBounds = coefficientBounds(Object.values(COEFFICIENTS.polyols).map((x) => x.pod));
const polyolPacBounds = coefficientBounds(Object.values(COEFFICIENTS.polyols).map((x) => x.pac));

const familyCategories = (
  family: ProductSemanticFamily | null | undefined,
): readonly ProductCategory[] | null => {
  switch (family) {
    case 'cocoa':
    case 'chocolate':
    case 'cocoa_butter':
      return ['chocolate_gelato'];
    case 'dairy_liquid':
      return ['milk_gelato'];
    case 'dairy_protein':
    case 'plant_protein_isolate':
      return ['protein_gelato'];
    case 'plant_beverage':
    case 'coconut_fat':
    case 'liquid_vegetable_oil':
      return ['vegan_gelato'];
    case 'fruit':
    case 'beverage':
      // A soft/functional drink enters a recipe the way a fruit base does: as the
      // water-rich body of a sorbet.
      return ['sorbet'];
    case 'nut':
    case 'nut_paste':
      // nut_gelato currently uses the documented milk-gelato target fallback.
      return ['milk_gelato'];
    case 'alcohol':
      // alcohol_gelato currently uses the same documented fallback bands.
      return ['milk_gelato'];
    default:
      return null;
  }
};

function relevantBands(semantic: ProductSemanticClassification | null | undefined): TargetBand[] {
  const categories = familyCategories(semantic?.ingredientFamily);
  const selected = categories
    ? TARGET_BANDS.filter((band) => categories.includes(band.category))
    : [...TARGET_BANDS];
  return selected.length > 0 ? selected : [...TARGET_BANDS];
}

/**
 * Largest non-negative share this ingredient can occupy while the recipe can
 * still remain inside the selected Engine band's existing composition maxima.
 */
function maximumShare(fields: ProductFieldTruthMap, band: TargetBand): number {
  let share = 1;
  const constrain = (field: WorkingNumericField, metric: keyof TargetBand['metrics']): void => {
    const ingredientPercent = fields[field].value;
    const maxRecipePercent = band.metrics[metric]?.max;
    if (!finite(ingredientPercent) || ingredientPercent <= 0 || !finite(maxRecipePercent)) return;
    share = Math.min(share, maxRecipePercent / ingredientPercent);
  };
  constrain('total_solids_percent', 'total_solids');
  constrain('water_percent', 'water');
  constrain('fat_percent', 'fat');
  constrain('alcohol_percent', 'alcohol');
  return Math.max(0, Math.min(1, share));
}

/**
 * Largest admissible recipe share of this product across the Engine bands its
 * kind can enter. Shared with the mass-balance closure so that an unnamed-solids
 * uncertainty is judged by the SAME share model as the sweetening uncertainty.
 */
export function maximumRecipeShareFor(
  fields: ProductFieldTruthMap,
  semantic: ProductSemanticClassification | null | undefined,
): number {
  const bands = relevantBands(semantic);
  return round4(bands.reduce((best, band) => Math.max(best, maximumShare(fields, band)), 0));
}

function iceSlope(category: ProductCategory, temperatureC: number): number | null {
  const rows = resolveIceAnchorRows(ICE_ANCHOR_ROWS, category);
  const exact = rows.find((row) => row.temperature_c === temperatureC);
  if (!exact || exact.npac_high === exact.npac_low) return null;
  return Math.abs(
    (exact.ice_at_npac_high - exact.ice_at_npac_low) / (exact.npac_high - exact.npac_low),
  );
}

const materialAlcoholFamily = (
  semantic: ProductSemanticClassification | null | undefined,
): boolean => semantic?.ingredientFamily === 'alcohol' || semantic?.flavorDomain === 'ALCOHOL';

/**
 * Evaluate the maximum plausible recipe-level result movement. The caller only
 * asks this after verified values, deterministic closure and a compatible
 * whole-profile completion have already had their turn.
 */
export function assessSweeteningFreezingMateriality(input: {
  fields: ProductFieldTruthMap;
  semantic?: ProductSemanticClassification | null;
}): SweeteningFreezingMateriality {
  const { fields, semantic } = input;
  const totalSugars = Math.max(0, fields.total_sugars_percent.value ?? 0);
  let attributedNamedSugar = 0;
  let knownPod = 0;
  let knownPac = 0;
  for (const field of sugarFields) {
    const truth = fields[field];
    if (
      !finite(truth.value) ||
      (truth.provenance.state !== 'VERIFIED' && truth.provenance.basis !== 'mapper_similar_profile')
    ) {
      continue;
    }
    attributedNamedSugar += truth.value;
    knownPod += truth.value * sugarPodCoefficient[field];
    knownPac += truth.value * sugarPacCoefficient[field];
  }
  const unresolvedSugarPercent = Math.max(0, totalSugars - attributedNamedSugar);

  const declaredPolyol = fields.polyol_percent.value;
  const possibleUnstatedPolyol =
    declaredPolyol === null && semantic?.ingredientFamily === 'other_sugar'
      ? Math.max(0, (fields.carbohydrate_percent.value ?? 0) - totalSugars)
      : 0;
  const unresolvedPolyolPercent = Math.max(0, declaredPolyol ?? possibleUnstatedPolyol);
  const alcoholAuthorityUnresolved =
    fields.alcohol_percent.value === null && materialAlcoholFamily(semantic);

  const knownAlcohol = fields.alcohol_percent.value ?? 0;
  const knownSalt = fields.salt_percent.value ?? 0;
  const netFixedPac = knownAlcohol * COEFFICIENTS.npac.alcohol + knownSalt * COEFFICIENTS.npac.salt;

  const podLow =
    knownPod +
    unresolvedSugarPercent * sugarPodBounds.min +
    unresolvedPolyolPercent * polyolPodBounds.min;
  const podHigh =
    knownPod +
    unresolvedSugarPercent * sugarPodBounds.max +
    unresolvedPolyolPercent * polyolPodBounds.max;
  const alcoholUncertaintyHigh = alcoholAuthorityUnresolved ? 100 * COEFFICIENTS.npac.alcohol : 0;
  const pacLow =
    knownPac +
    unresolvedSugarPercent * sugarPacBounds.min +
    unresolvedPolyolPercent * polyolPacBounds.min +
    netFixedPac;
  const pacHigh =
    knownPac +
    unresolvedSugarPercent * sugarPacBounds.max +
    unresolvedPolyolPercent * polyolPacBounds.max +
    netFixedPac +
    alcoholUncertaintyHigh;

  const profileEstimatedPowers =
    fields.pod_value.provenance.state === 'ESTIMATED' &&
    fields.pac_value.provenance.state === 'ESTIMATED' &&
    finite(fields.pod_value.value) &&
    finite(fields.pac_value.value);
  const nominalPod = fields.pod_value.value ?? (podLow + podHigh) / 2;
  const nominalPac = fields.pac_value.value ?? (pacLow + pacHigh) / 2;
  const podValueDelta = Math.max(Math.abs(nominalPod - podLow), Math.abs(podHigh - nominalPod));
  const pacValueDelta = Math.max(Math.abs(nominalPac - pacLow), Math.abs(pacHigh - nominalPac));

  const bands = relevantBands(semantic);
  let maxRecipeShare = 0;
  let maxPodEffect = 0;
  let maxNpacEffect = 0;
  let maxIceFractionEffect: number | null = null;
  let maxSorbetUnsupportedFreezeActiveFraction = 0;
  for (const band of bands) {
    const share = maximumShare(fields, band);
    const minimumWaterFraction = (band.metrics.water?.min ?? 0) / 100;
    const podEffect = podValueDelta * share;
    // The canonical NPAC basis is per water mass. Missing water rails cannot be
    // used to reduce risk, so they retain the conservative full effect.
    const npacEffect =
      (pacValueDelta * share) / (minimumWaterFraction > 0 ? minimumWaterFraction : 1);
    const slope = iceSlope(band.category, band.temperature_c);
    const iceEffect = slope === null ? null : npacEffect * slope;
    const sorbetUnsupportedFreezeActiveFraction =
      band.category === 'sorbet'
        ? ((unresolvedSugarPercent + unresolvedPolyolPercent) / 100) * share
        : 0;
    maxRecipeShare = Math.max(maxRecipeShare, share);
    maxPodEffect = Math.max(maxPodEffect, podEffect);
    maxNpacEffect = Math.max(maxNpacEffect, npacEffect);
    if (iceEffect !== null) {
      maxIceFractionEffect = Math.max(maxIceFractionEffect ?? 0, iceEffect);
    }
    maxSorbetUnsupportedFreezeActiveFraction = Math.max(
      maxSorbetUnsupportedFreezeActiveFraction,
      sorbetUnsupportedFreezeActiveFraction,
    );
  }

  // A sorbet interpretation may place an unresolved sugar portion in lactose
  // or another freeze-active solid outside its published F/G/S solver. The
  // solver's own trace boundary therefore remains part of "every plausible
  // interpretation"; materiality cannot make unavailable physics look valid.
  const sorbetSolverCanBecomeUnavailable =
    maxSorbetUnsupportedFreezeActiveFraction >= SORBET_UNSUPPORTED_FREEZE_ACTIVE_TRACE_FRACTION;
  const withinTolerance =
    maxPodEffect <= ENGINE_RESULT_ACCEPTANCE_TOLERANCE &&
    maxNpacEffect <= ENGINE_RESULT_ACCEPTANCE_TOLERANCE &&
    (maxIceFractionEffect === null || maxIceFractionEffect <= ENGINE_RESULT_ACCEPTANCE_TOLERANCE);

  maxRecipeShare = round4(maxRecipeShare);
  maxPodEffect = round4(maxPodEffect);
  maxNpacEffect = round4(maxNpacEffect);
  maxIceFractionEffect = maxIceFractionEffect === null ? null : round4(maxIceFractionEffect);
  maxSorbetUnsupportedFreezeActiveFraction = round4(maxSorbetUnsupportedFreezeActiveFraction);
  const verdict: SweeteningFreezingMaterialityVerdict =
    !alcoholAuthorityUnresolved && !sorbetSolverCanBecomeUnavailable && withinTolerance
      ? 'NON_MATERIAL'
      : 'MATERIAL';
  const reasonCodes = [
    `MAX_RECIPE_SHARE_${maxRecipeShare}`,
    `MAX_POD_EFFECT_${maxPodEffect}`,
    `MAX_NPAC_EFFECT_${maxNpacEffect}`,
    ...(maxIceFractionEffect === null ? [] : [`MAX_ICE_FRACTION_EFFECT_${maxIceFractionEffect}`]),
    `ENGINE_ACCEPTANCE_TOLERANCE_${ENGINE_RESULT_ACCEPTANCE_TOLERANCE}`,
    ...(profileEstimatedPowers ? ['COMPATIBLE_MAPPER_POWER_ESTIMATE'] : []),
    ...(alcoholAuthorityUnresolved ? ['ALCOHOL_AUTHORITY_UNRESOLVED'] : []),
    ...(sorbetSolverCanBecomeUnavailable
      ? [
          `SORBET_UNSUPPORTED_FREEZE_ACTIVE_FRACTION_${maxSorbetUnsupportedFreezeActiveFraction}`,
          `SORBET_TRACE_LIMIT_${SORBET_UNSUPPORTED_FREEZE_ACTIVE_TRACE_FRACTION}`,
        ]
      : []),
    ...(verdict === 'NON_MATERIAL'
      ? ['ALL_PLAUSIBLE_EFFECTS_WITHIN_ENGINE_TOLERANCE']
      : !withinTolerance
        ? ['PLAUSIBLE_EFFECT_EXCEEDS_ENGINE_TOLERANCE']
        : ['PLAUSIBLE_INTERPRETATION_CAN_INVALIDATE_ENGINE']),
  ];

  return {
    verdict,
    unresolvedSugarPercent: round4(unresolvedSugarPercent),
    unresolvedPolyolPercent: round4(unresolvedPolyolPercent),
    alcoholAuthorityUnresolved,
    profileEstimatedPowers,
    plausiblePodValue: { low: round4(podLow), high: round4(podHigh), nominal: round4(nominalPod) },
    plausiblePacValue: { low: round4(pacLow), high: round4(pacHigh), nominal: round4(nominalPac) },
    maxRecipeShare,
    maxPodEffect,
    maxNpacEffect,
    maxIceFractionEffect,
    maxSorbetUnsupportedFreezeActiveFraction,
    engineAcceptanceTolerance: ENGINE_RESULT_ACCEPTANCE_TOLERANCE,
    engineCategories: [...new Set(bands.map((band) => band.category))],
    reasonCodes,
  };
}
