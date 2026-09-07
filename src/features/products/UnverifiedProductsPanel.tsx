/**
 * Produkty → Niezweryfikowane (owner contract 2026-09-07).
 *
 * A private product the pipeline could not make production-ready after the FULL rescue is not
 * thrown away and is not silently "saved": it is listed here with what is missing in plain words,
 * and „Uzupełnij dane" re-enters THE SAME completion form the scanner already uses — by handing the
 * scanner the saved code, so there is one form and one authority, not a second editor.
 *
 * Nothing here renders a module name, a raw status or an identifier: the RPC returns customer
 * language, and anything it does not recognise is shown as a neutral sentence rather than a code.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { fetchMyUnverifiedProducts, type UnverifiedProduct } from '@/services/unverifiedProducts';

/**
 * The pipeline names a missing fact with its own key. The customer reads a thing, not a key — and
 * an unknown key becomes a neutral phrase rather than leaking the key itself.
 */
const MISSING_LABEL: Record<string, string> = {
  ingredientsText: 'skład z etykiety',
  allergensText: 'alergeny z etykiety',
  product_identity: 'nazwa produktu',
  brand_or_unbranded: 'marka',
  nutrition_basis: 'podstawa wartości odżywczych (100 g lub 100 ml)',
  nutrition_energyKcal: 'kalorie',
  nutrition_fat: 'tłuszcz',
  nutrition_carbohydrate: 'węglowodany',
  nutrition_sugars: 'cukry',
  nutrition_protein: 'białko',
  nutrition_salt: 'sól',
  netQuantity: 'zawartość opakowania',
};

export function missingInPlainWords(missing: readonly string[]): string[] {
  const words = missing
    .map((key) => MISSING_LABEL[key])
    .filter((label): label is string => typeof label === 'string');
  return [...new Set(words)];
}

export function UnverifiedProductsPanel() {
  const [rows, setRows] = useState<UnverifiedProduct[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const rows = await fetchMyUnverifiedProducts();
      if (!live) return;
      // `null` is "we could not ask", which is not the same as "you have none"
      if (rows === null) setFailed(true);
      else setRows(rows);
    })();
    return () => {
      live = false;
    };
  }, []);

  if (failed)
    return (
      <p className="text-sm text-stone-700" data-testid="unverified-error">
        Nie możemy teraz wczytać Twoich produktów. Spróbuj ponownie za chwilę.
      </p>
    );
  if (rows === null)
    return (
      <p className="text-sm text-stone-600" data-testid="unverified-loading">
        Wczytuję…
      </p>
    );
  if (rows.length === 0)
    return (
      <p className="text-sm text-stone-700" data-testid="unverified-empty">
        Nie masz niezweryfikowanych produktów. Wszystko, co zapisałeś, jest gotowe do użycia.
      </p>
    );

  return (
    <ul className="space-y-3" data-testid="unverified-list">
      {rows.map((row) => {
        const missing = missingInPlainWords(row.missing ?? []);
        return (
          <li
            key={row.productId}
            className="rounded-2xl border border-stone-200 p-4"
            data-testid="unverified-row"
          >
            <p className="text-sm font-semibold text-stone-900">
              {row.name ?? 'Produkt bez nazwy'}
              {row.brand ? (
                <span className="font-normal text-stone-600"> · {row.brand}</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-stone-600">
              {missing.length > 0
                ? `Brakuje: ${missing.join(', ')}.`
                : 'Brakuje jeszcze danych z etykiety.'}
            </p>
            {row.ean ? (
              <Link
                to={`/products/scan?code=${encodeURIComponent(row.ean)}`}
                className={`${buttonClasses('primary', 'sm')} mt-3 inline-flex`}
                data-testid="unverified-complete"
              >
                Uzupełnij dane
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
