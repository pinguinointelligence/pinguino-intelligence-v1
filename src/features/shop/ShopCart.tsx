import { cn } from '@/lib/cn';
import {
  applicationPrimaryClasses,
  applicationSecondaryClasses,
} from '@/components/ui/applicationControlStyles';
import { shopCopy as c, shopGrams, shopMoney } from '@/copy/shop';
import type { ShopProduct } from '@/services/shop';
import { SHOP_SHIPPING_FLAT_CENTS, shopOrderTotals } from './shopShipping';
import { shopContentTitle } from './shopContentTitle';
import type { ShopCartLine } from './shopCartStore';

/**
 * The cart, as a decision rather than a list.
 *
 * Two columns: the lines on the left, and one summary panel on the right that
 * answers the only question left — what will actually be charged. Shipping is
 * stated here, before the payment page, because a courier charge that first
 * first appears on the payment page is a surprise, not a total.
 *
 * There is no invented tax row. Provider-side tax calculation is not enabled,
 * so the session charges exactly items + shipping and returns a zero tax
 * amount; the honest statement is that the amount shown is the amount charged.
 * The VAT and invoicing decision is recorded for the owner rather than guessed
 * at here — see `reports/SHOP_FINAL_PASS_2026-08-31.md`.
 *
 * The preorder lead time is attached to the LINE that causes it, not floated
 * above the cart as an alert — it is a fact about that product, not a system
 * message.
 */

export interface ShopCartEntry {
  line: ShopCartLine;
  product: ShopProduct;
}

const label =
  'text-[10px] leading-[1.25] font-bold tracking-[0.1em] text-[var(--g-text-secondary)] uppercase';

function QuantityStepper({
  quantity,
  onChange,
  title,
}: {
  quantity: number;
  onChange: (next: number) => void;
  title: string;
}) {
  const step = (delta: number) => onChange(Math.min(20, Math.max(0, quantity + delta)));
  return (
    <span className="inline-flex h-[34px] items-stretch overflow-hidden rounded-[var(--g-control-radius)] border border-[var(--g-line-strong)] bg-white">
      <button
        type="button"
        onClick={() => step(-1)}
        className="pro-focus-ring w-8 text-[15px] text-ink hover:bg-[var(--g-ivory-deep)]"
        aria-label={`${c.cart.decrease} — ${title}`}
      >
        −
      </button>
      <span
        className="w-10 border-x border-[var(--g-line-quiet)] text-center font-mono text-[13px] leading-8 tabular-nums"
        aria-live="polite"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={quantity >= 20}
        className="pro-focus-ring w-8 text-[15px] text-ink hover:bg-[var(--g-ivory-deep)] disabled:text-[var(--g-lock)]"
        aria-label={`${c.cart.increase} — ${title}`}
      >
        +
      </button>
    </span>
  );
}

