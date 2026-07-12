/**
 * DEV-ONLY PINGÜINO PRO CORE — exact scaling + Production Mode (import.meta.env.DEV gated; never
 * shipped). Drives the deterministic in-memory production adapter so the whole vertical — select
 * an exact immutable version → scale to a non-round batch (exact total + Engine invariance) →
 * plan a run → legal lifecycle → record actuals → deviation → complete → append-only amendment →
 * owner-scoped history — can be exercised in a real browser. LOCAL / file-first, NOT a backend.
 */
import { useMemo, useReducer, useState } from 'react';
import { calculateRecipe, type EngineIngredient, type RecipeInput, type RecipeItem } from '@/engine';
import { buildRecipeVersion } from '@/features/pro-core/recipeVersioning';
import { scaledRecipeInput } from '@/features/pro-core/recipeScaling';
import { productionCapabilitiesFor, type ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import { computeDeviation } from '@/features/pro-core/productionMode';
import { InMemoryProduction } from '@/services/proCore/inMemoryProduction';

const TRACE = { engineVersion: 'engine.dev', configVersion: 'config.dev' };

/** A small but REAL milk base so calculateRecipe yields real percentages (invariance is genuine). */
function ing(id: string, name: string, c: Partial<EngineIngredient['composition']>): EngineIngredient {
  const zero = {
    water_percent: 0, solids_percent: 0, fat_percent: 0, protein_percent: 0, carbohydrate_percent: 0,
    sugar_percent: 0, sucrose_percent: 0, glucose_percent: 0, dextrose_percent: 0, fructose_percent: 0,
    lactose_percent: 0, polyol_percent: 0, fiber_percent: 0, salt_percent: 0, alcohol_percent: 0, kcal_per_100g: 0,
  };
  return {
    id, name, category: 'dairy', composition: { ...zero, ...c },
    pod_value: null, pac_value: null, de_value: null, cost_per_kg: null,
    confidence_score: 100, source_type: 'verified_db', is_verified: true,
  };
}
const line = (i: EngineIngredient, grams: number): RecipeItem => ({ id: i.id, ingredient: i, planned_grams: grams, actual_grams: null, lock_type: 'unlocked' });

function seedVersion() {
  const items = [
    line(ing('milk', 'Milk 3.5%', { water_percent: 88.7, solids_percent: 11.3, fat_percent: 3.5, lactose_percent: 4.7, sugar_percent: 4.7, protein_percent: 3 }), 523.5),
    line(ing('cream', 'Cream 30%', { water_percent: 64.42, solids_percent: 35.58, fat_percent: 30, lactose_percent: 3.2, sugar_percent: 3.2, protein_percent: 2.3 }), 263.5),
    line(ing('sucrose', 'Sucrose', { solids_percent: 100, carbohydrate_percent: 100, sugar_percent: 100, sucrose_percent: 100 }), 123.4),
    line(ing('dextrose', 'Dextrose', { water_percent: 8, solids_percent: 92, carbohydrate_percent: 92, sugar_percent: 92, glucose_percent: 92 }), 38.3),
  ];
  const recipeInput: RecipeInput = { items, mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: 948.7, machine_capacity_grams: null };
  return buildRecipeVersion({ recipeId: 'r', ownerUserId: 'user-pro', versionNumber: 3, recipeInput, trace: TRACE, source: 'manual', createdBy: 'user-pro', createdAt: '2026-07-12T12:00:00.000Z' }, 'ver-3');
}

const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(3));

