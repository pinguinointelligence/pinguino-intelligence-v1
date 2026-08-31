import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { getShopCatalog, startShopCheckout, syncShopOrder } from '@/services/shop';
import { shopCopy as c, shopMoney } from '@/copy/shop';
import { useShopCartStore } from './shopCartStore';
import { ShopCart, type ShopCartEntry } from './ShopCart';
import { ShopConfirmation } from './ShopConfirmation';
import { ShopProductCard } from './ShopProductCard';
import { ShopStarterContents, ShopStarterPack } from './ShopStarterPack';
import { SHOP_SHIPPING_FLAT_CENTS } from './shopShipping';

/** The Gellatti shop: a small, factual catalogue and one honest checkout. */

const label =
  'text-[10px] leading-[1.25] font-bold tracking-[0.1em] text-[var(--g-text-secondary)] uppercase';

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
          <ShopStarterPack
            product={bundle}
            inCart={cart.lines.some((line) => line.sku === bundle.sku)}
            onAdd={() => cart.add(bundle.sku)}
          />
          <ShopStarterContents product={bundle} />
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

      {/* MASTER DESIGNBOOK §7: the approved Shop screen closes on an
          orange-ruled informational block. The rule is 2 px and it carries
          meaning — it marks the commerce terms, not decoration. */}
      <aside
        className="border-l-2 border-[var(--g-orange)] bg-[var(--g-ivory-deep)] p-[18px]"
        data-testid="shop-closing-note"
      >
        <p className="text-[14px] font-semibold tracking-[-0.01em]">{c.starterPack.closingTitle}</p>
        <p className="mt-1 max-w-[92ch] text-[12.5px] leading-relaxed text-[var(--g-text-secondary)]">
          {c.starterPack.closingBody.replace('{shipping}', shopMoney(SHOP_SHIPPING_FLAT_CENTS))}
        </p>
      </aside>
    </div>
  );
}
