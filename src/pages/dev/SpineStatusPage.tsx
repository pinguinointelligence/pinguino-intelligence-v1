/**
 * DEV-ONLY Spine status board (route: /dev/spine).
 *
 * A STATIC repo-level snapshot of the locked PINGUINO Spine v1.0 architecture: which modules are
 * done / partial / blocked / not started, plus links to the working DEV tools and the governing
 * docs. It reads nothing live (no DB, no services) — the source of truth is docs/PINGUINO_SPINE.md
 * and the locked documents in docs/pinguino-spine/; this page is a signpost, not a monitor.
 *
 * Boundaries (SpineStatusPage.test.tsx): DEV-only; no DB/service access; no engine-value writes;
 * no external benchmark tool names.
 */
import { Link } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';

/** Snapshot date — bump when the status list is re-audited against the repo. */
const SNAPSHOT_DATE = '2026-07-06';

type SpineStatus = 'done' | 'partial' | 'blocked' | 'not_started';

const STATUS_LABEL: Record<SpineStatus, string> = {
  done: 'done',
  partial: 'partial',
  blocked: 'blocked on humans',
  not_started: 'not started',
};

const STATUS_CLASS: Record<SpineStatus, string> = {
  done: 'rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700',
  partial: 'rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-700',
  blocked: 'rounded bg-rose-100 px-1.5 py-0.5 font-mono text-xs text-rose-700',
  not_started: 'rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-500',
};

interface SpineModule {
  module: string;
  status: SpineStatus;
  note: string;
  to?: string;
}

/** Condensed from the full evidence table in docs/PINGUINO_SPINE.md §6. */
const MODULES: SpineModule[] = [
  { module: 'Mapper Basement', status: 'done', note: '542 locked references; read-only from the app; inserts only via approved human seed migration.' },
  { module: 'Product Mapper', status: 'blocked', note: '69 products · 23 matched · 3 rejected · 43 awaiting team calibration (PAC/POD + owner picks).', to: '/dev/mapper-status' },
  { module: 'Matching stack', status: 'done', note: 'Composition matcher + name-concept tiebreak + milk fat-band + coffee special-case; false-positive tested.', to: '/dev/mapper-review' },
  { module: 'Reference proposals / calibration pack', status: 'blocked', note: '12 staged proposals unlock ~17 products; team fills PAC/POD, owner approves the insert.', to: '/dev/reference-proposals' },
  { module: 'Studio “My Products”', status: 'done', note: 'Reference-linked engine handoff (PAC/POD resolved at calc time, never copied); math-equivalence proven.', to: '/dev/studio-picker-proof' },
  { module: 'Base Engine', status: 'partial', note: '−11 °C calibrated, deterministic, ENGINE 0.4.0 / CONFIG 0.5.0 — frozen; −12/−13 arrive as regulator configs, never as duplicate engines.' },
  { module: 'Optimizer (correction solver core)', status: 'partial', note: 'Deterministic candidates → exact grams → verify by full recalc; planning/actual-batch contexts; demo redaction at source. Profile-awareness pending.' },
  { module: 'Product Profile Registry', status: 'not_started', note: '4 active profiles locked (standard, sorbet, vegan, chocolate); unsupported types must warn, never silently map.' },
  { module: 'Recipe Intent', status: 'not_started', note: 'NormalizedRecipeIntent contract 1.0.0 locked; explicit input → saved defaults → system defaults.' },
  { module: 'Designer', status: 'not_started', note: 'Intent → RecipeDesignPlan (strategy + optimizer constraints); flavor-driven routing; hero-ingredient policy by tier.' },
  { module: 'Temperature Regulator', status: 'not_started', note: 'Bands locked for 4 products × −11/−12/−13 °C in four regulator docs; −11 is the zero-delta base.' },
  { module: 'Integration Flow router', status: 'not_started', note: '16-step execution order locked; routes final / warning / tradeoff / impossible.' },
  { module: 'User Flow (conversation)', status: 'not_started', note: 'Polish-first script locked — first question “Jakie lody dziś robimy?”; batch size before final generation.' },
  { module: 'Account Access', status: 'partial', note: 'Demo/Pro hook + at-source redaction exist; the AccessContext/capabilities contract is pending. Login/billing stay external.' },
  { module: 'Intake / OCR', status: 'partial', note: 'Classifier + label-image queue live; OCR engine not built — the adapter honestly returns not-implemented.', to: '/dev/intake-hub' },
  { module: 'Enrichment (reviewed merge)', status: 'done', note: 'Fill/agree/conflict/skip compare; nutrition-allowlist writes; never overwrites a PI-Verified product. Idle until a non-catalog product arrives.', to: '/dev/enrichment-preview' },
  { module: 'Snapshots / audit trail', status: 'done', note: 'Append-only product snapshots with diff view.', to: '/dev/snapshot-audit' },
  { module: 'Auth / plans / billing', status: 'partial', note: 'External by design — will feed the resolved AccessContext; Free Preview mode live.' },
  { module: 'Labels / print / export', status: 'not_started', note: 'Destination placeholder only; Phase E of the roadmap.' },
  { module: 'Franchise / SOP', status: 'not_started', note: 'Future phase; commercial planning doc only.' },
];

