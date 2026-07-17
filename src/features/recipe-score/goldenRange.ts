/**
 * PINGÜINO UI/UX master — Złoty Zakres presentation contract (SPEC §15.3, §21.1).
 *
 * A reusable, COLOR-INDEPENDENT 5-state vocabulary for every future Monitor:
 * NEUTRAL scale + a golden optimum BAND — explicitly NOT the red–green–red
 * MyGelato pattern (§15.3). Gold is reserved for the optimum only (§21.1); there
 * is no „green" state at all, and equal deviations below/above the band map to
 * the SAME state (the scale is symmetric and neutral). Every state carries TEXT,
 * so no meaning ever rests on color alone.
 *
 * Band inputs REUSE the existing shapes — no new band data, no hardcoded band
 * numbers anywhere in this module:
 *   - the engine's `TargetRange` `{ min, max, warn_above?, warn_below? }`
 *     (`Indicator.band`, `selectTargetBand(...).band.metrics[...]`), and
 *   - the `readonly [number, number]` tuples used by
 *     features/optimization/temperatureAwareTargetBands (npacBand, metricBands)
 *     and features/pi-monitor (`PiAxisReading.band`).
 *
 * State geometry is grounded in the ENGINE's own classification semantics
 * (src/engine/statuses.ts, read conceptually — nothing is re-computed here):
 *   - the in-band ideal/good split uses the engine's exported
 *     `IDEAL_ZONE_FRACTION` (config data via the public barrel — never re-derived),
 *   - warn thresholds (`warn_above`/`warn_below`) dominate the band check, exactly
 *     like the engine's classify order,
 *   - out-of-band distance is measured in the engine's own normalization unit
 *     (half-widths of the band — the same unit the scoring stage uses for
 *     out-of-band refinement),
 *   - one-sided „safe" directions (the engine maps below-band on risk metrics to
 *     'good' — lower risk is never bad) present as INFO, never amber/red. This is
 *     precisely why a red–green–red gradient would lie.
 *
 * Pure, deterministic, non-mutating. Presentation only — no Monitor UI here.
 */
import { IDEAL_ZONE_FRACTION } from '@/engine';
import type { IndicatorStatus, TargetRange } from '@/engine';

/** The §15.3 visual-state vocabulary: neutral scale, golden optimum band. */
export type GoldenRangeState = 'neutral' | 'info' | 'golden' | 'amber' | 'red';

/** Severity order (presentation only): golden best → red worst; neutral = no assessment. */
export const GOLDEN_RANGE_SEVERITY: Readonly<Record<GoldenRangeState, number>> = Object.freeze({
  golden: 0,
  info: 1,
  amber: 2,
  red: 3,
  neutral: -1,
});

export type GoldenRangeTextKey = `golden-range.state.${GoldenRangeState}`;

export interface GoldenRangeStateText {
  state: GoldenRangeState;
  textKey: GoldenRangeTextKey;
  /** Polish state text (§15.3) — every state is readable without its color. */
  text: string;
}

/** Each state carries text (§15.3) — the vocabulary is color-independent by contract. */
export const GOLDEN_RANGE_STATE_TEXT: Readonly<Record<GoldenRangeState, GoldenRangeStateText>> =
  Object.freeze({
    neutral: Object.freeze({
      state: 'neutral' as const,
      textKey: 'golden-range.state.neutral' as const,
      text: 'Brak oceny',
    }),
    info: Object.freeze({
      state: 'info' as const,
      textKey: 'golden-range.state.info' as const,
      text: 'Poprawne',
    }),
    golden: Object.freeze({
      state: 'golden' as const,
      textKey: 'golden-range.state.golden' as const,
      text: 'W złotym zakresie',
    }),
    amber: Object.freeze({
      state: 'amber' as const,
      textKey: 'golden-range.state.amber' as const,
      text: 'Odchylenie wymagające uwagi',
    }),
    red: Object.freeze({
      state: 'red' as const,
      textKey: 'golden-range.state.red' as const,
      text: 'Istotny problem',
    }),
  });

/** The EXISTING band shapes, reused as-is (engine range or tuple) — never a new shape. */
export type GoldenBandInput = TargetRange | readonly [number, number];

/** Which side of the band a value sits on („ZA MAŁO … ZA DUŻO" copy hooks, §15.3). */
export type BandSide = 'below' | 'inside' | 'above';

/** Per-direction semantics: 'safe' marks one-sided risk metrics whose low side is fine. */
export type BandDirectionSemantics = 'deviation' | 'safe';

export interface BandPositionOptions {
  /** Inner optimum fraction of the band; defaults to the engine's IDEAL_ZONE_FRACTION. */
  idealZoneFraction?: number;
  /**
   * Direction semantics per side (default: both 'deviation'). Mark a side 'safe'
   * for one-sided risk metrics (e.g. alcohol / lactose-sandiness below band):
   * a safe-side value presents as INFO — correct and informational, never a
   * deviation. This is the anti-red–green–red rule made explicit.
   */
  direction?: Partial<Record<'below' | 'above', BandDirectionSemantics>>;
}

export interface GoldenRangeReading {
  state: GoldenRangeState;
  textKey: GoldenRangeTextKey;
  /** The state's Polish text — present on every reading (color-independent). */
  text: string;
  /** Side of the band, or null when nothing could be assessed. */
  side: BandSide | null;
}

