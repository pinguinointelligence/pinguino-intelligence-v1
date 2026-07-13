/**
 * DEV-ONLY Ingredient Resolution harness (route: /dev/ingredient-resolution; never shipped).
 *
 * Drives the deterministic in-memory resolution adapter so the whole flow — the per-line
 * resolution sheet, the fresh/herb FORM step, honest catalogue search, the delegated scan /
 * manual-add handoff, the substitution actions, and the Engine-readiness GATE (ready → resolved
 * with engine values; not-ready → the honest Polish message, line stays unresolved) — can be
 * exercised in a real browser while the intake/persistence backend is a launch gate. LOCAL /
 * file-first evidence, NOT live. It reads NOTHING from the network and PERSISTS NOTHING.
 */
import { useMemo, useReducer, useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { InMemoryIngredientResolution } from '@/services/ingredientResolution/inMemoryIngredientResolution';
import {
  ingredientResolutionSummary,
  type ResolutionActionId,
} from '@/features/ingredient-resolution';
import {
  IngredientResolutionSheet,
  ResolutionLineList,
} from '@/features/ingredient-resolution/ui/ingredientResolutionView';
import {
  CATALOGUE_FIXTURES,
  RESOLUTION_LINE_SEEDS,
  candidatesFromCatalogue,
  PICKABLE_PRODUCTS,
} from '@/features/ingredient-resolution/__fixtures__/resolutionFixtures';

export function IngredientResolutionDevPage() {
  const ctrl = useMemo(
    () =>
      new InMemoryIngredientResolution(
        { workingRecipeId: 'wc-dev', sourceRecipeId: 'catalogue-dev', lines: RESOLUTION_LINE_SEEDS },
        CATALOGUE_FIXTURES,
      ),
    [],
  );
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [substituteDraft, setSubstituteDraft] = useState('');

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const state = ctrl.snapshot();
  const summary = ingredientResolutionSummary(state);
  const active = state.activeLineId ? ctrl.line(state.activeLineId) : undefined;

  const act = (fn: () => void) => {
    fn();
    refresh();
  };

  const onAction = (lineId: string, action: ResolutionActionId) => {
    switch (action) {
      case 'choose_candidate':
        ctrl.chooseCandidates(lineId, candidatesFromCatalogue(ctrl.line(lineId)?.line.candidateProductIds ?? []));
        break;
      case 'search_catalogue':
        ctrl.search(lineId, searchQuery);
        break;
      case 'scan_label':
        ctrl.scan(lineId);
        break;
      case 'add_manually':
        ctrl.addManually(lineId);
        break;
      case 'dont_have':
        ctrl.substitution(lineId, 'dont_have');
        break;
      case 'substitute':
        ctrl.substitution(lineId, 'substitute', substituteDraft.trim() || undefined);
        break;
      case 'why':
        ctrl.substitution(lineId, 'why');
        break;
    }
    refresh();
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-sm text-stone-900">
      <p className="text-xs uppercase tracking-widest opacity-60">DEV · Ingredient resolution (in-memory)</p>
      <h1 className="mt-1 text-lg font-semibold">Uzupełnianie składników · przed dokładnym przeliczeniem</h1>
      <p className="mt-1 max-w-2xl opacity-70">
        Deterministyczny lokalny harness. Produkt trafia do receptury tylko, gdy przejdzie bramkę
        gotowości silnika (dokładne pac/pod). Skan i ręczne dodanie delegują do istniejącego
        modułu intake — tutaj symulujemy powrót z zapisanym produktem.
      </p>

      {/* The exact selector the PI Monitor consumes. */}
      <section className="mt-6 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3" aria-label="Podsumowanie">
        <p>
          Gotowe do przeliczenia:{' '}
          <strong data-testid="all-resolved">{summary.allResolved ? 'TAK' : 'NIE'}</strong> · do
          uzupełnienia: <strong data-testid="unresolved-count">{summary.unresolvedCount}</strong>
        </p>
        {summary.unresolvedNames.length > 0 ? (
          <p className="mt-1 opacity-70">Pozostałe: {summary.unresolvedNames.join(', ')}</p>
        ) : null}
      </section>

      <section className="mt-6" aria-label="Linie">
        <ResolutionLineList lines={state.lines} onOpen={(id) => act(() => ctrl.open(id))} />
      </section>

      {active ? (
        <section className="mt-6" aria-label="Arkusz uzupełniania">
          <IngredientResolutionSheet
            line={active}
            onSelectForm={(form) => act(() => ctrl.chooseForm(active.line.lineId, form))}
            onAction={(a) => onAction(active.line.lineId, a)}
            onPickCandidate={(c) =>
              act(() => {
                const pickable = PICKABLE_PRODUCTS[c.productId];
                if (pickable) ctrl.pick(active.line.lineId, pickable);
              })
            }
            onSearch={(q) => act(() => ctrl.search(active.line.lineId, q))}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onClose={() => act(() => ctrl.close())}
          />

          {/* DEV affordances: name a substitute, or simulate an intake save return. */}
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-stone-300 px-4 py-3">
            <label className="text-xs">
              <span className="mb-1 block opacity-60">Zamiennik (dla „Zastąp składnik")</span>
              <input
                className="rounded border px-2 py-1"
                value={substituteDraft}
                onChange={(e) => setSubstituteDraft(e.target.value)}
              />
            </label>
            {active.state === 'awaiting_intake' ? (
              <button
                type="button"
                className="rounded border px-3 py-1"
                onClick={() =>
                  act(() => {
                    // Simulate a successful intake save returning an engine-ready product.
                    ctrl.returnFromIntake(active.line.lineId, PICKABLE_PRODUCTS['PR-FIX-CHOC-DARK']!);
                  })
                }
              >
                Symuluj powrót z zapisanym produktem
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
