import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { productCatalogOverviewVerificationView } from '@/features/ingredient-builder/productPickerModel';
import { preserveServerProductRank } from './ranking';
import { useGlobalCatalogPicker } from './useGlobalCatalogPicker';
import { CarbonationBubbles } from '@/components/product/CarbonationBubbles';
import {
  applicationCompactClasses,
  applicationFieldClasses,
  applicationIconClasses,
  applicationPrimaryClasses,
  applicationQuietClasses,
} from '@/components/ui/applicationControlStyles';
import type { CatalogProductSearchHit } from './contracts';

const badgeTone = (status: string, blocked: boolean, directMapper: boolean): string => {
  if (blocked) return 'bg-red-100 text-red-700';
  if (status === 'WYMAGA SPRAWDZENIA ETYKIETY') return 'bg-amber-100 text-amber-700';
  if (status === 'GELLATTI — SPRAWDZONY') {
    return directMapper ? 'bg-gold/12 text-gold-ink' : 'bg-status-ideal/12 text-status-ideal';
  }
  return 'bg-slate-200 text-slate-700';
};

const catalogHitKey = (hit: CatalogProductSearchHit): string =>
  `${hit.entityKind}:${hit.entityKind === 'pi_base' ? (hit.mappedIngredientId ?? hit.id) : hit.id}`;

