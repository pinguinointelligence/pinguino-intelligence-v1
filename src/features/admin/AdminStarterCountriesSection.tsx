import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import { cn } from '@/lib/cn';
import {
  getAdminCountryComponents,
  getAdminShopCountries,
  saveCountryComponent,
  setCountryFlag,
  type ShopCountryComponentRow,
} from '@/services/shopCountries';
import { ADMIN_TABLE, ADMIN_TD, ADMIN_TH } from './adminUi';

/**
 * STARTER PACK BY COUNTRY — the operator's work list.
 *
 * The headline is what is MISSING, not what exists. A country goes
 * customer-live for the Local pack only when every canonical component carries
 * a local product name, a supplier and a purchase URL; until then it is
 * INCOMPLETE and the Shop refuses it. So the useful question here is never
 * "which countries do we have" but "what is this country still owed", and the
 * answer is named component by component rather than as a count.
 *
 * The component list is NOT maintained here. It is derived from
 * `shop_bundle_items` — the canonical Starter Pack composition — so adding a
 * component to the pack immediately shows up as an outstanding link in every
 * country instead of silently shipping an incomplete document.
 *
 * Filling the last link flips a country live with no deploy: readiness is
 * computed by the database, not stored by this screen.
 */

const table = `${ADMIN_TABLE} min-w-[860px]`;
const field =
  'h-[34px] w-full rounded-[8px] border border-[var(--g-line-strong)] bg-white px-2 text-[12.5px]';

const FIELDS = [
  ['localProductName', 'Nazwa u dostawcy'],
  ['supplierName', 'Sklep / dostawca'],
  ['purchaseUrl', 'https://…'],
  ['packSize', 'np. 500 g'],
] as const;

type EditableKey = (typeof FIELDS)[number][0];
type Draft = Partial<Record<EditableKey, string>>;

