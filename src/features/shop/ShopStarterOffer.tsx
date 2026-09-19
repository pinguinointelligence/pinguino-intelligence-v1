import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  applicationAccentClasses,
  applicationQuietClasses,
} from '@/components/ui/applicationControlStyles';
import { DestinationTop } from '@/components/shared/destinationEditorial';
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
import { getShippingRate, type ShopShippingRate } from '@/services/shopCountries';

/**
 * The primary action on the dark ground: the SAME approved control family at
 * the same 12 px radius, in its accent member, with the approved disabled
 * treatment unchanged (--g-lock on --g-line-quiet at full opacity).
 */
const ACCENT_CTA = applicationAccentClasses(
  'min-h-[46px] px-7 text-[14px] disabled:cursor-not-allowed disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)] disabled:opacity-100',
);
/** The quiet companion link, on the same ground. */
const QUIET_LINK = applicationQuietClasses('text-[13px] !text-white/75 hover:!text-white');

/**
 * THE ONE featured offer — Shop C3 (owner approved 2026-08-31), rebuilt on the
 * shared destination top by DESIGN S1 (owner correction 2026-09-18).
 *
 * THE OFFER IS THE ENTRY BLOCK. The pack, the question, the conditions, the
 * price and the action all stand on ONE dark ground — the same `DestinationTop`
 * Sklep, Affiliate and Franchise share, with the same radius, the same 6 px
 * Gellatti bar down the left edge and the same way a photograph meets it. The
 * packshot fills the block's own right-hand side and fades into the ground: no
 * frame, no card inside a card, no hard edge.
 *
 * WHAT THIS SUPERSEDES. C3 put the graphite on the product NAME alone, the
 * price on white below it and the action in the graphite control, because the
 * page around them was ivory. The ground is dark now, so that division has
 * nothing left to divide: the owner's correction moves the whole offer onto the
 * graphite and gives the primary action the Gellatti accent, which on this
 * ground is the only fill a customer can read as an action. The reading ORDER
 * the owner fixed is untouched, and still enforced by the presentation
 * contract: product → what it is → availability → price → add.
 *
 * Nothing about the commerce moved: the same catalogue product, the same
 * country authority, the same resolved shipping rate (or none), the same cart
 * call, the same 0 EUR local flow.
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
    <DestinationTop
      eyebrow={c.hero.eyebrow}
      title={name}
      lede={mode === 'local' ? c.localPack.body : c.starterPack.offerLede}
      visual={
        /* The packshot is the block's own right-hand side, edge to edge. The
           bag is shot on white, so the shared gradient carries that white into
           the graphite instead of leaving a pasted rectangle. */
        <img
          src={primary.src}
          alt={name}
          width={900}
          height={1166}
          className="h-full w-full object-cover object-top"
          data-testid="shop-starter-shot"
        />
      }
    >
      <div aria-labelledby="shop-starter" data-testid="shop-starter-offer">
        <h2 id="shop-starter" className="sr-only">
          {name}
        </h2>
        {facts ? (
          <p className="font-mono text-[12.5px] text-white/[0.78] tabular-nums md:text-[13.5px]">
            {facts}
          </p>
        ) : null}

        {/* The question sits BEFORE the money, because it decides which money
            is shown. Asking it in checkout would mean quoting a price and then
            taking it away. */}
        <ShopCountrySelector tone="inverse" className="mt-3.5 md:mt-4" />

        {/* PHYSICAL — the pack ships. Conditions, then money, then the action. */}
        {mode === 'physical' ? (
          <>
            <div className="mt-3 border-l-2 border-[var(--g-orange)] pl-[11px] md:mt-4 md:pl-[13px]">
              <p
                className={cn(
                  'flex items-center gap-2.5 text-[13px] font-semibold md:text-[13.5px]',
                  'text-white',
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
                <p className="mt-1 ml-4 text-[13px] text-white/60">
                  {c.starterPack.offerShipping.replace(
                    '{amount}',
                    shopMoney(shippingRate.priceCents, shippingRate.currency),
                  )}
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-3.5 md:mt-4">
              <span
                className="font-mono text-[29px] font-semibold tracking-[-0.01em] text-white tabular-nums md:text-[30px]"
                data-testid="shop-starter-price"
              >
                {shopMoney(product.priceCents, product.currency)}
              </span>
              {perKg ? (
                <span className="font-mono text-[12.5px] text-white/60 tabular-nums">
                  {perKg} {c.product.perKg}
                </span>
              ) : null}
            </div>

            <div className="mt-3.5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5 md:mt-4">
              <button
                type="button"
                onClick={onAdd}
                disabled={soldOut}
                className={ACCENT_CTA}
                data-testid={`shop-add-${product.sku}`}
              >
                {inCart ? c.product.added : c.product.add}
              </button>
              <a href="#shop-contents" className={QUIET_LINK}>
                {c.starterPack.contentsCta}
              </a>
            </div>
          </>
        ) : null}

        {/* LOCAL — the same seven components, sourced where the customer is.
            This is an OFFER, not a fallback: it keeps the product's own money
            treatment so 0 EUR reads as a real price rather than an absence. */}
        {mode === 'local' ? (
          <>
            <div className="mt-3 border-l-2 border-[var(--g-orange)] pl-[11px] md:mt-4 md:pl-[13px]">
              <p
                className="text-[13px] font-semibold text-white md:text-[13.5px]"
                data-testid="shop-local-name"
              >
                {c.localPack.name}
              </p>
              <p className="mt-1 text-[13px] text-white/60">{c.localPack.lede}</p>
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-3.5 md:mt-4">
              <span
                className="font-mono text-[29px] font-semibold tracking-[-0.01em] text-white tabular-nums md:text-[30px]"
                data-testid="shop-local-price"
              >
                {c.localPack.price}
              </span>
              <span className="font-mono text-[12.5px] text-white/60">{country?.name}</span>
            </div>

            <div className="mt-3.5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5 md:mt-4">
              <button
                type="button"
                onClick={onLocalPack}
                className={ACCENT_CTA}
                data-testid="shop-local-cta"
              >
                {c.localPack.cta}
              </button>
              <a href="#shop-contents" className={QUIET_LINK}>
                {c.starterPack.contentsCta}
              </a>
            </div>
          </>
        ) : null}

        {/* The strip only ever offers what is NOT on display. */}
        <div className="mt-4 flex flex-row gap-3 md:mt-5">
          {alternates.map((alt) => (
            <button
              key={alt.id}
              type="button"
              onClick={() => setShot(alt.id)}
              aria-label={alt.label}
              className="pro-focus-ring block rounded-[6px] bg-white/[0.07] p-1 opacity-[0.88] transition-opacity hover:opacity-100"
              data-testid={`shop-shot-${alt.id}`}
            >
              <img
                src={alt.thumb}
                alt=""
                width={160}
                height={207}
                loading="lazy"
                className="block h-[46px] w-9 object-contain"
              />
            </button>
          ))}
        </div>
      </div>
    </DestinationTop>
  );
}
