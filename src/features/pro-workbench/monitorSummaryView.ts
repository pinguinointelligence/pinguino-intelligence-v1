/**
 * PINGÜINO Pro — Monitor PI summary view-model (Agent M, Monitor completeness B1–B6).
 *
 * PURE presentation reshaping of the ALREADY-COMPUTED `RecipeResult` — no engine math,
 * no band values invented, no score re-derivation. Three responsibilities:
 *
 *  1. `monitorScoreView` — THE ONE seam through which the Monitor summary reads score
 *     fields. Since the CURRENT-DRAFT closure (owner P0, 2026-07-25) it consumes the
 *     CANONICAL addendum-2 `recipeTechnicalFit` adapter — the same integer every other
 *     public surface renders. No Monitor layout change was needed.
 *  2. `buildMonitorAssessment` — the owner's B5 truthful states:
 *       - `insufficient` (empty/zero-mass recipe or unscorable result) → the exact
 *         sentence „Brak wystarczających danych do oceny." — never a blank Monitor;
 *       - `provisional` (any indicator on a fallback/estimated band) → „Ocena
 *         częściowa / prowizoryczna" + SOURCE + coverage + reason;
 *       - `native` → violated approved bands retained for internal classification;
 *         the public renderer shows the current value + direction but protects the
 *         exact numeric boundaries, or shows the honest all-in-band sentence;
 *         a 10/10 presentation stays the score adapter's job.
 *  3. `buildMonitorPrimarySignal` — B2's one primary warning/success line (the worst
 *     engine warning by severity, or the honest success sentence).
 *
 * Plus `buildStabilizationProvenance` — the B1 „Stabilizacja (+provenance sentence)"
 * line, read from the approved-dosage assessment (pure, already-existing science).
 */
import { detectViolations, type RecipeInput, type RecipeResult } from '@/engine';
import { copy } from '@/copy/en';
import { buildWarnings, metricLabel, metricUnit } from '@/features/pi-panel/indicatorView';
import type { TargetMetric } from '@/engine';
import { recipeTechnicalFit, type TechnicalFitPresentation } from '@/features/recipe-score';
import { assessStabilizerDosage } from '@/features/formulation/stabilizerDosage';
import { recipeFitForInput } from '@/features/protein-gelato/proteinTarget';

const m = copy.monitorPi.summary;

/* ------------------------------------------------------------------------ *
 * 1. Score seam                                                            *
 * ------------------------------------------------------------------------ */

export interface MonitorScoreView {
  /** ACCEPTANCE ADDENDUM (2) public presentation — integer 1–10 („7/10"),
   * label, aria text. Since the CURRENT-DRAFT closure this is the CANONICAL
   * „Dopasowanie techniczne" adapter, identical to every other surface. */
  match: TechnicalFitPresentation;
}

/**
 * THE one score-reading function of the Monitor summary layer.
 *
 * OWNER CURRENT-DRAFT P0 (Phase 5) — ONE CANONICAL SCORE. This seam used to
 * read the §15.1 match adapter over `result.scores`, i.e. the engine's mode-weighted
 * `overall` blend (technical + flavor + cost). Every other public surface —
 * the recalculation modal, OverallScoreCard, the §14.1 status badge, the
 * customer Home monitor — had already migrated to the addendum-2
 * `recipeTechnicalFit` adapter, so ONE draft legitimately rendered TWO
 * different integers side by side: `overall 82.1 → 8/10` in the Monitor
 * headline next to `technical 88.3 → 9/10` in the modal (the owner's exact
 * „modal 9/10 vs Monitor 8/10" report). The rewire this function was written
 * for is done here: identical input can no longer produce two integers.
 *
 * The `match.score === null` semantics `buildMonitorAssessment` depends on are
 * preserved — `recipeTechnicalFit` returns a null score for an unscorable
 * result exactly as `recipeMatchScore` did.
 */
export function monitorScoreView(result: RecipeResult, input?: RecipeInput): MonitorScoreView {
  return {
    match: input ? recipeFitForInput(input, result) : recipeTechnicalFit(result),
  };
}

/* ------------------------------------------------------------------------ *
 * 2. Truthful assessment states (B5)                                       *
 * ------------------------------------------------------------------------ */

export type MonitorAssessmentState = 'native' | 'provisional' | 'insufficient';

export interface ViolatedBandView {
  metric: TargetMetric;
  label: string;
  value: number;
  unit: string;
  bandMin: number;
  bandMax: number;
  side: 'below' | 'above';
}

export interface MonitorAssessmentView {
  state: MonitorAssessmentState;
  /** The honest state headline (exact B5 sentences for provisional/insufficient). */
  headline: string;
  /** Provisional only: WHERE the provisional bands come from. */
  sourceText: string | null;
  /** Provisional only: WHY the assessment is partial. */
  reasonText: string | null;
  /** Assessment coverage — indicators with a band vs all indicators. */
  assessedCount: number;
  totalCount: number;
  coverageText: string | null;
  /** Native approved bands violated by the CURRENT result. Exact boundaries remain
   * internal to this view-model and must not be printed by the customer renderer. */
  violatedBands: ViolatedBandView[];
  /** Native + nothing violated → the honest all-in-band sentence. */
  withinBandsText: string | null;
}

