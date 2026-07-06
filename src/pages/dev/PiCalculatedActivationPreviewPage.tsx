/**
 * DEV-ONLY PI Calculated activation page (route: /dev/pi-calculated-activation-preview).
 *
 * Shows the GATED activation plan for each class-derived PI Calculated candidate — the exact
 * class_derived EngineIngredient, Studio provenance label, and review_notes — and, for an
 * OWNER-APPROVED candidate whose status is still draft, an "Activate" control that persists
 * `pi_calculated` THROUGH the guarded `setProductLifecycleStatus` service (status + review audit
 * only — never pac/pod, never a broad update, never mapper_basement). NOT-approved candidates are
 * preview-only. The approval allowlist (`APPROVED_PI_CALCULATED_CODES`) gates activation.
 *
 * Boundaries (PiCalculatedActivationPreviewPage.security.test.ts): DEV-only route + NotFound;
 * reads via the two read services; runs the pure planner; the ONLY write is the narrow
 * setProductLifecycleStatus; never writes pac/pod; no locked base; no raw DB verbs.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { listMyProducts } from '@/services/products';
import { listEngineApprovedIngredients } from '@/services/ingredients';
import { setProductLifecycleStatus } from '@/services/productStatusWrite';
import {
  planClassDerivedActivations,
  type ClassDerivedActivationBatch,
  type ClassDerivedActivationPlan,
} from '@/data/products/productActivationPlan';

export function PiCalculatedActivationPreviewPage() {
  const [batch, setBatch] = useState<ClassDerivedActivationBatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const load = async () => {
    setLoading(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const [products, basement] = await Promise.all([listMyProducts(), listEngineApprovedIngredients()]);
      setBatch(planClassDerivedActivations({ products, basement }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  // Persist pi_calculated THROUGH the guarded service (status + review_notes only). Owner-approved
  // + still-draft candidates only. Never writes pac/pod; the product row's engine columns stay NULL.
  const activate = async (plan: ClassDerivedActivationPlan) => {
    setBusyCode(plan.product_code);
    setErrorMessage(null);
    setMessage(null);
    try {
      const review_notes = `${plan.status_update.review_notes} · owner-approved activation (${plan.product_code} only)`;
      const updated = await setProductLifecycleStatus(plan.status_update.product_id, 'pi_calculated', { review_notes });
      setMessage(`${plan.product_code} → status ${updated.status}`);
      setBatch((prev) =>
        prev
          ? {
              ...prev,
              plans: prev.plans.map((p) =>
                p.product_code === plan.product_code ? { ...p, current_status: updated.status } : p,
              ),
            }
          : prev,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">PI Calculated — activation</h1>
      <p className="mt-2 text-sm text-stone-600">
        The gated activation plan per class-derived PI Calculated candidate. Activating an
        owner-approved candidate persists <code>pi_calculated</code> through the guarded status
        service (status + review note only) — never pac/pod, never the locked base.
      </p>
      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-800">
        only owner-approved codes activate · product pac/pod always stay NULL · no locked-base write
      </p>

      {!batch ? (
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="mt-6 rounded bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Build activation plans'}
        </button>
      ) : null}
      {message ? <p className="mt-3 font-mono text-xs text-emerald-700">{message}</p> : null}
      {errorMessage ? <p className="mt-3 font-mono text-xs text-rose-700">{errorMessage}</p> : null}

      {batch ? (
        <>
          <p className="mt-4 font-mono text-xs text-stone-500">
            {batch.plans.length} class-derived candidate(s) · {batch.approvedPlans.length} owner-approved ·
            allowlist: [{batch.approvedCodes.join(', ') || 'empty'}]
          </p>
          {batch.plans.length === 0 ? (
            <p className="mt-4 font-mono text-xs text-stone-400">no class-derived PI Calculated candidates</p>
          ) : null}
          <div className="mt-4 space-y-3">
            {batch.plans.map((plan) => (
              <PlanCard key={plan.product_code} plan={plan} busy={busyCode === plan.product_code} onActivate={() => void activate(plan)} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function PlanCard({ plan, busy, onActivate }: { plan: ClassDerivedActivationPlan; busy: boolean; onActivate: () => void }) {
  const ing = plan.engine_ingredient;
  const activatable = plan.approved && plan.current_status === 'draft';
  return (
    <div className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-stone-500">{plan.product_code}</span>
        <span
          className={
            plan.approved
              ? 'rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700'
              : 'rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-500'
          }
        >
          {plan.approved ? 'APPROVED' : 'NOT APPROVED — preview only'}
        </span>
      </div>
      <p className="mt-0.5 font-medium">{plan.product_name ?? '(no name)'}</p>
      <p className="mt-1 font-mono text-xs text-stone-500">
        current status {plan.current_status} · rule {plan.rule_id} · {plan.confidence} · composition basis{' '}
        {plan.composition_basis_reference_id} · pac/pod basis {plan.pacpod_basis_reference_ids.join(', ')}
      </p>
      <p className="mt-1 font-mono text-xs text-emerald-700">ephemeral engine values · pac {plan.derived_pac} · pod {plan.derived_pod}</p>
      <p className="mt-1 font-mono text-xs text-sky-700">Studio label: “{plan.provenance_label}”</p>
      <div className="mt-2 rounded bg-stone-50 px-2 py-1.5 font-mono text-[11px] text-stone-600">
        <div>engine ingredient: id {ing.id} · pac {ing.pac_value} · pod {ing.pod_value} · is_verified {String(ing.is_verified)} · source {ing.source_type}</div>
        <div className="mt-1">review_notes: {plan.status_update.review_notes}</div>
        <div className="mt-1 text-rose-700">product row after: pac_value {String(plan.product_pac_after)} · pod_value {String(plan.product_pod_after)} (stays NULL)</div>
      </div>
      {activatable ? (
        <button
          type="button"
          onClick={onActivate}
          disabled={busy}
          className="mt-2 rounded bg-emerald-700 px-3 py-1.5 text-xs text-paper disabled:opacity-50"
        >
          {busy ? 'Activating…' : 'Activate → pi_calculated (guarded)'}
        </button>
      ) : plan.approved && plan.current_status === 'pi_calculated' ? (
        <p className="mt-2 font-mono text-xs text-emerald-700">✓ activated (pi_calculated)</p>
      ) : null}
      {plan.warnings.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-stone-500">
          {plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
