import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { productCatalogOverviewVerificationView } from '@/features/ingredient-builder/productPickerModel';
import { preserveServerProductRank } from './ranking';
import { canonicalFamilyLabelPl } from './catalogDisplayAliases';
import { useGlobalCatalogPicker } from './useGlobalCatalogPicker';
import { CarbonationBubbles } from '@/components/product/CarbonationBubbles';
import { currencyMark } from '@/features/pro-core/currencyMark';
import {
  applicationCompactClasses,
  applicationFieldClasses,
  applicationIconClasses,
  applicationPrimaryClasses,
  applicationQuietClasses,
} from '@/components/ui/applicationControlStyles';
import type { CatalogProductSearchHit } from './contracts';

/** The approved „Moja cena" cell — the stored value or an explicit dash. */
const catalogPrice = (hit: CatalogProductSearchHit): string =>
  hit.privatePricePerKg !== null && hit.privatePricePerKg !== undefined
    ? `${hit.privatePricePerKg.toFixed(2)} ${currencyMark(hit.privatePriceCurrency ?? 'EUR')}/kg`
    : '—';

const catalogHitKey = (hit: CatalogProductSearchHit): string =>
  `${hit.entityKind}:${hit.entityKind === 'pi_base' ? (hit.mappedIngredientId ?? hit.id) : hit.id}`;

/**
 * GELLATTI V2.1 §5 — the approved catalog row.
 *
 * The preview's master list is a real COLUMN TABLE:
 * `Produkt | EAN | Status | Moja cena | ·` on a 60 px line under one ivory
 * head band. The identity is two lines (name over its own qualifier), the EAN
 * and the price are mono, and the status is a chip. This is presentation only:
 * the same hit, the same selection callback and the same favourite toggle.
 */
const CATALOG_COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_92px_28px] items-center gap-x-3 ' +
  'lg:grid-cols-[minmax(0,1fr)_157px_92px_100px_28px]';

