import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { customerErrorMessage } from '@/copy/customerError';
import {
  adminCatalogAction,
  getAdminCatalog,
  getAdminCountryOverview,
  type AdminCatalogProduct,
} from '@/services/adminControl';

const inputClass = 'pro-focus-ring min-h-11 w-full border border-ink/15 bg-white px-3 text-sm';

export function AdminCatalogSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [selected, setSelected] = useState<AdminCatalogProduct | null>(null);
  const [market, setMarket] = useState('PL');
  const [reason, setReason] = useState('Controlled catalog administration');
  const [mergeTarget, setMergeTarget] = useState('');
  const catalog = useQuery({
    queryKey: ['admin-catalog', submittedSearch],
    queryFn: () => getAdminCatalog(submittedSearch),
  });
  const countries = useQuery({
    queryKey: ['admin-country-overview'],
    queryFn: getAdminCountryOverview,
  });
  const action = useMutation({
    mutationFn: (
      kind: 'ADD_MARKET' | 'REMOVE_MARKET' | 'PUBLISH' | 'UNPUBLISH' | 'RETIRE' | 'MERGE_DUPLICATE',
    ) => {
      if (!selected) throw new Error('Wybierz produkt.');
      return adminCatalogAction(selected.id, kind, {
        market,
        reason,
        targetProductId: mergeTarget || undefined,
      });
    },
    onSuccess: async () => {
      setSelected(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-country-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-directory', 'AUDIT'] }),
      ]);
    },
  });
  return (
    <>
      <header className="border-b border-ink/10 pb-6">
        <SectionLabel>Katalog główny</SectionLabel>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">
          Katalog i kraje
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Dane źródłowe są tylko do odczytu. Produkty zachowują historię wersji, sposób użycia,
          pochodzenie danych oraz rejestr zmian.
        </p>
      </header>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedSearch(search.trim());
        }}
      >
        <input
          className={inputClass}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Nazwa, marka, EAN lub identyfikator"
          aria-label="Szukaj katalogu"
        />
        <Button type="submit">Szukaj</Button>
      </form>
      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead>
              <tr className="border-y border-ink/15 bg-stone-50">
                {['Artykuł', 'Produkt', 'EAN', 'Status', 'Behavior', 'Rynki', ''].map((label) => (
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
              {(catalog.data ?? []).map((product) => (
                <tr key={product.id} className="border-b border-ink/10">
                  <td className="px-3 py-4">
                    <span className="font-mono text-ink">{product.articleId}</span>
                    <span className="mt-1 block text-[10px] text-stone-400">{product.origin}</span>
                  </td>
                  <td className="px-3 py-4">
                    <strong className="text-ink">{product.name ?? '—'}</strong>
                    <span className="mt-1 block text-stone-500">
                      {product.brand ?? 'bez marki'}
                    </span>
                  </td>
                  <td className="px-3 py-4 font-mono">{product.ean ?? '—'}</td>
                  <td className="px-3 py-4">
                    {product.active ? 'PUBLISHED' : 'UNPUBLISHED'}
                    <span className="mt-1 block text-stone-500">{product.verificationStatus}</span>
                  </td>
                  <td className="px-3 py-4">
                    {String(product.behavior?.mainEligibility ?? 'MISSING')}
                    <span className="mt-1 block text-stone-500">
                      {String(product.behavior?.bindingStatus ?? '—')}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    {product.variants
                      .flatMap((variant) => (Array.isArray(variant.markets) ? variant.markets : []))
                      .join(', ') || '—'}
                  </td>
                  <td className="px-3 py-4">
                    <button
                      type="button"
                      onClick={() => setSelected(product)}
                      className="pro-focus-ring min-h-10 border border-ink/15 px-3 font-semibold"
                    >
                      Sprawdź
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {catalog.isError ? (
            <p className="mt-4 border border-red-300 bg-red-50 p-3 text-xs text-red-800">
              {customerErrorMessage(catalog.error, 'admin')}
            </p>
          ) : null}
        </div>
        <aside className="border border-ink/12 bg-[#f3ede3] p-5">
          <SectionLabel>Operacje na produkcie</SectionLabel>
          {selected ? (
            <div className="mt-4 space-y-4">
              <div>
                <strong className="text-sm text-ink">
                  {selected.articleId} · {selected.name}
                </strong>
                <p className="mt-1 break-all font-mono text-[10px] text-stone-500">{selected.id}</p>
              </div>
              {selected.origin === 'PI' ? (
                <p className="border border-amber-300 bg-amber-50 p-3 text-xs">
                  Dane źródłowe są chronione i w tym panelu pozostają tylko do odczytu.
                </p>
              ) : (
                <>
                  <label className="block text-xs font-semibold">
                    Powód
                    <input
                      className={`${inputClass} mt-2`}
                      value={reason}
                      onChange={(event) => setReason(event.currentTarget.value)}
                    />
                  </label>
                  <label className="block text-xs font-semibold">
                    Rynek ISO
                    <select
                      className={`${inputClass} mt-2`}
                      value={market}
                      onChange={(event) => setMarket(event.currentTarget.value)}
                    >
                      {(countries.data ?? []).map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.code} · {country.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="ghost" onClick={() => action.mutate('ADD_MARKET')}>
                      Dodaj rynek
                    </Button>
                    <Button variant="ghost" onClick={() => action.mutate('REMOVE_MARKET')}>
                      Usuń rynek
                    </Button>
                    <Button onClick={() => action.mutate('PUBLISH')}>Opublikuj</Button>
                    <Button variant="ghost" onClick={() => action.mutate('UNPUBLISH')}>
                      Wycofaj publikację
                    </Button>
                  </div>
                  <label className="block text-xs font-semibold">
                    Dokładny identyfikator produktu docelowego
                    <input
                      className={`${inputClass} mt-2 font-mono`}
                      value={mergeTarget}
                      onChange={(event) => setMergeTarget(event.currentTarget.value)}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => action.mutate('MERGE_DUPLICATE')}
                  >
                    Połącz dokładny duplikat
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full border-red-300 text-red-800"
                    onClick={() => action.mutate('RETIRE')}
                  >
                    Wycofaj z katalogu
                  </Button>
                </>
              )}
              <details className="border-t border-ink/10 pt-4">
                <summary className="cursor-pointer text-xs font-semibold">
                  Wersja / pochodzenie
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto bg-white p-3 text-[10px]">
                  {JSON.stringify(
                    {
                      currentVersion: selected.currentVersion,
                      behavior: selected.behavior,
                      contributorRequests: selected.contributorRequests,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {action.isError ? (
                <p className="border border-red-300 bg-red-50 p-3 text-xs text-red-800">
                  {customerErrorMessage(action.error, 'admin')}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">
              Wybierz artykuł. Mutacje zawsze wymagają powodu i uprawnienia CATALOG.
            </p>
          )}
        </aside>
      </div>
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-ink">Przegląd krajów</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-xs">
            <thead>
              <tr className="border-y border-ink/15 bg-stone-50">
                {[
                  'Kraj',
                  'Zatwierdzone',
                  'Oczekujące',
                  'Do sprawdzenia',
                  'Tylko topping',
                  'Gotowe do bazy',
                  'Ostatnia zmiana',
                ].map((label) => (
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
              {(countries.data ?? []).map((country) => (
                <tr key={country.code} className="border-b border-ink/10">
                  <td className="px-3 py-4">
                    <strong>{country.code}</strong> · {country.name}
                  </td>
                  <td className="px-3 py-4 tabular-nums">{country.totalApprovedProducts}</td>
                  <td className="px-3 py-4 tabular-nums">{country.pendingRequests}</td>
                  <td className="px-3 py-4 tabular-nums">{country.reviewQueue}</td>
                  <td className="px-3 py-4 tabular-nums">{country.toppingOnly}</td>
                  <td className="px-3 py-4 tabular-nums">{country.baseReady}</td>
                  <td className="px-3 py-4">
                    {country.lastUpdated
                      ? new Date(country.lastUpdated).toLocaleString('pl-PL')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
