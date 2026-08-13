import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { rankCatalogHits } from './ranking';
import { useGlobalCatalogPicker } from './useGlobalCatalogPicker';
import { useIngredientSearch } from '@/features/ingredient-builder/useIngredientSearch';
import { listEngineApprovedIngredientsByIds } from '@/services/ingredients';

const statusLabel = {
  verified: 'Zweryfikowany',
  manual_unverified: 'Dodany manualnie · Niezweryfikowany',
  blocked: 'Nie można zweryfikować',
  pi_base: 'PINGÜINO Base',
} as const;

export function GlobalCatalogSearchPanel() {
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [market, setMarket] = useState<string | null>(null);
  const [retailer, setRetailer] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const piBase = useIngredientSearch({ enabled: query.trim() !== '', query });
  const catalog = useGlobalCatalogPicker({
    enabled: true,
    query,
    favoritesOnly,
    selectedMarkets: market && market !== '__GLOBAL__' ? [market] : [],
    forceGlobal: market === '__GLOBAL__',
    limit: Math.min(500, Math.max(100, visibleLimit)),
  });
  const hits = useMemo(
    () => rankCatalogHits({
      hits: catalog.hits,
      query,
      context: 'base',
      preferences: catalog.preferences,
      favoritesOnly,
      selectedMarkets: market && market !== '__GLOBAL__' ? [market] : [],
      retailer,
    }),
    [catalog.hits, catalog.preferences, favoritesOnly, market, query, retailer],
  );
  const markets = [catalog.preferences.primaryMarket, ...catalog.preferences.additionalMarkets]
    .filter((value): value is string => Boolean(value));
  const retailers = [...new Set(catalog.hits.flatMap((hit) => hit.retailers))].sort();
  const pinnedBaseIds = [...new Set([...catalog.favorites, ...catalog.recent])]
    .filter((key) => key.startsWith('pi_base:'))
    .filter((key) => !favoritesOnly || catalog.favorites.has(key))
    .map((key) => key.slice('pi_base:'.length));
  const pinnedBaseRows = useQuery({
    queryKey: ['global-catalog-pinned-base', pinnedBaseIds.sort().join(',')],
    queryFn: () => listEngineApprovedIngredientsByIds(pinnedBaseIds),
    enabled: query.trim() === '' && pinnedBaseIds.length > 0,
  });
  const baseHits = favoritesOnly
    ? piBase.hits.filter((hit) => catalog.favorites.has(`pi_base:${hit.id}`))
    : piBase.hits;
  const resultCount = hits.length + baseHits.length + (pinnedBaseRows.data?.length ?? 0);

  return (
    <section className="mt-8 rounded-2xl border border-ink/10 bg-white p-4 shadow-pro-e1" aria-labelledby="global-catalog-search-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="global-catalog-search-title" className="text-base font-semibold text-ink">Katalog PINGÜINO</h2>
          <p className="mt-1 text-xs text-stone-600">Wspólne fakty etykietowe; Twoje ceny, notatki i dostawcy pozostają prywatne.</p>
        </div>
        <Link to="/account#product-markets-heading" className="pro-focus-ring min-h-11 rounded-xl px-3 py-3 text-xs font-semibold text-ink">
          Rynki produktów
        </Link>
      </div>
      <label className="mt-4 block">
        <span className="sr-only">Szukaj w katalogu produktów</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Szukaj produktu, marki, EAN lub rodziny…"
          className="pro-focus-ring h-11 w-full rounded-xl border border-ink/15 bg-stone-50 px-3 text-sm text-ink"
        />
      </label>
      <div className="mt-2 flex items-center gap-2 overflow-x-auto" aria-label="Filtry katalogu produktów">
        <button
          type="button"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly((value) => !value)}
          className={cn('pro-focus-ring min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold', favoritesOnly ? 'border-gold bg-gold/12 text-ink' : 'border-ink/12 text-stone-600')}
        >
          ★ Ulubione
        </button>
        {markets.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={market === value}
            onClick={() => setMarket((current) => current === value ? null : value)}
            className={cn('pro-focus-ring min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold', market === value ? 'border-gold bg-gold/12 text-ink' : 'border-ink/12 text-stone-600')}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={market === '__GLOBAL__'}
          onClick={() => setMarket('__GLOBAL__')}
          className={cn('pro-focus-ring min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold', market === '__GLOBAL__' ? 'border-gold bg-gold/12 text-ink' : 'border-ink/12 text-stone-600')}
        >
          Cały świat
        </button>
        {retailers.length > 0 ? (
          <select
            aria-label="Filtr sprzedawcy"
            value={retailer ?? ''}
            onChange={(event) => setRetailer(event.currentTarget.value || null)}
            className="pro-focus-ring min-h-11 shrink-0 rounded-full border border-ink/12 bg-white px-3 text-xs font-semibold text-stone-700"
          >
            <option value="">Wszyscy sprzedawcy</option>
            {retailers.map((value) => <option key={value}>{value}</option>)}
          </select>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-stone-600" role="status" aria-live="polite">
        {!catalog.isSettled || !piBase.isSettled ? 'Szukam…' : `${resultCount} wyników`}
      </p>
      <div className="mt-2 divide-y divide-ink/8 border-y border-ink/8">
        {baseHits.length > 0 ? <p className="py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">PINGÜINO Base</p> : null}
        {(pinnedBaseRows.data?.length ?? 0) > 0 ? <p className="py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">Ulubione i ostatnio używane PINGÜINO Base</p> : null}
        {(pinnedBaseRows.data ?? []).map((row) => {
          const favorite = catalog.favorites.has(`pi_base:${row.ingredient_id}`);
          return (
          <div key={`pi-favorite:${row.ingredient_id}`} className="flex min-h-14 items-center gap-3 py-2">
            <span aria-label="PINGÜINO Base" className="grid size-6 shrink-0 place-items-center rounded-full bg-gold/12 text-[10px] font-bold text-gold-ink">PI</span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold text-ink">{row.ingredient_name_display}</strong><span className="block truncate text-xs text-stone-600">{row.ingredient_subcategory ?? row.ingredient_category}</span></span>
            <button type="button" aria-pressed={favorite} aria-label={favorite ? `Usuń ${row.ingredient_name_display} z Ulubionych` : `Dodaj ${row.ingredient_name_display} do Ulubionych`} onClick={() => catalog.toggleFavorite('pi_base', row.ingredient_id, !favorite)} className={cn('pro-focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-lg', favorite ? 'text-gold' : 'text-stone-500')}><span aria-hidden>{favorite ? '★' : '☆'}</span></button>
          </div>
          );
        })}
        {baseHits.slice(0, visibleLimit).map((hit) => {
          const favorite = catalog.favorites.has(`pi_base:${hit.id}`);
          return (
            <div key={`pi:${hit.id}`} className="flex min-h-14 items-center gap-3 py-2">
              <span aria-label="PINGÜINO Base" className="grid size-6 shrink-0 place-items-center rounded-full bg-gold/12 text-[10px] font-bold text-gold-ink">PI</span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold text-ink">{hit.name}</strong>
                <span className="block truncate text-xs text-stone-600">{hit.form || hit.category}</span>
              </span>
              <button type="button" aria-pressed={favorite} aria-label={favorite ? `Usuń ${hit.name} z Ulubionych` : `Dodaj ${hit.name} do Ulubionych`} onClick={() => catalog.toggleFavorite('pi_base', hit.id, !favorite)} className={cn('pro-focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-lg', favorite ? 'text-gold' : 'text-stone-500')}><span aria-hidden>{favorite ? '★' : '☆'}</span></button>
            </div>
          );
        })}
        {hits.length > 0 ? <p className="py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">Produkty komercyjne</p> : null}
        {hits.slice(0, visibleLimit).map((hit) => (
          <div key={hit.id} className="flex min-h-14 items-center gap-3 py-2">
            <span aria-label={statusLabel[hit.status]} title={[statusLabel[hit.status], ...hit.missingFields, ...hit.invalidFields].join(' · ')} className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold', hit.status === 'verified' ? 'bg-status-ideal/12 text-status-ideal' : hit.status === 'manual_unverified' ? 'bg-slate-200 text-slate-700' : 'bg-red-100 text-red-700')}>
              <span aria-hidden>{hit.status === 'verified' ? '✓' : hit.status === 'manual_unverified' ? '✎' : '!'}</span>
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm font-semibold text-ink">{hit.displayName}</strong>
              <span className="block truncate text-xs text-stone-600">{hit.brand ?? hit.canonicalFamily ?? hit.category ?? 'Produkt'}{hit.markets[0] ? ` · ${hit.markets[0]}` : ''}</span>
              {hit.originalName && hit.originalName !== hit.displayName ? <span className="block truncate text-[10px] text-stone-600">oryg. {hit.originalName}</span> : null}
            </span>
            {hit.status !== 'blocked' ? <button
              type="button"
              aria-pressed={hit.favorite}
              aria-label={hit.favorite ? `Usuń ${hit.displayName} z Ulubionych` : `Dodaj ${hit.displayName} do Ulubionych`}
              onClick={() => catalog.toggleFavorite('commercial_product', hit.id, !hit.favorite)}
              className={cn('pro-focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-lg', hit.favorite ? 'text-gold' : 'text-stone-500')}
            >
              <span aria-hidden>{hit.favorite ? '★' : '☆'}</span>
            </button> : <span className="px-2 text-[10px] font-semibold text-red-700">Uzupełnij dane</span>}
          </div>
        ))}
        {catalog.isSettled && piBase.isSettled && resultCount === 0 ? <p className="py-5 text-sm text-stone-600">Brak pasujących produktów.</p> : null}
      </div>
      {hits.length > visibleLimit || baseHits.length > visibleLimit || piBase.hasMore ? (
        <button type="button" onClick={() => { setVisibleLimit((value) => Math.min(500, value + 100)); if (piBase.hasMore) piBase.loadMore(); }} className="pro-focus-ring mt-3 min-h-11 rounded-xl border border-ink/15 px-4 text-xs font-semibold text-ink">
          Pokaż więcej wyników
        </button>
      ) : null}
      {catalog.isError ? <p className="mt-3 text-sm text-status-error" role="alert">Katalog jest chwilowo niedostępny. Spróbuj ponownie.</p> : null}
      {piBase.isError ? <p className="mt-3 text-sm text-status-error" role="alert">PINGÜINO Base jest chwilowo niedostępne. Spróbuj ponownie.</p> : null}
    </section>
  );
}
