/**
 * DEV-ONLY PINGÜINO PRO CORE — saved recipes + immutable versions (import.meta.env.DEV gated;
 * never shipped). Drives the deterministic in-memory recipe adapter so the save → version →
 * edit → compare → restore → archive flow + capability gating (Demo/Home/Pro) can be exercised
 * in a real browser. LOCAL / file-first, NOT a live backend.
 */
import { useMemo, useReducer, useState } from 'react';
import type { RecipeInput } from '@/engine';
import { InMemoryRecipes } from '@/services/proCore/inMemoryRecipes';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';

const TRACE = { engineVersion: 'engine.dev', configVersion: 'config.dev' };
const item = (id: string, name: string, grams: number) => ({ id, ingredient: { name }, planned_grams: grams });
const input = (batch: number, items: ReturnType<typeof item>[]): RecipeInput =>
  ({ items, mode: 'gelato', category: 'gelato', target_temperature_c: -11, target_batch_grams: batch, machine_capacity_grams: null }) as unknown as RecipeInput;

const CAPS: Record<string, RecipeCapabilities> = {
  pro: { canSaveRecipe: true, canViewRecipeVersions: true, canRestoreRecipeVersion: true, maxSavedRecipes: null, canViewExactGrams: true },
  home: { canSaveRecipe: true, canViewRecipeVersions: true, canRestoreRecipeVersion: true, maxSavedRecipes: 1, canViewExactGrams: true },
  demo: { canSaveRecipe: false, canViewRecipeVersions: false, canRestoreRecipeVersion: false, maxSavedRecipes: 0, canViewExactGrams: false },
};

export function ProCoreRecipesDevPage() {
  const svc = useMemo(() => {
    const ctr = { n: 0 };
    return new InMemoryRecipes(() => new Date(2026, 6, 12, 12, 0, ctr.n).toISOString(), () => `id-${(ctr.n += 1)}`);
  }, []);
  const [persona, setPersona] = useState<'pro' | 'home' | 'demo'>('pro');
  const [msg, setMsg] = useState<string | null>(null);
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const caps = CAPS[persona]!;
  const userId = `user-${persona}`;

  const act = (fn: () => void) => { try { fn(); setMsg(null); } catch (e) { setMsg((e as Error).message); } refresh(); };
  const recipes = svc.listRecipes(userId, { includeArchived: true });
  const recipe = recipes[0] ?? null;
  const versions = recipe ? svc.getVersions(recipe.recipeId) : [];
  const cmp = recipe && versions.length >= 2 ? svc.compare(recipe.recipeId, 1, versions.length) : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-sm">
      <p className="text-xs uppercase tracking-widest opacity-60">DEV · PRO CORE — saved recipes + versions (in-memory)</p>
      <h1 className="mt-1 text-lg font-semibold">Saved Recipes · Immutable Versions</h1>
      <p className="mt-1 max-w-2xl opacity-70">Deterministic local harness. Save is always explicit; editing creates a new version; earlier versions are immutable; restoring makes a new latest version. Demo cannot save exact grams; Home is limited to one recipe.</p>

      <section className="mt-5 flex flex-wrap items-center gap-3" aria-label="Persona">
        <label className="font-medium" htmlFor="persona">Persona</label>
        <select id="persona" className="rounded border px-2 py-1" value={persona} onChange={(e) => { setPersona(e.target.value as 'pro'); setMsg(null); refresh(); }}>
          <option value="pro">Pro</option><option value="home">Home</option><option value="demo">Demo</option>
        </select>
        <span className="opacity-60">maxSavedRecipes: {caps.maxSavedRecipes === null ? '∞' : caps.maxSavedRecipes} · exact grams: {caps.canViewExactGrams ? 'yes' : 'no'}</span>
      </section>

      <section className="mt-4 flex flex-wrap gap-2" aria-label="Actions">
        <button type="button" className="rounded border px-3 py-1" onClick={() => act(() => svc.createRecipe({ ownerUserId: userId, title: 'Vanilla Gelato Base', recipeInput: input(1000, [item('milk', 'Milk 3.5%', 600), item('sugar', 'Sucrose', 400)]), trace: TRACE, by: userId, capabilities: caps }))}>Save as new recipe</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!recipe} onClick={() => act(() => svc.saveNewVersion(recipe!.recipeId, input(1200, [item('milk', 'Milk 3.5%', 700), item('sugar', 'Sucrose', 500)]), TRACE, userId))}>Edit → save new version</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!recipe || versions.length < 1} onClick={() => act(() => svc.restore(recipe!.recipeId, 1, userId, caps))}>Restore v1 → new version</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!recipe} onClick={() => act(() => svc.archiveRecipe(recipe!.recipeId, !recipe!.archived))}>Toggle archive</button>
      </section>

      {msg && <p role="alert" className="mt-4 rounded border border-amber-500 bg-amber-50 px-3 py-2 text-amber-900" data-testid="msg">{msg}</p>}

      <section className="mt-6" aria-label="Recipe">
        <h2 className="font-semibold">Recipe {recipe ? `· ${recipe.title}` : '(none saved)'}</h2>
        {recipe && <p className="opacity-70">latest version: <strong data-testid="latest">{recipe.latestVersionNumber}</strong> · versions: <strong data-testid="version-count">{versions.length}</strong> · archived: {recipe.archived ? 'yes' : 'no'}</p>}
        <ul className="mt-2 space-y-1">
          {versions.map((v) => (
            <li key={v.versionNumber} data-testid="version-row">v{v.versionNumber} · {v.source}{v.restoredFromVersion ? ` (from v${v.restoredFromVersion})` : ''} · batch {v.totalBatchG} g · engine {v.engineVersion}/{v.configVersion}</li>
          ))}
        </ul>
      </section>

      {cmp && (
        <section className="mt-6" aria-label="Comparison">
          <h2 className="font-semibold">Compare v1 ↔ v{cmp.versionB} — {cmp.identical ? 'identical' : 'different'}</h2>
          <ul className="mt-2 space-y-1">
            {cmp.lines.map((l) => (
              <li key={l.key} data-testid="diff-row">{l.name}: {l.gramsA ?? '—'} g → {l.gramsB ?? '—'} g · <strong>{l.change}</strong></li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
