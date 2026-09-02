import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { EmptyState } from '@/components/shared/EmptyState';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { customerErrorMessage } from '@/copy/customerError';
import {
  getAdminShopOrders,
  getAdminShopProducts,
  setShopOrderFulfillment,
  syncShopOrder,
  upsertAdminShopProduct,
  type AdminShopProduct,
  type ShopAvailability,
  type ShopFulfillmentStatus,
} from '@/services/shop';
import { shopCopy, shopMoney } from '@/copy/shop';
import { AdminShopOrderCard } from './AdminShopOrderCard';
import { shopOrderQueue, shopOrderQueueCounts, type ShopOrderQueue } from './shopOrderQueue';

const field = 'pro-focus-ring min-h-11 w-full border border-[var(--g-line)] bg-white px-3 text-sm';
const th = 'border-b border-[var(--g-line)] px-3 py-2.5 text-left font-semibold text-[var(--g-text-secondary)]';
const td = 'border-b border-[var(--g-line-quiet)] px-3 py-3 align-top text-[var(--g-ink)]';

const AVAILABILITY: readonly ShopAvailability[] = ['in_stock', 'preorder', 'out_of_stock'];
const AVAILABILITY_LABEL: Readonly<Record<ShopAvailability, string>> = {
  in_stock: 'Dostępny',
  preorder: 'Na zamówienie',
  out_of_stock: 'Niedostępny',
};

/** The bench, in the order somebody actually works it. */
const QUEUES: ReadonlyArray<{ key: ShopOrderQueue | 'all'; label: string }> = [
  { key: 'toShip', label: shopCopy.admin.queueToShip },
  { key: 'waiting', label: shopCopy.admin.queueWaiting },
  { key: 'unpaid', label: shopCopy.admin.queueUnpaid },
  { key: 'shipped', label: shopCopy.admin.queueShipped },
  { key: 'all', label: shopCopy.admin.filterAll },
];

function ProductRow({
  product,
  onSave,
  pending,
}: {
  product: AdminShopProduct;
  onSave: (patch: Partial<AdminShopProduct>) => void;
  pending: boolean;
}) {
  const [price, setPrice] = useState(String(product.price_cents / 100));
  const [availability, setAvailability] = useState<ShopAvailability>(product.availability);
  const [leadTime, setLeadTime] = useState(String(product.lead_time_weeks ?? ''));
  const [active, setActive] = useState(product.active);
  const dirty =
    Math.round(Number(price) * 100) !== product.price_cents ||
    availability !== product.availability ||
    (Number(leadTime) || null) !== product.lead_time_weeks ||
    active !== product.active;

  return (
    <tr>
      <td className={td}>
        <strong className="block text-ink">{product.title}</strong>
        <span className="font-mono text-[11px] text-[var(--g-text-secondary)]">{product.sku}</span>
        {product.canonical_ingredient_id ? (
          <span className="mt-0.5 block font-mono text-[11px] text-[var(--g-text-secondary)]">
            {product.canonical_ingredient_id}
          </span>
        ) : null}
      </td>
      <td className={td}>{product.pack_size_g ? `${product.pack_size_g} g` : 'zestaw'}</td>
      <td className={td}>
        <input
          className={`${field} w-24`}
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.currentTarget.value)}
        />
        <span className="mt-1 block text-[11px] text-[var(--g-text-secondary)]">
          {shopMoney(product.price_cents, product.currency)}
        </span>
      </td>
      <td className={td}>
        <select
          className={`${field} w-40`}
          value={availability}
          onChange={(event) => setAvailability(event.currentTarget.value as ShopAvailability)}
        >
          {AVAILABILITY.map((value) => (
            <option key={value} value={value}>
              {AVAILABILITY_LABEL[value]}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <input
          className={`${field} w-24`}
          inputMode="numeric"
          placeholder="tyg."
          value={leadTime}
          onChange={(event) => setLeadTime(event.currentTarget.value)}
          disabled={availability !== 'preorder'}
        />
      </td>
      <td className={td}>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.currentTarget.checked)}
          />
          Widoczny
        </label>
      </td>
      <td className={td}>
        <Button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            onSave({
              price_cents: Math.round(Number(price) * 100),
              availability,
              lead_time_weeks: availability === 'preorder' ? Number(leadTime) || null : null,
              active,
            })
          }
        >
          Zapisz
        </Button>
      </td>
    </tr>
  );
}

/** Admin commerce: articles, prices, availability, preorder lead time, and the
 *  order queue with its real payment status from the provider. */
