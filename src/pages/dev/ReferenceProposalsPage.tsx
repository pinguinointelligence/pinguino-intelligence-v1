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
import { NotFoundPage } from '@/pages/NotFoundPage';
import { REFERENCE_PROPOSALS, proposalUnlockedProducts, type ProposalReadiness } from '@/data/products/referenceProposals';

const READINESS_STYLE: Record<ProposalReadiness, string> = {
  ready: 'bg-emerald-100 text-emerald-700',
  needs_pacpod: 'bg-amber-100 text-amber-700',
  needs_source: 'bg-sky-100 text-sky-700',
  unsafe: 'bg-red-100 text-status-risky',
};

const compEntries = (c: Record<string, number>) => Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' · ');

export function ReferenceProposalsPage() {
  if (!import.meta.env.DEV) return <NotFoundPage />;

  const unlocked = proposalUnlockedProducts();

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Basement reference proposals</h1>
      <p className="mt-2 text-sm text-stone-600">
        Staging only — read from the pure proposal module. Nothing here writes to the locked
        reference base, and no PAC/POD is invented. Every proposal needs team-calibrated PAC/POD before insert.
      </p>
      <p className="mt-2 font-mono text-xs text-stone-500">
        {REFERENCE_PROPOSALS.length} proposals · would unlock {unlocked.length} products
      </p>

      <div className="mt-6 space-y-4">
        {REFERENCE_PROPOSALS.map((p) => (
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
            <p className="mt-1 font-mono text-xs text-stone-400">sources: {p.sources.join(' ; ')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
