/**
 * PINGÜINO User Monitor — the three §20.5 indicators for a RECIPE (UIUX Slice D).
 *
 * „Nie mieszaj tych pojęć": Dopasowanie receptury (1–10), Pewność danych (TEXT)
 * and Gotowość produkcyjna (TEXT) stay three separate indicators. This module
 * derives the recipe-level presentations by REUSING the recipe-score contracts:
 *
 *  - match score → `recipeMatchScore` (the §15.1 adapter, untouched);
 *  - data confidence → a recipe-level TEXT status derived ONLY from the
 *    engine's own honesty signals that already exist on `RecipeResult`:
 *    `low_confidence_ingredient` warnings (the engine's own §16 boundary — no
 *    threshold is re-derived here), per-ingredient `is_verified`, and band
 *    provenance (`band_status` / `category_fallback` / `temperature_fallback`).
 *    Presented as TEXT, never a number (§20.5 + calibration honesty);
 *  - production readiness → REUSES `productionReadiness` with a
 *    CALIBRATION-PENDING internal level per confidence tier (anchored to the
 *    exported `DATA_CONFIDENCE_LEVELS`, never new numbers). TEXT only.
 *
 * Pure, deterministic, presentation-only. Never mutates the result; no IO.
 */
import type { RecipeResult } from '@/engine';
import {
  DATA_CONFIDENCE_DISCLAIMER,
  DATA_CONFIDENCE_LEVELS,
  RECIPE_INDICATOR_CONTRACTS,
  productionReadiness,
  recipeMatchScore,
  type ProductionReadinessText,
  type RecipeMatchScorePresentation,
  type TenPointScore,
} from '@/features/recipe-score';

/* ------------------------------------------------------------------------ *
 * Pewność danych — recipe-level TEXT status                                *
 * ------------------------------------------------------------------------ */

export type RecipeDataConfidenceTier =
  | 'verified_complete'
  | 'estimated_partial'
  | 'low_confidence';

export interface RecipeDataConfidenceView {
  /** §20.5 public name — „Pewność danych". */
  name: string;
  tier: RecipeDataConfidenceTier;
  /** Honest Polish TEXT status — never a number, never a laboratory claim. */
  text: string;
  disclaimer: typeof DATA_CONFIDENCE_DISCLAIMER;
}

const CONFIDENCE_TEXT: Readonly<Record<RecipeDataConfidenceTier, string>> = Object.freeze({
  verified_complete: 'Dane składników zweryfikowane i kompletne.',
  estimated_partial: 'Część danych szacowana — profil lub składniki bez pełnej weryfikacji.',
  low_confidence: 'Ograniczona — część składników ma dane o niskiej pewności.',
});

/**
 * CALIBRATION-PENDING internal levels feeding `productionReadiness` ONLY —
 * anchored to the exported DATA_CONFIDENCE_LEVELS (own-measured data grade for
 * a fully verified set; reference-borrowed grade for estimated data). Never
 * rendered; the UI shows the TEXT above.
 */
export const CONFIDENCE_LEVEL_BY_TIER: Readonly<
  Record<RecipeDataConfidenceTier, TenPointScore | null>
> = Object.freeze({
  verified_complete: DATA_CONFIDENCE_LEVELS.pi_calculated,
  estimated_partial: DATA_CONFIDENCE_LEVELS.pi_generated,
  low_confidence: null,
});

/** Derive the recipe-level data-confidence TEXT status (see module docs). */
export function deriveRecipeDataConfidence(result: RecipeResult): RecipeDataConfidenceView {
  const lowConfidence = result.warnings.some((w) => w.code === 'low_confidence_ingredient');
  const unverifiedIngredient = result.items.some((item) => !item.ingredient.is_verified);
  const bandProvenancePending = result.indicators.some(
    (i) => i.band_status === 'estimated' || i.category_fallback === true || i.temperature_fallback === true,
  );

  const tier: RecipeDataConfidenceTier = lowConfidence
    ? 'low_confidence'
    : unverifiedIngredient || bandProvenancePending
      ? 'estimated_partial'
      : 'verified_complete';

  return {
    name: RECIPE_INDICATOR_CONTRACTS.data_confidence.name,
    tier,
    text: CONFIDENCE_TEXT[tier],
    disclaimer: DATA_CONFIDENCE_DISCLAIMER,
  };
}

/* ------------------------------------------------------------------------ *
 * Gotowość produkcyjna — TEXT status (reuses productionReadiness)          *
 * ------------------------------------------------------------------------ */

export interface RecipeReadinessView {
  /** §20.5 public name — „Gotowość produkcyjna". */
  name: string;
  readiness: ProductionReadinessText;
}

export function deriveRecipeReadiness(result: RecipeResult): RecipeReadinessView {
  const match = recipeMatchScore(result.scores);
  const confidence = deriveRecipeDataConfidence(result);
  return {
    name: RECIPE_INDICATOR_CONTRACTS.production_readiness.name,
    readiness: productionReadiness({
      matchScore: match.score,
      dataConfidenceLevel: CONFIDENCE_LEVEL_BY_TIER[confidence.tier],
    }),
  };
}

/* ------------------------------------------------------------------------ *
 * §14.1 status line — gotowa / wymaga korekty / test rekomendowany          *
 * ------------------------------------------------------------------------ */

export type MonitorStatusLineId = 'gotowa' | 'wymaga_korekty' | 'test_rekomendowany' | 'brak_danych';

export interface MonitorStatusLine {
  id: MonitorStatusLineId;
  text: string;
}

export const MONITOR_STATUS_LINE_TEXT: Readonly<Record<MonitorStatusLineId, string>> =
  Object.freeze({
    gotowa: 'Gotowa',
    wymaga_korekty: 'Wymaga korekty',
    test_rekomendowany: 'Test rekomendowany',
    brak_danych: 'Brak danych do oceny',
  });

/**
 * The §14.1 main-view status, derived transparently from the published
 * contracts: ready readiness → „Gotowa"; a match score in the §15.1 correction
 * range (≤ 5) → „Wymaga korekty"; otherwise → „Test rekomendowany".
 */
export function deriveMonitorStatusLine(result: RecipeResult): MonitorStatusLine {
  const match: RecipeMatchScorePresentation = recipeMatchScore(result.scores);
  if (match.score === null) {
    return { id: 'brak_danych', text: MONITOR_STATUS_LINE_TEXT.brak_danych };
  }
  const { readiness } = deriveRecipeReadiness(result);
  if (readiness.readiness === 'ready') {
    return { id: 'gotowa', text: MONITOR_STATUS_LINE_TEXT.gotowa };
  }
  if (match.score <= 5) {
    return { id: 'wymaga_korekty', text: MONITOR_STATUS_LINE_TEXT.wymaga_korekty };
  }
  return { id: 'test_rekomendowany', text: MONITOR_STATUS_LINE_TEXT.test_rekomendowany };
}