/**
 * PRESENTATION policy constant (calibration-pending, NOT band data): how many
 * band half-widths beyond the edge still present as amber („blisko — wymaga
 * uwagi") before escalating to red („istotny problem"). Half-widths are the
 * engine's own out-of-band normalization unit.
 */
export const AMBER_OVERSHOOT_LIMIT_HALF_WIDTHS = 1;

const reading = (state: GoldenRangeState, side: BandSide | null): GoldenRangeReading => {
  const vocab = GOLDEN_RANGE_STATE_TEXT[state];
  return { state, textKey: vocab.textKey, text: vocab.text, side };
};

const isTuple = (band: GoldenBandInput): band is readonly [number, number] => Array.isArray(band);

interface NormalizedBand {
  min: number;
  max: number;
  warnAbove?: number;
  warnBelow?: number;
}

/** Accept both existing band shapes; null when the band cannot be interpreted. */
function normalizeBand(band: GoldenBandInput | null | undefined): NormalizedBand | null {
  if (!band) return null;
  const min = isTuple(band) ? band[0] : band.min;
  const max = isTuple(band) ? band[1] : band.max;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  return {
    min,
    max,
    warnAbove: isTuple(band) ? undefined : band.warn_above,
    warnBelow: isTuple(band) ? undefined : band.warn_below,
  };
}

/**
 * Classify one value against one golden band into the §15.3 state vocabulary.
 *
 *   - no usable value or band            → neutral („Brak oceny")
 *   - beyond a warn threshold            → red (info when that side is 'safe')
 *   - out of band, safe side             → info (correct — one-sided risk metric)
 *   - out of band ≤ 1 half-width         → amber („blisko" — needs attention)
 *   - out of band beyond that            → red („za mało / za dużo" — real problem)
 *   - in band, inside the ideal zone     → golden (the optimum is a RANGE, not a point)
 *   - in band, outside the ideal zone    → info (correct, near the band edge)
 *
 * Symmetric by construction: equal overshoot below/above ⇒ the same state.
 * Pure; never mutates `band`; never invents band numbers.
 */
export function bandPosition(
  value: number | null | undefined,
  band: GoldenBandInput | null | undefined,
  options: BandPositionOptions = {},
): GoldenRangeReading {
  const normalized = normalizeBand(band);
  if (value === null || value === undefined || !Number.isFinite(value) || !normalized) {
    return reading('neutral', null);
  }

  const { min, max, warnAbove, warnBelow } = normalized;
  const belowSemantics = options.direction?.below ?? 'deviation';
  const aboveSemantics = options.direction?.above ?? 'deviation';
  const halfWidth = (max - min) / 2;

  // Warn thresholds dominate the band check (mirrors the engine's classify order).
  if (warnAbove !== undefined && value > warnAbove) {
    return reading(aboveSemantics === 'safe' ? 'info' : 'red', 'above');
  }
  if (warnBelow !== undefined && value < warnBelow) {
    return reading(belowSemantics === 'safe' ? 'info' : 'red', 'below');
  }

  if (value < min || value > max) {
    const side: BandSide = value < min ? 'below' : 'above';
    const semantics = side === 'below' ? belowSemantics : aboveSemantics;
    if (semantics === 'safe') return reading('info', side);
    // Degenerate (single-point) band: no distance unit exists, so an out-of-band
    // value is an attention state, never silently escalated to red.
    if (halfWidth <= 0) return reading('amber', side);
    const overshoot = (side === 'below' ? min - value : value - max) / halfWidth;
    return reading(overshoot <= AMBER_OVERSHOOT_LIMIT_HALF_WIDTHS ? 'amber' : 'red', side);
  }

  // In band: golden for the inner optimum zone (a RANGE, per §15.3 — reusing the
  // engine's ideal-zone fraction), info for correct values nearer the edge.
  if (halfWidth <= 0) return reading('info', 'inside');
  const idealZoneFraction = options.idealZoneFraction ?? IDEAL_ZONE_FRACTION;
  const center = (min + max) / 2;
  const centeredDistance = Math.abs(value - center) / halfWidth;
  return reading(centeredDistance <= idealZoneFraction ? 'golden' : 'info', 'inside');
}

/**
 * Engine-status → state mapping, for callers that already hold a classified
 * indicator (e.g. `RecipeResult.indicators[i].status`). Consistent with
 * `bandPosition` and monotone in the engine's own status severity:
 *   ideal/premium → golden; good → info (in-band near edge OR the safe side of a
 *   one-sided risk metric); risky/too_expensive → amber; directional failures and
 *   needs_correction → red.
 *
 * NOTE: the engine also uses 'needs_correction' as its safe „cannot assess"
 * status (missing value or band). When data may be missing, prefer
 * `bandPosition(value, band)` — it reports an honest NEUTRAL instead.
 */
export const GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS: Readonly<
  Record<IndicatorStatus, GoldenRangeState>
> = Object.freeze({
  ideal: 'golden',
  premium: 'golden',
  good: 'info',
  risky: 'amber',
  too_expensive: 'amber',
  too_soft: 'red',
  too_hard: 'red',
  too_sweet: 'red',
  too_weak: 'red',
  needs_correction: 'red',
});

/** Full reading (state + text) for an already-classified engine indicator status. */
export function bandStateForIndicatorStatus(status: IndicatorStatus): GoldenRangeReading {
  return reading(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS[status], null);
}
