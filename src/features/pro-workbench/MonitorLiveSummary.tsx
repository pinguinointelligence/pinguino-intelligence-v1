/**
 * PINGÜINO Pro — Monitor PI LIVE summary (B2 first layer; owner one-screen architecture).
 *
 * The PERMANENT (non-collapsible) top block of the right Monitor panel: the technical
 * 1–10 score + §15.1 label, the §14.1 status badge, the truthful assessment state
 * (native / provisional / insufficient — B5), coverage, the six quality axes with
 * green/amber/red TEXT readings (never color alone), serving temperature, the §20.5
 * TEXT statuses (Pewność danych + Gotowość produkcyjna) and ONE primary
 * warning/success line. Presentation only — every value is an already-computed
 * `RecipeResult` field read through the pure view models.
 */
import { useMemo } from 'react';
import { copy } from '@/copy/en';
import type { RecipeResult } from '@/engine';
import { formatTemperatureC } from '@/features/customer-shell/temperature';
import type { GoldenRangeReading } from '@/features/recipe-score';
import { MATCH_SCORE_TOOLTIPS } from '@/features/recipe-score';
import {
  buildUserMonitorSummaryCards,
  deriveMonitorStatusLine,
  deriveRecipeDataConfidence,
  deriveRecipeReadiness,
} from '@/features/user-monitor';
import {
  buildMonitorAssessment,
  buildMonitorPrimarySignal,
  monitorScoreView,
} from './monitorSummaryView';

const c = copy.monitorPi;

/** Złoty Zakres reading tones on the dark panel — text carries the meaning. */
const READING_TONE: Record<GoldenRangeReading['state'], string> = {
  golden: 'text-gold-soft font-medium',
  info: 'text-ivory/70',
  amber: 'text-status-risky',
  red: 'text-status-error',
  neutral: 'text-ivory/60',
};

const SIGNAL_TONE: Record<'info' | 'warning' | 'critical' | 'ok', string> = {
  ok: 'text-status-ideal',
  info: 'text-ivory/70',
  warning: 'text-status-risky',
  critical: 'text-status-error',
};

