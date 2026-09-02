import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { getShopCatalog, startShopCheckout, syncShopOrder } from '@/services/shop';
import { shopCopy as c } from '@/copy/shop';
import { useShopCartStore } from './shopCartStore';
import { ShopCart, type ShopCartEntry } from './ShopCart';
import { ShopConfirmation } from './ShopConfirmation';
import { ShopProductCard } from './ShopProductCard';
import { ShopStarterContents } from './ShopStarterContents';
import { useNavigate } from 'react-router';
import { ShopStarterOffer } from './ShopStarterOffer';

/** The Gellatti shop: a small, factual catalogue and one honest checkout. */

const label =
  'text-[10px] leading-[1.25] font-bold tracking-[0.1em] text-[var(--g-text-secondary)] uppercase';

export function ShopCatalog() {
  const navigate = useNavigate();
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
    <div data-testid="shop-catalog">
      {confirmationState ? (
        <div className="mb-9">
          <ShopConfirmation
            state={confirmationState}
            order={sync.data?.order ?? null}
            onBack={() => setParams({})}
          />
        </div>
      ) : null}

      {/* SHOP C3 · ONE Zestaw Startowy → W zestawie → Kup osobno.
          No hero, no second product block, no framed content container. */}
      {bundle ? (
        <>
          <ShopStarterOffer
            product={bundle}
            inCart={cart.lines.some((line) => line.sku === bundle.sku)}
            onAdd={() => cart.add(bundle.sku)}
            /* Intent goes into the ROUTE, so signing in or reloading resumes
               the same flow with the same country. */
            onLocalPack={() => navigate('/shop/local-starter-pack')}
          />
          <ShopStarterContents product={bundle} />
        </>
      ) : null}

      {/* The second shop mode. Separated by air, not by a container. */}
      <section id="shop-singles" aria-labelledby="shop-singles-title" className="mt-16 md:mt-23">
        <p className={label}>{c.product.singlesKicker}</p>
        <h2
          id="shop-singles-title"
          className="mt-1.5 text-[25px] leading-[1.2] font-extrabold tracking-[-0.032em]"
        >
          {c.product.singlesTitle}
        </h2>
        <p className="mt-1.5 text-[14.5px] leading-[1.5] text-[var(--g-text-secondary)]">
          {c.product.singlesHelper}
        </p>
        <div className="mt-4.5 grid md:grid-cols-2 md:gap-x-14">
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

      <div className="mt-16 md:mt-23">
        <ShopCart
          entries={entries}
          authed={authStatus === 'authed'}
          checkoutPending={checkout.isPending}
          checkoutError={checkoutError}
          onQuantity={(sku, quantity) => cart.setQuantity(sku, quantity)}
          onRemove={(sku) => cart.remove(sku)}
          onCheckout={startCheckout}
          onSignIn={() => openAuthModal()}
        />
      </div>
    </div>
  );
}
