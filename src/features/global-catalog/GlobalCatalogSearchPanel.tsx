import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { productCatalogOverviewVerificationView } from '@/features/ingredient-builder/productPickerModel';
import { preserveServerProductRank } from './ranking';
import { useGlobalCatalogPicker } from './useGlobalCatalogPicker';
import { CarbonationBubbles } from '@/components/product/CarbonationBubbles';

const badgeTone = (status: string, blocked: boolean, directMapper: boolean): string => {
  if (blocked) return 'bg-red-100 text-red-700';
  if (status === 'WYMAGA SPRAWDZENIA ETYKIETY') return 'bg-amber-100 text-amber-700';
  if (status === 'PINGÜINO — SPRAWDZONY') {
    return directMapper ? 'bg-gold/12 text-gold-ink' : 'bg-status-ideal/12 text-status-ideal';
  }
  return 'bg-slate-200 text-slate-700';
};

export function GlobalCatalogSearchPanel() {
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [market, setMarket] = useState<string | null>(null);
  const [retailer, setRetailer] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const catalog = useGlobalCatalogPicker({
    enabled: true,
    query,
    context: 'TOPPING',
    favoritesOnly,
    selectedMarkets: market && market !== '__GLOBAL__' ? [market] : [],
    forceGlobal: market === '__GLOBAL__',
    limit: Math.max(100, visibleLimit),
  });
  const hits = useMemo(
    () =>
      preserveServerProductRank(catalog.hits, catalog.preferences).filter(
        (hit) => !retailer || hit.retailers.includes(retailer),
      ),
    [catalog.hits, catalog.preferences, retailer],
  );
  const markets = [
    catalog.preferences.primaryMarket,
    ...catalog.preferences.additionalMarkets,
  ].filter((value): value is string => Boolean(value));
  const retailers = [...new Set(catalog.hits.flatMap((hit) => hit.retailers))].sort();
  const baseHits = hits.filter((hit) => hit.entityKind === 'pi_base');
  const commercialHits = hits.filter((hit) => hit.entityKind === 'commercial_product');
  const resultCount = hits.length;

  return (
    <section
      className="mt-8 rounded-2xl border border-ink/10 bg-white p-4 shadow-pro-e1"
      aria-labelledby="global-catalog-search-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="global-catalog-search-title" className="text-base font-semibold text-ink">
            Katalog PINGÜINO
          </h2>
          <p className="mt-1 text-xs text-stone-600">
            Wspólne fakty etykietowe; Twoje ceny, notatki i dostawcy pozostają prywatne.
          </p>
        </div>
        <Link
          to="/account#product-markets-heading"
          className="pro-focus-ring min-h-11 rounded-xl px-3 py-3 text-xs font-semibold text-ink"
        >
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
      <div
        className="mt-2 flex items-center gap-2 overflow-x-auto"
        aria-label="Filtry katalogu produktów"
      >
        <button
          type="button"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly((value) => !value)}
          className={cn(
            'pro-focus-ring min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold',
            favoritesOnly ? 'border-gold bg-gold/12 text-ink' : 'border-ink/12 text-stone-600',
          )}
        >
          ★ Ulubione
        </button>
        {markets.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={market === value}
            onClick={() => setMarket((current) => (current === value ? null : value))}
            className={cn(
              'pro-focus-ring min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold',
              market === value ? 'border-gold bg-gold/12 text-ink' : 'border-ink/12 text-stone-600',
            )}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={market === '__GLOBAL__'}
          onClick={() => setMarket('__GLOBAL__')}
          className={cn(
            'pro-focus-ring min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold',
            market === '__GLOBAL__'
              ? 'border-gold bg-gold/12 text-ink'
              : 'border-ink/12 text-stone-600',
          )}
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
            {retailers.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-stone-600" role="status" aria-live="polite">
        {!catalog.isSettled ? 'Szukam…' : `${resultCount} wyników`}
      </p>
      <div className="mt-2 divide-y divide-ink/8 border-y border-ink/8">
        {baseHits.length > 0 ? (
          <p className="py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">
            PINGÜINO Base
          </p>
        ) : null}
        {baseHits.slice(0, visibleLimit).map((hit) => {
          const mapperId = hit.mappedIngredientId ?? hit.id;
          const favorite = catalog.favorites.has(`pi_base:${mapperId}`);
          const verification = productCatalogOverviewVerificationView(hit);
          const technicallyBlocked =
            verification.status === 'PRODUCT DATA INCOMPLETE' ||
            verification.status === 'MAPPER BINDING REQUIRED';
          return (
            <div key={`pi:${hit.id}`} className="flex min-h-14 items-center gap-3 py-2">
              <span
                aria-label={verification.status}
                title={verification.reason ?? verification.status}
                data-catalog-verification-status={verification.status}
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                  badgeTone(verification.status, technicallyBlocked, true),
                )}
              >
                <span aria-hidden>
                  {technicallyBlocked
                    ? '!'
                    : verification.status === 'PINGÜINO — SPRAWDZONY'
                      ? 'PI'
                      : '✎'}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <strong className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink">
                  <span className="truncate">{hit.displayName}</span>
                  <CarbonationBubbles status={hit.carbonationStatus} />
                </strong>
                <span
                  className={cn(
                    'block truncate text-xs',
                    technicallyBlocked ? 'text-status-error' : 'text-stone-600',
                  )}
                  data-catalog-block-reason={
                    technicallyBlocked ? (verification.reason ?? undefined) : undefined
                  }
                  title={technicallyBlocked ? (verification.reason ?? undefined) : undefined}
                >
                  {technicallyBlocked
                    ? verification.reason
                    : (hit.productForm ?? hit.category ?? 'Składnik PINGÜINO Base')}
                </span>
              </span>
              <button
                type="button"
                aria-pressed={favorite}
                aria-label={
                  favorite
                    ? `Usuń ${hit.displayName} z Ulubionych`
                    : `Dodaj ${hit.displayName} do Ulubionych`
                }
                onClick={() => catalog.toggleFavorite('pi_base', mapperId, !favorite)}
                className={cn(
                  'pro-focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-lg',
                  favorite ? 'text-gold' : 'text-stone-500',
                )}
              >
                <span aria-hidden>{favorite ? '★' : '☆'}</span>
              </button>
            </div>
          );
        })}
        {commercialHits.length > 0 ? (
          <p className="py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">
            Produkty komercyjne
          </p>
        ) : null}
        {commercialHits.slice(0, visibleLimit).map((hit) => {
          const verification = productCatalogOverviewVerificationView(hit);
          const technicallyBlocked =
            verification.status === 'PRODUCT DATA INCOMPLETE' ||
            verification.status === 'MAPPER BINDING REQUIRED';
          return (
            <div key={hit.id} className="flex min-h-14 items-center gap-3 py-2">
              <span
                aria-label={verification.status}
                title={verification.reason ?? verification.status}
                data-catalog-verification-status={verification.status}
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                  badgeTone(verification.status, technicallyBlocked, false),
                )}
              >
                <span aria-hidden>
                  {technicallyBlocked
                    ? '!'
                    : verification.status === 'PINGÜINO — SPRAWDZONY'
                      ? '✓'
                      : '✎'}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <strong className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink">
                  <span className="truncate">{hit.displayName}</span>
                  <CarbonationBubbles status={hit.carbonationStatus} />
                </strong>
                <span
                  className={cn(
                    'block truncate text-xs',
                    technicallyBlocked ? 'text-status-error' : 'text-stone-600',
                  )}
                  data-catalog-block-reason={
                    technicallyBlocked ? (verification.reason ?? undefined) : undefined
                  }
                  title={technicallyBlocked ? (verification.reason ?? undefined) : undefined}
                >
                  {technicallyBlocked ? (
                    verification.reason
                  ) : (
                    <>
                      {hit.brand ?? hit.canonicalFamily ?? hit.category ?? 'Produkt'}
                      {hit.markets[0] ? ` · ${hit.markets[0]}` : ''}
                    </>
                  )}
                </span>
                {hit.originalName && hit.originalName !== hit.displayName ? (
                  <span className="block truncate text-[10px] text-stone-600">
                    oryg. {hit.originalName}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                aria-pressed={hit.favorite}
                aria-label={
                  hit.favorite
                    ? `Usuń ${hit.displayName} z Ulubionych`
                    : `Dodaj ${hit.displayName} do Ulubionych`
                }
                onClick={() => catalog.toggleFavorite('commercial_product', hit.id, !hit.favorite)}
                className={cn(
                  'pro-focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-lg',
                  hit.favorite ? 'text-gold' : 'text-stone-500',
                )}
              >
                <span aria-hidden>{hit.favorite ? '★' : '☆'}</span>
              </button>
            </div>
          );
        })}
        {catalog.isSettled && resultCount === 0 ? (
          <p className="py-5 text-sm text-stone-600">Brak pasujących produktów.</p>
        ) : null}
      </div>
      {hits.length > visibleLimit || catalog.hasMore ? (
        <button
          type="button"
          onClick={() => {
            setVisibleLimit((value) => value + 100);
            if (hits.length <= visibleLimit && catalog.hasMore) catalog.loadMore();
          }}
          className="pro-focus-ring mt-3 min-h-11 rounded-xl border border-ink/15 px-4 text-xs font-semibold text-ink"
        >
          Pokaż więcej wyników
        </button>
      ) : null}
      {catalog.isError ? (
        <p className="mt-3 text-sm text-status-error" role="alert">
          Katalog jest chwilowo niedostępny. Spróbuj ponownie.
        </p>
      ) : null}
    </section>
  );
}
