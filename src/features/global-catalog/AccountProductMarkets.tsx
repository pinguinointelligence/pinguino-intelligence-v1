import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import {
  DEFAULT_CATALOG_MARKET_PREFERENCES,
  detectCatalogMarketCountry,
  getCatalogMarketPreferences,
  listCatalogMarketCountries,
  saveCatalogMarketPreferences,
} from '@/services/globalCatalog';
import type { CatalogMarketPreferences } from './contracts';

export function AccountProductMarkets() {
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: ['global-catalog-market-preferences'],
    queryFn: getCatalogMarketPreferences,
    staleTime: 5 * 60 * 1000,
  });
  const countries = useQuery({
    queryKey: ['catalog-market-countries'],
    queryFn: listCatalogMarketCountries,
    staleTime: 60 * 60 * 1000,
  });
  const detected = useQuery({
    queryKey: ['catalog-market-country-proposal'],
    queryFn: detectCatalogMarketCountry,
    staleTime: Infinity,
  });
  const [draft, setDraft] = useState<CatalogMarketPreferences | null>(null);
  const preferencesUnavailable = saved.isPending || saved.isError;
  const form = draft ?? saved.data ?? DEFAULT_CATALOG_MARKET_PREFERENCES;
  const selected = [form.primaryMarket, ...form.additionalMarkets]
    .filter((market): market is string => Boolean(market));
  const updateDraft = (update: (current: CatalogMarketPreferences) => CatalogMarketPreferences) => {
    if (preferencesUnavailable) return;
    setDraft((current) => update(current ?? saved.data ?? DEFAULT_CATALOG_MARKET_PREFERENCES));
  };
  const mutation = useMutation({
    mutationFn: saveCatalogMarketPreferences,
    onSuccess: async (_data, variables) => {
      setDraft(null);
      queryClient.setQueryData(['global-catalog-market-preferences'], variables);
      await queryClient.invalidateQueries({ queryKey: ['product-search-v1'] });
    },
  });
  const toggleCountry = (code: string) => updateDraft((current) => {
    const all = [current.primaryMarket, ...current.additionalMarkets]
      .filter((market): market is string => Boolean(market));
    const next = all.includes(code) ? all.filter((market) => market !== code) : [...all, code];
    const primaryMarket = current.primaryMarket && next.includes(current.primaryMarket)
      ? current.primaryMarket
      : next[0] ?? null;
    return {
      ...current,
      primaryMarket,
      additionalMarkets: next.filter((market) => market !== primaryMarket),
      defaultScope: next.length === 0 ? 'global' : current.defaultScope === 'global' ? 'my_markets' : current.defaultScope,
    };
  });
  const detectedCountry = countries.data?.find((country) => country.code === detected.data);
  return (
    <section className="py-5" aria-labelledby="product-markets-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="product-markets-heading" className="text-[15px] leading-[1.3] font-bold tracking-[-0.02em] text-[var(--g-ink)]">Produkty w wyszukiwarce</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--g-text-secondary)]">
            Wybierz kraje sprzedaży SKU. Kraj pochodzenia pozostaje osobnym faktem produktu,
            a Ulubione są widoczne niezależnie od tego filtra
          </p>
        </div>
        <button
          type="button"
          disabled={mutation.isPending || preferencesUnavailable || countries.isPending}
          onClick={() => mutation.mutate(form)}
          className="pro-focus-ring min-h-11 rounded-sm bg-ink px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Zapisuję…' : 'Zapisz ustawienia'}
        </button>
      </div>

      {!form.primaryMarket && detectedCountry ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-[var(--g-line)] bg-[var(--g-ivory-deep)] px-4 py-3">
          <p className="text-xs text-[var(--g-ink)]">
            Proponowany rynek na podstawie ustawień konta lub języka przeglądarki:
            {' '}<strong>{detectedCountry.namePl} ({detectedCountry.code})</strong>.
          </p>
          <button
            type="button"
            onClick={() => updateDraft((current) => ({ ...current, primaryMarket: detectedCountry.code, defaultScope: 'my_markets' }))}
            className="pro-focus-ring min-h-10 border border-[var(--g-line)] bg-white px-3 text-xs font-semibold text-ink"
          >
            Ustaw jako domyślny
          </button>
        </div>
      ) : null}

      <fieldset className="mt-5">
        <legend className="text-xs font-semibold text-[var(--g-ink)]">Kraje sprzedaży produktu</legend>
        <div className="mt-3 grid gap-px border border-[var(--g-line)] bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
          {(countries.data ?? []).map((country) => {
            const isSelected = selected.includes(country.code);
            return (
              <label
                key={country.code}
                className={cn(
                  'pro-focus-ring flex min-h-12 cursor-pointer items-center gap-3 bg-white px-4 py-3 text-xs',
                  isSelected && 'bg-[var(--g-ivory-deep)] text-ink',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={preferencesUnavailable}
                  onChange={() => toggleCountry(country.code)}
                />
                <span className="min-w-0 flex-1 font-semibold">{country.namePl}</span>
                <span className="font-mono text-[10px] text-[var(--g-text-secondary)]">{country.code}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-xs font-semibold text-[var(--g-ink)]">Domyślny zakres</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            ['my_markets', 'Tylko wybrane kraje'],
            ['my_markets_and_global', 'Wybrane + globalne'],
            ['global', 'Szukaj we wszystkich krajach'],
          ] as const).map(([scope, label]) => (
            <button
              key={scope}
              type="button"
              aria-pressed={form.defaultScope === scope}
              onClick={() => updateDraft((current) => ({ ...current, defaultScope: scope }))}
              className={cn(
                'pro-focus-ring min-h-11 rounded-sm border px-3 text-xs font-semibold',
                form.defaultScope === scope ? 'border-ink bg-ink text-white' : 'border-[var(--g-line)] bg-white text-[var(--g-text-secondary)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="mt-4 text-xs text-[var(--g-text-secondary)]">
        Aktywny zakres: {form.defaultScope === 'global'
          ? 'wszystkie kraje'
          : selected.length > 0 ? selected.join(' + ') : 'brak wybranych krajów'}
      </p>
      {mutation.isError ? <p className="mt-3 text-xs text-status-error" role="alert">Nie udało się zapisać krajów.</p> : null}
      {saved.isError || countries.isError ? <p className="mt-3 text-xs text-status-error" role="alert">Nie udało się odczytać ustawień. Formularz pozostaje zablokowany.</p> : null}
      {mutation.isSuccess ? <p className="mt-3 text-xs text-status-ideal" role="status">Ustawienia krajów zapisane i zastosowane.</p> : null}
    </section>
  );
}
