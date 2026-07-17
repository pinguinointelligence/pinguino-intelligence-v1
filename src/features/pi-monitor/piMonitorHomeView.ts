/**
 * PINGÜINO PI Recipe Monitor — Monitor Home view model (SPEC §13, UIUX Slice D).
 *
 * Pure, presentation-only §13 content for the customer result's monitor:
 *   - „Dopasowanie receptury" 1–10 + the §15.1 verdict (via the EXISTING
 *     `recipeMatchScore` adapter — never re-derived, never decimals, never %);
 *   - the four §13 consumer traits (Słodycz / Miękkość / Kremowość / Pełnia —
 *     plain single words, audit #12: never technical compounds) as Złoty Zakres
 *     5-state TEXT readings (via the EXISTING `bandPosition`, §15.3);
 *   - Stabilność as a STATUS (§13.1 „niekoniecznie suwak") — the worst-of
 *     reading across the engine's own freezing-stability-related indicators;
 *   - the §13.3 machine-fit checklist rows (saved machine + batch fit).
 *
 * ENGINE DATA PROTECTION (§22, §13.2): the returned view carries NO numeric
 * metric values, NO band numbers and NO PAC/POD figures BY TYPE CONSTRUCTION —
 * every row is a state + Polish text. The engine result is consumed read-only;
 * indicators/bands never leave this function. The 1–10 score is the sanctioned
 * public teaser (§4). Pure and deterministic: no React, no IO, no mutation.
 */
import type { Indicator, RecipeResult, TargetMetric } from '@/engine';
import {
  GOLDEN_RANGE_SEVERITY,
  GOLDEN_RANGE_STATE_TEXT,
  bandPosition,
  recipeMatchScore,
  type GoldenRangeReading,
  type RecipeMatchScorePresentation,
} from '@/features/recipe-score';
import type { AxisIntentStep, PiAxisId } from './piMonitorContracts';

/* ------------------------------------------------------------------------ *
 * The four §13 consumer traits                                             *
 * ------------------------------------------------------------------------ */

export type MonitorHomeTraitId = 'slodycz' | 'miekkosc' | 'kremowosc' | 'pelnia';

export const MONITOR_HOME_TRAIT_ORDER: readonly MonitorHomeTraitId[] = [
  'slodycz',
  'miekkosc',
  'kremowosc',
  'pelnia',
];

/** §13.1 consumer labels — plain single words (audit #12). */
export const MONITOR_HOME_TRAIT_LABELS: Readonly<Record<MonitorHomeTraitId, string>> =
  Object.freeze({
    slodycz: 'Słodycz',
    miekkosc: 'Miękkość',
    kremowosc: 'Kremowość',
    pelnia: 'Pełnia',
  });

/** Trait → the engine target metric whose CLASSIFIED indicator drives the row. */
const TRAIT_METRIC: Readonly<Record<MonitorHomeTraitId, TargetMetric>> = Object.freeze({
  slodycz: 'pod',
  miekkosc: 'ice_fraction',
  kremowosc: 'fat',
  pelnia: 'total_solids',
});

/** Trait → the EXISTING pi-monitor stepped-preference axis (the §16 lever). */
export const MONITOR_HOME_TRAIT_AXIS: Readonly<Record<MonitorHomeTraitId, PiAxisId>> =
  Object.freeze({
    slodycz: 'slodycz',
    miekkosc: 'miekkosc_twardosc',
    kremowosc: 'kremowosc_tluszcz',
    pelnia: 'pelnia_body',
  });

/**
 * §16.1 consumer step labels (verbatim direction words). Presentation override
 * for the HOME surface only — the pi-monitor bridge (`axisStepLabels`) keeps its
 * own labels; the intent contract (`decrease`/`keep`/`increase`) is unchanged.
 */
export const MONITOR_HOME_STEP_LABELS: Readonly<
  Record<MonitorHomeTraitId, Readonly<Record<AxisIntentStep, string>>>
> = Object.freeze({
  slodycz: Object.freeze({ decrease: 'Mniej słodkie', keep: 'Bez zmian', increase: 'Bardziej słodkie' }),
  miekkosc: Object.freeze({ decrease: 'Twardsze', keep: 'Bez zmian', increase: 'Bardziej miękkie' }),
  kremowosc: Object.freeze({ decrease: 'Lżejsze', keep: 'Bez zmian', increase: 'Bardziej kremowe' }),
  pelnia: Object.freeze({ decrease: 'Lekka', keep: 'Bez zmian', increase: 'Pełniejsza' }),
});

/* ------------------------------------------------------------------------ *
 * View shapes (text + state only — no numbers, by construction)            *
 * ------------------------------------------------------------------------ */

export interface MonitorHomeTraitRow {
  id: MonitorHomeTraitId;
  label: string;
  /** Złoty Zakres 5-state reading — state + Polish text, never a number (§15.3). */
  reading: GoldenRangeReading;
}

/** Minimal machine context injected by the shell (§13.3 checklist inputs). */
export interface MonitorHomeMachineContext {
  /** Customer-facing machine name (brand + family — never a technology code). */
  name: string;
  /** The shell's derived batch-guidance state for the current amount. */
  batchFit: 'recommended_active' | 'custom' | 'custom_above' | 'none';
}

export interface MonitorHomeCheckRow {
  id: 'machine' | 'batch' | 'structure';
  text: string;
  /** 'ok' renders as a calm check; 'attention' as an honest, non-alarming note. */
  tone: 'ok' | 'attention';
}