function ComponentEditor({ iso2 }: { iso2: string }) {
  const queryClient = useQueryClient();
  const components = useQuery({
    queryKey: ['admin', 'starter-country-components', iso2],
    queryFn: () => getAdminCountryComponents(iso2),
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const save = useMutation({
    mutationFn: async (row: ShopCountryComponentRow) => {
      const draft = drafts[row.id] ?? {};
      await saveCountryComponent(row.id, {
        localProductName: draft.localProductName ?? row.localProductName,
        supplierName: draft.supplierName ?? row.supplierName,
        purchaseUrl: draft.purchaseUrl ?? row.purchaseUrl,
        packSize: draft.packSize ?? row.packSize,
        notes: row.notes,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'starter-country-components', iso2],
      });
      /* Readiness is COMPUTED, so the country row must be re-read too — that is
         what turns the last saved link into LIVE without a deploy. */
      void queryClient.invalidateQueries({ queryKey: ['admin', 'starter-countries'] });
    },
  });

  if (components.isLoading) return <ApplicationState kind="loading" title="Wczytuję składniki…" />;
  if (components.isError) {
    return <ApplicationState kind="error" title="Nie udało się wczytać składników." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className={table}>
        <thead>
          <tr>
            <th className={ADMIN_TH}>Składnik kanoniczny</th>
            <th className={ADMIN_TH}>Produkt lokalny</th>
            <th className={ADMIN_TH}>Dostawca</th>
            <th className={ADMIN_TH}>Link zakupu</th>
            <th className={ADMIN_TH}>Opakowanie</th>
            <th className={ADMIN_TH} />
          </tr>
        </thead>
        <tbody>
          {(components.data ?? []).map((row) => {
            const draft = drafts[row.id] ?? {};
            const value = (key: EditableKey) => draft[key] ?? row[key] ?? '';
            const complete =
              value('localProductName').trim() !== '' &&
              value('supplierName').trim() !== '' &&
              value('purchaseUrl').trim() !== '';
            return (
              <tr key={row.id} data-testid={`country-component-${row.sku}`}>
                <td className={`${ADMIN_TD} text-[var(--g-ink)]`}>
                  <span className="font-mono text-[11px] text-[var(--g-text-secondary)]">
                    {row.sku}
                  </span>
                  <span className="mt-0.5 block">{row.componentTitle}</span>
                  {!complete ? (
                    <span
                      className="mt-1 inline-block rounded-[5px] bg-[var(--g-orange)] px-1.5 py-0.5 text-[10px] font-bold text-white"
                      data-testid="component-missing"
                    >
                      BRAKUJE
                    </span>
                  ) : null}
                </td>
                {FIELDS.map(([key, placeholder]) => (
                  <td className={ADMIN_TD} key={key}>
                    <input
                      className={field}
                      placeholder={placeholder}
                      value={value(key)}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...prev[row.id], [key]: event.target.value },
                        }))
                      }
                      data-testid={`component-${key}-${row.sku}`}
                    />
                  </td>
                ))}
                <td className={ADMIN_TD}>
                  <button
                    type="button"
                    onClick={() => save.mutate(row)}
                    disabled={save.isPending}
                    className={applicationSecondaryClasses('text-[12px]')}
                    data-testid={`component-save-${row.sku}`}
                  >
                    Zapisz
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AdminStarterCountriesSection() {
  const queryClient = useQueryClient();
  const countries = useQuery({
    queryKey: ['admin', 'starter-countries'],
    queryFn: getAdminShopCountries,
  });
  const [open, setOpen] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (input: {
      iso2: string;
      column: 'physical_starter_pack_available' | 'local_starter_pack_available';
      value: boolean;
    }) => setCountryFlag(input.iso2, input.column, input.value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'starter-countries'] }),
  });

  if (countries.isLoading) return <ApplicationState kind="loading" title="Wczytuję kraje…" />;
  if (countries.isError) {
    return <ApplicationState kind="error" title="Nie udało się wczytać krajów." />;
  }

  const rows = countries.data ?? [];

  return (
    <section>
      <h2 className="text-[18px] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
        Zestaw Startowy — kraje
      </h2>
      <p className="mt-1 max-w-[70ch] text-[13px] text-[var(--g-text-secondary)]">
        Lokalny Zestaw Startowy staje się dostępny dla klientów dopiero wtedy, gdy każdy składnik
        kanoniczny ma nazwę produktu, dostawcę i link. Do tego czasu kraj jest NIEKOMPLETNY, a Sklep
        go nie proponuje. Uzupełnienie ostatniego linku aktywuje kraj bez wdrożenia.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className={table}>
          <thead>
            <tr>
              <th className={ADMIN_TH}>Kraj</th>
              <th className={ADMIN_TH}>Wysyłka fizyczna</th>
              <th className={ADMIN_TH}>Lokalny — zamiar</th>
              <th className={ADMIN_TH}>Kompletność</th>
              <th className={ADMIN_TH}>Brakuje</th>
              <th className={ADMIN_TH}>Status</th>
              <th className={ADMIN_TH} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.iso2} data-testid={`starter-country-${row.iso2}`}>
                <td className={`${ADMIN_TD} text-[var(--g-ink)]`}>
                  <span className="font-mono text-[11px] text-[var(--g-text-secondary)]">
                    {row.iso2}
                  </span>
                  <span className="mt-0.5 block">{row.name}</span>
                </td>
                <td className={ADMIN_TD}>
                  <input
                    type="checkbox"
                    checked={row.physicalAvailable}
                    onChange={(event) =>
                      toggle.mutate({
                        iso2: row.iso2,
                        column: 'physical_starter_pack_available',
                        value: event.target.checked,
                      })
                    }
                    data-testid={`physical-${row.iso2}`}
                  />
                </td>
                <td className={ADMIN_TD}>
                  <input
                    type="checkbox"
                    checked={row.localIntended}
                    onChange={(event) =>
                      toggle.mutate({
                        iso2: row.iso2,
                        column: 'local_starter_pack_available',
                        value: event.target.checked,
                      })
                    }
                    data-testid={`local-intent-${row.iso2}`}
                  />
                </td>
                <td className={`${ADMIN_TD} font-mono tabular-nums`}>
                  {row.componentsReady} / {row.componentsRequired}
                </td>
                <td className={ADMIN_TD}>
                  {row.missingComponents.length ? (
                    <span className="font-mono text-[11px] text-[var(--g-attention-ink)]">
                      {row.missingComponents.join(', ')}
                    </span>
                  ) : (
                    <span className="text-[12px] text-[var(--g-text-secondary)]">—</span>
                  )}
                </td>
                <td className={ADMIN_TD}>
                  <span
                    className={cn(
                      'rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold',
                      row.localLive
                        ? 'bg-[var(--g-ink)] text-white'
                        : 'bg-[var(--g-line-quiet)] text-[var(--g-lock)]',
                    )}
                    data-testid={`local-live-${row.iso2}`}
                  >
                    {row.localLive ? 'LIVE' : 'NIEKOMPLETNY'}
                  </span>
                </td>
                <td className={ADMIN_TD}>
                  <button
                    type="button"
                    onClick={() => setOpen(open === row.iso2 ? null : row.iso2)}
                    className={applicationSecondaryClasses('text-[12px]')}
                    data-testid={`open-components-${row.iso2}`}
                  >
                    {open === row.iso2 ? 'Zwiń' : 'Składniki'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="mt-5 rounded-[12px] border border-[var(--g-line)] bg-white p-4">
          <h3 className="text-[14px] font-semibold text-[var(--g-ink)]">
            {rows.find((row) => row.iso2 === open)?.name}
          </h3>
          <ComponentEditor iso2={open} />
        </div>
      ) : null}
    </section>
  );
}
