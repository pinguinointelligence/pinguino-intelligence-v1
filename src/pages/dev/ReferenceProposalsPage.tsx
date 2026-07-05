/**
 * DEV-ONLY reference-proposal staging view (route: /dev/reference-proposals).
 *
 * READ-ONLY staging surface for the missing `mapper_basement` references that block products.
 * It reads the pure `referenceProposals` module (NOT mapper_basement) and shows, per proposal,
 * the target category/subcategory, the products it would unlock, the known composition, the
 * missing fields, the required (team-only) PAC/POD calibration, sources, and a readiness badge.
 * It NEVER writes to mapper_basement and NEVER invents PAC/POD.
 *
 * Boundaries (ReferenceProposalsPage.security.test.ts): DEV-only; no service/DB write; no
 * mapper_basement; no pac/pod literal.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import {
  REFERENCE_PROPOSALS,
  filterProposals,
  proposalChecklist,
  proposalInsertReadiness,
  proposalNextAction,
  proposalUnlockedProducts,
  type ProposalReadiness,
} from '@/data/products/referenceProposals';

const CHECK_MARK: Record<'present' | 'missing' | 'team_only', string> = {
  present: '✓',
  missing: '✗',
  team_only: '⛔',
};
const CHECK_STYLE: Record<'present' | 'missing' | 'team_only', string> = {
  present: 'text-emerald-700',
  missing: 'text-status-risky',
  team_only: 'text-amber-700',
};

const READINESS_STYLE: Record<ProposalReadiness, string> = {
  ready: 'bg-emerald-100 text-emerald-700',
  needs_pacpod: 'bg-amber-100 text-amber-700',
  needs_source: 'bg-sky-100 text-sky-700',
  unsafe: 'bg-red-100 text-status-risky',
};

const compEntries = (c: Record<string, number>) => Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' · ');

const READINESS_FILTERS: (ProposalReadiness | 'all')[] = ['all', 'ready', 'needs_pacpod', 'needs_source', 'unsafe'];

export function ReferenceProposalsPage() {
  const [readiness, setReadiness] = useState<ProposalReadiness | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [unlocks, setUnlocks] = useState('');

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const unlocked = proposalUnlockedProducts();
  const categories = ['all', ...new Set(REFERENCE_PROPOSALS.map((p) => p.category))];
  const visible = filterProposals(REFERENCE_PROPOSALS, { readiness, category, unlocks });

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Basement reference proposals</h1>
      <p className="mt-2 text-sm text-stone-600">
        Staging only — read from the pure proposal module. No PAC/POD is invented; every proposal needs
        team-calibrated PAC/POD before insert.
      </p>

      <div className="mt-4 rounded-md border border-amber-400/50 bg-amber-50 px-4 py-2 text-xs leading-relaxed text-amber-900">
        <strong>No basement write.</strong> This page is read-only — nothing here inserts into the locked
        reference base. A human applies a reviewed seed migration once the team supplies calibrated PAC/POD.
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <span className="font-mono text-stone-500">{visible.length}/{REFERENCE_PROPOSALS.length} · unlock {unlocked.length} products</span>
        <select aria-label="readiness filter" className="rounded border border-stone-300 px-2 py-1" value={readiness} onChange={(e) => setReadiness(e.target.value as ProposalReadiness | 'all')}>
          {READINESS_FILTERS.map((r) => <option key={r} value={r}>{r === 'all' ? 'any readiness' : r}</option>)}
        </select>
        <select aria-label="category filter" className="rounded border border-stone-300 px-2 py-1" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'any category' : c}</option>)}
        </select>
        <input aria-label="unlocks product filter" className="rounded border border-stone-300 px-2 py-1 font-mono" placeholder="unlocks PR-…" value={unlocks} onChange={(e) => setUnlocks(e.target.value)} />
      </div>

      <div className="mt-6 space-y-4">
        {visible.map((p) => (
          <div key={p.key} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-medium">{p.proposed_name}</h2>
              <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${READINESS_STYLE[p.readiness]}`}>{p.readiness}</span>
            </div>
            <p className="mt-1 font-mono text-xs text-stone-500">
              target: {p.category} / {p.subcategory} · unlocks {p.unlocks.join(', ')} · source confidence {p.source_confidence}
            </p>
            <p className="mt-2 text-xs text-stone-600">
              <span className="text-stone-400">known (per 100g):</span> {compEntries(p.known_composition as Record<string, number>)}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              <span className="text-stone-400">missing:</span> {p.missing_fields.join(' · ')}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              <span className="text-stone-400">do not insert:</span> {p.do_not_insert_reason}
            </p>
            {p.needs_pacpod_calibration ? (
              <p className="mt-1 text-xs">
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-amber-700">team PAC/POD calibration needed</span>
              </p>
            ) : null}
            <div className="mt-2 rounded border border-stone-100 bg-stone-50 px-2 py-1.5 text-xs">
              <p className="font-mono text-stone-600">required-fields checklist</p>
              <ul className="mt-0.5 grid grid-cols-2 gap-x-3 font-mono text-stone-500">
                {proposalChecklist(p).map((item) => (
                  <li key={item.field}>
                    <span className={CHECK_STYLE[item.status]}>{CHECK_MARK[item.status]}</span> {item.field}
                  </li>
                ))}
              </ul>
              <p className="mt-1 font-mono text-stone-600">
                insert readiness: <span className="text-status-risky">blocked</span> — {proposalInsertReadiness(p).blocking.join(' · ')}
              </p>
            </div>
            <p className="mt-1 text-xs text-sky-800">
              <span className="text-stone-400">next action:</span> {proposalNextAction(p)}
            </p>
            <p className="mt-1 font-mono text-xs text-stone-400">sources: {p.sources.join(' ; ')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
