/**
 * OptimizationPreviewPanel (Spine Slice 10) — a PURE, reusable display of a
 * pre-computed optimization preview. It NEVER calls the engine, NEVER saves, and
 * shows only what the display policy permits (Free/Demo: high-level recommendation
 * + direction; Pro: exact correction plan + grams + before/after; DEV: adds a
 * debug trace). It takes an already-computed `OptimizationPreviewView` — the
 * caller runs the preview.
 */
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { recommendationFor, type OptimizationDisplayPolicy } from './optimizationPreviewPolicy';
import type { OptimizationPreviewView } from './optimizationPreviewRunner';
import type { BaseEngineMetrics } from '@/spine';

const DECISION_TONE: Record<string, string> = {
  optimized: 'text-emerald-300',
  no_action_needed: 'text-emerald-300',
  tradeoff: 'text-amber-300',
  impossible: 'text-rose-300',
  blocked: 'text-rose-300',
};

const humanize = (s: string): string => s.replace(/_/g, ' ');
const fmt = (v: number | null | undefined): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—';

function MetricRow({ label, before, after }: { label: string; before: number | null | undefined; after: number | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 font-mono text-[11px] text-ivory/60">
      <span className="text-ivory/40">{label}</span>
      <span>
        {fmt(before)} <span className="text-ivory/30">→ {fmt(after)}</span>
      </span>
    </div>
  );
}

export function OptimizationPreviewPanel({
  view,
  policy,
}: {
  view: OptimizationPreviewView;
  policy: OptimizationDisplayPolicy;
}) {
  const b = view.beforeMetrics;
  const a = view.afterMetrics;
  const metricRows: Array<[string, keyof BaseEngineMetrics]> = [
    ['NPAC', 'npac'],
    ['POD', 'pod'],
    ['ice fraction', 'iceFraction'],
    ['total solids', 'solids'],
    ['water', 'water'],
  ];

  return (
    <Card padding="lg">
      <SectionLabel>Optimization preview</SectionLabel>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span className={`text-sm font-medium ${DECISION_TONE[view.finalDecision] ?? 'text-ivory'}`}>
          {humanize(view.finalDecision)}
        </span>
        <span className="font-mono text-[11px] text-ivory/40">
          {view.productProfile} · {view.servingTemperatureC}°C
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ivory/60">{recommendationFor(view.finalDecision)}</p>

      {/* Temperature-aware target instrumentation — label only, safe in every tier. */}
      <p className="mt-2 font-mono text-[11px] text-ivory/40">
        solver target: {view.targetGuidance.solverTargetSource}
        {view.targetGuidance.solverTargetAligned
          ? ' · aligned with the regulator'
          : ' · not connected (still the −11 seeded band)'}
      </p>

      {/* Directional recommendation — safe in every tier (no grams, no ingredient names). */}
      {view.correctionGoals.length > 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-ivory/50">
          <span className="text-ivory/40">Direction: </span>
          {view.correctionGoals.map(humanize).join(' · ')}
        </p>
      ) : null}

      {/* Pro: the exact correction plan (target metric + lever ingredient classes). */}
      {policy.showCorrectionDetail && view.proposedCorrections.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-ivory/10 pt-3">
          <p className="font-mono text-[11px] text-ivory/40">correction plan</p>
          {view.proposedCorrections.map((p) => (
            <div key={p.goal} className="flex justify-between gap-3 font-mono text-[11px] text-ivory/70">
              <span>{humanize(p.goal)}</span>
              <span className="text-ivory/40">{p.affectedIngredientClasses.map(humanize).join(' / ')}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Pro: the solver's exact added grams. */}
      {policy.showExactGrams && view.proposedAdjustments.length > 0 ? (
        <p className="mt-3 font-mono text-[11px] text-sky-300/80">
          solver added: {view.proposedAdjustments.map((x) => `${x.type} ${x.ingredient} ${x.grams.toFixed(1)}g`).join(', ')}
        </p>
      ) : null}

      {/* Pro (technical view): numeric before/after metrics. */}
      {policy.showBeforeAfterMetrics && a ? (
        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 border-t border-ivory/10 pt-3 sm:grid-cols-2">
          {metricRows.map(([label, key]) => (
            <MetricRow key={key} label={label} before={b[key]} after={a[key]} />
          ))}
        </div>
      ) : null}

      {/* Free / Demo: the redaction affordance. */}
      {!policy.showExactGrams ? (
        <p className="mt-3 text-[11px] leading-relaxed text-ivory/30">
          Exact grams and the full correction plan are available on Pro.
        </p>
      ) : null}

      {/* DEV-only debug trace — additive, never relaxes customer redaction. */}
      {policy.showTrace ? (
        <div className="mt-4 space-y-0.5 rounded bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-ivory/40">
          <div>
            DEV trace · rerun {view.rerunState} · optimizer {view.optimizerDecision} · flow {view.flowDecision}
          </div>
          {view.targetGuidance.target ? (
            <div>
              regulator target · {view.targetGuidance.target.regulatorProfile} · npac{' '}
              {view.targetGuidance.target.npacBand[0]}–{view.targetGuidance.target.npacBand[1]}
              {view.targetGuidance.npacTargetDivergence != null
                ? ` · Δcenter ${view.targetGuidance.npacTargetDivergence.toFixed(1)}`
                : ''}
            </div>
          ) : null}
          {view.rerun ? (
            <div>
              regulator {view.rerun.before.status} (score {view.rerun.before.score}) → {view.rerun.after.status} (score{' '}
              {view.rerun.after.score})
            </div>
          ) : null}
          {view.rejectedCorrections.length > 0 ? (
            <div>rejected: {view.rejectedCorrections.map((r) => `${r.goal}:${r.reason}`).join(', ')}</div>
          ) : null}
          {view.hardBlockers.length > 0 ? (
            <div className="text-rose-300/70">blockers: {view.hardBlockers.join(', ')}</div>
          ) : null}
          {view.warnings.length > 0 ? <div>warnings: {view.warnings.join(', ')}</div> : null}
        </div>
      ) : null}
    </Card>
  );
}