export function ProCoreProductionDevPage() {
  const svc = useMemo(() => { const c = { n: 0 }; return new InMemoryProduction(() => new Date(2026, 6, 12, 13, 0, c.n).toISOString(), () => `id-${(c.n += 1)}`); }, []);
  const version = useMemo(() => seedVersion(), []);
  const [persona, setPersona] = useState<ProCorePersona>('pro');
  const [target, setTarget] = useState(1234);
  const [runId, setRunId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, refresh] = useReducer((x: number) => x + 1, 0);

  const caps = productionCapabilitiesFor(persona);
  const owner = `user-${persona}`;
  const act = (fn: () => void) => { try { fn(); setMsg(null); } catch (e) { setMsg((e as Error).message); } refresh(); };

  const scaled = svc.scale(version, { kind: 'weight_g', grams: target });
  const run = runId ? svc.getRun(runId, owner) : null;
  const dev = run ? computeDeviation(run) : null;

  // Engine composition invariance (real): source percentages vs scaled percentages.
  const before = calculateRecipe(version.recipeInput).percentages;
  const after = scaled.ok ? calculateRecipe(scaledRecipeInput(version, scaled)).percentages : null;
  const maxDrift = after ? Math.max(...(Object.keys(before) as (keyof typeof before)[]).map((k) => Math.abs(after[k] - before[k]))) : null;

  const history = svc.listRuns(owner, { sort: 'newest' });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-sm">
      <p className="text-xs uppercase tracking-widest opacity-60">DEV · PRO CORE — exact scaling + Production Mode (in-memory)</p>
      <h1 className="mt-1 text-lg font-semibold">Scale · Plan · Produce · History</h1>
      <p className="mt-1 max-w-2xl opacity-70">Deterministic local harness over immutable recipe version <strong>v{version.versionNumber}</strong> ({version.versionId}). Scaling totals the batch exactly; a run is planned from the exact version id; the planned snapshot is immutable; actuals never replace it; post-completion changes are append-only. Production Mode is Pro-only.</p>

      <section className="mt-5 flex flex-wrap items-center gap-3" aria-label="Persona">
        <label className="font-medium" htmlFor="persona">Persona</label>
        <select id="persona" className="rounded border px-2 py-1" value={persona} onChange={(e) => { setPersona(e.target.value as ProCorePersona); setRunId(null); setMsg(null); refresh(); }}>
          <option value="pro">Pro</option><option value="home">Home</option><option value="demo">Demo</option>
        </select>
        <span className="opacity-60" data-testid="cap">Production Mode: {caps.canUseProductionMode ? 'yes' : 'no'} · exact grams: {caps.canViewExactGrams ? 'yes' : 'no'}</span>
      </section>

      <section className="mt-4 flex flex-wrap items-center gap-3" aria-label="Scale">
        <label className="font-medium" htmlFor="target">Target batch (g)</label>
        <select id="target" className="rounded border px-2 py-1" value={target} onChange={(e) => { setTarget(Number(e.target.value)); refresh(); }}>
          {[1234, 4750, 12500, 50, 250000].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {scaled.ok && (
          <span className="opacity-70" data-testid="scale-total">
            source {scaled.sourceTotalG.toFixed(1)} g → exact total <strong>{scaled.canonicalTotalG}</strong> g · display total <strong>{scaled.displayTotalG}</strong> g · invariance max drift {maxDrift?.toExponential(1)} pp
          </span>
        )}
      </section>

      {scaled.ok && (
        <ul className="mt-2 space-y-1" aria-label="Scaled lines">
          {scaled.lines.map((l) => (
            <li key={l.id} data-testid="scaled-row">{l.name}: {l.sourceGrams} g → <strong>{l.grams}</strong> g (display {l.displayGrams} g)</li>
          ))}
        </ul>
      )}

      <section className="mt-5 flex flex-wrap gap-2" aria-label="Actions">
        <button type="button" className="rounded border px-3 py-1" onClick={() => act(() => { const r = svc.createRun({ ownerUserId: owner, version, target: { kind: 'weight_g', grams: target }, capabilities: caps, by: owner }); setRunId(r.runId); })}>Plan run from exact version</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!run} onClick={() => act(() => svc.transition(run!.runId, 'planned', owner))}>→ planned</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!run} onClick={() => act(() => svc.transition(run!.runId, 'in_progress', owner))}>→ in_progress</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!run} onClick={() => act(() => svc.recordActual(run!.runId, { by: owner, items: run!.plannedItems.map((p, idx) => ({ id: p.id, name: p.name, actualGrams: p.plannedGrams + (idx === 0 ? 5 : -5) })), actualTotalMixG: run!.plannedBatchG, actualYieldG: run!.plannedBatchG - 120, wasteG: 120, deviationReason: 'scale drift' }))}>Record actuals</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!run} onClick={() => act(() => svc.transition(run!.runId, 'completed', owner))}>→ completed</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!run} onClick={() => act(() => svc.amend(run!.runId, { by: owner, detail: 'Corrected batch label', amendment: { batch_reference: 'B-77' } }))}>Amend (post-completion)</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!run} onClick={() => act(() => svc.transition(run!.runId, 'draft', owner))}>Try illegal → draft</button>
      </section>

      {msg && <p role="alert" className="mt-4 rounded border border-amber-500 bg-amber-50 px-3 py-2 text-amber-900" data-testid="msg">{msg}</p>}

      {run && (
        <section className="mt-6" aria-label="Run">
          <h2 className="font-semibold">Run {run.runId} · status <strong data-testid="status">{run.status}</strong></h2>
          <p className="opacity-70">planned from version <strong>{run.recipeVersionId}</strong> (v{run.recipeVersionNumber}) · planned batch {run.plannedBatchG} g · events <strong data-testid="events">{run.events.length}</strong> ({run.events.map((e) => e.type).join(' → ')})</p>
          {dev && (
            <table className="mt-2 w-full border-collapse text-left">
              <thead><tr className="opacity-60"><th className="pr-4">ingredient</th><th className="pr-4">planned g</th><th className="pr-4">actual g</th><th className="pr-4">Δ g</th><th>Δ %</th></tr></thead>
              <tbody>
                {dev.lines.map((l) => (
                  <tr key={l.id} data-testid="dev-row"><td className="pr-4">{l.name}</td><td className="pr-4">{l.plannedGrams}</td><td className="pr-4">{l.actualGrams ?? '—'}</td><td className="pr-4">{l.deltaGrams === null ? '—' : l.deltaGrams}</td><td>{l.deltaPercent === null ? '—' : l.deltaPercent.toFixed(2)}</td></tr>
                ))}
                <tr className="font-medium"><td className="pr-4">total mix</td><td className="pr-4">{dev.plannedTotalG}</td><td className="pr-4">{fmt(dev.actualTotalMixG)}</td><td className="pr-4">{dev.totalDeltaG === null ? '—' : dev.totalDeltaG}</td><td>yield {fmt(dev.actualYieldG)} · waste {fmt(dev.wasteG)}</td></tr>
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="mt-6" aria-label="History">
        <h2 className="font-semibold">History (owner {owner}) — <span data-testid="history-count">{history.total}</span></h2>
        <ul className="mt-2 space-y-1">
          {history.items.map((r) => (
            <li key={r.runId} data-testid="history-row">{r.runId} · v{r.recipeVersionNumber} · {r.status} · {r.plannedBatchG} g · {r.createdAt.slice(11, 19)}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