const isProvisionalIndicator = (indicator: RecipeResult['indicators'][number]): boolean =>
  indicator.category_fallback === true ||
  indicator.temperature_fallback === true ||
  indicator.band_status === 'estimated';

/** B5 — derive the truthful assessment state from the engine's own provenance flags. */
export function buildMonitorAssessment(result: RecipeResult): MonitorAssessmentView {
  const { match } = monitorScoreView(result);
  const banded = result.indicators.filter((i) => i.band != null);
  const total = result.indicators.length;
  const coverageText = total > 0 ? copy.studio.overall.coverage(banded.length, total) : null;

  if (result.total_batch_g <= 0 || match.score === null) {
    return {
      state: 'insufficient',
      headline: m.insufficient,
      sourceText: null,
      reasonText: null,
      assessedCount: banded.length,
      totalCount: total,
      coverageText: null,
      violatedBands: [],
      withinBandsText: null,
    };
  }

  const categoryFallback = result.indicators.some((i) => i.category_fallback === true);
  const temperatureFallback = result.indicators.some((i) => i.temperature_fallback === true);
  const estimated = result.indicators.some((i) => i.band_status === 'estimated');
  const provisional = categoryFallback || temperatureFallback || estimated;

  // Exact violated NATIVE bands — engine's own out-of-range detection, indicator
  // band values verbatim (strictly outside [min, max]; warn thresholds stay the
  // detailed modules' business, not the headline's).
  const indicatorByKey = new Map(result.indicators.map((i) => [i.key, i]));
  const violatedBands: ViolatedBandView[] = [];
  for (const violation of detectViolations(result)) {
    const indicator = indicatorByKey.get(violation.metric);
    const band = indicator?.band ?? null;
    const value = indicator?.value ?? null;
    if (!indicator || band == null || value == null) continue;
    if (isProvisionalIndicator(indicator)) continue; // provisional deviations are soft
    if (value >= band.min && value <= band.max) continue; // warn-threshold only
    violatedBands.push({
      metric: violation.metric,
      label: metricLabel(violation.metric),
      value,
      unit: metricUnit(violation.metric),
      bandMin: band.min,
      bandMax: band.max,
      side: value < band.min ? 'below' : 'above',
    });
  }

  if (provisional) {
    const sourceText = categoryFallback
      ? m.provisionalSource.category
      : temperatureFallback
        ? m.provisionalSource.temperature
        : m.provisionalSource.estimated;
    return {
      state: 'provisional',
      headline: m.assessmentProvisional,
      sourceText,
      reasonText: m.provisionalReason,
      assessedCount: banded.length,
      totalCount: total,
      coverageText,
      violatedBands,
      withinBandsText: null,
    };
  }

  return {
    state: 'native',
    headline: m.assessmentNative,
    sourceText: null,
    reasonText: null,
    assessedCount: banded.length,
    totalCount: total,
    coverageText,
    violatedBands,
    withinBandsText: violatedBands.length === 0 ? m.withinBands : null,
  };
}

/* ------------------------------------------------------------------------ *
 * 3. Primary warning / success (B2)                                        *
 * ------------------------------------------------------------------------ */

export interface MonitorPrimarySignal {
  kind: 'warning' | 'ok';
  severity: 'info' | 'warning' | 'critical' | null;
  text: string;
}

const SEVERITY_RANK = { info: 0, warning: 1, critical: 2 } as const;

/** The ONE primary signal line: the worst engine warning, or the honest success. */
export function buildMonitorPrimarySignal(result: RecipeResult): MonitorPrimarySignal {
  const warnings = buildWarnings(result);
  if (warnings.length === 0) {
    return { kind: 'ok', severity: null, text: m.primaryOk };
  }
  const worst = warnings.reduce((best, w) =>
    SEVERITY_RANK[w.severity] > SEVERITY_RANK[best.severity] ? w : best,
  );
  return { kind: 'warning', severity: worst.severity, text: worst.message };
}

/* ------------------------------------------------------------------------ *
 * 4. Stabilization provenance sentence (B1)                                *
 * ------------------------------------------------------------------------ */

/** The B1 „Stabilizacja (+provenance sentence)" — read from the approved-dosage
 * assessment (pure). Never invents a window; honest about unapproved identities. */
export function buildStabilizationProvenance(input: RecipeInput): string {
  const assessments = assessStabilizerDosage(input);
  if (assessments.length === 0) return copy.monitorPi.stabilization.provenanceNone;
  const approved = assessments.filter((a) => a.window !== null);
  if (approved.length === 0) return copy.monitorPi.stabilization.provenanceUnapproved;
  return copy.monitorPi.stabilization.provenanceAssessed(approved.length);
}
