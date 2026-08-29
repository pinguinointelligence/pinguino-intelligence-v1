import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
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
import { shopFulfillmentLabelPl, shopMoney, shopOrderStatusLabelPl } from '@/copy/shop';

const field = 'pro-focus-ring min-h-11 w-full border border-ink/15 bg-white px-3 text-sm';
const th = 'border-b border-ink/15 px-3 py-2.5 text-left font-semibold text-stone-500';
const td = 'border-b border-ink/8 px-3 py-3 align-top text-stone-700';

const AVAILABILITY: readonly ShopAvailability[] = ['in_stock', 'preorder', 'out_of_stock'];
const AVAILABILITY_LABEL: Readonly<Record<ShopAvailability, string>> = {
  in_stock: 'Dostępny',
  preorder: 'Na zamówienie',
  out_of_stock: 'Niedostępny',
};
const FULFILLMENT: readonly ShopFulfillmentStatus[] = [
  'awaiting',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
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
        <span className="font-mono text-[11px] text-stone-500">{product.sku}</span>
        {product.canonical_ingredient_id ? (
          <span className="mt-0.5 block font-mono text-[11px] text-stone-500">
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
        <span className="mt-1 block text-[11px] text-stone-500">
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
 *  order queue with its real Stripe payment status. */
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
    mutationFn: (input: { orderId: string; fulfillmentStatus: ShopFulfillmentStatus }) =>
      setShopOrderFulfillment(input),
    onSuccess: refresh,
  });

  const sync = useMutation({
    mutationFn: (orderId: string) => syncShopOrder(orderId),
    onSuccess: refresh,
  });

  return (
    <>
      <header className="border-b border-ink/10 pb-6">
        <SectionLabel>Sprzedaż</SectionLabel>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">Sklep</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Artykuły odsyłają do istniejących produktów kanonicznych — sklep nigdy nie tworzy
          duplikatu składnika. Cena, dostępność i termin realizacji są edytowalne tutaj.
        </p>
      </header>

      {save.isError ? (
        <p className="mt-4 text-sm text-[#b3261e]">{customerErrorMessage(save.error, 'admin')}</p>
      ) : null}

      <section className="mt-7">
        <SectionLabel>Artykuły</SectionLabel>
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
        <SectionLabel>Zamówienia</SectionLabel>
        {orders.isLoading ? (
          <ApplicationState kind="loading" title="Wczytuję zamówienia…" />
        ) : null}
        {orders.data && orders.data.length === 0 ? (
          <EmptyState title="Brak zamówień." />
        ) : null}
        <div className="mt-4 grid gap-3">
          {(orders.data ?? []).map((order) => (
            <article key={order.id} className="border border-ink/10 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-ink">{order.orderNumber}</p>
                  <p className="mt-1 text-xs text-stone-500">{order.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="border border-ink/15 px-2 py-1 text-[11px] tracking-[0.08em] text-stone-600 uppercase">
                    {shopOrderStatusLabelPl(order.status)}
                  </span>
                  {order.containsPreorder ? (
                    <span className="border border-[#ef8708]/45 bg-[#ef8708]/10 px-2 py-1 text-[11px] tracking-[0.08em] text-[#8a4d00] uppercase">
                      Na zamówienie · {order.leadTimeWeeks ?? '?'} tyg.
                    </span>
                  ) : null}
                  <span className="border border-ink/15 px-2 py-1 text-[11px] tracking-[0.08em] text-stone-600 uppercase">
                    {shopFulfillmentLabelPl(order.fulfillmentStatus)}
                  </span>
                </div>
              </div>

              <ul className="mt-4 divide-y divide-ink/10 text-sm">
                {order.items.map((item) => (
                  <li key={item.sku} className="flex justify-between gap-3 py-2">
                    <span className="text-stone-700">
                      {item.title} × {item.quantity}
                    </span>
                    <span className="font-mono text-stone-600">
                      {shopMoney(item.unitPriceCents * item.quantity, order.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-stone-500">Wartość</dt>
                  <dd className="font-mono text-sm text-ink">
                    {shopMoney(order.totalCents, order.currency)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-stone-500">Stripe session</dt>
                  <dd className="truncate font-mono text-[11px] text-stone-600">
                    {order.stripeCheckoutSessionId ?? '—'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-stone-500">Payment intent</dt>
                  <dd className="truncate font-mono text-[11px] text-stone-600">
                    {order.stripePaymentIntentId ?? '—'}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={sync.isPending}
                  onClick={() => sync.mutate(order.id)}
                >
                  Sync ze Stripe
                </Button>
                {FULFILLMENT.filter((status) => status !== order.fulfillmentStatus).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    variant="ghost"
                    disabled={fulfil.isPending}
                    onClick={() => fulfil.mutate({ orderId: order.id, fulfillmentStatus: status })}
                  >
                    {shopFulfillmentLabelPl(status)}
                  </Button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
