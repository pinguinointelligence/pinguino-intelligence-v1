/**
 * LIVE server-search picker (owner P0) — the canonical Pro ingredient search.
 * Every settled query hits the CURRENT backend (no preloaded catalogue, no
 * 1,000-row snapshot). Results are ranked natural-first with the form shown.
 *
 * Stale-selection protection (Phase 10): a selection is remembered TOGETHER
 * with the normalized query it was made in — a query change invalidates it,
 * `Dodaj składnik` is disabled until the CURRENT response settles, and the
 * added ingredient is resolved fresh by exact stable id (`getIngredientById`),
 * so an older response can never inject a stale candidate.
 */
import { useState } from 'react';
import { copy } from '@/copy/en';
import type { EngineIngredient } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { getIngredientById } from '@/services/ingredients';
import { groupHitsByForm, resultRowTextPl } from './ingredientPresentation';
import { useIngredientSearch } from './useIngredientSearch';
import { PickerEmptyState } from './IngredientPicker';
import type { IngredientLibrary } from './ingredientLibrary';

const b = copy.studio.builder;

export function ServerIngredientPicker({
  library,
  onAdd,
  initialQuery = '',
}: {
  library: IngredientLibrary;
  onAdd: (ingredient: EngineIngredient) => void;
  /** Test seam: pre-settled query for static renders. */
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [picked, setPicked] = useState<{ norm: string; id: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const search = useIngredientSearch({ enabled: library.serverSearch, query });

  // The owner's confirmed products ("My Products") — local, small, always available.
  const productFilter = query.trim().toLowerCase();
  const filteredProducts =
    productFilter === ''
      ? library.products
      : library.products.filter((p) => `${p.name} ${p.id}`.toLowerCase().includes(productFilter));

  const hasQuery = query.trim() !== '';
  // A selection is only valid for the query it was made in (stale-add protection).
  const pickedId = picked && picked.norm === search.settledNorm ? picked.id : null;
  const effectiveId =
    pickedId !== null &&
    (search.hits.some((hit) => hit.id === pickedId) || filteredProducts.some((p) => p.id === pickedId))
      ? pickedId
      : (search.hits[0]?.id ?? filteredProducts[0]?.id ?? '');
  const count = search.hits.length + filteredProducts.length;
  const canAdd = effectiveId !== '' && !adding && (!hasQuery || search.isSettled);
  const selectedProvenance = library.productProvenance.get(effectiveId);

  const add = async () => {
    if (!canAdd || effectiveId === '') return;
    const product = library.products.find((p) => p.id === effectiveId);
    if (product) {
      onAdd(product);
      return;
    }
    // Resolve the FULL approved scientific row fresh, by exact stable id.
    setAdding(true);
    try {
      const row = await getIngredientById(effectiveId);
      if (row) onAdd(ingredientRowToEngineIngredient(row));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5" data-testid="server-ingredient-picker">
      {/* Live search bar */}
      <div className="relative">
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ivory/40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="9" cy="9" r="5.5" />
          <line x1="13.2" y1="13.2" x2="17" y2="17" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          aria-label={b.searchLabel}
          placeholder={b.searchPlaceholder}
          className="w-full rounded-md border border-ivory/15 bg-shell py-2.5 pl-9 pr-3 text-sm transition-colors hover:border-ivory/30 focus:border-ivory/40 focus:outline-none"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {!hasQuery ? (
        <p className="text-xs leading-relaxed text-ivory/50" data-testid="picker-search-hint">
          {b.liveSearchHint}
        </p>
      ) : search.isError ? (
        <p className="text-xs text-amber-300/90" role="status" data-testid="picker-search-error">
          {b.searchError}
        </p>
      ) : search.isFetching ? (
        <p className="text-xs text-ivory/50" role="status" aria-live="polite" data-testid="picker-searching">
          {b.searching}
        </p>
      ) : (
        <p className="text-xs text-ivory/50" aria-live="polite">
          <span className="font-mono tabular-nums text-ivory/70">{count.toLocaleString('en-US')}</span>{' '}
          {count === 1 ? b.resultUnitOne : b.resultUnitMany} {b.resultFoundSuffix}
        </p>
      )}

      {hasQuery && search.isSettled && count === 0 ? (
        <PickerEmptyState query={query} onClear={() => setQuery('')} />
      ) : (
        <>
          <div className="flex gap-2">
            <select
              aria-label={b.addLabel}
              className="flex-1 rounded-md border border-ivory/15 bg-shell px-3 py-2 text-sm transition-colors hover:border-ivory/30 focus:border-ivory/40 focus:outline-none"
              value={effectiveId}
              onChange={(event) => setPicked({ norm: search.settledNorm, id: event.currentTarget.value })}
            >
              {/* Owner P0: results separated by FORM group (Świeże → Mrożone → … → Inne),
                  rank order preserved inside each group; row = NAZWA · Kategoria · Forma. */}
              {groupHitsByForm(search.hits).map((group) => (
                <optgroup key={group.group} label={group.headingPl}>
                  {group.hits.map((hit) => (
                    <option key={hit.id} value={hit.id}>
                      {resultRowTextPl(hit)}
                    </option>
                  ))}
                </optgroup>
              ))}
              {filteredProducts.length > 0 ? (
                <optgroup label="My Products">
                  {filteredProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.id})
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <button
              type="button"
              disabled={!canAdd}
              className="inline-flex items-center justify-center rounded-md border border-ivory/20 px-5 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void add()}
              data-testid="picker-add"
            >
              <span aria-hidden className="mr-1.5">
                ＋
              </span>
              {b.addLabel}
            </button>
          </div>

          {search.hasMore ? (
            <button
              type="button"
              className="self-start rounded-md border border-ivory/15 px-3 py-1.5 text-xs text-ivory/70 transition-colors hover:border-ivory/40"
              onClick={search.loadMore}
              data-testid="picker-load-more"
            >
              {b.moreResults}
            </button>
          ) : null}

          {selectedProvenance ? (
            <p className="text-xs leading-relaxed text-ivory/50">
              {selectedProvenance.class_derived ? (
                <span className="text-ivory/70">
                  {selectedProvenance.provenance_note ?? 'PI Calculated · class-derived · not independently measured'}
                </span>
              ) : (
                <>
                  {selectedProvenance.status_label ? (
                    <span className="text-ivory/70">{selectedProvenance.status_label} · </span>
                  ) : null}
                  <span className="text-ivory/70">Reference-linked profile</span> · PAC/POD from approved
                  reference · not independently measured
                </>
              )}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
