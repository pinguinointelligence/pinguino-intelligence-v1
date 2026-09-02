import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  shopCopy as c,
  shopFulfillmentLabelPl,
  shopGrams,
  shopMoney,
  shopOrderStatusLabelPl,
} from '@/copy/shop';
import type { AdminShopOrder, ShopFulfillmentStatus } from '@/services/shop';

/**
 * One order, written for the person who has to pack it tomorrow morning.
 *
 * The test this card is built against: standing at the bench with a box, can I
 * tell WHAT goes in it, WHERE it goes, whether the money arrived, and whether
 * I am allowed to send it yet — without opening the payment provider's own
 * dashboard and without asking anyone. Everything that answers one of those four questions is on the card;
 * everything else (provider ids) sits at the bottom, where reconciliation
 * happens, not packing.
 */

const label = 'text-[9px] font-bold tracking-[0.1em] text-[var(--g-text-muted)] uppercase';
const field =
  'pro-focus-ring min-h-10 w-full border border-[var(--g-line)] bg-white px-3 text-xs text-ink';

const FULFILLMENT: readonly ShopFulfillmentStatus[] = [
  'awaiting',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
];

function StatusChip({ children, tone }: { children: string; tone: 'neutral' | 'attention' | 'paid' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center border px-2 py-1 text-[11px] tracking-[0.08em] uppercase',
        tone === 'attention'
          ? 'border-[var(--g-orange)]/45 bg-[var(--g-attention-surface)] text-[var(--g-attention-ink)]'
          : tone === 'paid'
            ? 'border-status-ideal/40 bg-status-ideal/10 text-[var(--g-ink)]'
            : 'border-[var(--g-line)] text-[var(--g-text-secondary)]',
      )}
    >
      {children}
    </span>
  );
}

