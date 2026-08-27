import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import {
  canonicalizeAdminCustomerAddedProduct,
  listAdminCustomerAddedProducts,
  type AdminCustomerAddedProduct,
} from '@/services/adminControl';
import { customerErrorMessage } from '@/copy/customerError';

export function AdminCustomerAddedProductsSection() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AdminCustomerAddedProduct | null>(null);
  const query = useQuery({
    queryKey: ['admin-customer-added-products'],
    queryFn: listAdminCustomerAddedProducts,
  });
  const canonicalize = useMutation({
    mutationFn: (pendingId: string) => canonicalizeAdminCustomerAddedProduct(pendingId),
    onSuccess: async () => {
      setSelected(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-customer-added-products'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-directory', 'AUDIT'] }),
      ]);
    },
  });

  return (
    <>
      <header className="border-b border-ink/10 pb-6">
        <SectionLabel>Produkty klientów z kodem EAN</SectionLabel>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">
          Produkty dodane przez klientów
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Jeden EAN to jeden produkt oczekujący. Kolejność wynika z liczby różnych kont klientów,
          nie liczby skanów.
        </p>
      </header>
      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-y border-ink/15 bg-stone-50">
                {['Klienci', 'EAN', 'Produkt', 'Pewność', 'Ostatnio', ''].map((label) => (
                  <th
                    key={label}
                    className="px-3 py-3 text-[10px] uppercase tracking-[0.1em] text-stone-500"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(query.data ?? []).map((product) => (
                <tr key={product.id} className="border-b border-ink/10">
                  <td className="px-3 py-4 font-mono text-xl font-semibold text-ink">
                    {product.distinctCustomerCount}
                  </td>
                  <td className="px-3 py-4 font-mono">{product.ean}</td>
                  <td className="px-3 py-4">
                    <strong>{product.name}</strong>
                    <span className="mt-1 block text-stone-500">
                      {product.brand ?? 'bez marki'} · {product.productCode}
                    </span>
                  </td>
                  <td className="px-3 py-4 tabular-nums">{product.productAccuracy}%</td>
                  <td className="px-3 py-4">
                    {new Date(product.lastSeenAt).toLocaleString('pl-PL')}
                  </td>
                  <td className="px-3 py-4">
                    <button
                      type="button"
                      className="min-h-10 border border-ink/15 px-3 font-semibold"
                      onClick={() => setSelected(product)}
                    >
                      Zweryfikuj
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.isError && (
            <p
              role="alert"
              className="mt-4 border border-red-300 bg-red-50 p-3 text-xs text-red-800"
            >
              Nie udało się odczytać kolejki.
            </p>
          )}
        </div>
        <aside className="border border-ink/12 bg-[#f3ede3] p-5">
          <SectionLabel>Weryfikacja produktu</SectionLabel>
          {selected ? (
            <div className="mt-4 space-y-4">
              <div>
                <strong className="text-sm text-ink">{selected.name}</strong>
                <p className="mt-1 font-mono text-xs">EAN {selected.ean}</p>
                <p className="mt-1 text-xs text-stone-600">
                  {selected.distinctCustomerCount} różnych klientów · {selected.productAccuracy}%
                </p>
              </div>
              <p className="border border-ink/15 bg-white p-3 text-xs leading-5 text-stone-600">
                Ta akcja potwierdza dokładny kod EAN i tworzy jeden główny wpis produktu. Relacje
                klientów, ich ceny i receptury pozostaną na tym samym produkcie.
              </p>
              <details className="border-t border-ink/10 pt-4">
                <summary className="cursor-pointer text-xs font-semibold">
                  Profil i sposób użycia
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto bg-white p-3 text-[10px]">
                  {JSON.stringify(
                    { profile: selected.profile, behavior: selected.behavior },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <Button
                className="w-full"
                disabled={canonicalize.isPending}
                onClick={() => canonicalize.mutate(selected.id)}
              >
                Potwierdź produkt
              </Button>
              {canonicalize.isError && (
                <p
                  role="alert"
                  className="border border-red-300 bg-red-50 p-3 text-xs text-red-800"
                >
                  {customerErrorMessage(canonicalize.error, 'admin')}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">Wybierz produkt z kolejki.</p>
          )}
        </aside>
      </div>
    </>
  );
}