export function ShopCart({
  entries,
  authed,
  checkoutPending,
  checkoutError,
  onQuantity,
  onRemove,
  onCheckout,
  onSignIn,
  onBrowse,
}: {
  entries: readonly ShopCartEntry[];
  authed: boolean;
  checkoutPending: boolean;
  checkoutError: string | null;
  onQuantity: (sku: string, quantity: number) => void;
  onRemove: (sku: string) => void;
  onCheckout: () => void;
  onSignIn: () => void;
  onBrowse: () => void;
}) {
  const units = entries.reduce((sum, entry) => sum + entry.line.quantity, 0);
  const totals = shopOrderTotals(
    entries.reduce((sum, entry) => sum + entry.product.priceCents * entry.line.quantity, 0),
  );
  const preorderWeeks = entries.reduce(
    (max, entry) =>
      entry.product.availability === 'preorder'
        ? Math.max(max, entry.product.leadTimeWeeks ?? 0)
        : max,
    0,
  );
  const currency = entries[0]?.product.currency ?? 'eur';

  return (
    <section aria-labelledby="shop-cart" data-testid="shop-cart">
      <p className={label}>{c.cart.kicker}</p>
      <h2 id="shop-cart" className="mt-2 text-[22px] leading-[1.2] font-bold tracking-[-0.025em]">
        {c.cart.title}
      </h2>

      {entries.length === 0 ? (
        /* Compact by design: an empty cart is one sentence and one way out, not
           a large panel of nothing. */
        <div className="mt-[18px] flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-[var(--g-line)] bg-white p-5">
          <p className="text-[13px] text-[var(--g-text-secondary)]">{c.cart.empty}</p>
          <button type="button" onClick={onBrowse} className={applicationSecondaryClasses()}>
            {c.cart.emptyCta}
          </button>
        </div>
      ) : (
        <div className="mt-[18px] grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_344px]">
          <div className="rounded-[12px] border border-[var(--g-line)] bg-white">
            {entries.map(({ line, product }) => (
              <div
                key={product.sku}
                data-testid={`cart-line-${product.sku}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-3 border-b border-[var(--g-line-quiet)] p-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_108px_92px_56px] sm:gap-y-0"
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="text-[14px] text-ink">{shopContentTitle(product.title)}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--g-text-secondary)]">
                    {product.kind === 'bundle' && product.contentsTotalG
                      ? c.starterPack.contentsRecapValue
                          .replace('{count}', String(product.contents.length))
                          .replace('{grams}', shopGrams(product.contentsTotalG))
                      : [
                          product.packSizeG ? shopGrams(product.packSizeG) : null,
                          `${shopMoney(product.priceCents, product.currency)} ${c.cart.perUnit}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </p>
                  {product.availability === 'preorder' ? (
                    <p className="mt-1.5 text-[11px] text-[var(--g-attention-ink)]">
                      {c.cart.preorderLineItem.replace(
                        '{weeks}',
                        String(product.leadTimeWeeks ?? 0),
                      )}
                    </p>
                  ) : null}
                </div>
                <div>
                  <span className="sr-only">{c.cart.quantity}</span>
                  <QuantityStepper
                    quantity={line.quantity}
                    title={product.title}
                    onChange={(next) => onQuantity(product.sku, next)}
                  />
                </div>
                <p className="text-right font-mono text-[14px] tabular-nums">
                  {shopMoney(product.priceCents * line.quantity, product.currency)}
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(product.sku)}
                  className="pro-focus-ring col-span-2 justify-self-start text-[11px] text-[var(--g-text-secondary)] underline underline-offset-[3px] hover:text-ink sm:col-span-1 sm:justify-self-end"
                  data-testid={`cart-remove-${product.sku}`}
                >
                  {c.cart.remove}
                </button>
              </div>
            ))}
          </div>

          <aside className="rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory-deep)] p-[22px]">
            <h3 className={label}>{c.cart.summaryTitle}</h3>
            <div className="mt-1 flex justify-between gap-3 py-2 text-[13px] text-[var(--g-text-secondary)]">
              <span>{c.cart.itemsRow.replace('{count}', String(units))}</span>
              <b className="font-mono text-[13px] font-normal text-ink tabular-nums">
                {shopMoney(totals.subtotalCents, currency)}
              </b>
            </div>
            <div className="flex justify-between gap-3 py-2 text-[13px] text-[var(--g-text-secondary)]">
              <span>{c.cart.shippingRow}</span>
              <b className="font-mono text-[13px] font-normal text-ink tabular-nums">
                {shopMoney(SHOP_SHIPPING_FLAT_CENTS, currency)}
              </b>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-[var(--g-line-strong)] pt-3.5">
              <span className="text-[13px] font-semibold">{c.cart.grandTotal}</span>
              <strong
                className="font-mono text-[24px] font-medium tabular-nums"
                data-testid="cart-total"
              >
                {shopMoney(totals.totalCents, currency)}
              </strong>
            </div>

            {preorderWeeks > 0 ? (
              <p className="mt-3 rounded-lg border border-[var(--g-orange)]/40 bg-[var(--g-attention-surface)] px-3 py-2.5 text-[11.5px] leading-snug text-[var(--g-attention-ink)]">
                {c.cart.preorderNotice.replace('{weeks}', String(preorderWeeks))}
              </p>
            ) : null}

            {authed ? (
              <button
                type="button"
                onClick={onCheckout}
                disabled={checkoutPending}
                className={cn(
                  applicationPrimaryClasses(),
                  'mt-4 w-full',
                  'disabled:cursor-wait disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)]',
                )}
                data-testid="shop-checkout"
              >
                {checkoutPending ? c.cart.redirecting : c.cart.checkout}
              </button>
            ) : (
              <>
                <p className="mt-4 text-[12px] text-[var(--g-text-secondary)]">
                  {c.cart.signInFirst}
                </p>
                <button
                  type="button"
                  onClick={onSignIn}
                  className={cn(applicationPrimaryClasses(), 'mt-2 w-full')}
                  data-testid="shop-signin"
                >
                  {c.cart.signInCta}
                </button>
              </>
            )}

            {checkoutError ? (
              <p className="mt-3 text-[12px] text-status-error">{checkoutError}</p>
            ) : null}
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--g-text-muted)]">
              {c.cart.finalAmountNote} {c.cart.testMode}
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}
