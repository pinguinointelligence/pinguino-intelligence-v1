/**
 * DEV-ONLY Optimization Preview (route: /dev/optimization-preview).
 *
 * Wires the pure Spine chain — Base Engine metrics → Integration Flow → Optimizer
 * routing → `runOptimizationRerunPreview` — to the REAL correction solver and
 * REAL `calculateRecipe` over deterministic sample recipes (no product DB, no
 * Mapper, no external DB, no auth). It renders, per fixture, the before/after
 * metrics, the decision at each stage, the correction plan, and the final
 * verified decision. It writes NOTHING and persists NOTHING.
 *
 * Boundaries (OptimizationPreviewPage.security.test.ts): DEV-only route + NotFound;
 * no DB client / service write / recipe save / pac-pod write / status activation.
 */
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OPTIMIZATION_PREVIEW_FIXTURES } from '@/features/optimization/optimizationPreviewFixtures';
import {
  runAllOptimizationPreviews,
  type OptimizationPreviewView,
} from '@/features/optimization/optimizationPreviewRunner';

const DECISION_TONE: Record<string, string> = {
  optimized: 'bg-emerald-500/15 text-emerald-300',
  no_action_needed: 'bg-emerald-500/15 text-emerald-300',
  tradeoff: 'bg-amber-500/15 text-amber-300',
  warning: 'bg-amber-500/15 text-amber-300',
  impossible: 'bg-rose-500/15 text-rose-300',
  blocked: 'bg-rose-500/15 text-rose-300',
};

const fmt = (v: number | null | undefined): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—';

const Pill = ({ text }: { text: string }) => (
  <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${DECISION_TONE[text] ?? 'bg-ivory/10 text-ivory/70'}`}>
    {text}
  </span>
);

const MetricRow = ({ label, before, after }: { label: string; before: number | null | undefined; after: number | null | undefined }) => (
  <div className="flex justify-between gap-4 font-mono text-[11px] text-ivory/70">
    <span className="text-ivory/40">{label}</span>
    <span>
      {fmt(before)}
      {after !== undefined ? <span className="text-ivory/40"> → {fmt(after)}</span> : null}
    </span>
  </div>
);

function FixtureCard({ view }: { view: OptimizationPreviewView }) {
  const b = view.beforeMetrics;
  const a = view.afterMetrics;
  return (
    <div className="rounded-lg border border-ivory/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ivory">{view.label}</p>
        <Pill text={view.finalDecision} />
      </div>
      <p className="mt-1 font-mono text-[11px] text-ivory/40">
        {view.productProfile} · {view.servingTemperatureC}°C · intended {view.intendedDecision} · rerun {view.rerunState}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
        <MetricRow label="NPAC" before={b.npac} after={a?.npac} />
        <MetricRow label="POD" before={b.pod} after={a?.pod} />
        <MetricRow label="ice fraction" before={b.iceFraction} after={a?.iceFraction} />
        <MetricRow label="fat" before={b.fat} after={a?.fat} />
        <MetricRow label="total solids" before={b.solids} after={a?.solids} />
        <MetricRow label="water" before={b.water} after={a?.water} />
        <MetricRow label="lactose sanding" before={b.lactoseSanding} after={a?.lactoseSanding} />
        <MetricRow label="protein share" before={b.proteinShareInSolids} after={a?.proteinShareInSolids} />
      </div>

      <div className="mt-3 space-y-1 border-t border-ivory/10 pt-3 font-mono text-[11px] text-ivory/60">
        <div>flow: <Pill text={view.flowDecision} /> · optimizer: <Pill text={view.optimizerDecision} /></div>
        <div>correction goals: {view.correctionGoals.length ? view.correctionGoals.join(', ') : '—'}</div>
        <div className="text-emerald-300/80">
          proposed: {view.proposedCorrections.length
            ? view.proposedCorrections.map((p) => `${p.goal}[${p.affectedIngredientClasses.join('/')}]`).join(', ')
            : '—'}
        </div>
        {view.rejectedCorrections.length ? (
          <div className="text-rose-300/80">rejected: {view.rejectedCorrections.map((r) => `${r.goal}:${r.reason}`).join(', ')}</div>
        ) : null}
        {view.proposedAdjustments.length ? (
          <div className="text-sky-300/80">solver added: {view.proposedAdjustments.map((x) => `${x.type} ${x.ingredient} ${x.grams.toFixed(1)}g`).join(', ')}</div>
        ) : null}
        {view.rerun ? (
          <div>
            regulator: {view.rerun.before.status} (acc {String(view.rerun.before.acceptable)}, score {view.rerun.before.score}) →{' '}
            {view.rerun.after.status} (acc {String(view.rerun.after.acceptable)}, score {view.rerun.after.score})
          </div>
        ) : null}
        {view.hardBlockers.length ? <div className="text-rose-300/80">blockers: {view.hardBlockers.join(', ')}</div> : null}
        {view.warnings.length ? <div className="text-ivory/40">warnings: {view.warnings.join(', ')}</div> : null}
      </div>
    </div>
  );
}

export function OptimizationPreviewPage() {
  if (!import.meta.env.DEV) return <NotFoundPage />;

  const views = runAllOptimizationPreviews(OPTIMIZATION_PREVIEW_FIXTURES);

  return (
    <div className="min-h-screen bg-[#1a1a1a] px-6 py-12 text-ivory">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-wide text-ivory/40">DEV · internal</p>
        <h1 className="mt-3 text-2xl font-light tracking-tight">Optimization Preview</h1>
        <p className="mt-2 text-xs leading-relaxed text-ivory/50">
          Deterministic sample recipes run through the REAL Base Engine + correction solver, wired to the
          pure Spine chain (Integration Flow → Optimizer routing → rerun verification). Preview only —
          nothing is saved, no product DB / Mapper / external backend is touched, no recipe is mutated.
        </p>
        <div className="mt-6 space-y-4">
          {views.map((view) => (
            <FixtureCard key={view.id} view={view} />
          ))}
        </div>
      </div>
    </div>
  );
}
