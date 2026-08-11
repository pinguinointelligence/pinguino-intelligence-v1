import { useState } from 'react';
import type { EffectiveIngredientCost } from '@/features/pro-core/costContracts';
import { parseCustomerPriceText } from './customerPriceInput';

export interface IngredientPriceView {
  cost: EffectiveIngredientCost;
  lineCost: number | null;
  canEdit: boolean;
  onSave?: (pricePerKg: number) => Promise<void>;
  onReset?: () => Promise<void>;
}

const money = (value: number): string =>
  value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function IngredientPriceCell({ view }: { view: IngredientPriceView }) {
  const { cost, lineCost } = view;
  const own = cost.source === 'customer_override';
  const base = cost.mapperPricePerKg;
  const title = own
    ? `Twoja cena. Cena bazowa: ${base === null ? 'brak' : `${money(base)} ${cost.currency}/kg`}`
    : undefined;
  return (
    <div className="min-w-0 text-right" title={title} data-testid="ingredient-effective-price">
      <span className="flex items-center justify-end gap-1 font-mono text-xs tabular-nums text-ink">
        {cost.pricePerKg === null ? '—' : `${money(cost.pricePerKg)} ${cost.currency}/kg`}
        {own ? (
          <span className="rounded-md bg-stone-200 px-1.5 py-px font-sans text-xs font-semibold text-stone-700">
            Moja
          </span>
        ) : null}
      </span>
      <span className="block truncate text-xs text-stone-600">
        {lineCost === null ? 'Koszt niepełny' : `${money(lineCost)} ${cost.currency}`}
      </span>
    </div>
  );
}

export function CustomerPriceEditor({ view }: { view?: IngredientPriceView }) {
  const initial = view?.cost.customerOverridePerKg ?? view?.cost.pricePerKg ?? 0;
  const [raw, setRaw] = useState(String(initial).replace('.', ','));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSave = view?.onSave;
  const onReset = view?.onReset;

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
      const base = view.cost.mapperPricePerKg ?? 0;
      setRaw(String(base).replace('.', ','));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2 border border-ink/10 p-2" data-testid="customer-price-editor">
      <p className="text-xs font-semibold text-ink">Moja cena</p>
      <label className="mt-1 grid grid-cols-[1fr_auto] items-center gap-2 text-xs text-stone-600">
        <span>Cena za kg</span>
        <span className="flex items-center gap-1">
          <input
            value={raw}
            inputMode="decimal"
            aria-label="Moja cena za kg"
            onChange={(event) => setRaw(event.currentTarget.value)}
            className="h-11 w-20 rounded-lg border border-ink/15 px-2 text-right font-mono text-xs text-ink focus:border-ink/40 focus:outline-none"
          />
          {view.cost.currency}
        </span>
      </label>
      {error ? <p className="mt-1 text-xs text-status-error">{error}</p> : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void reset()}
          className="min-h-11 text-xs text-stone-600 underline decoration-stone-300 underline-offset-2 disabled:opacity-40"
        >
          Przywróć cenę bazową
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="min-h-11 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}
