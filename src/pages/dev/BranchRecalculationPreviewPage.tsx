/**
 * DEV-ONLY IF9/IF10 Branch Recalculation Preview (route: /dev/branch-recalculation-preview).
 *
 * Renders the deterministic Slice 19 scenarios through the pure branch routers
 * (IF9 batch rescue, IF10 stock shortage) + the exact-recalculation preview
 * (real solver / real calculateRecipe, verification-gated). Preview only —
 * NOTHING is saved or applied; no product DB, no Mapper, no inventory, no auth.
 *
 * Boundaries (BranchRecalculationPreviewPage.security.test.ts): DEV-only route +
 * NotFound; no DB client / service write / recipe save / pac-pod write.
 */
import { NotFoundPage } from '@/pages/NotFoundPage';
import {
  BRANCH_RECALCULATION_SCENARIOS,
  type BranchRecalculationScenario,
} from '@/features/optimization/branchRecalculationFixtures';
import {
  previewBatchRescueRecalculation,
  previewStockShortageRecalculation,
  previewVerifiedSubstituteRecalculation,
  type BranchRecalculationPreview,
} from '@/features/optimization/branchRecalculationPreview';

const STATUS_TONE: Record<string, string> = {
  calculated: 'bg-emerald-500/15 text-emerald-300',
  not_attempted: 'bg-ivory/10 text-ivory/70',
  blocked_missing_data: 'bg-amber-500/15 text-amber-300',
  verification_failed: 'bg-rose-500/15 text-rose-300',
  unsafe: 'bg-rose-500/15 text-rose-300',
  not_supported: 'bg-rose-500/15 text-rose-300',
};

const fmt = (v: number | null | undefined): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—';

const runScenario = (s: BranchRecalculationScenario): BranchRecalculationPreview =>
  s.kind === 'batch_rescue'
    ? previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe })
    : s.kind === 'verified_substitute'
      ? previewVerifiedSubstituteRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: s.plannedRecipe, contract: s.contract() })
      : previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: s.plannedRecipe });

function ScenarioCard({ scenario }: { scenario: BranchRecalculationScenario }) {
  const r = runScenario(scenario);
  const menu = r.batchRescue?.nextUserDecisionOptions ?? r.stockShortage?.nextUserDecisionOptions ?? [];
  const measurements =
    r.batchRescue?.requiredMeasurements ?? r.stockShortage?.requiredMeasurements ?? [];
  return (
    <div className="rounded-lg border border-ivory/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ivory">{scenario.label}</p>
        <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${STATUS_TONE[r.exactStatus] ?? 'bg-ivory/10 text-ivory/70'}`}>
          {r.exactStatus}
        </span>
      </div>
      <div className="mt-3 space-y-1 font-mono text-[11px] text-ivory/60">
        <div>
          branch: {r.branch} · route decision: <span className="text-ivory/80">{r.routeDecision}</span>
        </div>
        {r.exactStatusReason ? <div className="text-ivory/40">reason: {r.exactStatusReason}</div> : null}
        {r.singleShotReason ? (
          <div className="text-ivory/40">single-shot: {r.singleShotReason}</div>
        ) : null}
        {r.multiStep ? (
          <div className={r.multiStep.status === 'verification_failed' ? 'text-rose-300/80' : 'text-emerald-300/80'}>
            multi-step: {r.multiStep.status} · steps {r.multiStep.steps.length}/{r.multiStep.maxSteps} · stop:{' '}
            {r.multiStep.stopReason}
          </div>
        ) : null}
        {r.multiStep?.steps.map((st) => (
          <div key={st.index} className="text-ivory/50">
            step {st.index + 1} (f={st.fraction}): {st.metricValueBefore.toFixed(1)} → {st.metricValueAfter.toFixed(1)} ·{' '}
            {st.regulatorDecision} · {st.actions.map((a) => `${a.type} ${a.ingredient} ${a.grams.toFixed(1)}g`).join(', ')}
          </div>
        ))}
        {r.exactActions.length > 0 ? (
          <div className="text-sky-300/80">
            verified add-only: {r.exactActions.map((a) => `${a.type} ${a.ingredient} ${a.grams.toFixed(1)}g`).join(', ')}
          </div>
        ) : null}
        {r.scaleFactor !== null ? (
          <div className="text-sky-300/80">
            scale factor: ×{r.scaleFactor.toFixed(3)} · verified: {String(r.scaleVerified)}
          </div>
        ) : null}
        {r.substitution ? (
          <div className="text-sky-300/80">
            substitute ({r.substitution.verification}): keep {r.substitution.originalIngredientName}{' '}
            {r.substitution.availableOriginalG.toFixed(0)}g + {r.substitution.substituteName}{' '}
            {r.substitution.substituteG.toFixed(0)}g · {r.substitution.verdict}
          </div>
        ) : null}
        {r.beforeMetrics && r.afterMetrics ? (
          <div>
            npac {fmt(r.beforeMetrics.npac)} → {fmt(r.afterMetrics.npac)} · pod {fmt(r.beforeMetrics.pod)} →{' '}
            {fmt(r.afterMetrics.pod)} · solids {fmt(r.beforeMetrics.solids)} → {fmt(r.afterMetrics.solids)}
          </div>
        ) : null}
        {r.rerun ? (
          <div>
            regulator rerun: {r.rerun.before.status} → {r.rerun.after.status} · decision {r.rerun.decision}
          </div>
        ) : null}
        {menu.length > 0 ? <div className="text-ivory/40">user menu: {menu.join(' · ')}</div> : null}
        {measurements.length > 0 ? (
          <div className="text-amber-300/70">required next: {measurements.join(', ')}</div>
        ) : null}
        {(r.batchRescue?.warnings.length || r.stockShortage?.warnings.length || r.warnings.length) ? (
          <div className="text-ivory/40">
            warnings: {[...(r.batchRescue?.warnings ?? r.stockShortage?.warnings ?? []), ...r.warnings].join(', ')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BranchRecalculationPreviewPage() {
  if (!import.meta.env.DEV) return <NotFoundPage />;

  return (
    <div className="min-h-screen bg-[#1a1a1a] px-6 py-12 text-ivory">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-wide text-ivory/40">DEV · internal</p>
        <h1 className="mt-3 text-2xl font-light tracking-tight">IF9 / IF10 Branch Recalculation Preview</h1>
        <p className="mt-2 text-xs leading-relaxed text-ivory/50">
          Actual-batch rescue (IF9) and stock-shortage (IF10) decisions through the pure spine routers, with
          the exact-recalculation preview on top: the REAL solver (add-only, regulator-target override,
          multi-step walk when a single shot is rejected) and the REAL engine rerun decide what gets numbers
          — verification-gated, never forced. Preview only — nothing is saved, nothing is applied, no
          inventory or product DB is touched, no recipe is mutated.
        </p>
        <div className="mt-6 space-y-4">
          {BRANCH_RECALCULATION_SCENARIOS.map((s) => (
            <ScenarioCard key={s.id} scenario={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