const DOCS = [
  'docs/PINGUINO_SPINE.md — repo-level architecture map (system map, data flows, safety rules, evidence table)',
  'docs/PINGUINO_NEXT_IMPLEMENTATION_ROADMAP.md — phases A (team calibration) → G (franchise/future)',
  'docs/pinguino-spine/ — the 14 locked Spine documents (source of truth for every module above)',
  'docs/mapper/OWNER_TEAM_CALIBRATION_HANDOFF.md — the current human gate, ready to hand over',
];

export function SpineStatusPage() {
  if (!import.meta.env.DEV) return <NotFoundPage />;

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">PINGUINO Spine — status</h1>
      <p className="mt-2 text-sm text-stone-600">
        Static snapshot ({SNAPSHOT_DATE}) of the locked Spine v1.0 architecture vs this repo. Reads
        nothing live — the evidence lives in the docs listed below.
      </p>

      <div className="mt-6 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
        <h2 className="font-medium">The locked execution spine</h2>
        <p className="mt-1 font-mono text-xs leading-relaxed text-stone-600">
          user input → Recipe Intent → Designer → Product Profile → Base Engine → Temperature
          Regulator → decision router → Optimizer (if needed) → recalc → verified output
        </p>
        <p className="mt-1 text-xs text-stone-500">
          One shared Base Engine for every product and temperature. AI explains and routes — AI
          never calculates exact recipe values.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {MODULES.map((m) => (
          <div key={m.module} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-medium">{m.module}</h2>
              <span className={STATUS_CLASS[m.status]}>{STATUS_LABEL[m.status]}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">{m.note}</p>
            {m.to ? (
              <Link to={m.to} className="mt-2 inline-block font-mono text-xs text-sky-700 underline">
                open {m.to} →
              </Link>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
        <h2 className="font-medium">Next actions</h2>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-stone-600">
          <li>
            <strong>HUMAN (the gate):</strong> team fills the calibration pack PAC/POD + the 4 owner
            picks, then a human applies the approved reference insert.
          </li>
          <li>
            <strong>CODE (independent):</strong> Spine Phase C can start any time — contracts →
            Product Profile Registry → Recipe Intent → Designer → regulator configs → router.
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
        <h2 className="font-medium">Governing docs</h2>
        <ul className="mt-1 space-y-1 text-xs leading-relaxed text-stone-600">
          {DOCS.map((d) => (
            <li key={d} className="font-mono">{d}</li>
          ))}
        </ul>
      </div>

      <p className="mt-6 rounded-md border border-stone-100 bg-stone-50 px-4 py-3 font-mono text-xs leading-relaxed text-stone-500">
        never: auto-write the locked reference base · copy reference PAC/POD onto products · show
        exact grams or exact Auto Fix in demo · invent values the docs don’t define
      </p>
    </div>
  );
}
