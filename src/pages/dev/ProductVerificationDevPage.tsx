/**
 * DEV-ONLY PI Verified review workspace (import.meta.env.DEV gated; never shipped).
 *
 * Drives the deterministic in-memory verification adapter so the whole workflow — queue,
 * field resolution, the sign-off gate (no auto-verify; red flags block; provenance +
 * attestations required), reopen/revisions and the append-only audit — can be exercised in a
 * real browser while paid staging is a launch gate. LOCAL / file-first evidence, NOT live.
 */
import { useMemo, useReducer, useState } from 'react';
import type { StatusDecisionInput } from '@/data/products/productStatusDecision';
import { InMemoryVerification } from '@/services/mapperVerification/inMemoryVerification';
import type { ReviewRole } from '@/features/mapper-verification/contracts';

const CLEAN: StatusDecisionInput = { product_name_display: 'Vanilla Gelato Base', mapper_status: 'matched', pac_value: 25, pod_value: 18 };
const FLAGGED: StatusDecisionInput = { product_name_display: 'Protein Sorbet (sugar free)', mapper_status: 'matched', pac_value: 22, pod_value: 15, polyol_percent: 12, detected_text: 'sugar free, contains maltitol' };
const REQUIRED = ['product_name', 'brand', 'package_size', 'package_unit', 'ean_code', 'category', 'nutrition_basis', 'energy_kcal', 'fat', 'carbohydrate', 'sugars', 'protein', 'salt', 'ingredients_text', 'allergens_text'];

