import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase/client';
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

interface ReadinessRow {
  iso2: string;
  name: string;
  active: boolean;
  physical_starter_pack_available: boolean;
  local_starter_pack_available: boolean;
  components_required: number;
  components_ready: number;
  missing_components: string[];
  mapping_complete: boolean;
  local_starter_pack_live: boolean;
}

interface ComponentRow {
  id: string;
  country_iso2: string;
  component_product_id: string;
  local_product_name: string | null;
  supplier_name: string | null;
  purchase_url: string | null;
  pack_size: string | null;
  display_price: string | null;
  notes: string | null;
  active: boolean;
  sort_order: number;
  shop_products: { sku: string; title: string } | null;
}

const readCountries = async (): Promise<ReadinessRow[]> => {
  if (!supabase) throw new Error('backend unavailable');
  const { data, error } = await supabase.from('shop_country_local_readiness').select('*');
  if (error) throw error;
  return ((data ?? []) as unknown as ReadinessRow[]).sort((a, b) => a.name.localeCompare(b.name));
};

const readComponents = async (iso2: string): Promise<ComponentRow[]> => {
  if (!supabase) throw new Error('backend unavailable');
  const { data, error } = await supabase
    .from('shop_country_components')
    .select('*,shop_products!inner(sku,title)')
    .eq('country_iso2', iso2)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ComponentRow[];
};

const field =
  'h-[34px] w-full rounded-[8px] border border-[var(--g-line-strong)] bg-white px-2 text-[12.5px]';

function ComponentEditor({ iso2 }: { iso2: string }) {
  const queryClient = useQueryClient();
  const components = useQuery({
    queryKey: ['admin', 'starter-country-components', iso2],
    queryFn: () => readComponents(iso2),
  });
  const [draft, setDraft] = useState<Record<string, Partial<ComponentRow>>>({});

  const save = useMutation({
    mutationFn: async (row: ComponentRow) => {
      if (!supabase) throw new Error('backend unavailable');
      const patch = draft[row.id] ?? {};
      const { error } = await supabase
        .from('shop_country_components')
        .update({
          local_product_name: patch.local_product_name ?? row.local_product_name,
          supplier_name: patch.supplier_name ?? row.supplier_name,
          purchase_url: patch.purchase_url ?? row.purchase_url,
          pack_size: patch.pack_size ?? row.pack_size,
          notes: patch.notes ?? row.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'starter-country-components', iso2],
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'starter-countries'] });
    },
  });

  if (components.isLoading) return <ApplicationState kind="loading" title="Wczytuję składniki…" />;
  if (components.isError) {
    return <ApplicationState kind="error" title="Nie udało się wczytać składników." />;
  }

  const rows = components.data ?? [];

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
          {rows.map((row) => {
            const patch = draft[row.id] ?? {};
            const value = <K extends keyof ComponentRow>(key: K) =>
              (patch[key] ?? row[key] ?? '') as string;
            const complete =
              Boolean((patch.local_product_name ?? row.local_product_name)?.trim()) &&
              Boolean((patch.supplier_name ?? row.supplier_name)?.trim()) &&
              Boolean((patch.purchase_url ?? row.purchase_url)?.trim());
            return (
              <tr key={row.id} data-testid={`country-component-${row.shop_products?.sku}`}>
                <td className={`${ADMIN_TD} text-[var(--g-ink)]`}>
                  <span className="font-mono text-[11px] text-[var(--g-text-secondary)]">
                    {row.shop_products?.sku}
                  </span>
                  <span className="mt-0.5 block">{row.shop_products?.title}</span>
                  {!complete ? (
                    <span
                      className="mt-1 inline-block rounded-[5px] bg-[var(--g-orange)] px-1.5 py-0.5 text-[10px] font-bold text-white"
                      data-testid="component-missing"
                    >
                      BRAKUJE
                    </span>
                  ) : null}
                </td>
                {(
                  [
                    ['local_product_name', 'Nazwa u dostawcy'],
                    ['supplier_name', 'Sklep / dostawca'],
                    ['purchase_url', 'https://…'],
                    ['pack_size', 'np. 500 g'],
                  ] as const
                ).map(([key, placeholder]) => (
                  <td className={ADMIN_TD} key={key}>
                    <input
                      className={field}
                      placeholder={placeholder}
                      value={value(key)}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          [row.id]: { ...prev[row.id], [key]: event.target.value },
                        }))
                      }
                      data-testid={`component-${key}-${row.shop_products?.sku}`}
                    />
                  </td>
                ))}
                <td className={ADMIN_TD}>
                  <button
                    type="button"
                    onClick={() => save.mutate(row)}
                    disabled={save.isPending}
                    className={applicationSecondaryClasses('text-[12px]')}
                    data-testid={`component-save-${row.shop_products?.sku}`}
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
    queryFn: readCountries,
  });
  const [open, setOpen] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: async (input: { iso2: string; column: string; value: boolean }) => {
      if (!supabase) throw new Error('backend unavailable');
      const { error } = await supabase
        .from('shop_countries')
        .update({ [input.column]: input.value, updated_at: new Date().toISOString() })
        .eq('iso2', input.iso2);
      if (error) throw error;
    },
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
                    checked={row.physical_starter_pack_available}
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
                    checked={row.local_starter_pack_available}
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
                  {row.components_ready} / {row.components_required}
                </td>
                <td className={ADMIN_TD}>
                  {row.missing_components?.length ? (
                    <span className="font-mono text-[11px] text-[var(--g-attention-ink)]">
                      {row.missing_components.join(', ')}
                    </span>
                  ) : (
                    <span className="text-[12px] text-[var(--g-text-secondary)]">—</span>
                  )}
                </td>
                <td className={ADMIN_TD}>
                  <span
                    className={cn(
                      'rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold',
                      row.local_starter_pack_live
                        ? 'bg-[var(--g-ink)] text-white'
                        : 'bg-[var(--g-line-quiet)] text-[var(--g-lock)]',
                    )}
                    data-testid={`local-live-${row.iso2}`}
                  >
                    {row.local_starter_pack_live ? 'LIVE' : 'NIEKOMPLETNY'}
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
