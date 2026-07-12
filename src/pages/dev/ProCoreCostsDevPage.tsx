/**
 * DEV-ONLY PINGÜINO PRO CORE — ingredient costs + immutable cost snapshots + gated export
 * (import.meta.env.DEV gated; never shipped). Drives the deterministic in-memory costs adapter so
 * cost entries → resolve → freeze snapshot → historical immutability → capability-gated CSV export
 * can be exercised in a real browser. LOCAL / file-first, NOT a backend.
 */
import { useMemo, useReducer, useState } from 'react';
import { exportCapabilitiesFor, type ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import { buildCostSnapshotCsv } from '@/features/pro-core/costExport';
import type { RecipeCostSnapshot } from '@/features/pro-core/costContracts';
import { InMemoryCosts, type NewCostEntry } from '@/services/proCore/inMemoryCosts';

const LINES = [
  { ingredientId: 'milk', ingredientName: 'Milk', grams: 600 },
  { ingredientId: 'sugar', ingredientName: 'Sugar', grams: 400 },
];

const money = (n: number | null) => (n === null ? '—' : `€${n.toFixed(4)}`);

export function ProCoreCostsDevPage() {
  const svc = useMemo(() => {
    const c = { n: 0 };
    const s = new InMemoryCosts(() => '2026-07-12T12:00:00.000Z', () => `id-${(c.n += 1)}`);
    const base: Omit<NewCostEntry, 'ingredientId' | 'ingredientName' | 'price'> = {
      ownerUserId: 'user-pro', supplier: 'Dairy Co', purchaseQuantity: 2, purchaseUnit: 'kg',
      densityGPerMl: null, unitWeightG: null, unitsPerPackage: null, currency: 'EUR',
      priceIncludesTax: false, taxRatePercent: null, effectiveFrom: '2026-01-01', expiresAt: null, note: null, createdBy: 'user-pro',
    };
    s.addEntry({ ...base, ingredientId: 'milk', ingredientName: 'Milk', price: 10 }); // 5/kg
    s.addEntry({ ...base, ingredientId: 'sugar', ingredientName: 'Sugar', price: 2 }); // 1/kg
    return s;
  }, []);

  const [persona, setPersona] = useState<ProCorePersona>('pro');
  const [snapshots, setSnapshots] = useState<RecipeCostSnapshot[]>([]);
  const [csv, setCsv] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, refresh] = useReducer((x: number) => x + 1, 0);

  const caps = exportCapabilitiesFor(persona);
  const owner = 'user-pro'; // costs belong to the Pro owner; persona only changes export capability
  const latest = snapshots[snapshots.length - 1] ?? null;
  const act = (fn: () => void) => { try { fn(); setMsg(null); } catch (e) { setMsg((e as Error).message); } refresh(); };

  const buildSnapshot = (asOf: string) => act(() => {
    svc.buildSnapshot({ ownerUserId: owner, recipeId: 'r', recipeVersionId: 'v1', lines: LINES, currency: 'EUR', basis: 'net', asOf, engineVersion: 'engine.dev', configVersion: 'config.dev', by: owner });
    setSnapshots(svc.listSnapshots(owner));
    setCsv(null);
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-sm">
      <p className="text-xs uppercase tracking-widest opacity-60">DEV · PRO CORE — costs + immutable snapshots + export (in-memory)</p>
      <h1 className="mt-1 text-lg font-semibold">Ingredient Costs · Snapshots · Export</h1>
      <p className="mt-1 max-w-2xl opacity-70">Deterministic local harness. Costs are the owner's price list; a snapshot freezes the resolved per-kg costs (historical cost never changes when the current price changes). Currencies are never converted; VAT is never guessed. Export is capability-gated — Demo cannot export, exact grams stay gated on the exact-grams capability.</p>

      <section className="mt-5 flex flex-wrap items-center gap-3" aria-label="Persona">
        <label className="font-medium" htmlFor="persona">Export persona</label>
        <select id="persona" className="rounded border px-2 py-1" value={persona} onChange={(e) => { setPersona(e.target.value as ProCorePersona); setMsg(null); setCsv(null); refresh(); }}>
          <option value="pro">Pro</option><option value="home">Home</option><option value="demo">Demo</option>
        </select>
        <span className="opacity-60" data-testid="cap">canExport: {caps.canExport ? 'yes' : 'no'} · exact grams: {caps.canViewExactGrams ? 'yes' : 'no'}</span>
      </section>

      <section className="mt-4" aria-label="Entries">
        <h2 className="font-semibold">Price list (owner {owner})</h2>
        <ul className="mt-1 space-y-1">
          {svc.listEntries(owner).map((e) => (
            <li key={e.entryId} data-testid="entry-row">{e.ingredientName}: €{e.price} / {e.purchaseQuantity}{e.purchaseUnit} · {e.currency} · from {e.effectiveFrom}</li>
          ))}
        </ul>
      </section>

      <section className="mt-4 flex flex-wrap gap-2" aria-label="Actions">
        <button type="button" className="rounded border px-3 py-1" onClick={() => buildSnapshot('2026-03-01')}>Build cost snapshot (Mar)</button>
        <button type="button" className="rounded border px-3 py-1" onClick={() => act(() => { svc.addEntry({ ownerUserId: owner, ingredientId: 'milk', ingredientName: 'Milk', supplier: 'Dairy Co', purchaseQuantity: 2, purchaseUnit: 'kg', densityGPerMl: null, unitWeightG: null, unitsPerPackage: null, price: 20, currency: 'EUR', priceIncludesTax: false, taxRatePercent: null, effectiveFrom: '2026-06-01', expiresAt: null, note: null, createdBy: owner }); refresh(); })}>Raise milk price (Jun, €20/2kg)</button>
        <button type="button" className="rounded border px-3 py-1" onClick={() => buildSnapshot('2026-07-01')}>Build cost snapshot (Jul)</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!latest} onClick={() => act(() => setCsv(buildCostSnapshotCsv(latest!, caps)))}>Export latest snapshot CSV</button>
      </section>

      {msg && <p role="alert" className="mt-4 rounded border border-amber-500 bg-amber-50 px-3 py-2 text-amber-900" data-testid="msg">{msg}</p>}

      <section className="mt-6" aria-label="Snapshots">
        <h2 className="font-semibold">Snapshots — <span data-testid="snap-count">{snapshots.length}</span></h2>
        {snapshots.map((s) => (
          <div key={s.snapshotId} className="mt-2 rounded border p-2" data-testid="snap">
            <p className="opacity-70">{s.snapshotId} · resolved {s.resolvedAt.slice(0, 10)} · complete {s.complete ? 'yes' : 'no'} · total <strong>{money(s.totalCost)}</strong> · per kg {money(s.costPerKg)}</p>
            <ul className="mt-1 space-y-1">
              {s.lines.map((l) => (
                <li key={l.ingredientId} data-testid="snap-line">{l.ingredientName}: {l.grams} g · {money(l.costPerKg)}/kg → line {money(l.lineCost)} · {l.state}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {csv && (
        <section className="mt-6" aria-label="Export">
          <h2 className="font-semibold">Exported CSV</h2>
          <pre className="mt-2 overflow-x-auto rounded border bg-black/5 p-2 text-xs" data-testid="csv">{csv}</pre>
        </section>
      )}
    </main>
  );
}
