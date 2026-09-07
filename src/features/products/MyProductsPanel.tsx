/**
 * Produkty → „Moje produkty" — every product this account owns, ready and not.
 *
 * Readiness is displayed exactly as it was SAVED; nothing here re-derives it, and nothing here
 * prints a status key, a module name or an identifier.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { fetchMyProducts, type MyProduct } from '@/services/myProducts';

export function MyProductsPanel() {
  const [rows, setRows] = useState<MyProduct[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await fetchMyProducts();
      if (!live) return;
      // `null` is "we could not ask", which is not the same as "you have none"
      if (result === null) setFailed(true);
      else setRows(result);
    })();
    return () => {
      live = false;
    };
  }, []);

  if (failed)
    return (
      <p className="text-sm text-stone-600" data-testid="my-products-unavailable">
        Nie udało się teraz wczytać Twoich produktów. Spróbuj ponownie za chwilę.
      </p>
    );
  if (rows === null)
    return (
      <p className="text-sm text-stone-600" data-testid="my-products-loading">
        Wczytuję Twoje produkty…
      </p>
    );
  if (rows.length === 0)
    return (
      <p className="text-sm text-stone-600" data-testid="my-products-empty">
        Nie masz jeszcze własnych produktów. Zeskanuj produkt, aby dodać pierwszy.
      </p>
    );

  return (
    <ul className="space-y-3" data-testid="my-products-list">
      {rows.map((row) => (
        <li
          key={row.productId}
          className="rounded-[var(--radius-pro-studio)] border border-ink/10 bg-white p-4"
        >
          <p className="text-sm font-semibold text-ink">{row.name ?? 'Produkt bez nazwy'}</p>
          {row.brand ? <p className="text-xs text-stone-600">{row.brand}</p> : null}
          <p className="mt-1 text-xs text-stone-600">
            {row.ready ? 'Gotowy do receptury' : 'Czeka na uzupełnienie danych'}
          </p>
          {row.ready ? null : (
            <Link
              to={`/products/scan?from=mine${row.ean ? `&code=${encodeURIComponent(row.ean)}` : ''}`}
              className={`${buttonClasses('ghost', 'sm')} mt-3`}
            >
              Uzupełnij dane
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
