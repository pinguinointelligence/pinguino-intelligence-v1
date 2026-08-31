import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import { applicationPrimaryClasses } from '@/components/ui/applicationControlStyles';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import {
  getShopCatalog,
  startShopCheckout,
  syncShopOrder,
  type ShopProduct,
} from '@/services/shop';
import {
  shopAvailabilityLabelPl,
  shopCopy as c,
  shopGrams,
  shopMoney,
} from '@/copy/shop';
import { useShopCartStore } from './shopCartStore';
import { ShopCart, type ShopCartEntry } from './ShopCart';
import { ShopConfirmation } from './ShopConfirmation';
import { ShopAllergenTags, ShopProductCard } from './ShopProductCard';
import { SHOP_SHIPPING_FLAT_CENTS } from './shopShipping';

/** The Gellatti shop: a small, factual catalogue and one honest checkout. */

const label =
  'text-[10px] leading-[1.25] font-bold tracking-[0.1em] text-[var(--g-text-secondary)] uppercase';

/**
 * The Starter Pack, merchandised.
 *
 * It is the shop's lead product, so it gets the shape a lead product needs:
 * what it is, why these seven and not seven others, and — separately, in a buy
 * box — price, per-kilogram, availability with its real lead time, what is in
 * the box, what shipping costs, and one button. The full contents list lives in
 * the hero panel above; repeating it here would be the same list twice.
 */
