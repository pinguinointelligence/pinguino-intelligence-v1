import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
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
import { getLocalPackSnapshot } from '@/services/localStarterPack';
import { downloadLocalStarterPackPdf } from './localStarterPackPdf';

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

/**
 * A 0 EUR Local pack answers different questions than a parcel: which country,
 * is my list ready, can I open it. Forcing "awaiting fulfilment / shipped" onto
 * a digital order would describe a journey that does not exist, so this row is
 * its own shape rather than the physical row with fields blanked out.
 */
function LocalPackRow({ order, focused }: { order: ShopOrder; focused: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const found = await getLocalPackSnapshot(order.id);
      if (!found) {
        setFailed(true);
      } else {
        await downloadLocalStarterPackPdf(found.snapshot, found.orderNumber);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={cn(
        'rounded-[12px] border bg-white p-5',
        focused ? 'border-[var(--g-orange)]' : 'border-[var(--g-line)]',
      )}
      data-testid={`order-${order.orderNumber}`}
      data-order-type="LOCAL_STARTER_PACK"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={label}>{c.orders.number}</p>
          <p className="mt-1 font-mono text-sm text-ink">{order.orderNumber}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={chip}>{c.localPack.name}</span>
          <span className={chip}>{c.localPack.price}</span>
        </div>
      </div>

      <dl className="mt-4 grid gap-4 border-t border-[var(--g-line)] pt-4 sm:grid-cols-3">
        <div>
          <dt className={label}>{c.orders.placed}</dt>
          <dd className="mt-1 font-mono text-xs text-[var(--g-text-secondary)]">
            {order.created_at.slice(0, 16).replace('T', ' ')}
          </dd>
        </div>
        <div>
          <dt className={label}>{c.localPack.countryLabel}</dt>
          <dd className="mt-1 text-[13px] text-[var(--g-ink)]">
            {order.localPackCountry ?? order.shipping.country ?? '—'}
          </dd>
        </div>
        <div>
          <dt className={label}>{c.localPack.listTitle}</dt>
          <dd className="mt-1 text-[13px] text-[var(--g-ink)]">
            {order.localPackReady ? c.orders.pdfReady : c.orders.pdfPending}
          </dd>
        </div>
      </dl>

      {order.localPackReady ? (
        <div className="mt-4 border-t border-[var(--g-line)] pt-4">
          <button
            type="button"
            onClick={() => void open()}
            disabled={busy}
            className={applicationSecondaryClasses(
              'disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)]',
            )}
            data-testid={`order-pdf-${order.orderNumber}`}
          >
            {busy ? '…' : c.orders.viewPdf}
          </button>
          {failed ? (
            <p className="mt-2 text-[12px] text-[var(--g-attention-ink)]">{c.orders.pdfFailed}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function OrderRow({
  order,
  onSync,
  syncing,
  focused,
}: {
  order: ShopOrder;
  onSync: () => void;
  syncing: boolean;
  focused: boolean;
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
      className={cn(
        'rounded-[12px] border bg-white p-5',
        focused ? 'border-[var(--g-orange)]' : 'border-[var(--g-line)]',
      )}
      data-testid={`order-${order.orderNumber}`}
      data-order-type="PHYSICAL"
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

/**
 * The customer's own order history.
 *
 * `focusOrderId` is the deep-link target: "Pokaż moje zamówienie" must land on
 * the ORDER, not on an account landing page the customer then has to search.
 * The row is marked and scrolled to; the id stays in the URL, so a refresh or a
 * reopened tab lands in exactly the same place.
 */
export function ShopOrdersPanel({ focusOrderId }: { focusOrderId?: string | null } = {}) {
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
      {rows.map((order) => {
        const focused = focusOrderId != null && order.id === focusOrderId;
        return order.orderType === 'LOCAL_STARTER_PACK' ? (
          <FocusAnchor key={order.id} focused={focused}>
            <LocalPackRow order={order} focused={focused} />
          </FocusAnchor>
        ) : (
          <FocusAnchor key={order.id} focused={focused}>
            <OrderRow
              order={order}
              focused={focused}
              syncing={sync.isPending}
              onSync={() => sync.mutate(order.id)}
            />
          </FocusAnchor>
        );
      })}
    </div>
  );
}

/** Scrolls its child into view once, when it is the deep-link target. */
function FocusAnchor({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);
  return <div ref={ref}>{children}</div>;
}