export function AdminShopOrderCard({
  order,
  onFulfil,
  onSync,
  pending,
}: {
  order: AdminShopOrder;
  onFulfil: (input: {
    fulfillmentStatus: ShopFulfillmentStatus;
    trackingCarrier?: string | null;
    trackingNumber?: string | null;
  }) => void;
  onSync: () => void;
  pending: boolean;
}) {
  const [carrier, setCarrier] = useState(order.tracking.carrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(order.tracking.number ?? '');

  const address = [
    order.shipping.name,
    order.shipping.line1,
    order.shipping.line2,
    [order.shipping.postalCode, order.shipping.city].filter(Boolean).join(' ') || null,
    order.shipping.state,
    order.shipping.country,
  ].filter((line): line is string => Boolean(line && line.trim()));

  return (
    <article
      className="border border-[var(--g-line)] bg-white p-5"
      data-testid={`admin-order-${order.orderNumber}`}
      data-order-status={order.status}
      data-order-fulfillment={order.fulfillmentStatus}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-ink">{order.orderNumber}</p>
          <p className="mt-1 font-mono text-[11px] text-[var(--g-text-secondary)]">
            {order.created_at.slice(0, 16).replace('T', ' ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={order.status === 'paid' ? 'paid' : 'neutral'}>
            {shopOrderStatusLabelPl(order.status)}
          </StatusChip>
          {order.containsPreorder ? (
            <StatusChip tone="attention">
              {c.orders.preorderLine.replace('{weeks}', String(order.leadTimeWeeks ?? 0))}
            </StatusChip>
          ) : null}
          <StatusChip tone="neutral">{shopFulfillmentLabelPl(order.fulfillmentStatus)}</StatusChip>
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)]">
        {/* WHAT goes in the box. */}
        <div>
          <p className={label}>{c.admin.packingList}</p>
          <ul className="mt-2 grid gap-1.5">
            {order.items.map((item) => (
              <li key={item.sku} className="flex justify-between gap-3 text-[13px]">
                <span className="min-w-0 text-[var(--g-ink)]">
                  <strong className="font-mono text-[13px] font-medium">{item.quantity} ×</strong>{' '}
                  {item.title}
                  {item.packSizeG ? (
                    <span className="text-[var(--g-text-secondary)]">
                      {' '}
                      · {shopGrams(item.packSizeG)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-[var(--g-text-secondary)] tabular-nums">
                  {shopMoney(item.unitPriceCents * item.quantity, order.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* WHERE it goes. */}
        <div>
          <p className={label}>{c.admin.shipTo}</p>
          {address.length > 0 ? (
            <address className="mt-2 text-[13px] leading-[1.55] not-italic text-[var(--g-ink)]">
              {address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              {order.shipping.phone ? (
                <span className="mt-1 block font-mono text-[12px] text-[var(--g-text-secondary)]">
                  {order.shipping.phone}
                </span>
              ) : null}
            </address>
          ) : (
            <p className="mt-2 text-[12px] text-[var(--g-attention-ink)]">{c.admin.noAddress}</p>
          )}
          <p className={cn(label, 'mt-4')}>{c.admin.customer}</p>
          <p className="mt-1.5 text-[12px] break-all text-[var(--g-text-secondary)]">
            {order.email}
          </p>
        </div>

        {/* WHAT was paid. */}
        <div>
          <p className={label}>{c.admin.money}</p>
          <dl className="mt-2 grid gap-1 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--g-text-secondary)]">{c.orders.subtotal}</dt>
              <dd className="font-mono tabular-nums">
                {shopMoney(order.subtotalCents, order.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--g-text-secondary)]">{c.orders.shippingCost}</dt>
              <dd className="font-mono tabular-nums">
                {shopMoney(order.shippingCents, order.currency)}
              </dd>
            </div>
            {order.taxCents > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--g-text-secondary)]">VAT</dt>
                <dd className="font-mono tabular-nums">
                  {shopMoney(order.taxCents, order.currency)}
                </dd>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between gap-3 border-t border-[var(--g-line-quiet)] pt-1.5">
              <dt className="font-semibold text-[var(--g-ink)]">{c.orders.total}</dt>
              <dd className="font-mono text-[14px] tabular-nums">
                {shopMoney(order.totalCents, order.currency)}
              </dd>
            </div>
          </dl>
          {order.tracking.number ? (
            <>
              <p className={cn(label, 'mt-4')}>{c.orders.tracking}</p>
              <p className="mt-1.5 font-mono text-[12px] break-all">
                {[order.tracking.carrier, order.tracking.number].filter(Boolean).join(' · ')}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {/* Recording a shipment and marking it shipped are ONE action, so a
          parcel can never be „shipped" with nobody able to say under what
          number. */}
      {order.status === 'paid' && order.fulfillmentStatus !== 'shipped' &&
      order.fulfillmentStatus !== 'delivered' ? (
        <div className="mt-5 grid gap-2 border-t border-[var(--g-line)] pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <label className="grid gap-1">
            <span className={label}>{c.admin.carrier}</span>
            <input
              className={field}
              value={carrier}
              onChange={(event) => setCarrier(event.currentTarget.value)}
              placeholder="DPD"
            />
          </label>
          <label className="grid gap-1">
            <span className={label}>{c.admin.trackingNumber}</span>
            <input
              className={field}
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.currentTarget.value)}
            />
          </label>
          <Button
            type="button"
            className="self-end"
            disabled={pending || trackingNumber.trim() === ''}
            onClick={() =>
              onFulfil({
                fulfillmentStatus: 'shipped',
                trackingCarrier: carrier.trim() || null,
                trackingNumber: trackingNumber.trim(),
              })
            }
          >
            {c.admin.markShipped}
          </Button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--g-line)] pt-4">
        <Button type="button" variant="ghost" disabled={pending} onClick={onSync}>
          {c.admin.syncPayment}
        </Button>
        {FULFILLMENT.filter((status) => status !== order.fulfillmentStatus).map((status) => (
          <Button
            key={status}
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onFulfil({ fulfillmentStatus: status })}
          >
            {shopFulfillmentLabelPl(status)}
          </Button>
        ))}
      </div>

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[var(--g-text-secondary)]">{c.admin.sessionReference}</dt>
          <dd className="truncate font-mono text-[11px] text-[var(--g-text-secondary)]">
            {order.paymentReference.sessionId ?? '—'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[var(--g-text-secondary)]">{c.admin.intentReference}</dt>
          <dd className="truncate font-mono text-[11px] text-[var(--g-text-secondary)]">
            {order.paymentReference.intentId ?? '—'}
          </dd>
        </div>
      </dl>
    </article>
  );
}
