import { useState } from 'react';
import { Link } from 'react-router';
import { createManualProduct } from '@/services/manualProduct';
import type { ProductIngestResult } from '@/services/productIngest';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { customerErrorMessage } from '@/copy/customerError';

const shell = 'mx-auto min-h-screen max-w-3xl bg-paper px-4 py-8 text-ink sm:px-8 lg:py-12';
const card =
  'rounded-[20px] border border-stone-200 bg-white shadow-[0_12px_32px_rgba(28,25,23,0.06)]';
const field =
  'pro-focus-ring mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm';
const initial = {
  displayName: '',
  brand: '',
  ean: '',
  packageSize: '',
  category: '',
  energyKcal: '',
  fat: '',
  carbohydrate: '',
  sugars: '',
  protein: '',
  salt: '',
  ingredientsText: '',
  allergensText: '',
};

const numeric = (value: string) => Number(value.replace(',', '.'));

export function ManualProductPage() {
  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const [values, setValues] = useState(initial);
  const [unbranded, setUnbranded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ProductIngestResult | null>(null);
  const update = (key: keyof typeof initial, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setError(null);
    const numbers = {
      energyKcal: numeric(values.energyKcal),
      fat: numeric(values.fat),
      carbohydrate: numeric(values.carbohydrate),
      sugars: numeric(values.sugars),
      protein: numeric(values.protein),
      salt: numeric(values.salt),
    };
    if (Object.values(numbers).some((value) => !Number.isFinite(value) || value < 0)) {
      setError('Wartości odżywcze muszą być liczbami z opakowania.');
      return;
    }
    if (numbers.sugars > numbers.carbohydrate) {
      setError('Cukry nie mogą przekraczać węglowodanów.');
      return;
    }
    setBusy(true);
    try {
      const result = await createManualProduct({
        displayName: values.displayName,
        brand: values.brand || null,
        explicitlyUnbranded: unbranded,
        ean: values.ean || null,
        packageSize: values.packageSize,
        category: values.category || null,
        nutrition: numbers,
        ingredientsText: values.ingredientsText,
        allergensText: values.allergensText || null,
      });
      setSaved(result);
    } catch (caught) {
      setError(customerErrorMessage(caught, 'scanner', 'SCANNER_SAVE_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  if (authStatus !== 'authed' && !import.meta.env.DEV) {
    return (
      <main className={shell}>
        <Link to="/products" className="text-sm text-stone-600">
          ← Produkty
        </Link>
        <section className={`${card} mt-8 p-6 sm:p-9`}>
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">Dodaj produkt ręcznie</h1>
          <p className="mt-3 text-sm text-stone-600">
            Zaloguj się, aby produkt został przypisany do Twojego konta.
          </p>
          <button
            type="button"
            onClick={openAuthModal}
            className="pro-focus-ring mt-6 min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white"
          >
            Zaloguj się
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={shell}>
      <Link
        to="/products"
        className="pro-focus-ring inline-flex min-h-11 items-center text-sm text-stone-600"
      >
        ← Produkty
      </Link>
      <header className="mt-5 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
          Produkt Gellatti
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Dodaj produkt ręcznie</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Przepisz fakty z opakowania. Na tej podstawie przygotujemy dane potrzebne do receptury.
        </p>
      </header>

      <section className={`${card} mt-7 p-6 sm:p-8`}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">Nazwa produktu</span>
            <input
              className={field}
              value={values.displayName}
              onChange={(e) => update('displayName', e.currentTarget.value)}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Marka</span>
            <input
              className={field}
              disabled={unbranded}
              value={values.brand}
              onChange={(e) => update('brand', e.currentTarget.value)}
            />
          </label>
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={unbranded}
              onChange={(e) => setUnbranded(e.currentTarget.checked)}
              className="size-4 accent-stone-900"
            />
            Produkt nie ma marki
          </label>
          <label>
            <span className="text-sm font-semibold">
              EAN / GTIN <span className="font-normal text-stone-500">(opcjonalnie)</span>
            </span>
            <input
              inputMode="numeric"
              className={field}
              value={values.ean}
              onChange={(e) => update('ean', e.currentTarget.value)}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Opakowanie</span>
            <input
              placeholder="np. 250 g"
              className={field}
              value={values.packageSize}
              onChange={(e) => update('packageSize', e.currentTarget.value)}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">
              Kategoria <span className="font-normal text-stone-500">(opcjonalnie)</span>
            </span>
            <input
              className={field}
              value={values.category}
              onChange={(e) => update('category', e.currentTarget.value)}
            />
          </label>
        </div>

        <div className="mt-8 border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Wartości odżywcze na 100 g</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            {(
              [
                ['energyKcal', 'Energia', 'kcal'],
                ['fat', 'Tłuszcz', 'g'],
                ['carbohydrate', 'Węglowodany', 'g'],
                ['sugars', 'Cukry', 'g'],
                ['protein', 'Białko', 'g'],
                ['salt', 'Sól', 'g'],
              ] as const
            ).map(([key, label, unit]) => (
              <label key={key}>
                <span className="text-sm font-semibold">{label}</span>
                <span className="mt-2 flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    className={`${field} mt-0`}
                    value={values[key]}
                    onChange={(e) => update(key, e.currentTarget.value)}
                  />
                  <span className="text-xs text-stone-500">{unit}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-5 border-t border-stone-200 pt-6">
          <label>
            <span className="text-sm font-semibold">Skład produktu</span>
            <textarea
              rows={4}
              className={`${field} py-3`}
              value={values.ingredientsText}
              onChange={(e) => update('ingredientsText', e.currentTarget.value)}
            />
            <span className="mt-1 block text-xs text-stone-500">
              Przepisz wykaz składników z opakowania.
            </span>
          </label>
          <label>
            <span className="text-sm font-semibold">
              Alergeny <span className="font-normal text-stone-500">(jeśli potwierdzone)</span>
            </span>
            <input
              className={field}
              value={values.allergensText}
              onChange={(e) => update('allergensText', e.currentTarget.value)}
            />
            <span className="mt-1 block text-xs text-stone-500">
              Puste pole zostanie zapisane jako „Alergeny niepotwierdzone”, nigdy „Brak alergenów”.
            </span>
          </label>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-terracotta/40 bg-terracotta/10 p-4 text-sm text-stone-700"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="pro-focus-ring mt-6 min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white disabled:bg-stone-400"
        >
          {busy ? 'Sprawdzamy dane…' : 'Zapisz produkt'}
        </button>
      </section>

      {saved && (
        <section className={`${card} mt-6 border-sage/40 p-6`} aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            {saved.engineUsable ? 'Produkt gotowy' : 'Produkt wymaga dalszej weryfikacji'}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{saved.productCode}</h2>
          <p className="mt-2 text-sm text-stone-600">
            Dokładność danych {Math.round(saved.productAccuracy ?? 0)}%
          </p>
          {saved.allergenEvidenceStatus === 'NOT_CONFIRMED' && (
            <p className="mt-2 text-sm font-medium text-terracotta">Alergeny niepotwierdzone</p>
          )}
        </section>
      )}
    </main>
  );
}
