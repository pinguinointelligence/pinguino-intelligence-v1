/**
 * BranchWorkflowPreviewPanel (Spine Slice 21) — a PURE, display-only rendering
 * of an already-computed IF9/IF10 branch recalculation preview.
 *
 * It NEVER calls the engine, NEVER writes anything, and carries NO action
 * handlers at all — there is no Apply / Save / Update-inventory control by
 * construction. What it shows follows the display policy: Demo/Free see the
 * route decision, the locked user-decision menu and safe status labels only;
 * Pro sees VERIFIED numbers (IF9 add-only grams, the IF10 scale ratio,
 * before/after metrics); the DEV trace is additive. `partial_improvement` is
 * always labelled partial — the word "rescued" never appears for it.
 */
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import type { BranchRecalculationPreview } from './branchRecalculationPreview';
import { branchStatusLabel, type BranchWorkflowDisplayPolicy } from './branchWorkflowPolicy';

const STATUS_TONE: Record<string, string> = {
  calculated: 'text-emerald-300',
  partial_improvement: 'text-amber-300',
  not_attempted: 'text-ivory/70',
  blocked_missing_data: 'text-amber-300',
  unsafe: 'text-rose-300',
  verification_failed: 'text-rose-300',
  not_supported: 'text-rose-300',
};

const humanize = (s: string): string => s.replace(/_/g, ' ');
const fmt = (v: number | null | undefined): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—';

export function BranchWorkflowPreviewPanel({
  preview,
  policy,
}: {
  preview: BranchRecalculationPreview;
  policy: BranchWorkflowDisplayPolicy;
}) {
  const branchLabel = preview.branch === 'actual_batch_rescue' ? 'Actual Batch Rescue' : 'Stock Shortage';
  const branchResult = preview.batchRescue ?? preview.stockShortage;
  const menu = branchResult?.nextUserDecisionOptions ?? [];
  const menuLimitedReason = preview.stockShortage?.menuLimitedReason ?? null;
  const measurements = branchResult?.requiredMeasurements ?? [];
  const allWarnings = [...(branchResult?.warnings ?? []), ...preview.warnings];
  const verified = preview.exactStatus === 'calculated' || preview.exactStatus === 'partial_improvement';

  return (
    <Card padding="lg">
      <SectionLabel>{branchLabel} · preview</SectionLabel>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ivory">{humanize(preview.routeDecision)}</span>
        <span className={`font-mono text-[11px] ${STATUS_TONE[preview.exactStatus] ?? 'text-ivory/60'}`}>
          {branchStatusLabel(preview.exactStatus)}
        </span>
      </div>

      {/* Hard display rules — always visible, every tier. */}
      <p className="mt-2 text-[11px] leading-relaxed text-ivory/40">
        Preview only — nothing is applied. No inventory is changed. No recipe is saved.
      </p>

      {preview.exactStatusReason ? (
        <p className="mt-2 font-mono text-[11px] text-ivory/40">{humanize(preview.exactStatusReason)}</p>
      ) : null}

      {/* The locked user-decision menu — safe in every tier (names, no numbers). */}
      {menu.length > 0 ? (
        <div className="mt-3 border-t border-ivory/10 pt-3">
          <p className="font-mono text-[11px] text-ivory/40">your decision (nothing runs until a later slice):</p>
          <p className="mt-1 text-xs leading-relaxed text-ivory/60">{menu.map(humanize).join(' · ')}</p>
        </div>
      ) : menuLimitedReason ? (
        <p className="mt-3 font-mono text-[11px] text-ivory/40">menu limited: {humanize(menuLimitedReason)}</p>
      ) : null}

      {/* Pro: VERIFIED exact numbers only. */}
      {policy.showExactGrams && verified && preview.exactActions.length > 0 && !preview.substitution ? (
        <p className="mt-3 font-mono text-[11px] text-sky-300/80">
          verified add-only:{' '}
          {preview.exactActions.map((a) => `${a.type} ${a.ingredient} ${a.grams.toFixed(1)}g`).join(', ')}
        </p>
      ) : null}
      {policy.showExactGrams && verified && preview.substitution ? (
        <p className="mt-3 font-mono text-[11px] text-sky-300/80">
          verified substitute ({humanize(preview.substitution.verification)}): keep{' '}
          {preview.substitution.originalIngredientName} {preview.substitution.availableOriginalG.toFixed(1)}g +{' '}
          {preview.substitution.substituteName} {preview.substitution.substituteG.toFixed(1)}g ·{' '}
          {preview.substitution.verdict}
        </p>
      ) : null}
      {policy.showScaleFactor && verified && preview.scaleFactor !== null ? (
        <p className="mt-3 font-mono text-[11px] text-sky-300/80">
          verified scale-down: ×{preview.scaleFactor.toFixed(3)} (all composition percentages preserved)
        </p>
      ) : null}
      {policy.showBeforeAfterMetrics && preview.beforeMetrics && preview.afterMetrics ? (
        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 border-t border-ivory/10 pt-3 sm:grid-cols-2">
          <div className="flex justify-between gap-4 font-mono text-[11px] text-ivory/60">
            <span className="text-ivory/40">NPAC</span>
            <span>
              {fmt(preview.beforeMetrics.npac)} <span className="text-ivory/30">→ {fmt(preview.afterMetrics.npac)}</span>
            </span>
          </div>
          <div className="flex justify-between gap-4 font-mono text-[11px] text-ivory/60">
            <span className="text-ivory/40">POD</span>
            <span>
              {fmt(preview.beforeMetrics.pod)} <span className="text-ivory/30">→ {fmt(preview.afterMetrics.pod)}</span>
            </span>
          </div>
        </div>
      ) : null}

      {/* Safe codes — every tier. */}
      {measurements.length > 0 ? (
        <p className="mt-3 font-mono text-[11px] text-amber-300/70">
          required next: {measurements.map(humanize).join(', ')}
        </p>
      ) : null}
      {allWarnings.length > 0 ? (
        <p className="mt-2 font-mono text-[11px] text-ivory/40">warnings: {allWarnings.map(humanize).join(', ')}</p>
      ) : null}

      {/* Redacted tiers: the upgrade affordance instead of numbers. */}
      {!policy.showExactGrams ? (
        <p className="mt-3 text-[11px] leading-relaxed text-ivory/30">
          Exact verified grams and ratios are available on Pro.
        </p>
      ) : null}

      {/* DEV-only debug trace — additive, never relaxes customer redaction. */}
      {policy.showTrace ? (
        <div className="mt-4 space-y-0.5 rounded bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-ivory/40">
          <div>
            DEV trace · solver {String(preview.trace.solverInvoked)} · override {String(preview.trace.targetOverrideActive)}
          </div>
          {preview.singleShotReason ? <div>single-shot: {preview.singleShotReason}</div> : null}
          {preview.multiStep ? (
            <div>
              multi-step: {preview.multiStep.status} · steps {preview.multiStep.steps.length}/{preview.multiStep.maxSteps} ·
              stop {preview.multiStep.stopReason}
            </div>
          ) : null}
          {preview.rerun ? <div>rerun: {preview.rerun.before.status} → {preview.rerun.after.status} · {preview.rerun.decision}</div> : null}
          {preview.scaleVerified !== null ? <div>scaleVerified: {String(preview.scaleVerified)}</div> : null}
        </div>
      ) : null}
    </Card>
  );
}
