/**
 * calculateRecipe — the deterministic pipeline entry point (spec §12/§18).
 *
 * Pure ASSEMBLY of the already-implemented, individually-tested stages:
 * composition (§6) → POD (§7) → PAC/NPAC (§8) → ice fraction (§9) →
 * status classification (§9/§12.7). No new math lives here.
 *
 * Guarantees:
 * - `actual_grams` overrides `planned_grams` (effective-grams rule, §6/§15) —
 *   already-added production amounts flow into every number.
 * - Alcohol stays separate from water/solids; sugar types stay separate (§4/§5)
 *   — both by construction of the composition stage.
 * - Empty / zero-mass recipes never crash: metric fields are null (not
 *   misleading zeros), indicators classify to needs_correction, and no NaN or
 *   Infinity appears in the output.
 * - Inputs are never mutated; same input ⇒ same output.
 * - Every result is stamped with ENGINE_VERSION + CONFIG_VERSION (§17).
 * - Nutrition (per 100 g), costs (kg + servings, honest incomplete state) and
 *   scores (mode-weighted, stability-gated) ride on top of the metric stages;
 *   corrections remain a later stage.
 *
 * Warnings (deterministic, code-based, emitted in fixed order):
 * - alcohol_above_safe_range (warning) — alcohol % above the selected band's
 *   warn_above threshold.
 * - machine_capacity_exceeded (critical) — total mass above machine capacity.
 * - batch_mass_mismatch (info) — |total − target| beyond 0.1 g (the spec §6
 *   display precision).
 * - low_confidence_ingredient (info, per ingredient, item order) — confidence
 *   below 80 (the masterplan §16 "needs verification" boundary).
 * - cost_incomplete (info) — at least one ingredient cost is unknown.
 * A per-ingredient composition_invalid sanity warning is deferred until its
 * tolerance is decided — not invented here.
 */
import { computeComposition } from './composition';
import { CONFIG_VERSION, ENGINE_VERSION } from './config/version';
import { computeRecipeCosts } from './cost';
import { estimateIceFraction } from './iceFraction';
import { computeNutritionPer100g } from './nutrition';
import { computeRecipeNpac, computeRecipePac } from './pac';
import { computeRecipePod } from './pod';
import { computeScores } from './scoring';
import {
  classifyRecipeIndicators,
  computeLactoseSandinessRisk,
  selectTargetBand,
  type StatusInputs,
} from './statuses';
import type { EffectiveRecipeItem, EngineWarning, RecipeInput, RecipeResult } from './types';

/** Masterplan §16: below this confidence an ingredient "needs verification". */
const LOW_CONFIDENCE_THRESHOLD = 80;

/** Spec §6 display precision — mass deviations beyond this are reportable. */
const BATCH_MASS_TOLERANCE_G = 0.1;

function collectWarnings(
  input: RecipeInput,
  totalBatchG: number,
  alcoholPercent: number | null,
  items: readonly EffectiveRecipeItem[],
): EngineWarning[] {
  const warnings: EngineWarning[] = [];

  const warnAbove = selectTargetBand(input.category, input.target_temperature_c)?.band.metrics
    .alcohol.warn_above;
  if (alcoholPercent !== null && warnAbove !== undefined && alcoholPercent > warnAbove) {
    warnings.push({
      code: 'alcohol_above_safe_range',
      severity: 'warning',
      context: { alcohol_percent: alcoholPercent, warn_above: warnAbove },
    });
  }

  if (input.machine_capacity_grams !== null && totalBatchG > input.machine_capacity_grams) {
    warnings.push({
      code: 'machine_capacity_exceeded',
      severity: 'critical',
      context: { total_batch_g: totalBatchG, machine_capacity_grams: input.machine_capacity_grams },
    });
  }

  if (Math.abs(totalBatchG - input.target_batch_grams) > BATCH_MASS_TOLERANCE_G) {
    warnings.push({
      code: 'batch_mass_mismatch',
      severity: 'info',
      context: {
        total_batch_g: totalBatchG,
        target_batch_grams: input.target_batch_grams,
        difference: totalBatchG - input.target_batch_grams,
      },
    });
  }

  for (const item of items) {
    if (item.ingredient.confidence_score < LOW_CONFIDENCE_THRESHOLD) {
      warnings.push({
        code: 'low_confidence_ingredient',
        severity: 'info',
        context: {
          ingredient_id: item.ingredient.id,
          ingredient_name: item.ingredient.name,
          confidence_score: item.ingredient.confidence_score,
        },
      });
    }
  }

  return warnings;
}

/** The full deterministic recipe calculation (spec §12/§18 locked signature). */
export function calculateRecipe(input: RecipeInput): RecipeResult {
  // 1–5: effective items, batch mass, component totals, percentages, sugar split
  const { items, total_batch_g, totals, percentages, sugar } = computeComposition(input.items);
  const hasMass = total_batch_g > 0;

  // 6–8: POD, PAC, NPAC (canonical per_total_mass normalization)
  const pod_points = hasMass ? computeRecipePod(items, total_batch_g) : null;
  const pac_points = hasMass ? computeRecipePac(items, total_batch_g) : null;
  const npac_points = hasMass ? computeRecipeNpac(items, total_batch_g) : null;

  // 9: ice fraction (category- and temperature-aware)
  const ice_fraction_percent = hasMass
    ? estimateIceFraction({
        npac: npac_points,
        temperature_c: input.target_temperature_c,
        category: input.category,
      })
    : null;

  // 10: lactose sandiness risk (calibration-pending working definition)
  const sandiness_risk = hasMass
    ? computeLactoseSandinessRisk(totals.lactose_g, totals.water_g)
    : null;

  // 11: classify all PI indicators
  const statusInputs: StatusInputs = {
    pod: pod_points,
    npac: npac_points,
    ice_fraction: ice_fraction_percent,
    lactose: hasMass ? percentages.lactose_percent : null,
    lactose_sandiness_risk: sandiness_risk,
    fat: hasMass ? percentages.fat_percent : null,
    aerating_protein: hasMass ? percentages.protein_percent : null,
    protein_in_solids:
      hasMass && totals.solids_g > 0 ? (totals.protein_g / totals.solids_g) * 100 : null,
    total_solids: hasMass ? percentages.solids_percent : null,
    water: hasMass ? percentages.water_percent : null,
    alcohol: hasMass ? percentages.alcohol_percent : null,
  };
  const indicators = classifyRecipeIndicators(
    statusInputs,
    input.category,
    input.target_temperature_c,
  );

  // nutrition / cost / scores ride on top — no metric stage changes
  const nutrition_per_100g = hasMass ? computeNutritionPer100g(items, total_batch_g) : null;
  const costs = hasMass ? computeRecipeCosts(items, total_batch_g) : null;
  const scores = hasMass
    ? computeScores({
        indicators,
        items,
        total_batch_g,
        mode: input.mode,
        goals: input.goals,
        costs,
      })
    : null;

  const warnings = collectWarnings(input, total_batch_g, statusInputs.alcohol, items);
  if (costs && !costs.complete) {
    warnings.push({
      code: 'cost_incomplete',
      severity: 'info',
      context: { missing_count: costs.missing_cost_ingredient_ids.length },
    });
  }

  // 12: assemble the complete, version-stamped result
  return {
    engine_version: ENGINE_VERSION,
    config_version: CONFIG_VERSION,
    total_batch_g,
    items,
    totals,
    percentages,
    sugar,
    pod_points,
    pac_points,
    npac_points,
    ice_fraction_percent,
    indicators,
    scores,
    nutrition_per_100g,
    costs,
    warnings,
  };
}