export function GlobalCatalogSearchPanel() {
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [market, setMarket] = useState<string | null>(null);
  const [retailer, setRetailer] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
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
  const selectedHit = hits.find((hit) => catalogHitKey(hit) === selectedKey) ?? hits[0] ?? null;
  const selectedVerification = selectedHit
    ? productCatalogOverviewVerificationView(selectedHit)
    : null;

  return (
    <section
      className="mt-6 rounded-[var(--radius-pro-studio)] border border-ink/10 bg-white p-3 shadow-pro-e0 sm:p-4"
      aria-labelledby="global-catalog-search-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="global-catalog-search-title" className="text-base font-semibold text-ink">
            Katalog Gellatti
          </h2>
          <p className="mt-1 text-xs text-stone-600">
            Wspólne fakty etykietowe; Twoje ceny, notatki i dostawcy pozostają prywatne.
          </p>
        </div>
        <Link to="/account#product-markets-heading" className={applicationQuietClasses()}>
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
          className={applicationFieldClasses('bg-pro-warm-raised text-sm')}
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
            applicationCompactClasses('shrink-0'),
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
              applicationCompactClasses('shrink-0'),
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
            applicationCompactClasses('shrink-0'),
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
            className={applicationCompactClasses('shrink-0 text-stone-700')}
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
      <div className="mt-2 grid min-w-0 gap-3 lg:grid-cols-[minmax(340px,0.85fr)_minmax(420px,1.15fr)]">
        <div className="min-w-0 overflow-hidden rounded-[var(--radius-pro-studio)] border border-ink/10">
          {baseHits.length > 0 ? (
            <p className="bg-pro-warm-raised px-3 py-2 text-[11px] font-semibold text-stone-600">
              Baza składników Gellatti
            </p>
          ) : null}
          {baseHits.slice(0, visibleLimit).map((hit) => {
            const mapperId = hit.mappedIngredientId ?? hit.id;
            const favorite = catalog.favorites.has(`pi_base:${mapperId}`);
            const verification = productCatalogOverviewVerificationView(hit);
            const technicallyBlocked =
              verification.status === 'DANE PRODUKTU NIEPEŁNE' ||
              verification.status === 'WYMAGA POWIĄZANIA';
            const active = selectedHit ? catalogHitKey(selectedHit) === catalogHitKey(hit) : false;
            return (
              <div
                key={`pi:${hit.id}`}
                className={cn(
                  'flex min-h-14 items-center gap-2 border-t border-ink/8 px-2 py-1.5',
                  active && 'bg-pro-amber/55',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedKey(catalogHitKey(hit))}
                  className="pro-focus-ring flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-pro-studio)] px-1 text-left"
                >
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
                        : verification.status === 'GELLATTI — SPRAWDZONY'
                          ? 'G'
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
                        : (hit.productForm ?? hit.category ?? 'Składnik z bazy Gellatti')}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={favorite}
                  aria-label={
                    favorite
                      ? `Usuń ${hit.displayName} z Ulubionych`
                      : `Dodaj ${hit.displayName} do Ulubionych`
                  }
                  onClick={() => catalog.toggleFavorite('pi_base', mapperId, !favorite)}
                  className={applicationIconClasses(favorite ? 'text-gold' : 'text-stone-500')}
                >
                  <span aria-hidden>{favorite ? '★' : '☆'}</span>
                </button>
              </div>
            );
          })}
          {commercialHits.length > 0 ? (
            <p className="border-t border-ink/8 bg-pro-warm-raised px-3 py-2 text-[11px] font-semibold text-stone-600">
              Produkty komercyjne
            </p>
          ) : null}
          {commercialHits.slice(0, visibleLimit).map((hit) => {
            const verification = productCatalogOverviewVerificationView(hit);
            const technicallyBlocked =
              verification.status === 'DANE PRODUKTU NIEPEŁNE' ||
              verification.status === 'WYMAGA POWIĄZANIA';
            const active = selectedHit ? catalogHitKey(selectedHit) === catalogHitKey(hit) : false;
            return (
              <div
                key={hit.id}
                className={cn(
                  'flex min-h-14 items-center gap-2 border-t border-ink/8 px-2 py-1.5',
                  active && 'bg-pro-amber/55',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedKey(catalogHitKey(hit))}
                  className="pro-focus-ring flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-pro-studio)] px-1 text-left"
                >
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
                        : verification.status === 'GELLATTI — SPRAWDZONY'
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
                      {technicallyBlocked
                        ? verification.reason
                        : `${hit.brand ?? hit.canonicalFamily ?? hit.category ?? 'Produkt'}${hit.markets[0] ? ` · ${hit.markets[0]}` : ''}`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={hit.favorite}
                  aria-label={
                    hit.favorite
                      ? `Usuń ${hit.displayName} z Ulubionych`
                      : `Dodaj ${hit.displayName} do Ulubionych`
                  }
                  onClick={() =>
                    catalog.toggleFavorite('commercial_product', hit.id, !hit.favorite)
                  }
                  className={applicationIconClasses(hit.favorite ? 'text-gold' : 'text-stone-500')}
                >
                  <span aria-hidden>{hit.favorite ? '★' : '☆'}</span>
                </button>
              </div>
            );
          })}
          {catalog.isSettled && resultCount === 0 ? (
            <p className="px-3 py-6 text-sm text-stone-600">Brak pasujących produktów.</p>
          ) : null}
          {hits.length > visibleLimit || catalog.hasMore ? (
            <div className="border-t border-ink/8 p-3">
              <button
                type="button"
                onClick={() => {
                  setVisibleLimit((value) => value + 100);
                  if (hits.length <= visibleLimit && catalog.hasMore) catalog.loadMore();
                }}
                className={applicationCompactClasses()}
              >
                Pokaż więcej wyników
              </button>
            </div>
          ) : null}
          {catalog.isError ? (
            <p
              className="border-t border-status-error/25 bg-status-error/[0.05] p-3 text-sm text-status-error"
              role="alert"
            >
              Katalog jest chwilowo niedostępny. Spróbuj ponownie.
            </p>
          ) : null}
        </div>

        <aside className="order-first min-w-0 rounded-[var(--radius-pro-studio)] border border-ink/10 bg-pro-warm-raised p-4 lg:order-none lg:sticky lg:top-4 lg:h-max">
          {selectedHit && selectedVerification ? (
            <>
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-pro-studio)] bg-pro-sage text-lg font-semibold text-status-ideal">
                  {selectedHit.displayName.slice(0, 1).toLocaleUpperCase('pl-PL')}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-stone-600">
                    {selectedHit.usableInBase || selectedHit.usableAsTopping
                      ? 'Gotowy'
                      : 'Wymaga weryfikacji'}
                  </span>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-ink">
                    {selectedHit.displayName}
                  </h3>
                  <p className="mt-1 break-all font-mono text-[10px] text-stone-500">
                    {selectedHit.productCode ?? 'Produkt z katalogu Gellatti'}
                    {selectedHit.eans[0] ? ` · EAN ${selectedHit.eans[0]}` : ''}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-[var(--radius-pro-studio)] border border-ink/10 bg-white p-3">
                  <dt className="text-[10px] text-stone-500">Zastosowanie</dt>
                  <dd className="mt-1 text-xs font-semibold text-ink">
                    {selectedHit.usableInBase && selectedHit.usableAsTopping
                      ? 'Receptura i topping'
                      : selectedHit.usableInBase
                        ? 'Receptura'
                        : selectedHit.usableAsTopping
                          ? 'Topping'
                          : 'Wymaga weryfikacji'}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-pro-studio)] border border-ink/10 bg-white p-3">
                  <dt className="text-[10px] text-stone-500">Moja cena</dt>
                  <dd className="mt-1 font-mono text-xs font-semibold text-ink">
                    {selectedHit.privatePricePerKg !== null &&
                    selectedHit.privatePricePerKg !== undefined
                      ? `${selectedHit.privatePricePerKg.toFixed(2)} ${selectedHit.privatePriceCurrency ?? 'EUR'} / kg`
                      : '—'}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-pro-studio)] border border-ink/10 bg-white p-3">
                  <dt className="text-[10px] text-stone-500">Rodzaj</dt>
                  <dd className="mt-1 text-xs font-semibold text-ink">
                    {selectedHit.category ?? selectedHit.canonicalFamily ?? 'Produkt'}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-pro-studio)] border border-ink/10 bg-white p-3">
                  <dt className="text-[10px] text-stone-500">Rynek</dt>
                  <dd className="mt-1 text-xs font-semibold text-ink">
                    {selectedHit.markets.join(', ') || 'Globalny'}
                  </dd>
                </div>
              </dl>
              {selectedVerification.reason ? (
                <p className="mt-3 text-xs leading-5 text-stone-600">
                  {selectedVerification.reason}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link to="/pro/recipe" className={applicationPrimaryClasses()}>
                  Otwórz picker w recepturze
                </Link>
                <Link to="/account" className={applicationQuietClasses()}>
                  Ustawienia produktów
                </Link>
              </div>
            </>
          ) : (
            <p className="py-6 text-sm text-stone-500">Wybierz produkt, aby zobaczyć szczegóły.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
