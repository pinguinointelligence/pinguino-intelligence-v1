/**
 * Produkty — the page's own filter tabs. The vocabulary and the URL rules live beside it in
 * `productsFilter.ts`, so a screen and a link agree on what a filter is without importing a
 * component to find out.
 */
import { useSearchParams } from 'react-router';
import { PRODUCT_FILTERS, PRODUCT_FILTER_LABEL, productFilterFromParam } from './productsFilter';

export function ProductsFilterTabs() {
  const [params, setParams] = useSearchParams();
  const active = productFilterFromParam(params.get('filter'));
  return (
    <div
      className="mb-5 flex flex-wrap gap-2"
      role="tablist"
      aria-label="Filtry produktów"
      data-testid="products-filter-tabs"
    >
      {PRODUCT_FILTERS.map((filter) => {
        const selected = filter === active;
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={selected}
            data-filter={filter}
            className={`pro-focus-ring inline-flex min-h-9 items-center rounded-full border px-4 text-xs font-semibold transition-colors max-sm:min-h-11 ${
              selected
                ? 'border-ink bg-ink text-white'
                : 'border-ink/15 bg-white text-stone-600 hover:text-ink'
            }`}
            onClick={() => {
              const next = new URLSearchParams(params);
              // `all` is the default, so it stays out of the URL rather than pinning a redundant param
              if (filter === 'all') next.delete('filter');
              else next.set('filter', filter);
              setParams(next, { replace: true });
            }}
          >
            {PRODUCT_FILTER_LABEL[filter]}
          </button>
        );
      })}
    </div>
  );
}
