import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { shopCopy as c, shopGrams, shopMoney } from '@/copy/shop';
import type { ShopProduct } from '@/services/shop';
import { shopContentTitle } from './shopContentTitle';
import { ShopPackFrame } from './ShopPackaging';
import { ShopAllergenTags, ShopAvailabilityChip } from './ShopProductCard';
import { SHOP_SHIPPING_FLAT_CENTS } from './shopShipping';

/**
 * The Starter Pack, in the approved product-detail language.
 *
 * MASTER DESIGNBOOK §7 "Shop": the approved screen closes on a two-column
 * product-detail concept — packaging frame on the left, and on the right the
 * kicker, name, a short explanation and a stack of labelled spec rows whose
 * values are right-aligned mono. The purchase action sits under the rows.
 *
 * Everything numeric here comes from the commerce source: the packed grams,
 * the total, the price and the lead time. Nothing is written into copy.
 */
export function ShopStarterPack({
  product,
  inCart,
  onAdd,
}: {
  product: ShopProduct;
  inCart: boolean;
  onAdd: () => void;
}) {
  const soldOut = product.availability === 'out_of_stock';
  const perKg =
    product.contentsTotalG && product.contentsTotalG > 0
      ? shopMoney(
          Math.round((product.priceCents / product.contentsTotalG) * 1000),
          product.currency,
        )
      : null;

  const rows: Array<[string, string]> = [
    [
      c.starterPack.massRow,
      product.contentsTotalG ? shopGrams(product.contentsTotalG) : '—',
    ],
    [
      c.starterPack.priceRow,
      perKg
        ? `${shopMoney(product.priceCents, product.currency)} · ${perKg} ${c.product.perKg}`
        : shopMoney(product.priceCents, product.currency),
    ],
    [c.starterPack.shippingRow, shopMoney(SHOP_SHIPPING_FLAT_CENTS, product.currency)],
  ];

  return (
    <div
      className="grid gap-3.5 rounded-[12px] border border-[var(--g-line)] bg-white p-[18px] lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]"
      data-testid="shop-starter-pack"
    >
      <ShopPackFrame title={c.starterPack.packShotTitle} meta={
        product.contentsTotalG ? shopGrams(product.contentsTotalG) : null
      } size="detail" />

      <div className="flex flex-col">
        <p className="text-[10px] leading-[1.25] font-bold tracking-[0.16em] text-[var(--g-text-secondary)] uppercase">
          {c.starterPack.detailKicker}
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h3 id="shop-starter" className="text-[22px] leading-[1.2] font-bold tracking-[-0.025em]">
            {shopContentTitle(product.title)}
          </h3>
          <ShopAvailabilityChip product={product} />
        </div>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
          {c.starterPack.detailBody}
        </p>

        <dl className="mt-4 border-t border-[var(--g-line-quiet)]">
          {rows.map(([term, value]) => (
            <div
              key={term}
              className="flex items-baseline justify-between gap-4 border-b border-[var(--g-line-quiet)] py-2.5"
            >
              <dt className="text-[12px] text-[var(--g-text-secondary)]">{term}</dt>
              <dd className="text-right font-mono text-[13px] tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 border-b border-[var(--g-line-quiet)] py-2.5">
            <dt className="text-[12px] text-[var(--g-text-secondary)]">
              {c.starterPack.availabilityRow}
            </dt>
            <dd className="text-right text-[13px] font-semibold text-[var(--g-attention-ink)]">
              {c.product.preorderWeeks.replace('{weeks}', String(product.leadTimeWeeks ?? 0))}
            </dd>
          </div>
        </dl>

        <ShopAllergenTags allergens={product.allergens} />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onAdd}
            disabled={soldOut}
            className={cn(
              buttonClasses('primary', 'md'),
              'disabled:cursor-not-allowed disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)] disabled:opacity-100',
            )}
            data-testid={`shop-detail-add-${product.sku}`}
          >
            {inCart ? c.product.added : c.product.add}
          </button>
          <a href="#shop-contents" className={buttonClasses('ghost', 'md')}>
            {c.starterPack.contentsCta}
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * The packed contents, as a labelled list. This is the one place the exact
 * gramatures are stated; the hero states only the total.
 */
export function ShopStarterContents({ product }: { product: ShopProduct }) {
  return (
    <section id="shop-contents" aria-labelledby="shop-contents-title" className="mt-3">
      <div className="rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory-deep)] p-[18px]">
        <p className="text-[10px] leading-[1.25] font-bold tracking-[0.16em] text-[var(--g-text-secondary)] uppercase">
          {c.starterPack.contentsTitle}
        </p>
        <h3
          id="shop-contents-title"
          className="mt-1.5 text-[15px] font-semibold tracking-[-0.015em]"
        >
          {c.starterPack.contentsHelper}
        </h3>
        <ul className="mt-3.5 grid gap-0 border-t border-[var(--g-line)] sm:grid-cols-2 sm:gap-x-8">
          {product.contents.map((entry) => (
            <li
              key={entry.sku}
              className="flex items-baseline justify-between gap-4 border-b border-[var(--g-line)] py-2"
            >
              <span className="min-w-0 text-[13px] text-[var(--g-ink)]">
                {shopContentTitle(entry.title)}
              </span>
              <span className="shrink-0 font-mono text-[12px] text-[var(--g-text-secondary)] tabular-nums">
                {entry.packSizeG ? shopGrams(entry.packSizeG) : '—'}
              </span>
            </li>
          ))}
        </ul>
        {product.contentsTotalG ? (
          <div className="mt-3.5 flex items-baseline justify-between gap-4">
            <span className="text-[10px] font-bold tracking-[0.16em] text-[var(--g-text-secondary)] uppercase">
              {c.starterPack.packTotal}
            </span>
            <strong
              className="font-mono text-[20px] font-medium tabular-nums"
              data-testid="shop-contents-total"
            >
              {shopGrams(product.contentsTotalG)}
            </strong>
          </div>
        ) : null}
      </div>
    </section>
  );
}
