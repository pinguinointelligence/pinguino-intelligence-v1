import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  applicationPrimaryClasses,
  applicationQuietClasses,
} from '@/components/ui/applicationControlStyles';
import { shopAvailabilityLabelPl, shopCopy as c, shopGrams, shopMoney } from '@/copy/shop';
import type { ShopProduct } from '@/services/shop';
import { SHOP_STARTER_SHOTS, type ShopShotId } from './shopStarterShots';
import { shopProductName } from './shopProductName';
import { ShopCountrySelector } from './ShopCountrySelector';
import {
  selectedShopCountry,
  selectedStarterPackMode,
  useShopCountryStore,
} from './shopCountryStore';
import { getShippingRate, type ShopShippingRate } from './shopCountryAuthority';

/**
 * THE ONE featured offer — Shop C3, owner approved 2026-08-31, with the
 * product-emphasis correction of 2026-09-01.
 *
 * Photography on the left, commerce on the right, and no container around
 * either: the bags are shot on white, so the page ground carries the product.
 *
 * The graphite belongs to the PRODUCT IDENTITY, never to the money. The name
 * sits in a graphite field edged in orange, carrying the pack facts on its
 * baseline; the price is ordinary ink on white below it, and the primary action
 * is the approved graphite control. Orange marks one thing — the made-to-order
 * condition.
 *
 * Reading order, fixed: product → what it is → availability → price → add.
 */