export interface MonitorHomeView {
  /** „Dopasowanie receptury" — 1–10 integer + §15.1 verdict (or honest no-data). */
  score: RecipeMatchScorePresentation;
  traits: MonitorHomeTraitRow[];
  /** §13.1 „Stabilność jako status" — worst-of across stability indicators. */
  stability: { label: string; reading: GoldenRangeReading };
  /** §13.3 checklist (machine fit, batch fit, structure) — may be empty. */
  checks: MonitorHomeCheckRow[];
}

export const MONITOR_HOME_STABILITY_LABEL = 'Stabilność';

/** §13.3 checklist copy (exact strings pinned by tests). */
export const MONITOR_HOME_CHECK_COPY = Object.freeze({
  machine: (name: string) => `Dopasowana do ${name}`,
  batchRecommended: 'Właściwa ilość dla pojemnika',
  batchCustom: 'Własna ilość — zapisana',
  batchAbove: 'Ilość powyżej zalecanej — podziel na pojemniki',
  structureGood: 'Dobra struktura po przygotowaniu',
  structureAttention: 'Struktura wymaga uwagi',
});

/* ------------------------------------------------------------------------ *
 * Builders                                                                 *
 * ------------------------------------------------------------------------ */

/** Engine metrics feeding the STABILITY status (freezing-stability related). */
const STABILITY_METRICS: readonly TargetMetric[] = ['npac', 'water', 'lactose_sandiness_risk'];

const neutralReading = (): GoldenRangeReading => ({
  state: 'neutral',
  textKey: GOLDEN_RANGE_STATE_TEXT.neutral.textKey,
  text: GOLDEN_RANGE_STATE_TEXT.neutral.text,
  side: null,
});

function indicatorByKey(result: RecipeResult | null): ReadonlyMap<string, Indicator> {
  return new Map((result?.indicators ?? []).map((i) => [i.key, i]));
}

/** 5-state reading for one classified indicator — honest NEUTRAL when unassessable. */
function readingFor(indicator: Indicator | undefined): GoldenRangeReading {
  if (!indicator) return neutralReading();
  return bandPosition(indicator.value, indicator.band ?? null);
}

/** Worst-of severity across readings; all-neutral stays neutral (honest no-assessment). */
function worstOf(readings: readonly GoldenRangeReading[]): GoldenRangeReading {
  let worst: GoldenRangeReading | null = null;
  for (const r of readings) {
    if (r.state === 'neutral') continue;
    if (worst === null || GOLDEN_RANGE_SEVERITY[r.state] > GOLDEN_RANGE_SEVERITY[worst.state]) {
      worst = r;
    }
  }
  return worst ?? neutralReading();
}

function buildChecks(
  machine: MonitorHomeMachineContext | null,
  traits: readonly MonitorHomeTraitRow[],
): MonitorHomeCheckRow[] {
  const checks: MonitorHomeCheckRow[] = [];

  if (machine !== null) {
    checks.push({ id: 'machine', text: MONITOR_HOME_CHECK_COPY.machine(machine.name), tone: 'ok' });
    if (machine.batchFit === 'recommended_active') {
      checks.push({ id: 'batch', text: MONITOR_HOME_CHECK_COPY.batchRecommended, tone: 'ok' });
    } else if (machine.batchFit === 'custom') {
      checks.push({ id: 'batch', text: MONITOR_HOME_CHECK_COPY.batchCustom, tone: 'ok' });
    } else if (machine.batchFit === 'custom_above') {
      checks.push({ id: 'batch', text: MONITOR_HOME_CHECK_COPY.batchAbove, tone: 'attention' });
    }
    // batchFit 'none': no recommendation exists — no row (never a fake check).
  }

  // §13.3 structure line — derived from the structure-bearing traits
  // (Miękkość + Pełnia). Neutral (nothing assessable) → no row, never a fake ✓.
  const structural = traits.filter((t) => t.id === 'miekkosc' || t.id === 'pelnia');
  const worst = worstOf(structural.map((t) => t.reading));
  if (worst.state === 'golden' || worst.state === 'info') {
    checks.push({ id: 'structure', text: MONITOR_HOME_CHECK_COPY.structureGood, tone: 'ok' });
  } else if (worst.state === 'amber' || worst.state === 'red') {
    checks.push({ id: 'structure', text: MONITOR_HOME_CHECK_COPY.structureAttention, tone: 'attention' });
  }

  return checks;
}

/**
 * Build the §13 Monitor Home view from an already-computed engine result.
 * `result === null` (structure-only / not calculated) yields the honest
 * „Brak danych" score, all-neutral traits and no structure check.
 * Pure; never mutates `result`; returns no numeric metric/band data.
 */
export function buildMonitorHomeView(
  result: RecipeResult | null,
  machine: MonitorHomeMachineContext | null = null,
): MonitorHomeView {
  const byKey = indicatorByKey(result);

  const traits: MonitorHomeTraitRow[] = MONITOR_HOME_TRAIT_ORDER.map((id) => ({
    id,
    label: MONITOR_HOME_TRAIT_LABELS[id],
    reading: readingFor(byKey.get(TRAIT_METRIC[id])),
  }));

  const stability = {
    label: MONITOR_HOME_STABILITY_LABEL,
    reading: worstOf(STABILITY_METRICS.map((m) => readingFor(byKey.get(m)))),
  };

  return {
    score: recipeMatchScore(result?.scores ?? null),
    traits,
    stability,
    checks: buildChecks(machine, traits),
  };
}
