import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { shopCopy as c } from '@/copy/shop';
import {
  selectedShopCountry,
  selectedStarterPackMode,
  useShopCountryStore,
} from './shopCountryStore';

/**
 * WHERE ARE YOU STARTING? — the question that changes the offer.
 *
 * Deliberately NOT a shipping field buried in checkout. It sits with the
 * product, because the answer decides which product experience the customer
 * gets: a pack that ships, or the same seven components sourced locally for
 * nothing. Asking it late would mean showing a price we then take away.
 *
 * The state line is the whole point of the control. A country is never
 * described as unsupported while a better offer exists — `local` reads as an
 * availability, not a consolation — and the honest "not yet" is reserved for
 * the case where neither mode is real.
 */
export function ShopCountrySelector({ className }: { className?: string }) {
  const load = useShopCountryStore((state) => state.load);
  const countries = useShopCountryStore((state) => state.countries);
  const selected = useShopCountryStore((state) => state.selected);
  const select = useShopCountryStore((state) => state.select);
  const loading = useShopCountryStore((state) => state.loading);
  const country = useShopCountryStore(selectedShopCountry);
  const mode = useShopCountryStore(selectedStarterPackMode);

  useEffect(() => {
    void load();
  }, [load]);

  const state =
    mode === 'physical'
      ? { label: c.country.shipsHere, tone: 'ship' as const }
      : mode === 'local'
        ? { label: c.country.localHere, tone: 'local' as const }
        : selected != null
          ? { label: c.country.noneHere, tone: 'none' as const }
          : null;

  return (
    <div
      className={cn(
        'rounded-[14px] border border-[var(--g-line)] bg-[var(--g-ivory)] px-[18px] py-4 md:px-5 md:py-[18px]',
        className,
      )}
      data-testid="shop-country-selector"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
        <label
          htmlFor="shop-country"
          className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--g-ink)] md:text-[15px]"
        >
          {c.country.question}
        </label>
        {state ? (
          <span
            className={cn(
              'font-mono text-[11.5px] font-semibold tracking-[0.02em]',
              state.tone === 'ship' && 'text-[var(--g-ink)]',
              state.tone === 'local' && 'text-[var(--g-attention-ink)]',
              state.tone === 'none' && 'text-[var(--g-text-secondary)]',
            )}
            data-testid="shop-country-state"
          >
            {state.label}
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-[13px] leading-[1.45] text-[var(--g-text-secondary)]">
        {mode === 'none' && selected != null ? c.country.noneHelper : c.country.helper}
      </p>

      <select
        id="shop-country"
        value={selected ?? ''}
        onChange={(event) => select(event.target.value)}
        disabled={loading && countries.length === 0}
        className={cn(
          'mt-3 h-[42px] w-full rounded-[10px] border border-[var(--g-line-strong)] bg-white px-3',
          'text-[14px] text-[var(--g-ink)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
          'disabled:cursor-not-allowed disabled:text-[var(--g-lock)]',
        )}
        data-testid="shop-country-select"
      >
        <option value="" disabled>
          {c.country.placeholder}
        </option>
        {countries.map((entry) => (
          <option key={entry.iso2} value={entry.iso2}>
            {entry.name}
          </option>
        ))}
      </select>

      {country && mode === 'local' ? (
        <p
          className="mt-2.5 text-[13px] leading-[1.45] text-[var(--g-ink)]"
          data-testid="shop-country-local-note"
        >
          {c.localPack.lede}
        </p>
      ) : null}
    </div>
  );
}
