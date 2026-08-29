import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  applicationFieldClasses,
  applicationPrimaryClasses,
  applicationSecondaryClasses,
} from '@/components/ui/applicationControlStyles';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import {
  getShopCatalog,
  startShopCheckout,
  syncShopOrder,
  type ShopProduct,
} from '@/services/shop';
import { shopAvailabilityLabelPl, shopCopy as c, shopMoney } from '@/copy/shop';
import { useShopCartStore } from './shopCartStore';

const sectionLabel = 'text-[10px] font-semibold tracking-[0.13em] text-stone-500 uppercase';

function AvailabilityChip({ product }: { product: ShopProduct }) {
  const preorder = product.availability === 'preorder';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-[11px]',
        preorder
          ? 'border-[#ef8708]/45 bg-[#ef8708]/10 text-[#8a4d00]'
          : product.availability === 'out_of_stock'
            ? 'border-ink/15 bg-[#f5f2ee] text-stone-500'
            : 'border-ink/12 bg-white text-stone-600',
      )}
    >
      {shopAvailabilityLabelPl(product.availability, product.leadTimeWeeks)}
    </span>
  );
}

function ProductCard({
  product,
  inCart,
  onAdd,
}: {
  product: ShopProduct;
  inCart: boolean;
  onAdd: () => void;
}) {
  const perKg =
    product.packSizeG && product.packSizeG > 0
      ? shopMoney(Math.round((product.priceCents / product.packSizeG) * 1000), product.currency)
      : null;
  return (
    <article className="flex flex-col rounded-[12px] border border-ink/12 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{product.title}</h3>
        <AvailabilityChip product={product} />
      </div>
      {product.description ? (
        <p className="mt-2 text-xs leading-relaxed text-stone-500">{product.description}</p>
      ) : null}
      {product.contents.length > 0 ? (
        <div className="mt-4">
          <p className={sectionLabel}>{c.starterPack.contents}</p>
          <ul className="mt-2 grid gap-1 text-xs text-stone-600">
            {product.contents.map((entry) => (
              <li key={entry.sku}>
                {entry.title}
                {entry.packSizeG ? ` · ${entry.packSizeG} g` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-ink/10 pt-4">
        <div>
          <p className="font-mono text-xl text-ink">{shopMoney(product.priceCents, product.currency)}</p>
          {perKg ? (
            <p className="mt-0.5 font-mono text-[11px] text-stone-500">
              {perKg} {c.product.perKg}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={product.availability === 'out_of_stock'}
          className={cn(applicationSecondaryClasses(), 'disabled:opacity-45')}
          data-testid={`shop-add-${product.sku}`}
        >
          {inCart ? c.product.added : c.product.add}
        </button>
      </div>
    </article>
  );
}

/** The Gellatti shop: a small, factual catalogue and one honest checkout. */
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

  const lines = cart.lines
    .map((line) => ({ line, product: bySku.get(line.sku) }))
    .filter((entry): entry is { line: typeof entry.line; product: ShopProduct } =>
      entry.product !== undefined,
    );
  const total = lines.reduce(
    (sum, entry) => sum + entry.product.priceCents * entry.line.quantity,
    0,
  );
  const preorderWeeks = lines.reduce(
    (max, entry) =>
      entry.product.availability === 'preorder'
        ? Math.max(max, entry.product.leadTimeWeeks ?? 0)
        : max,
    0,
  );

  const checkout = useMutation({
    mutationFn: () =>
      startShopCheckout({
        items: lines.map((entry) => ({ sku: entry.product.sku, quantity: entry.line.quantity })),
        successUrl: `${window.location.origin}/shop`,
        cancelUrl: `${window.location.origin}/shop`,
      }),
    onSuccess: (result) => {
      cart.clear();
      window.location.assign(result.url);
    },
    onError: () => setCheckoutError(c.cart.error),
  });

  // Returning from Stripe: verify the payment with Stripe itself, never trust
  // the redirect. The order id travels in the success URL the server built.
  const returnedOrderId = params.get('order');
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

  return (
    <div className="flex flex-col gap-10">
      {returnedOrderId ? (
        <div className="rounded-[12px] border border-ink/12 bg-[#e7e3dd] p-5" data-testid="shop-return">
          <p className="text-sm text-ink">
            {sync.data?.status === 'paid'
              ? `${c.orders.paidConfirmation} ${sync.data.orderNumber}`
              : sync.isPending
                ? 'Sprawdzam płatność…'
                : 'Płatność nie została jeszcze potwierdzona.'}
          </p>
          <button
            type="button"
            onClick={() => setParams({})}
            className={cn(applicationSecondaryClasses(), 'mt-4')}
          >
            Wróć do sklepu
          </button>
        </div>
      ) : null}

      {bundle ? (
        <section aria-labelledby="shop-starter">
          <p className={sectionLabel}>{c.starterPack.kicker}</p>
          <h2 id="shop-starter" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
            {bundle.title}
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">
            {c.starterPack.body}
          </p>
          <div className="mt-5">
            <ProductCard
              product={bundle}
              inCart={cart.lines.some((line) => line.sku === bundle.sku)}
              onAdd={() => cart.add(bundle.sku)}
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="shop-singles">
        <p className={sectionLabel}>Pojedyncze składniki</p>
        <h2 id="shop-singles" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
          Każdy składnik osobno
        </h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {singles.map((product) => (
            <ProductCard
              key={product.sku}
              product={product}
              inCart={cart.lines.some((line) => line.sku === product.sku)}
              onAdd={() => cart.add(product.sku)}
            />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="shop-cart"
        className="rounded-[12px] border border-ink/12 bg-white p-5"
        data-testid="shop-cart"
      >
        <h2 id="shop-cart" className="text-lg font-semibold tracking-[-0.02em]">
          {c.cart.title}
        </h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">{c.cart.empty}</p>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-ink/10">
              {lines.map(({ line, product }) => (
                <li key={product.sku} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1 text-sm text-ink">{product.title}</span>
                  <label className="flex items-center gap-2">
                    <span className="sr-only">{c.cart.quantity}</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={line.quantity}
                      onChange={(event) =>
                        cart.setQuantity(product.sku, Number(event.currentTarget.value))
                      }
                      className={applicationFieldClasses('w-20 text-center')}
                    />
                  </label>
                  <span className="w-24 text-right font-mono text-sm">
                    {shopMoney(product.priceCents * line.quantity, product.currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => cart.remove(product.sku)}
                    className="min-h-11 px-2 text-xs text-stone-500 hover:text-ink"
                  >
                    {c.cart.remove}
                  </button>
                </li>
              ))}
            </ul>

            {preorderWeeks > 0 ? (
              <p className="mt-4 rounded-[10px] border border-[#ef8708]/40 bg-[#ef8708]/10 px-4 py-3 text-sm text-[#8a4d00]">
                {c.cart.preorderNotice.replace('{weeks}', String(preorderWeeks))}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 pt-4">
              <p className="font-mono text-xl">
                {c.cart.total} {shopMoney(total)}
              </p>
              {authStatus === 'authed' ? (
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutError(null);
                    checkout.mutate();
                  }}
                  disabled={checkout.isPending}
                  className={cn(applicationPrimaryClasses(), 'disabled:opacity-45')}
                  data-testid="shop-checkout"
                >
                  {checkout.isPending ? c.cart.redirecting : c.cart.checkout}
                </button>
              ) : (
                <div className="text-right">
                  <p className="text-sm text-stone-600">{c.cart.signInFirst}</p>
                  <button
                    type="button"
                    onClick={() => openAuthModal()}
                    className={cn(applicationPrimaryClasses(), 'mt-2')}
                  >
                    {c.cart.signInCta}
                  </button>
                </div>
              )}
            </div>
            {checkoutError ? <p className="mt-3 text-sm text-[#b3261e]">{checkoutError}</p> : null}
            <p className="mt-3 text-xs text-stone-500">{c.cart.testMode}</p>
          </>
        )}
      </section>
    </div>
  );
}