export function MonitorLiveSummary({
  result,
  servingTemperatureC,
}: {
  result: RecipeResult;
  servingTemperatureC: number;
}) {
  const score = useMemo(() => monitorScoreView(result), [result]);
  const assessment = useMemo(() => buildMonitorAssessment(result), [result]);
  const signal = useMemo(() => buildMonitorPrimarySignal(result), [result]);
  const statusLine = useMemo(() => deriveMonitorStatusLine(result), [result]);
  const axes = useMemo(() => buildUserMonitorSummaryCards(result), [result]);
  const confidence = useMemo(() => deriveRecipeDataConfidence(result), [result]);
  const readiness = useMemo(() => deriveRecipeReadiness(result), [result]);

  /* B5 — insufficient input: NEVER a blank Monitor; the exact honest sentence. */
  if (assessment.state === 'insufficient') {
    return (
      <div data-testid="monitor-live-summary" data-assessment="insufficient">
        <p className="text-sm font-medium leading-relaxed text-ivory" data-testid="monitor-insufficient">
          {c.summary.insufficient}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ivory/65">{c.summary.insufficientHint}</p>
      </div>
    );
  }

  return (
    <div data-testid="monitor-live-summary" data-assessment={assessment.state}>
      {/* Score + §14.1 status badge */}
      <div className="flex items-start justify-between gap-3">
        <div
          aria-label={score.match.ariaText}
          title={MATCH_SCORE_TOOLTIPS[score.match.tooltipKey]}
          data-testid="monitor-summary-score"
        >
          <p className="text-[0.625rem] font-medium tracking-label text-ivory/65 uppercase">
            {c.summary.scoreName}
          </p>
          <p className="mt-1 flex items-baseline gap-2.5">
            <span className="font-mono text-[32px] font-medium leading-none tracking-tight tabular-nums text-ivory">
              {score.match.display}
            </span>
            <span className="text-sm font-medium text-ivory">{score.match.label}</span>
          </p>
        </div>
        <span
          className="shrink-0 rounded border border-ivory/25 px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] text-ivory/70 uppercase"
          data-testid="monitor-summary-badge"
        >
          {statusLine.text}
        </span>
      </div>

      {/* Truthful assessment state + coverage (B5) */}
      <div className="mt-3 space-y-1" data-testid="monitor-assessment" data-state={assessment.state}>
        <p
          className={`text-xs leading-relaxed ${
            assessment.state === 'provisional' ? 'text-status-risky' : 'text-ivory/70'
          }`}
        >
          {assessment.headline}
        </p>
        {assessment.sourceText ? (
          <p className="text-[11px] leading-relaxed text-ivory/65">{assessment.sourceText}</p>
        ) : null}
        {assessment.reasonText ? (
          <p className="text-[11px] leading-relaxed text-ivory/65">{assessment.reasonText}</p>
        ) : null}
        {assessment.coverageText ? (
          <p className="text-[11px] leading-relaxed text-ivory/60" data-testid="monitor-summary-coverage">
            {assessment.coverageText}
          </p>
        ) : null}
      </div>

      {/* Exact violated approved bands (native), or the honest all-in-band line. */}
      {assessment.violatedBands.length > 0 ? (
        <div className="mt-3" data-testid="monitor-violated-bands">
          <p className="text-[0.625rem] font-medium tracking-label text-status-risky uppercase">
            {c.summary.violatedHeading}
          </p>
          <ul className="mt-1 space-y-0.5">
            {assessment.violatedBands.map((band) => (
              <li key={band.metric} className="text-[11px] leading-relaxed text-ivory/80">
                {band.label}:{' '}
                <span className="font-mono tabular-nums text-status-risky">
                  {band.value.toFixed(1)}
                  {band.unit}
                </span>{' '}
                <span className="text-ivory/60">
                  (zakres {band.bandMin.toFixed(1)}–{band.bandMax.toFixed(1)}
                  {band.unit})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : assessment.withinBandsText ? (
        <p className="mt-3 text-[11px] leading-relaxed text-status-ideal" data-testid="monitor-within-bands">
          {assessment.withinBandsText}
        </p>
      ) : null}

      {/* Six quality axes — TEXT readings, worst-of per axis (§14.1). */}
      <div className="mt-4 border-t border-ivory/10 pt-3" data-testid="monitor-summary-axes">
        <p className="text-[0.625rem] font-medium tracking-label text-ivory/65 uppercase">
          {c.summary.axesTitle}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
          {axes.map((axis) => (
            <p
              key={axis.id}
              className="flex items-baseline justify-between gap-2 text-[12px]"
              data-testid={`monitor-axis-${axis.id}`}
            >
              <span className="text-ivory/70">{axis.label}</span>
              <span className={`text-right text-[11px] leading-snug ${READING_TONE[axis.reading.state]}`}>
                {axis.reading.text}
              </span>
            </p>
          ))}
        </div>
      </div>

      {/* Serving temperature + §20.5 TEXT statuses. */}
      <div className="mt-3 space-y-1 border-t border-ivory/10 pt-3">
        <p className="text-[11px] text-ivory/65">
          {c.summary.servingLabel}:{' '}
          <span className="font-mono tabular-nums text-ivory">
            {formatTemperatureC(servingTemperatureC)}
          </span>
        </p>
        <p className="text-[11px] leading-relaxed text-ivory/70" data-testid="monitor-summary-confidence">
          <span className="text-ivory/60">{confidence.name}:</span> {confidence.text}
        </p>
        <p className="text-[11px] leading-relaxed text-ivory/70" data-testid="monitor-summary-readiness">
          <span className="text-ivory/60">{readiness.name}:</span> {readiness.readiness.label} —{' '}
          {readiness.readiness.text}
        </p>
      </div>

      {/* ONE primary warning/success line (B2). */}
      <p
        className={`mt-3 border-t border-ivory/10 pt-3 text-[12px] leading-relaxed ${SIGNAL_TONE[signal.kind === 'ok' ? 'ok' : signal.severity ?? 'info']}`}
        data-testid="monitor-primary-signal"
        data-signal={signal.kind}
      >
        {signal.text}
      </p>
    </div>
  );
}
