import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import {
  applicationPrimaryClasses,
  applicationSecondaryClasses,
} from '@/components/ui/applicationControlStyles';
import { shopCopy as c, shopGrams, shopMoney } from '@/copy/shop';
import type { ShopOrder } from '@/services/shop';

/**
 * What closes the purchase.
 *
 * The shop used to return from the payment page to a one-line strip that said
 * the order was paid and nothing else — no number, no contents, no destination,
 * no idea what happens next. Somebody who has just spent money is entitled to
 * all four, on the screen, without hunting.
 *
 * Every value here comes back from the payment verification call, which reads
 * the provider. The browser never decides that a payment succeeded, and the
 * cart is already cleared by the time this renders, so it could not reconstruct
 * the order even if it wanted to.
 */

const label = 'block text-[9px] font-bold tracking-[0.1em] text-[var(--g-text-muted)] uppercase';

function addressLines(order: ShopOrder): string[] {
  const { shipping } = order;
  return [
    shipping.name,
    shipping.line1,
    shipping.line2,
    [shipping.postalCode, shipping.city].filter(Boolean).join(' ') || null,
    shipping.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

export function ShopConfirmation({
  state,
  order,
  onBack,
}: {
  state: 'checking' | 'paid' | 'pending' | 'failed' | 'cancelled';
  order: ShopOrder | null;
  onBack: () => void;
}) {
  const title =
    state === 'checking'
      ? c.confirmation.checking
      : state === 'paid'
        ? c.confirmation.paidTitle
        : state === 'failed'
          ? c.confirmation.failedTitle
          : state === 'cancelled'
            ? c.confirmation.cancelledTitle
            : c.confirmation.pendingTitle;
  const body =
    state === 'failed'
      ? c.confirmation.failedBody
      : state === 'cancelled'
        ? c.confirmation.cancelledBody
        : state === 'pending'
          ? c.confirmation.pendingBody
          : null;
  const address = order ? addressLines(order) : [];

  return (
    <section
      className="overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)]"
      data-testid="shop-return"
      data-confirmation-state={state}
      aria-live="polite"
    >
      <div className="border-b border-[var(--g-line)] px-7 pt-[26px] pb-[22px]">
        <span className="block text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
          {c.confirmation.kicker}
        </span>
        <h2 className="mt-2 text-[24px] leading-[1.15] font-bold tracking-[-0.03em]">{title}</h2>
        {body ? (
          <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
            {body}
          </p>
        ) : null}
      </div>

      {order && state === 'paid' ? (
        <>
          <dl className="grid sm:grid-cols-3">
            <div className="px-7 py-5">
              <dt className={label}>{c.orders.number}</dt>
              <dd className="mt-1.5 font-mono text-[13px]">{order.orderNumber}</dd>
              <dt className={cn(label, 'mt-4')}>{c.confirmation.paidLabel}</dt>
              <dd className="mt-1.5 font-mono text-[13px] tabular-nums">
                {shopMoney(order.totalCents, order.currency)}
              </dd>
            </div>
            <div className="border-t border-[var(--g-line)] px-7 py-5 sm:border-t-0 sm:border-l">
              <dt className={label}>{c.orders.shipTo}</dt>
              <dd className="mt-1.5 text-[13px] leading-[1.55]">
                {address.length > 0
                  ? address.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))
                  : '—'}
              </dd>
            </div>
            <div className="border-t border-[var(--g-line)] px-7 py-5 sm:border-t-0 sm:border-l">
              <dt className={label}>{c.orders.items}</dt>
              <dd className="mt-1.5 text-[13px] leading-[1.55]">
                {order.items.map((item) => (
                  <span key={item.sku} className="block">
                    {item.title}
                    {item.packSizeG ? ` · ${shopGrams(item.packSizeG)}` : ''} × {item.quantity}
                  </span>
                ))}
              </dd>
            </div>
          </dl>

          <div className="grid border-t border-[var(--g-line)] sm:grid-cols-3">
            {[
              c.confirmation.step1,
              order.containsPreorder && order.leadTimeWeeks
                ? c.confirmation.step2Preorder.replace('{weeks}', String(order.leadTimeWeeks))
                : c.confirmation.step2,
              c.confirmation.step3,
            ].map((step, index) => (
              <div
                key={step}
                className={cn(
                  'px-7 py-4 text-[12px] leading-relaxed text-[var(--g-text-secondary)]',
                  index > 0 && 'border-t border-[var(--g-line)] sm:border-t-0 sm:border-l',
                )}
              >
                <b className="mb-1.5 block font-mono text-[10px] font-normal text-[var(--g-text-muted)]">
                  {index + 1}
                </b>
                {step}
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--g-line)] px-7 py-4">
        {/* J: land on the ORDER, not the account landing page. The id travels
            in the URL, so a refresh or a reopened tab returns to the same
            place — and the same link shape serves a paid parcel and a 0 EUR
            Local pack, because Account resolves the row by id either way. */}
        <Link
          to={order ? `/account?section=orders&order=${order.id}` : '/account?section=orders'}
          className={applicationPrimaryClasses()}
          data-testid="confirmation-view-order"
        >
          {c.confirmation.viewOrders}
        </Link>
        <button type="button" onClick={onBack} className={applicationSecondaryClasses()}>
          {c.confirmation.back}
        </button>
      </div>
    </section>
  );
}