export function ShopStarterOffer({
  product,
  inCart,
  onAdd,
  onLocalPack,
}: {
  product: ShopProduct;
  inCart: boolean;
  onAdd: () => void;
  /** Starts the 0 EUR Local pack flow. Auth is handled by the caller. */
  onLocalPack: () => void;
}) {
  const [shot, setShot] = useState<ShopShotId>('front');
  /* The offer is a function of WHERE. `mode` selects which experience renders;
     `shippingRate` is resolved from the authority for the chosen country and is
     null whenever no enabled rate exists — never a fallback constant. */
  const mode = useShopCountryStore(selectedStarterPackMode);
  const country = useShopCountryStore(selectedShopCountry);
  /* Rates are CACHED BY COUNTRY and the visible rate is DERIVED, not mirrored.
     Setting state synchronously in the effect to clear a stale rate would
     cascade a render and, worse, briefly show one country's price under
     another's name. Switching back to a country already resolved costs no
     request at all. */
  const [ratesByCountry, setRatesByCountry] = useState<Record<string, ShopShippingRate | null>>({});
  useEffect(() => {
    if (!country?.physicalAvailable) return;
    const iso2 = country.iso2;
    let cancelled = false;
    void getShippingRate(iso2)
      .then((rate) => {
        if (!cancelled) setRatesByCountry((prev) => ({ ...prev, [iso2]: rate }));
      })
      .catch(() => {
        if (!cancelled) setRatesByCountry((prev) => ({ ...prev, [iso2]: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [country]);
  const shippingRate = country?.physicalAvailable ? (ratesByCountry[country.iso2] ?? null) : null;
  const primary = SHOP_STARTER_SHOTS.find((s) => s.id === shot) ?? SHOP_STARTER_SHOTS[0]!;
  /* The strip only ever offers what is NOT on display. */
  const alternates = SHOP_STARTER_SHOTS.filter((s) => s.id !== primary.id);

  const soldOut = product.availability === 'out_of_stock';
  const preorder = product.availability === 'preorder';
  const name = shopProductName(product);
  const total = product.contentsTotalG;
  const perKg =
    total && total > 0
      ? shopMoney(Math.round((product.priceCents / total) * 1000), product.currency)
      : null;
  const facts = total
    ? c.starterPack.offerFacts
        .replace('{count}', String(product.contents.length))
        .replace('{grams}', shopGrams(total))
    : null;

  return (
    <section
      aria-labelledby="shop-starter"
      className="grid items-start gap-5 md:grid-cols-[356px_minmax(0,1fr)] md:gap-16"
      data-testid="shop-starter-offer"
    >
      {/* ── gallery: the primary shot dominates, two quiet alternates ── */}
      <div className="grid gap-3 md:grid-cols-[48px_minmax(0,1fr)] md:items-center md:gap-4">
        <div className="order-2 flex flex-row justify-center gap-4 md:order-none md:flex-col md:gap-3.5">
          {alternates.map((alt) => (
            <button
              key={alt.id}
              type="button"
              onClick={() => setShot(alt.id)}
              aria-label={alt.label}
              className="pro-focus-ring block rounded-sm opacity-[0.88] transition-opacity hover:opacity-100"
              data-testid={`shop-shot-${alt.id}`}
            >
              <img
                src={alt.thumb}
                alt=""
                width={160}
                height={207}
                loading="lazy"
                className="block h-[50px] w-10 object-contain md:h-[60px] md:w-12"
              />
            </button>
          ))}
        </div>
        <div className="order-1 mx-auto w-full max-w-[186px] md:order-none md:mx-0 md:max-w-none">
          <img
            src={primary.src}
            alt={name}
            width={900}
            height={1166}
            className="block h-auto w-full"
            data-testid="shop-starter-shot"
          />
        </div>
      </div>

      {/* ── commerce ── */}
      <div className="min-w-0">
        {/* The one graphite object in the offer: the product's own name. */}
        <div className="rounded-[14px] border-l-[3px] border-[var(--g-orange)] bg-[var(--g-graphite)] px-[18px] pt-3.5 pb-4 md:px-7 md:pt-6 md:pb-[26px]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
            <h2
              id="shop-starter"
              className="text-[32px] leading-none font-extrabold tracking-[-0.05em] text-white md:text-[42px]"
            >
              {name}
            </h2>
            {facts ? (
              <span className="font-mono text-[12.5px] whitespace-nowrap text-white/[0.78] tabular-nums md:text-[13.5px]">
                {facts}
              </span>
            ) : null}
          </div>
        </div>

        <p className="mt-3 max-w-[44ch] text-[14.5px] leading-relaxed text-[var(--g-text-secondary)] md:mt-5 md:text-[15.5px]">
          {mode === 'local' ? c.localPack.body : c.starterPack.offerLede}
        </p>

        {/* The question sits BEFORE the money, because it decides which money
            is shown. Asking it in checkout would mean quoting a price and then
            taking it away. */}
        <ShopCountrySelector className="mt-4 md:mt-[22px]" />

        {/* PHYSICAL — the pack ships. Conditions, then money, then the action.
            Unchanged from the approved C3 offer; the country question above it
            is what decides whether this branch renders at all. */}
        {mode === 'physical' ? (
          <>
            <div className="mt-3 border-l-2 border-[var(--g-orange)] pl-[11px] md:mt-5 md:pl-[13px]">
              <p
                className={cn(
                  'flex items-center gap-2.5 text-[13px] font-semibold md:text-[13.5px]',
                  preorder ? 'text-[var(--g-attention-ink)]' : 'text-[var(--g-ink)]',
                )}
                data-testid="shop-starter-availability"
              >
                {preorder ? (
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-[var(--g-orange)]"
                  />
                ) : null}
                {shopAvailabilityLabelPl(product.availability, product.leadTimeWeeks)}
              </p>
              {/* A RESOLVED rate or nothing. Printing a constant would be a
                  promise checkout might not keep. */}
              {shippingRate ? (
                <p className="mt-1 ml-4 text-[13px] text-[var(--g-text-secondary)]">
                  {c.starterPack.offerShipping.replace(
                    '{amount}',
                    shopMoney(shippingRate.priceCents, shippingRate.currency),
                  )}
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-3.5 md:mt-5">
              <span
                className="font-mono text-[29px] font-semibold tracking-[-0.01em] tabular-nums md:text-[30px]"
                data-testid="shop-starter-price"
              >
                {shopMoney(product.priceCents, product.currency)}
              </span>
              {perKg ? (
                <span className="font-mono text-[12.5px] text-[var(--g-text-secondary)] tabular-nums">
                  {perKg} {c.product.perKg}
                </span>
              ) : null}
            </div>

            <div className="mt-3.5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5 md:mt-[22px]">
              <button
                type="button"
                onClick={onAdd}
                disabled={soldOut}
                className={applicationPrimaryClasses(
                  cn(
                    'min-h-[46px] px-7 text-[14px]',
                    'disabled:cursor-not-allowed disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)] disabled:opacity-100',
                  ),
                )}
                data-testid={`shop-add-${product.sku}`}
              >
                {inCart ? c.product.added : c.product.add}
              </button>
              <a href="#shop-contents" className={applicationQuietClasses('text-[13px]')}>
                {c.starterPack.contentsCta}
              </a>
            </div>
          </>
        ) : null}

        {/* LOCAL — the same seven components, sourced where the customer is.
            This is an OFFER, not a fallback: it keeps the product's own money
            treatment (ink on white, never graphite) so 0 EUR reads as a real
            price rather than an absence. */}
        {mode === 'local' ? (
          <>
            <div className="mt-3 border-l-2 border-[var(--g-orange)] pl-[11px] md:mt-5 md:pl-[13px]">
              <p
                className="text-[13px] font-semibold text-[var(--g-ink)] md:text-[13.5px]"
                data-testid="shop-local-name"
              >
                {c.localPack.name}
              </p>
              <p className="mt-1 text-[13px] text-[var(--g-text-secondary)]">{c.localPack.lede}</p>
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-3.5 md:mt-5">
              <span
                className="font-mono text-[29px] font-semibold tracking-[-0.01em] tabular-nums md:text-[30px]"
                data-testid="shop-local-price"
              >
                {c.localPack.price}
              </span>
              <span className="font-mono text-[12.5px] text-[var(--g-text-secondary)]">
                {country?.name}
              </span>
            </div>

            <div className="mt-3.5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5 md:mt-[22px]">
              <button
                type="button"
                onClick={onLocalPack}
                className={applicationPrimaryClasses('min-h-[46px] px-7 text-[14px]')}
                data-testid="shop-local-cta"
              >
                {c.localPack.cta}
              </button>
              <a href="#shop-contents" className={applicationQuietClasses('text-[13px]')}>
                {c.starterPack.contentsCta}
              </a>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
