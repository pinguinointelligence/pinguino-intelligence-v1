import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import {
  getMyShopOrders,
  syncShopOrder,
  type ShopOrder,
} from '@/services/shop';
import {
  shopCopy as c,
  shopFulfillmentLabelPl,
  shopMoney,
  shopOrderStatusLabelPl,
} from '@/copy/shop';

const label = 'text-[10px] font-semibold tracking-[0.13em] text-stone-500 uppercase';

function OrderRow({ order, onSync, syncing }: { order: ShopOrder; onSync: () => void; syncing: boolean }) {
  return (
    <article className="rounded-[12px] border border-ink/12 bg-white p-5" data-testid={`order-${order.orderNumber}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={label}>{c.orders.number}</p>
          <p className="mt-1 font-mono text-sm text-ink">{order.orderNumber}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-ink/15 px-2 py-1 text-[11px] tracking-[0.08em] text-stone-600 uppercase">
            {shopOrderStatusLabelPl(order.status)}
          </span>
          <span className="border border-ink/15 px-2 py-1 text-[11px] tracking-[0.08em] text-stone-600 uppercase">
            {shopFulfillmentLabelPl(order.fulfillmentStatus)}
          </span>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-ink/10 text-sm">
        {order.items.map((item) => (
          <li key={item.sku} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <span className="min-w-0 text-ink">
              {item.title}
              {item.quantity > 1 ? ` × ${item.quantity}` : ''}
              {item.isPreorder && order.leadTimeWeeks ? (
                <span className="ml-2 text-xs text-[#8a4d00]">
                  {c.orders.preorderLine.replace('{weeks}', String(order.leadTimeWeeks))}
                </span>
              ) : null}
            </span>
            <span className="font-mono text-sm text-stone-600">
              {shopMoney(item.unitPriceCents * item.quantity, order.currency)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4">
        <div className="flex flex-wrap gap-6">
          <span>
            <span className={label}>{c.orders.placed}</span>
            <span className="mt-1 block font-mono text-xs text-stone-600">
              {order.created_at.slice(0, 16).replace('T', ' ')}
            </span>
          </span>
          <span>
            <span className={label}>{c.orders.total}</span>
            <span className="mt-1 block font-mono text-sm text-ink">
              {shopMoney(order.totalCents, order.currency)}
            </span>
          </span>
        </div>
        {order.status === 'pending' ? (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className={applicationSecondaryClasses('disabled:opacity-45')}
          >
            {c.orders.checkPayment}
          </button>
        ) : null}
      </div>
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
