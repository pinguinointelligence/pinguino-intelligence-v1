import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import { getMyShopOrders, syncShopOrder, type ShopOrder } from '@/services/shop';
import {
  shopCopy as c,
  shopFulfillmentLabelPl,
  shopGrams,
  shopMoney,
  shopOrderStatusLabelPl,
} from '@/copy/shop';
import { shopContentTitle } from './shopContentTitle';

/**
 * The customer's own orders — the same facts Admin works from, minus the
 * provider references.
 *
 * Somebody who has paid should be able to answer, without writing to anyone:
 * what did I buy, what did it cost, where is it going, has it shipped, and
 * under what number. The row carries all five.
 */

const label = 'text-[10px] font-bold tracking-[0.1em] text-[var(--g-text-secondary)] uppercase';

const chip =
  'border border-[var(--g-line)] px-2 py-1 text-[11px] tracking-[0.08em] text-[var(--g-text-secondary)] uppercase';

function OrderRow({
  order,
  onSync,
  syncing,
}: {
  order: ShopOrder;
  onSync: () => void;
  syncing: boolean;
}) {
  const address = [
    order.shipping.name,
    order.shipping.line1,
    order.shipping.line2,
    [order.shipping.postalCode, order.shipping.city].filter(Boolean).join(' ') || null,
    order.shipping.country,
  ].filter((line): line is string => Boolean(line && line.trim()));

  return (
    <article
      className="rounded-[12px] border border-[var(--g-line)] bg-white p-5"
      data-testid={`order-${order.orderNumber}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={label}>{c.orders.number}</p>
          <p className="mt-1 font-mono text-sm text-ink">{order.orderNumber}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={chip}>{shopOrderStatusLabelPl(order.status)}</span>
          <span className={chip}>{shopFulfillmentLabelPl(order.fulfillmentStatus)}</span>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-[var(--g-line)] text-sm">
        {order.items.map((item) => (
          <li key={item.sku} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <span className="min-w-0 text-ink">
              {shopContentTitle(item.title)}
              {item.packSizeG ? (
                <span className="text-[var(--g-text-secondary)]">
                  {' '}
                  · {shopGrams(item.packSizeG)}
                </span>
              ) : null}
              {item.quantity > 1 ? ` × ${item.quantity}` : ''}
              {item.isPreorder && order.leadTimeWeeks ? (
                <span className="ml-2 text-xs text-[var(--g-attention-ink)]">
                  {c.orders.preorderLine.replace('{weeks}', String(order.leadTimeWeeks))}
                </span>
              ) : null}
            </span>
            <span className="font-mono text-sm text-[var(--g-text-secondary)] tabular-nums">
              {shopMoney(item.unitPriceCents * item.quantity, order.currency)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid gap-4 border-t border-[var(--g-line)] pt-4 sm:grid-cols-3">
        <div>
          <dt className={label}>{c.orders.placed}</dt>
          <dd className="mt-1 font-mono text-xs text-[var(--g-text-secondary)]">
            {order.created_at.slice(0, 16).replace('T', ' ')}
          </dd>
          <dt className={`${label} mt-3`}>{c.orders.total}</dt>
          <dd className="mt-1 font-mono text-sm text-ink tabular-nums">
            {shopMoney(order.totalCents, order.currency)}
          </dd>
          {order.shippingCents > 0 ? (
            <dd className="mt-0.5 font-mono text-[11px] text-[var(--g-text-secondary)]">
              {c.orders.shippingCost} {shopMoney(order.shippingCents, order.currency)}
            </dd>
          ) : null}
        </div>
        {address.length > 0 ? (
          <div>
            <dt className={label}>{c.orders.shipTo}</dt>
            <dd className="mt-1 text-[13px] leading-[1.55] text-[var(--g-ink)]">
              {address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {order.tracking.number ? (
          <div>
            <dt className={label}>{c.orders.tracking}</dt>
            <dd className="mt-1 font-mono text-[12px] break-all text-[var(--g-ink)]">
              {[order.tracking.carrier, order.tracking.number].filter(Boolean).join(' · ')}
            </dd>
          </div>
        ) : null}
      </dl>

      {order.status === 'pending' ? (
        <div className="mt-4 border-t border-[var(--g-line)] pt-4">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className={applicationSecondaryClasses(
              'disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)]',
            )}
          >
            {c.orders.checkPayment}
          </button>
        </div>
      ) : null}
    </article>
  );
}

/** The customer's own order history — the same rows Admin sees. */
export function ShopOrdersPanel() {
  const queryClient = useQueryClient();
  const orders = useQuery({ queryKey: ['shop-orders', 'mine'], queryFn: getMyShopOrders });
  const sync = useMutation({
    mutationFn: (orderId: string) => syncShopOrder(orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-orders', 'mine'] }),
  });

  if (orders.isLoading) return <ApplicationState kind="loading" title="Wczytuję zamówienia…" />;
  if (orders.isError) {
    return <ApplicationState kind="error" title="Nie udało się wczytać zamówień." />;
  }
  const rows = orders.data ?? [];
  if (rows.length === 0) return <EmptyState title={c.orders.empty} />;

  return (
    <div className="grid gap-3">
      {rows.map((order) => (
        <OrderRow
          key={order.id}
          order={order}
          syncing={sync.isPending}
          onSync={() => sync.mutate(order.id)}
        />
      ))}
    </div>
  );
}