export function ProductVerificationDevPage() {
  const svc = useMemo(() => {
    const ctr = { n: 0 };
    const s = new InMemoryVerification(() => new Date(2026, 6, 12, 12, 0, ctr.n).toISOString(), () => `id-${(ctr.n += 1)}`);
    s.grantRole('review_admin', 'review_admin');
    s.grantRole('senior_reviewer', 'senior_reviewer');
    s.grantRole('reviewer', 'reviewer');
    s.createCase({ caseId: 'case-clean', productId: 'PR-1001', ownerUserId: 'owner1', source: 'ocr', statusDecisionInput: CLEAN, categoryFamily: 'food_label', priority: 'high' });
    s.createCase({ caseId: 'case-flagged', productId: 'PR-1002', ownerUserId: 'owner1', source: 'csv_import', statusDecisionInput: FLAGGED, categoryFamily: 'food_label' });
    s.submit('case-clean', 'owner1'); s.submit('case-flagged', 'owner1');
    s.assign('case-clean', 'senior_reviewer', 'review_admin'); s.assign('case-flagged', 'senior_reviewer', 'review_admin');
    return s;
  }, []);

  const [actor, setActor] = useState<ReviewRole>('senior_reviewer');
  const [caseId, setCaseId] = useState('case-clean');
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const [gateMsg, setGateMsg] = useState<string | null>(null);

  const actorId = actor === 'none' ? 'nobody' : actor;
  const c = svc.loadCase(caseId);
  const queue = svc.listQueue({}, 'priority', 1, 10).items;
  const events = c ? svc.listEvents(caseId) : [];
  const revisions = c ? svc.revisionsOf(caseId) : [];
  const gate = c && c.state !== 'verified' && c.state !== 'rejected'
    ? svc.evaluate(caseId, { signedBy: actorId, reason: 'reviewed against technical evidence', independentProvenance: true })
    : null;

  const act = (fn: () => void) => { try { fn(); setGateMsg(null); } catch (e) { setGateMsg((e as Error).message); } refresh(); };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-sm">
      <p className="text-xs uppercase tracking-widest opacity-60">DEV · PI Verified review (in-memory)</p>
      <h1 className="mt-1 text-lg font-semibold">Product Verification · Mapper Review</h1>
      <p className="mt-1 max-w-2xl opacity-70">Deterministic local harness. PI Verified is never auto-granted — it needs an authorized senior reviewer, all required fields resolved, no unwaived blocking red flags, and an independent-provenance attestation. Red-flagged products cannot be verified.</p>

      <section className="mt-6 flex flex-wrap items-center gap-4" aria-label="Controls">
        <label className="font-medium" htmlFor="actor">Acting as</label>
        <select id="actor" className="rounded border px-2 py-1" value={actor} onChange={(e) => { setActor(e.target.value as ReviewRole); refresh(); }}>
          {(['review_admin', 'senior_reviewer', 'reviewer', 'none'] as ReviewRole[]).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="font-medium" htmlFor="case">Case</label>
        <select id="case" className="rounded border px-2 py-1" value={caseId} onChange={(e) => { setCaseId(e.target.value); setGateMsg(null); refresh(); }}>
          {queue.map((q) => <option key={q.caseId} value={q.caseId}>{q.caseId} · {q.state}</option>)}
        </select>
      </section>

      <section className="mt-4" aria-label="Queue">
        <h2 className="font-semibold">Review queue ({queue.length})</h2>
        <ul className="mt-2 space-y-1">
          {queue.map((q) => (
            <li key={q.caseId} className="flex justify-between gap-4">
              <span>{q.productId} · {q.source} · <strong>{q.state}</strong> · rev {q.revision}</span>
              <span className="opacity-60">unresolved {q.unresolvedCount} · conflicts {q.conflictCount} · priority {q.priority}</span>
            </li>
          ))}
        </ul>
      </section>

      {c && (
        <section className="mt-6" aria-label="Case">
          <h2 className="font-semibold">Case {c.caseId} — <span data-testid="case-state">{c.state}</span> (revision {c.revision})</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded border px-3 py-1" onClick={() => act(() => REQUIRED.forEach((f) => svc.decideField(caseId, f, 'accept', actorId)))}>Resolve all required fields</button>
            <button type="button" className="rounded border px-3 py-1" onClick={() => act(() => svc.decideField(caseId, 'salt', 'mark_unknown', actorId, { reason: 'not on label' }))}>Mark salt unknown</button>
            <button type="button" className="rounded border px-3 py-1" onClick={() => act(() => svc.waiveWarning(caseId, 'sweetener_or_polyol', 'supplier technical sheet reviewed', actorId))}>Waive polyol flag</button>
            <button type="button" className="rounded border px-3 py-1 font-medium" onClick={() => act(() => { const r = svc.verify(caseId, { signedBy: actorId, reason: 'independent technical evidence verified', independentProvenance: true }); setGateMsg(`Verified · sign-off ${r.signoff.status}`); })}>Sign off · PI Verified</button>
            <button type="button" className="rounded border px-3 py-1" onClick={() => act(() => svc.reopen(caseId, 'new supplier data', actorId))} disabled={c.state !== 'verified' && c.state !== 'rejected'}>Reopen</button>
          </div>

          <div className="mt-4" role="status" aria-live="polite">
            {gateMsg && <p className="rounded border border-amber-500 bg-amber-50 px-3 py-2 text-amber-900" data-testid="gate-msg">{gateMsg}</p>}
            {gate && (
              <div className="mt-2">
                <p>Sign-off gate: <strong data-testid="gate-allowed">{gate.allowed ? 'READY' : 'BLOCKED'}</strong> · policy status: <strong>{gate.policyStatus}</strong> · red flags clear: {gate.redFlagsClear ? 'yes' : 'no'}</p>
                {!gate.allowed && (
                  <ul className="mt-1 list-disc pl-5 opacity-80">
                    {gate.blockers.map((b, i) => <li key={i} data-testid="blocker">{b}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div aria-label="Revisions">
              <h3 className="font-semibold">Revisions</h3>
              <ul className="mt-1 space-y-1">
                {revisions.map((r) => (
                  <li key={r.revision}>rev {r.revision} · {r.signoff ? `verified by ${r.signoff.signedBy}` : 'open'}{r.openReason ? ` · reopened: ${r.openReason}` : ''}</li>
                ))}
              </ul>
            </div>
            <div aria-label="Audit timeline">
              <h3 className="font-semibold">Audit timeline (append-only)</h3>
              <ul className="mt-1 space-y-1 opacity-80">
                {events.map((e, i) => <li key={i}>{e.at.slice(11, 19)} · {e.actorId} · <strong>{e.eventType}</strong>{e.reason ? ` · ${e.reason}` : ''}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
