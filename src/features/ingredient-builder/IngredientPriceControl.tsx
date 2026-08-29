import { useState, type ReactNode } from 'react';
import type { EffectiveIngredientCost } from '@/features/pro-core/costContracts';
import { currencyMark } from '@/features/pro-core/currencyMark';
import { parseCustomerPriceText } from './customerPriceInput';
import { HoverPreview } from '@/components/ui/HoverPreview';
import { cn } from '@/lib/cn';
import { useCustomerPriceDirtyStore } from './customerPriceDirtyStore';
import { customerErrorMessage } from '@/copy/customerError';

export interface IngredientPriceView {
  cost: EffectiveIngredientCost;
  lineCost: number | null;
  canEdit: boolean;
  onSave?: (pricePerKg: number) => Promise<void>;
  onReset?: () => Promise<void>;
  resetLabel?: string;
}

const money = (value: number): string =>
  value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Presentation only: `pricePerKg` is already the shared resolved authority. */
const priceTooltipCopy = (cost: EffectiveIngredientCost): string | null => {
  if (cost.pricePerKg === null) return null;
  const active = `${money(cost.pricePerKg)} ${currencyMark(cost.currency)}/kg`;
  if (cost.source !== 'customer_override') return `Cena bazowa: ${active}`;
  const own = `Moja cena: ${active}`;
  return cost.mapperPricePerKg === null
    ? own
    : `${own} · Bazowa: ${money(cost.mapperPricePerKg)} ${currencyMark(cost.currency)}/kg`;
};

export function IngredientPriceCell({ view }: { view: IngredientPriceView }) {
  const { cost, lineCost } = view;
  const own = cost.source === 'customer_override';
  const tooltipCopy = priceTooltipCopy(cost);
  const activePriceCopy =
    cost.pricePerKg === null ? '—' : `${money(cost.pricePerKg)} ${currencyMark(cost.currency)}/kg`;
  return (
    <div
      className="min-w-0 text-right leading-tight"
      data-testid="ingredient-effective-price"
      data-price-source={own ? 'customer_override' : 'reference'}
    >
      {/* Two clear lines in a column with reserved width, so the price can never
          reach into the ••• action. The former „Moja" badge is gone (owner,
          2026-08-24): it broke the shape of the block and the owner does not
          need to read the word on every row. A custom price is now marked by a
          quiet dot that explains itself on hover.

          GELLATTI V2.1 (approved preview): the UNIT price leads in the quiet
          tone and the LINE cost sits under it in ink — the reading order the
          owner approved is „what this product costs" then „what this row costs".
          Order and tone only: both numbers, their sources and their tooltips are
          unchanged. */}
      {!own && tooltipCopy ? (
        <HoverPreview
          text={tooltipCopy}
          align="end"
          maxWidthPx={224}
          className="block truncate font-mono text-[11px] font-semibold tabular-nums text-[var(--g-text-price)]"
        >
          <span aria-label={tooltipCopy}>{activePriceCopy}</span>
        </HoverPreview>
      ) : (
        <span className="block truncate font-mono text-[11px] font-semibold tabular-nums text-[var(--g-text-price)]">
          {activePriceCopy}
        </span>
      )}
      <span className="flex items-center justify-end gap-1 font-mono font-semibold tabular-nums text-[var(--g-ink)]">
        {/* „Koszt niepełny" is a STATUS, not a number: it is the one label wider
            than the reserved money column, so it takes the secondary size
            instead of clipping mid-word or stealing the name's width. */}
        <span
          className={cn('whitespace-nowrap', lineCost === null ? 'text-[10px]' : 'text-[11px]')}
        >
          {lineCost === null
            ? 'Koszt niepełny'
            : `${money(lineCost)} ${currencyMark(cost.currency)}`}
        </span>
        {own && tooltipCopy ? (
          // The base price used to hide in a native `title`. It now travels in
          // BOTH the hover preview and the accessible name, so nothing is lost
          // for keyboard/screen-reader users when the tooltip is not rendered.
          <HoverPreview
            text={tooltipCopy}
            focusable
            align="end"
            maxWidthPx={224}
            className="pro-focus-ring -my-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full"
          >
            {/* The MARK stays 5 px; the target around it is 16 px and keyboard
                reachable, so a quiet indicator never becomes a mouse-only,
                pixel-hunting affordance. */}
            <span
              aria-label={tooltipCopy}
              data-testid="customer-price-indicator"
              className="block size-[5px] rounded-full bg-gold"
            />
          </HoverPreview>
        ) : null}
      </span>
    </div>
  );
}