function StarterPackPanel({
  product,
  inCart,
  onAdd,
}: {
  product: ShopProduct;
  inCart: boolean;
  onAdd: () => void;
}) {
  const perKg =
    product.contentsTotalG && product.contentsTotalG > 0
      ? shopMoney(
          Math.round((product.priceCents / product.contentsTotalG) * 1000),
          product.currency,
        )
      : null;
  const soldOut = product.availability === 'out_of_stock';
  const preorder = product.availability === 'preorder';

  return (
    <div
      className="grid overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)] lg:grid-cols-[minmax(0,1fr)_372px]"
      data-testid="shop-starter-pack"
    >
      <div className="p-[clamp(24px,3vw,40px)]">
        <p className={label}>{c.starterPack.kicker}</p>
        <h2
          id="shop-starter"
          className="mt-2 text-[28px] leading-[1.1] font-bold tracking-[-0.032em]"
        >
          {product.title}
        </h2>
        <p className="mt-2.5 max-w-[60ch] text-[14.5px] leading-[1.65] text-[var(--g-text-secondary)]">
          {c.starterPack.lede}
        </p>

        <dl className="mt-7 grid border-t border-[var(--g-line)] sm:grid-cols-3">
          {[
            [c.starterPack.whyBodyTitle, c.starterPack.whyBodyText],
            [c.starterPack.whySweetTitle, c.starterPack.whySweetText],
            [c.starterPack.whyCreamTitle, c.starterPack.whyCreamText],
          ].map(([term, detail], index) => (
            <div
              key={term}
              className={cn(
                'pt-4 pr-4',
                index > 0 &&
                  'mt-3.5 border-t border-[var(--g-line)] sm:mt-0 sm:border-t-0 sm:border-l sm:pl-4',
              )}
            >
              <dt className="text-[12.5px] font-semibold tracking-[-0.01em]">{term}</dt>
              <dd className="mt-1.5 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                {detail}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-[12px] text-[var(--g-text-muted)]">{c.starterPack.allergens}</p>
        <ShopAllergenTags allergens={product.allergens} />
      </div>

      <div className="flex flex-col border-t border-[var(--g-line)] bg-white p-[30px] lg:border-t-0 lg:border-l">
        <p className="font-mono text-[30px] leading-none tracking-[-0.01em] tabular-nums">
          {shopMoney(product.priceCents, product.currency)}
        </p>
        {perKg ? (
          <p className="mt-1.5 font-mono text-[11px] text-[var(--g-text-secondary)]">
            {perKg} {c.product.perKg}
          </p>
        ) : null}
        <span
          className={cn(
            'mt-4 inline-flex w-fit items-center rounded-full border px-[11px] py-[5px] text-[11px]',
            preorder
              ? 'border-[var(--g-orange)]/45 bg-[var(--g-attention-surface)] text-[var(--g-attention-ink)]'
              : soldOut
                ? 'border-[var(--g-line-strong)] bg-[var(--g-line-quiet)] text-[var(--g-lock)]'
                : 'border-[var(--g-line)] bg-white text-[var(--g-text-secondary)]',
          )}
        >
          {shopAvailabilityLabelPl(product.availability, product.leadTimeWeeks)}
        </span>

        <dl className="mt-5 border-t border-[var(--g-line-quiet)]">
          {[
            [
              c.starterPack.contentsRecap,
              c.starterPack.contentsRecapValue
                .replace('{count}', String(product.contents.length))
                .replace('{grams}', product.contentsTotalG ? shopGrams(product.contentsTotalG) : '—'),
            ],
            [
              c.starterPack.shippingRow,
              shopMoney(SHOP_SHIPPING_FLAT_CENTS, product.currency),
            ],
            [c.starterPack.deliveryRow, c.starterPack.deliveryValue],
          ].map(([term, detail]) => (
            <div
              key={term}
              className="flex justify-between gap-3 border-b border-[var(--g-line-quiet)] py-2.5 text-[12px]"
            >
              <dt className="text-[var(--g-text-secondary)]">{term}</dt>
              <dd className="text-right font-mono text-[11.5px] tabular-nums">{detail}</dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          onClick={onAdd}
          disabled={soldOut}
          className={cn(
            applicationPrimaryClasses(),
            'mt-6 w-full',
            'disabled:cursor-not-allowed disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)]',
          )}
          data-testid={`shop-add-${product.sku}`}
        >
          {inCart ? c.product.added : c.product.add}
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--g-text-muted)]">
          {c.starterPack.finalAmountNote}
        </p>
      </div>
    </div>
  );
}

export function ShopCatalog() {
  const [params, setParams] = useSearchParams();
  const catalog = useQuery({ queryKey: ['shop-catalog'], queryFn: getShopCatalog });
  const cart = useShopCartStore();
  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const products = useMemo(() => catalog.data ?? [], [catalog.data]);
  const bySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
  const bundle = products.find((product) => product.kind === 'bundle');
  const singles = products.filter((product) => product.kind === 'single');

  const entries: ShopCartEntry[] = cart.lines
    .map((line) => ({ line, product: bySku.get(line.sku) }))
    .filter((entry): entry is ShopCartEntry => entry.product !== undefined);

  /* Two guards against paying twice for the same click: the button disables on
     `isPending`, and this ref closes the window before React re-renders. The
     checkout function reuses an unpaid order for the same cart on top of that,
     so even a duplicated request cannot mint a second order. */
  const starting = useRef(false);
  const checkout = useMutation({
    mutationFn: () =>
      startShopCheckout({
        items: entries.map((entry) => ({
          sku: entry.product.sku,
          quantity: entry.line.quantity,
        })),
        successUrl: `${window.location.origin}/shop`,
        cancelUrl: `${window.location.origin}/shop?checkout=cancelled`,
      }),
    onSuccess: (result) => {
      cart.clear();
      window.location.assign(result.url);
    },
    onError: () => {
      starting.current = false;
      setCheckoutError(c.cart.error);
    },
  });
  const startCheckout = () => {
    if (starting.current || checkout.isPending) return;
    starting.current = true;
    setCheckoutError(null);
    checkout.mutate();
  };

  // Returning from the payment page: the payment status is verified server-side
  // against the provider, never inferred from the redirect. The order id travels
  // in the success URL the server built.
  const returnedOrderId = params.get('order');
  const cancelled = params.get('checkout') === 'cancelled';
  const sync = useMutation({ mutationFn: (orderId: string) => syncShopOrder(orderId) });
  useEffect(() => {
    if (!returnedOrderId || sync.isPending || sync.data || sync.isError) return;
    sync.mutate(returnedOrderId);
  }, [returnedOrderId, sync]);

  if (catalog.isLoading) return <ApplicationState kind="loading" title="Wczytuję sklep…" />;
  if (catalog.isError) {
    return <ApplicationState kind="error" title="Nie udało się wczytać sklepu." />;
  }
  if (products.length === 0) {
    return <EmptyState title="Katalog jest pusty." />;
  }

  const confirmationState = returnedOrderId
    ? sync.isPending
      ? 'checking'
      : sync.data?.status === 'paid'
        ? 'paid'
        : sync.data?.status === 'failed'
          ? 'failed'
          : sync.data?.status === 'cancelled'
            ? 'cancelled'
            : 'pending'
    : cancelled
      ? 'cancelled'
      : null;

  return (
    <div className="flex flex-col gap-[58px]">
      {confirmationState ? (
        <ShopConfirmation
          state={confirmationState}
          order={sync.data?.order ?? null}
          onBack={() => setParams({})}
        />
      ) : null}

      {bundle ? (
        <section aria-labelledby="shop-starter">
          <StarterPackPanel
            product={bundle}
            inCart={cart.lines.some((line) => line.sku === bundle.sku)}
            onAdd={() => cart.add(bundle.sku)}
          />
        </section>
      ) : null}

      <section aria-labelledby="shop-singles">
        <p className={label}>{c.product.singlesKicker}</p>
        <h2 id="shop-singles" className="mt-2 text-[22px] leading-[1.2] font-bold tracking-[-0.025em]">
          {c.product.singlesTitle}
        </h2>
        <p className="mt-1 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
          {c.product.singlesHelper}
        </p>
        <div className="mt-[18px] grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {singles.map((product) => (
            <ShopProductCard
              key={product.sku}
              product={product}
              inCart={cart.lines.some((line) => line.sku === product.sku)}
              onAdd={() => cart.add(product.sku)}
            />
          ))}
        </div>
      </section>

      <ShopCart
        entries={entries}
        authed={authStatus === 'authed'}
        checkoutPending={checkout.isPending}
        checkoutError={checkoutError}
        onQuantity={(sku, quantity) => cart.setQuantity(sku, quantity)}
        onRemove={(sku) => cart.remove(sku)}
        onCheckout={startCheckout}
        onSignIn={() => openAuthModal()}
        onBrowse={() =>
          document.getElementById('shop-starter')?.scrollIntoView({ behavior: 'smooth' })
        }
      />
    </div>
  );
}
