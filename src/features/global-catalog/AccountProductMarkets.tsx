import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import {
  DEFAULT_CATALOG_MARKET_PREFERENCES,
  getCatalogMarketPreferences,
  saveCatalogMarketPreferences,
} from '@/services/globalCatalog';
import type { CatalogMarketPreferences } from './contracts';

const MARKET_OPTIONS = ['Polska', 'Niemcy', 'Hiszpania', 'Francja', 'Włochy', 'Wielka Brytania', 'Filipiny'];

export function AccountProductMarkets() {
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: ['global-catalog-market-preferences'],
    queryFn: getCatalogMarketPreferences,
    staleTime: 5 * 60 * 1000,
  });
  const [draft, setDraft] = useState<CatalogMarketPreferences | null>(null);
  const [customMarket, setCustomMarket] = useState('');
  const preferencesUnavailable = saved.isPending || saved.isError;
  const form = draft ?? saved.data ?? DEFAULT_CATALOG_MARKET_PREFERENCES;
  const marketOptions = [...new Set([
    ...MARKET_OPTIONS,
    ...(form.primaryMarket ? [form.primaryMarket] : []),
    ...form.additionalMarkets,
  ])];
  const updateDraft = (update: (current: CatalogMarketPreferences) => CatalogMarketPreferences) => {
    if (preferencesUnavailable) return;
    setDraft((current) => update(current ?? saved.data ?? DEFAULT_CATALOG_MARKET_PREFERENCES));
  };
  const mutation = useMutation({
    mutationFn: saveCatalogMarketPreferences,
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(['global-catalog-market-preferences'], variables);
    },
  });
  const toggleAdditional = (market: string) => updateDraft((current) => ({
    ...current,
    additionalMarkets: current.additionalMarkets.includes(market)
      ? current.additionalMarkets.filter((value) => value !== market)
      : [...current.additionalMarkets, market],
  }));
  return (
    <section className="py-5" aria-labelledby="product-markets-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="product-markets-heading" className="text-sm font-semibold text-ink">Rynki produktów</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-stone-600">
            Ustawia ranking katalogu. Kraj pochodzenia produktu pozostaje osobną informacją.
          </p>
        </div>
        <button
          type="button"
          disabled={mutation.isPending || preferencesUnavailable}
          onClick={() => mutation.mutate(form)}
          className="pro-focus-ring min-h-11 rounded-xl bg-ink px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Zapisuję…' : 'Zapisz rynki'}
        </button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="text-xs font-semibold text-stone-700">
          Rynek główny
          <select
            value={form.primaryMarket ?? ''}
            disabled={preferencesUnavailable}
            onChange={(event) => updateDraft((current) => ({
              ...current,
              primaryMarket: event.currentTarget.value || null,
              additionalMarkets: current.additionalMarkets.filter((value) => value !== event.currentTarget.value),
            }))}
            className="pro-focus-ring mt-2 min-h-11 w-full rounded-xl border border-ink/12 bg-white px-3 text-sm text-ink"
          >
            <option value="">Nie ustawiono</option>
            {marketOptions.map((market) => <option key={market}>{market}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-stone-700">
          Domyślny zakres wyszukiwania
          <select
            value={form.defaultScope}
            disabled={preferencesUnavailable}
            onChange={(event) => updateDraft((current) => ({ ...current, defaultScope: event.currentTarget.value as CatalogMarketPreferences['defaultScope'] }))}
            className="pro-focus-ring mt-2 min-h-11 w-full rounded-xl border border-ink/12 bg-white px-3 text-sm text-ink"
          >
            <option value="my_markets">Moje rynki</option>
            <option value="my_markets_and_global">Moje rynki + katalog globalny</option>
            <option value="global">Cały świat</option>
          </select>
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-stone-700">Rynki dodatkowe</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {marketOptions.filter((market) => market !== form.primaryMarket).map((market) => {
            const selected = form.additionalMarkets.includes(market);
            return (
              <button
                key={market}
                type="button"
                disabled={preferencesUnavailable}
                aria-pressed={selected}
                onClick={() => toggleAdditional(market)}
                className={cn(
                  'pro-focus-ring min-h-11 rounded-full border px-3 text-xs font-semibold',
                  selected ? 'border-gold bg-gold/12 text-ink' : 'border-ink/12 bg-white text-stone-600',
                )}
              >
                {market}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1 text-xs font-semibold text-stone-700">
          Inny rynek
          <input
            value={customMarket}
            disabled={preferencesUnavailable}
            onChange={(event) => setCustomMarket(event.currentTarget.value)}
            placeholder="Wpisz kraj lub rynek"
            className="pro-focus-ring mt-2 min-h-11 w-full rounded-xl border border-ink/12 bg-white px-3 text-sm text-ink"
          />
        </label>
        <button
          type="button"
          disabled={preferencesUnavailable || customMarket.trim() === ''}
          onClick={() => {
            const market = customMarket.trim();
            if (!market) return;
            updateDraft((current) => ({
              ...current,
              additionalMarkets: current.additionalMarkets.includes(market)
                ? current.additionalMarkets
                : [...current.additionalMarkets, market],
            }));
            setCustomMarket('');
          }}
          className="pro-focus-ring min-h-11 self-end rounded-xl border border-ink/15 bg-white px-4 text-xs font-semibold text-ink disabled:opacity-50"
        >
          Dodaj rynek
        </button>
      </div>
      <label className="mt-4 block text-xs font-semibold text-stone-700">
        Preferowani sprzedawcy <span className="font-normal text-stone-500">(oddziel przecinkami)</span>
        <input
          value={form.preferredRetailers.join(', ')}
          disabled={preferencesUnavailable}
          onChange={(event) => updateDraft((current) => ({
            ...current,
            preferredRetailers: event.currentTarget.value.split(',').map((value) => value.trim()).filter(Boolean),
          }))}
          placeholder="np. Lidl, REWE, Mercadona"
          className="pro-focus-ring mt-2 min-h-11 w-full rounded-xl border border-ink/12 bg-white px-3 text-sm text-ink"
        />
      </label>
      {mutation.isError ? <p className="mt-3 text-xs text-status-error" role="alert">Nie udało się zapisać rynków.</p> : null}
      {saved.isError ? <p className="mt-3 text-xs text-status-error" role="alert">Nie udało się odczytać zapisanych rynków. Formularz pozostaje zablokowany, aby ich nie nadpisać.</p> : null}
      {mutation.isSuccess ? <p className="mt-3 text-xs text-status-ideal" role="status">Rynki produktów zapisane.</p> : null}
    </section>
  );
}