export function CustomerPriceEditor({
  view,
  lineId,
  variant = 'default',
  footerAction,
}: {
  view?: IngredientPriceView;
  /** Lets the row show „you changed something here" while a typed price is
   * unsaved. Price is excluded from the §8 recipe signature on purpose (it
   * hydrates asynchronously), so the marker composes this state instead. */
  lineId?: string;
  variant?: 'default' | 'article';
  /** Compact article-only action anchored to the far-right footer edge. */
  footerAction?: ReactNode;
}) {
  const initial = view?.cost.customerOverridePerKg ?? view?.cost.pricePerKg ?? null;
  const [raw, setRaw] = useState(initial === null ? '' : String(initial).replace('.', ','));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setPriceDirty = useCustomerPriceDirtyStore((state) => state.setDirty);
  const onSave = view?.onSave;
  const onReset = view?.onReset;
  /** Only a real keystroke can raise the flag — never a hydration. */
  const markDirtyFromInput = (nextRaw: string) => {
    if (!lineId) return;
    const parsed = parseCustomerPriceText(nextRaw);
    const saved = view?.cost.customerOverridePerKg ?? view?.cost.pricePerKg ?? null;
    setPriceDirty(lineId, parsed !== null && (saved === null || parsed !== saved));
  };

  if (!view?.canEdit || !onSave || !onReset) {
    if (variant === 'article') {
      return (
        <div
          className="rounded-[10px] border border-ink/10 bg-white p-2.5"
          data-testid="customer-price-editor"
          data-layout="compact-inline"
        >
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[10px] leading-snug text-stone-600">
              Moja cena wymaga składnika z kanonicznym ID oraz aktywnego konta.
            </p>
            {footerAction}
          </div>
        </div>
      );
    }
    return (
      <p className="mb-1 rounded-lg border border-ink/10 px-2 py-1.5 text-xs text-stone-600">
        Moja cena wymaga składnika z kanonicznym ID oraz aktywnego konta.
      </p>
    );
  }

  const save = async () => {
    const parsed = parseCustomerPriceText(raw);
    if (parsed === null) {
      setError('Wpisz liczbę większą lub równą 0 (maks. 4 miejsca po przecinku).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(parsed);
      // The existing save flow succeeded, so the row is no longer price-dirty.
      if (lineId) setPriceDirty(lineId, false);
    } catch (reason) {
      setError(customerErrorMessage(reason, 'account'));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await onReset();
      const base = view.cost.mapperPricePerKg;
      setRaw(base === null ? '' : String(base).replace('.', ','));
      if (lineId) setPriceDirty(lineId, false);
    } catch (reason) {
      setError(customerErrorMessage(reason, 'account'));
    } finally {
      setBusy(false);
    }
  };

  const own = view.cost.source === 'customer_override';
  const base = view.cost.mapperPricePerKg;
  const activePrice = view.cost.pricePerKg;
  const article = variant === 'article';

  if (article) {
    return (
      <div
        className="rounded-[10px] border border-ink/10 bg-white p-2.5"
        data-testid="customer-price-editor"
        data-active-price-source={view.cost.source}
        data-layout="compact-inline"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
          <p className="min-w-0 text-[11px] font-semibold leading-none text-ink">Moja cena</p>
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <label className="flex h-9 w-[112px] shrink-0 items-center overflow-hidden rounded-[8px] border border-ink/12 bg-white focus-within:border-ink/35">
              <span className="sr-only">Cena za kg</span>
              <span className="flex h-full min-w-0 flex-1 items-center">
                <input
                  value={raw}
                  inputMode="decimal"
                  aria-label="Moja cena za kg"
                  onChange={(event) => {
                    setRaw(event.currentTarget.value);
                    markDirtyFromInput(event.currentTarget.value);
                  }}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-right font-mono text-xs leading-none tabular-nums text-ink focus:outline-none"
                />
                <span className="shrink-0 border-l border-ink/[0.08] px-2 font-mono text-[10px] text-stone-500">
                  {currencyMark(view.cost.currency)}
                </span>
              </span>
            </label>
            <button
              type="button"
              aria-label="Zapisz"
              disabled={busy}
              onClick={() => void save()}
              className="pro-focus-ring h-9 shrink-0 rounded-[8px] bg-ink px-3 text-[11px] font-semibold text-white transition-colors hover:bg-charcoal disabled:opacity-40"
            >
              Zapisz
            </button>
          </div>
          <span className="hidden sm:block" aria-hidden />
          {footerAction ? (
            <div className="col-span-2 justify-self-end sm:col-span-1">{footerAction}</div>
          ) : null}
        </div>
        {error ? <p className="mt-1 text-xs text-status-error">{error}</p> : null}
        <div className="mt-1.5 flex min-h-9 items-center gap-3">
          {own ? (
            <button
              type="button"
              aria-label={view.resetLabel ?? 'Przywróć cenę bazową'}
              disabled={busy}
              onClick={() => void reset()}
              className="pro-focus-ring inline-flex h-9 items-center px-1 text-[10px] text-stone-600 underline decoration-stone-300 underline-offset-2 transition-colors hover:text-ink disabled:opacity-40"
            >
              {view.resetLabel ?? 'Przywróć cenę bazową'}
            </button>
          ) : null}
          <p
            className="truncate font-mono text-[9px] leading-none tabular-nums text-stone-500"
            data-testid="article-panel-base-price"
          >
            {base !== null
              ? `Bazowa: ${money(base)} ${currencyMark(view.cost.currency)}/kg`
              : 'Bazowa: —'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-2 rounded-[10px] border border-ink/10 bg-stone-50/70 p-3"
      data-testid="customer-price-editor"
      data-active-price-source={view.cost.source}
      data-layout="default"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-ink">
          {own
            ? 'Moja cena'
            : view.cost.source === 'mapper_reference'
              ? 'Cena bazowa'
              : 'Brak ceny'}
        </p>
        <p className="shrink-0 font-mono text-[9px] leading-none tabular-nums text-stone-500">
          {own && base !== null
            ? `Bazowa: ${money(base)} ${currencyMark(view.cost.currency)}/kg`
            : activePrice !== null
              ? `${money(activePrice)} ${currencyMark(view.cost.currency)}/kg`
              : '—'}
        </p>
      </div>
      <div>
        <label className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs text-stone-600">
          <span>Cena za kg</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <input
              value={raw}
              inputMode="decimal"
              aria-label="Moja cena za kg"
              onChange={(event) => {
                setRaw(event.currentTarget.value);
                markDirtyFromInput(event.currentTarget.value);
              }}
              className="h-11 w-24 rounded-lg border border-ink/15 bg-white px-3 text-right font-mono text-xs leading-none tabular-nums text-ink focus:border-ink/40 focus:outline-none"
            />
            <span className="shrink-0 font-mono text-xs text-stone-500">
              {currencyMark(view.cost.currency)}
            </span>
          </span>
        </label>
      </div>
      {error ? <p className="mt-1 text-xs text-status-error">{error}</p> : null}
      <div className="mt-3 flex min-h-11 items-center justify-end gap-3">
        {own ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void reset()}
            className="min-h-11 px-1 text-xs text-stone-600 underline decoration-stone-300 underline-offset-2 transition-colors hover:text-ink disabled:opacity-40"
          >
            {view.resetLabel ?? 'Przywróć cenę bazową'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="min-h-11 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-charcoal disabled:opacity-40"
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}