export function AdminShopSection() {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ['admin-shop-products'], queryFn: getAdminShopProducts });
  const orders = useQuery({ queryKey: ['admin-shop-orders'], queryFn: getAdminShopOrders });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-shop-products'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-shop-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['shop-catalog'] }),
    ]);

  const save = useMutation({
    mutationFn: (input: { product: AdminShopProduct; patch: Partial<AdminShopProduct> }) =>
      upsertAdminShopProduct({
        id: input.product.id,
        sku: input.product.sku,
        slug: input.product.slug,
        kind: input.product.kind,
        title: input.product.title,
        description: input.product.description,
        canonicalIngredientId: input.product.canonical_ingredient_id,
        packSizeG: input.product.pack_size_g,
        priceCents: input.patch.price_cents ?? input.product.price_cents,
        currency: input.product.currency,
        imageUrl: input.product.image_url,
        availability: input.patch.availability ?? input.product.availability,
        leadTimeWeeks:
          input.patch.lead_time_weeks === undefined
            ? input.product.lead_time_weeks
            : input.patch.lead_time_weeks,
        active: input.patch.active ?? input.product.active,
        sortOrder: input.product.sort_order,
      }),
    onSuccess: refresh,
  });

  const fulfil = useMutation({
    mutationFn: (input: {
      orderId: string;
      fulfillmentStatus: ShopFulfillmentStatus;
      trackingCarrier?: string | null;
      trackingNumber?: string | null;
    }) => setShopOrderFulfillment(input),
    onSuccess: refresh,
  });

  const sync = useMutation({
    mutationFn: (orderId: string) => syncShopOrder(orderId),
    onSuccess: refresh,
  });

  const [queue, setQueue] = useState<ShopOrderQueue | 'all'>('toShip');
  const allOrders = useMemo(() => orders.data ?? [], [orders.data]);
  const counts = useMemo(() => shopOrderQueueCounts(allOrders), [allOrders]);
  const visible = useMemo(
    () => (queue === 'all' ? allOrders : allOrders.filter((o) => shopOrderQueue(o) === queue)),
    [allOrders, queue],
  );

  return (
    <>
      <header className="border-b border-[var(--g-line)] pb-6">
        <SectionLabel>Sprzedaż</SectionLabel>
        <h1 className="mt-2 text-[25px] leading-[1.08] font-[750] tracking-[-0.04em] text-[var(--g-ink)] sm:text-[30px]">Sklep</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--g-text-secondary)]">
          Artykuły odsyłają do istniejących produktów kanonicznych — sklep nigdy nie tworzy
          duplikatu składnika. Cena, dostępność i termin realizacji są edytowalne tutaj.
        </p>
      </header>

      {save.isError ? (
        <p className="mt-4 text-sm text-status-error">{customerErrorMessage(save.error, 'admin')}</p>
      ) : null}

      <section className="mt-7">
        <SectionLabel>{shopCopy.admin.articlesTitle}</SectionLabel>
        {products.isLoading ? <ApplicationState kind="loading" title="Wczytuję artykuły…" /> : null}
        {products.isError ? (
          <ApplicationState kind="error" title="Nie udało się wczytać artykułów." />
        ) : null}
        {products.data ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className={th}>Artykuł</th>
                  <th className={th}>Opakowanie</th>
                  <th className={th}>Cena (EUR)</th>
                  <th className={th}>Dostępność</th>
                  <th className={th}>Termin</th>
                  <th className={th}>Widoczność</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {products.data.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    pending={save.isPending}
                    onSave={(patch) => save.mutate({ product, patch })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <SectionLabel>{shopCopy.admin.ordersTitle}</SectionLabel>
        {orders.isLoading ? (
          <ApplicationState kind="loading" title="Wczytuję zamówienia…" />
        ) : null}
        {orders.isError ? (
          <ApplicationState kind="error" title="Nie udało się wczytać zamówień." />
        ) : null}

        {/* The bench, not a list. What has to go out today is the default view;
            everything else is one click away. The counts come from the two
            status columns the shop already keeps — nothing is stored twice. */}
        {orders.data ? (
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="tablist"
            aria-label={shopCopy.admin.ordersTitle}
          >
            {QUEUES.map(({ key, label }) => {
              const count = key === 'all' ? allOrders.length : counts[key];
              const selected = queue === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setQueue(key)}
                  data-testid={`admin-orders-queue-${key}`}
                  className={cn(
                    'pro-focus-ring inline-flex min-h-9 items-center gap-2 border px-3 text-xs transition-colors',
                    selected
                      ? 'border-[var(--g-ink)] bg-[var(--g-ink)] text-white'
                      : 'border-[var(--g-line)] bg-white text-[var(--g-text-secondary)] hover:border-[var(--g-line-strong)]',
                  )}
                >
                  {label}
                  <span className="font-mono text-[11px] tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {orders.data && visible.length === 0 ? (
          <EmptyState title="Brak zamówień w tym widoku." />
        ) : null}
        <div className="mt-4 grid gap-3">
          {visible.map((order) => (
            <AdminShopOrderCard
              key={order.id}
              order={order}
              pending={fulfil.isPending || sync.isPending}
              onSync={() => sync.mutate(order.id)}
              onFulfil={(input) => fulfil.mutate({ orderId: order.id, ...input })}
            />
          ))}
        </div>
      </section>
    </>
  );
}
