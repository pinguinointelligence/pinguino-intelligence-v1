import { useState } from 'react';
import type { EffectiveIngredientCost } from '@/features/pro-core/costContracts';
import { parseCustomerPriceText } from './customerPriceInput';
import { HoverPreview } from '@/components/ui/HoverPreview';
import { cn } from '@/lib/cn';
import { useCustomerPriceDirtyStore } from './customerPriceDirtyStore';

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
  const active = `${money(cost.pricePerKg)} ${cost.currency}/kg`;
  if (cost.source !== 'customer_override') return `Cena bazowa: ${active}`;
  const own = `Moja cena: ${active}`;
  return cost.mapperPricePerKg === null
    ? own
    : `${own} · Bazowa: ${money(cost.mapperPricePerKg)} ${cost.currency}/kg`;
};

export function IngredientPriceCell({ view }: { view: IngredientPriceView }) {
  const { cost, lineCost } = view;
  const own = cost.source === 'customer_override';
  const tooltipCopy = priceTooltipCopy(cost);
  const activePriceCopy =
    cost.pricePerKg === null ? '—' : `${money(cost.pricePerKg)} ${cost.currency}/kg`;
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
          quiet dot that explains itself on hover. */}
      <span className="flex items-center justify-end gap-1 font-mono font-semibold tabular-nums text-ink">
        {/* „Koszt niepełny" is a STATUS, not a number: it is the one label wider
            than the reserved money column, so it takes the secondary size
            instead of clipping mid-word or stealing the name's width. */}
        <span
          className={cn('whitespace-nowrap', lineCost === null ? 'text-[10px]' : 'text-[11px]')}
        >
          {lineCost === null ? 'Koszt niepełny' : `${money(lineCost)} ${cost.currency}`}
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
      {!own && tooltipCopy ? (
        <HoverPreview
          text={tooltipCopy}
          align="end"
          maxWidthPx={224}
          className="block truncate text-[10px] text-stone-600"
        >
          <span aria-label={tooltipCopy}>{activePriceCopy}</span>
        </HoverPreview>
      ) : (
        <span className="block truncate text-[10px] text-stone-600">{activePriceCopy}</span>
      )}
    </div>
  );
}

export function CustomerPriceEditor({
  view,
  lineId,
  variant = 'default',
}: {
  view?: IngredientPriceView;
  /** Lets the row show „you changed something here" while a typed price is
   * unsaved. Price is excluded from the §8 recipe signature on purpose (it
   * hydrates asynchronously), so the marker composes this state instead. */
  lineId?: string;
  variant?: 'default' | 'article';
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
    return (
      <p
        className={cn(
          'border border-ink/10 text-stone-600',
          variant === 'article'
            ? 'rounded-[8px] px-2.5 py-2 text-[10px] leading-snug'
            : 'mb-1 rounded-lg px-2 py-1.5 text-xs',
        )}
      >
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
      setError(reason instanceof Error ? reason.message : String(reason));
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
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const own = view.cost.source === 'customer_override';
  const base = view.cost.mapperPricePerKg;
  const activePrice = view.cost.pricePerKg;
  const article = variant === 'article';

  return (
    <div
      className={cn(
        'rounded-[10px] border border-ink/10 bg-white',
        article ? 'p-2.5' : 'mb-2 bg-stone-50/70 p-3',
      )}
      data-testid="customer-price-editor"
      data-active-price-source={view.cost.source}
      data-layout={article ? 'compact-inline' : 'default'}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <p className={cn('font-semibold text-ink', article ? 'text-[11px]' : 'text-xs')}>
          {article
            ? 'Moja cena'
            : own
              ? 'Moja cena'
              : view.cost.source === 'mapper_reference'
                ? 'Cena bazowa'
                : 'Brak ceny'}
        </p>
        <p className="shrink-0 font-mono text-[9px] leading-none tabular-nums text-stone-500">
          {article
            ? base !== null
              ? `Bazowa: ${money(base)} ${view.cost.currency}/kg`
              : 'Bazowa: —'
            : own && base !== null
              ? `Bazowa: ${money(base)} ${view.cost.currency}/kg`
              : activePrice !== null
                ? `${money(activePrice)} ${view.cost.currency}/kg`
                : '—'}
        </p>
      </div>
      <div className={cn(article && 'mt-2 flex min-w-0 items-center gap-2')}>
        <label
          className={cn(
            article
              ? 'flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-[8px] border border-ink/12 bg-white focus-within:border-ink/35'
              : 'mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs text-stone-600',
          )}
        >
          <span className={article ? 'sr-only' : undefined}>Cena za kg</span>
          <span className={cn('flex min-w-0 items-center', article ? 'h-full flex-1' : 'gap-1.5')}>
            <input
              value={raw}
              inputMode="decimal"
              aria-label="Moja cena za kg"
              onChange={(event) => {
                setRaw(event.currentTarget.value);
                markDirtyFromInput(event.currentTarget.value);
              }}
              className={cn(
                'text-right font-mono text-xs leading-none tabular-nums text-ink focus:outline-none',
                article
                  ? 'h-full min-w-0 flex-1 border-0 bg-transparent px-3'
                  : 'h-11 w-24 rounded-lg border border-ink/15 bg-white px-3 focus:border-ink/40',
              )}
            />
            <span
              className={cn(
                'shrink-0 font-mono text-stone-500',
                article ? 'border-l border-ink/[0.08] px-2.5 text-[10px]' : 'text-xs',
              )}
            >
              {view.cost.currency}
            </span>
          </span>
        </label>
        {article ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="pro-focus-ring h-10 shrink-0 rounded-[8px] bg-ink px-4 text-[11px] font-semibold text-white transition-colors hover:bg-charcoal disabled:opacity-40"
          >
            Zapisz
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-status-error">{error}</p> : null}
      <div
        className={cn(
          'flex items-center gap-3',
          article ? 'mt-1 min-h-6 justify-start' : 'mt-3 min-h-11 justify-end',
        )}
      >
        {own ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void reset()}
            className={cn(
              'px-1 text-stone-600 underline decoration-stone-300 underline-offset-2 transition-colors hover:text-ink disabled:opacity-40',
              article ? 'min-h-6 text-[10px]' : 'min-h-11 text-xs',
            )}
          >
            {view.resetLabel ?? 'Przywróć cenę bazową'}
          </button>
        ) : null}
        {!article ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="min-h-11 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-charcoal disabled:opacity-40"
          >
            Zapisz
          </button>
        ) : null}
      </div>
    </div>
  );
}