function CatalogRow({
  name,
  qualifier,
  ean,
  status,
  blocked,
  price,
  active,
  favorite,
  onSelect,
  onToggleFavorite,
  carbonation,
  blockReason,
}: {
  name: string;
  qualifier: string;
  ean: string;
  status: string;
  blocked: boolean;
  price: string;
  active: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  carbonation: Parameters<typeof CarbonationBubbles>[0]['status'];
  blockReason?: string | null;
}) {
  return (
    <div
      className={cn(
        CATALOG_COLUMNS,
        'min-h-[60px] border-t border-ink/8 px-3',
        active && 'bg-[var(--g-ivory)]',
      )}
      data-catalog-row={active ? 'selected' : 'row'}
    >
      <button
        type="button"
        onClick={onSelect}
        className="pro-focus-ring -mx-1 flex min-h-11 min-w-0 items-center rounded-[9px] px-1 text-left"
      >
        <span className="min-w-0">
          <strong className="flex min-w-0 items-center gap-1.5 text-[11px] leading-[15px] font-bold text-[var(--g-ink)]">
            <span className="truncate">{name}</span>
            <CarbonationBubbles status={carbonation} />
          </strong>
          <span
            className={cn(
              'mt-1 block truncate text-[9px] leading-[14px]',
              blocked ? 'text-status-error' : 'text-[var(--g-text-muted)]',
            )}
            data-catalog-block-reason={blocked ? (blockReason ?? undefined) : undefined}
            title={blocked ? (blockReason ?? undefined) : undefined}
          >
            {blocked ? (blockReason ?? status) : qualifier}
          </span>
        </span>
      </button>
      <span className="hidden truncate font-mono text-[11px] text-[var(--g-ink)] lg:block">
        {ean}
      </span>
      {/* Three tones, because the catalogue genuinely has three truths: ready,
          label-check-required, and technically blocked. Calibration honesty:
          the middle state must never be painted as ready. */}
      <span
        className={cn(
          'inline-flex h-6 min-w-0 items-center justify-center rounded-full px-2 text-[9px] font-bold',
          blocked
            ? 'bg-status-error/10 text-status-error'
            : status === 'WYMAGA SPRAWDZENIA ETYKIETY'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-[#f4f8f4] text-[#2f6b40]',
        )}
        data-catalog-verification-status={status}
        title={blockReason ?? status}
      >
        <span className="truncate">
          {blocked ? 'Sprawdź' : status === 'WYMAGA SPRAWDZENIA ETYKIETY' ? 'Etykieta' : 'Gotowy'}
        </span>
      </span>
      <span className="hidden truncate font-mono text-[11px] text-[var(--g-text-muted)] lg:block">
        {price}
      </span>
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={favorite ? `Usuń ${name} z Ulubionych` : `Dodaj ${name} do Ulubionych`}
        onClick={onToggleFavorite}
        className={applicationIconClasses(favorite ? 'text-gold' : 'text-stone-500')}
      >
        <span aria-hidden>{favorite ? '★' : '☆'}</span>
      </button>
    </div>
  );
}

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
  const selectedFavorite = selectedHit
    ? selectedHit.entityKind === 'pi_base'
      ? catalog.favorites.has(`pi_base:${selectedHit.mappedIngredientId ?? selectedHit.id}`)
      : selectedHit.favorite
    : false;
  const toggleSelectedFavorite = () => {
    if (!selectedHit) return;
    if (selectedHit.entityKind === 'pi_base') {
      catalog.toggleFavorite(
        'pi_base',
        selectedHit.mappedIngredientId ?? selectedHit.id,
        !selectedFavorite,
      );
      return;
    }
    catalog.toggleFavorite('commercial_product', selectedHit.id, !selectedFavorite);
  };

  return (
    <section className="mt-2" aria-label="Katalog Gellatti">
      <div className="rounded-[12px] border border-ink/12 bg-white p-3 shadow-pro-e0">
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-[260px] flex-1">
            <span className="sr-only">Szukaj w katalogu produktów</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Szukaj produktu, marki, EAN lub rodziny…"
              className={applicationFieldClasses('bg-white text-sm')}
            />
          </label>
          <Link to="/account#product-markets-heading" className={applicationQuietClasses()}>
            Rynki produktów
          </Link>
        </div>
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
                market === value
                  ? 'border-gold bg-gold/12 text-ink'
                  : 'border-ink/12 text-stone-600',
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
        <p className="mt-2 text-xs text-stone-600" role="status" aria-live="polite">
          {!catalog.isSettled ? 'Szukam…' : `${resultCount} wyników`}
        </p>
      </div>
      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[minmax(340px,1.22fr)_minmax(420px,1fr)]">
        <div
          className="min-w-0 overflow-hidden rounded-[12px] border border-ink/12 bg-white shadow-pro-e0"
          data-gellatti-panel
        >
          {/* The approved head band names the four columns once. */}
          <div
            className={cn(
              CATALOG_COLUMNS,
              'bg-[var(--g-ivory-deep)] px-3 py-2.5 text-[9px] text-[var(--g-text-field-label)]',
            )}
            aria-hidden
          >
            <span>Produkt</span>
            <span className="hidden lg:block">EAN</span>
            <span>Status</span>
            <span className="hidden lg:block">Moja cena</span>
            <span />
          </div>
          {baseHits.length > 0 ? (
            <p className="border-t border-ink/8 px-3 py-2 text-[10px] font-semibold text-[var(--g-text-muted)]">
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
            return (
              <CatalogRow
                key={`pi:${hit.id}`}
                name={hit.displayName}
                qualifier={hit.productForm ?? canonicalFamilyLabelPl(hit.category) ?? 'Składnik z bazy Gellatti'}
                ean={hit.eans[0] ?? hit.productCode ?? '—'}
                status={verification.status}
                blocked={technicallyBlocked}
                blockReason={verification.reason}
                price={catalogPrice(hit)}
                active={selectedHit ? catalogHitKey(selectedHit) === catalogHitKey(hit) : false}
                favorite={favorite}
                carbonation={hit.carbonationStatus}
                onSelect={() => setSelectedKey(catalogHitKey(hit))}
                onToggleFavorite={() => catalog.toggleFavorite('pi_base', mapperId, !favorite)}
              />
            );
          })}
          {commercialHits.length > 0 ? (
            <p className="border-t border-ink/8 px-3 py-2 text-[10px] font-semibold text-[var(--g-text-muted)]">
              Produkty komercyjne
            </p>
          ) : null}
          {commercialHits.slice(0, visibleLimit).map((hit) => {
            const verification = productCatalogOverviewVerificationView(hit);
            const technicallyBlocked =
              verification.status === 'DANE PRODUKTU NIEPEŁNE' ||
              verification.status === 'WYMAGA POWIĄZANIA';
            return (
              <CatalogRow
                key={hit.id}
                name={hit.displayName}
                qualifier={`${hit.brand ?? canonicalFamilyLabelPl(hit.canonicalFamily) ?? canonicalFamilyLabelPl(hit.category) ?? 'Produkt'}${hit.markets[0] ? ` · ${hit.markets[0]}` : ''}`}
                ean={hit.eans[0] ?? hit.productCode ?? '—'}
                status={verification.status}
                blocked={technicallyBlocked}
                blockReason={verification.reason}
                price={catalogPrice(hit)}
                active={selectedHit ? catalogHitKey(selectedHit) === catalogHitKey(hit) : false}
                favorite={hit.favorite}
                carbonation={hit.carbonationStatus}
                onSelect={() => setSelectedKey(catalogHitKey(hit))}
                onToggleFavorite={() =>
                  catalog.toggleFavorite('commercial_product', hit.id, !hit.favorite)
                }
              />
            );
          })}
          {catalog.isSettled && resultCount === 0 ? (
            <p className="px-3 py-6 text-sm text-stone-600">Brak pasujących produktów</p>
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

        {/* GELLATTI V2.1 §5 — the approved detail panel: a WHITE card with the
            product mark and its status chip, four hairline fact rows, the role
            note, then the action row. Every destination and callback below is
            the one that was already here. */}
        <aside
          className="order-first min-w-0 rounded-[12px] border border-ink/12 bg-white p-4 shadow-pro-e0 lg:order-none lg:sticky lg:top-4 lg:h-max"
          data-gellatti-panel
        >
          {selectedHit && selectedVerification ? (
            <>
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-[42px] shrink-0 place-items-center rounded-[12px] bg-[#efe8dc] text-[16px] font-extrabold text-[#101113]">
                  {selectedHit.displayName.slice(0, 1).toLocaleUpperCase('pl-PL')}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[21px] leading-[24px] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
                    {selectedHit.displayName}
                  </h3>
                  <p className="mt-1 text-[12px] leading-[17px] text-[var(--g-text-muted)]">
                    {selectedHit.brand ??
                      canonicalFamilyLabelPl(selectedHit.canonicalFamily) ??
                      'Produkt z katalogu Gellatti'}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[9px] font-bold',
                    selectedHit.usableInBase || selectedHit.usableAsTopping
                      ? 'bg-[#f4f8f4] text-[#2f6b40]'
                      : 'bg-status-error/10 text-status-error',
                  )}
                >
                  {selectedHit.usableInBase || selectedHit.usableAsTopping
                    ? 'Gotowy'
                    : 'Wymaga weryfikacji'}
                </span>
              </div>

              <dl className="mt-4">
                {(
                  [
                    ['EAN', selectedHit.eans[0] ?? selectedHit.productCode ?? '—', true],
                    ['Rynek', selectedHit.markets.join(', ') || 'Globalny', false],
                    [
                      'Moja cena',
                      catalogPrice(selectedHit) === '—'
                        ? 'Nie ustawiono'
                        : catalogPrice(selectedHit),
                      false,
                    ],
                    ['Status kanoniczny', selectedVerification.status, false],
                  ] as const
                ).map(([label, value, mono]) => (
                  <div
                    key={label}
                    className="flex min-h-[41px] items-center justify-between gap-4 border-b border-ink/8 py-2"
                  >
                    <dt className="shrink-0 text-[9px] text-[var(--g-text-field-label)]">
                      {label}
                    </dt>
                    <dd
                      className={cn(
                        'min-w-0 truncate text-right text-[11px] font-bold text-[var(--g-ink)]',
                        mono && 'font-mono',
                      )}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* The role note is the product's own module truth, in the
                  approved green surface. */}
              <div className="mt-4 rounded-[12px] bg-[#f3f7f3] px-3 py-3">
                <b className="block text-[14px] leading-[19px] font-bold text-[#2f6b40]">
                  {selectedHit.usableInBase && selectedHit.usableAsTopping
                    ? 'RECEPTURA I TOPPING'
                    : selectedHit.usableInBase
                      ? 'RECEPTURA'
                      : selectedHit.usableAsTopping
                        ? 'TYLKO TOPPING'
                        : 'WYMAGA WERYFIKACJI'}
                </b>
                <span className="mt-1 block text-[11px] leading-[16px] text-[var(--g-text-secondary)]">
                  {selectedVerification.reason ??
                    (selectedHit.usableAsTopping && !selectedHit.usableInBase
                      ? 'Dodawany po produkcji. Nie zmienia bilansu bazy lodowej.'
                      : 'Produkt może wejść do bazy lodowej receptury.')}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link to="/pro/recipe" className={applicationPrimaryClasses()}>
                  Użyj w recepturze
                </Link>
                <Link to="/account" className={applicationCompactClasses('min-h-10 px-3')}>
                  Ustawienia produktów
                </Link>
                <button
                  type="button"
                  aria-pressed={selectedFavorite}
                  onClick={toggleSelectedFavorite}
                  className={applicationCompactClasses(
                    cn('min-h-10 px-3', selectedFavorite && 'border-gold text-gold'),
                  )}
                >
                  {selectedFavorite ? '★ Ulubione' : '☆ Ulubione'}
                </button>
              </div>
            </>
          ) : (
            <p className="py-6 text-sm text-stone-500">Wybierz produkt, aby zobaczyć szczegóły</p>
          )}
        </aside>
      </div>
    </section>
  );
}
