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
      className="mb-2 rounded-lg border border-ink/10 bg-stone-50/70 p-3"
      data-testid="customer-price-editor"
      data-active-price-source={view.cost.source}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="text-xs font-semibold text-ink">
          {article
            ? 'Moja cena'
            : own
              ? 'Moja cena'
              : view.cost.source === 'mapper_reference'
                ? 'Cena bazowa'
                : 'Brak ceny'}
        </p>
        <p className="shrink-0 font-mono text-[10px] leading-relaxed tabular-nums text-stone-500">
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
          {view.cost.currency}
        </span>
      </label>
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
