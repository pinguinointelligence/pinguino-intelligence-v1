import { shopCopy as c, shopGrams } from '@/copy/shop';
import type { ShopProduct } from '@/services/shop';
import { shopContentTitle } from './shopContentTitle';

/**
 * `W zestawie` — product detail, never a second product.
 *
 * Shop C3: ONE hairline joins the list to the offer above it and there are no
 * rules inside. Names left, packed grams right-aligned in mono, and `Razem`
 * closes the block on weight alone. No bars, no cards, no ingredient
 * illustrations, no repeated descriptions.
 *
 * This is the one place the exact gramatures are stated; the offer above states
 * only the total.
 */
export function ShopStarterContents({ product }: { product: ShopProduct }) {
  /* Heaviest packed portion first, then alphabetical — a stable order the
     catalogue query does not guarantee, so the two 250 g lines always open the
     list as the approved screen shows them. Presentation only. */
  const packed = [...product.contents].sort(
    (a, b) => (b.packSizeG ?? 0) - (a.packSizeG ?? 0) || a.title.localeCompare(b.title, 'pl'),
  );
  return (
    <section
      id="shop-contents"
      aria-labelledby="shop-contents-title"
      className="mt-9 border-t border-[var(--g-line)] pt-7 md:mt-13 md:pt-9"
    >
      <h2
        id="shop-contents-title"
        className="text-[10px] leading-[1.25] font-bold tracking-[0.16em] text-[var(--g-text-secondary)] uppercase"
      >
        {c.starterPack.contents}
      </h2>

      <ul className="mt-3 grid sm:grid-cols-2 sm:gap-x-20">
        {packed.map((entry) => (
          <li
            key={entry.sku}
            className="flex items-baseline justify-between gap-5 py-[7px] text-[14.5px] md:py-[9px]"
          >
            <span className="min-w-0">{shopContentTitle(entry.title)}</span>
            <span className="shrink-0 font-mono text-[13.5px] text-[var(--g-text-secondary)] tabular-nums">
              {entry.packSizeG ? shopGrams(entry.packSizeG) : '—'}
            </span>
          </li>
        ))}
      </ul>

      {product.contentsTotalG ? (
        <div className="mt-4 flex items-baseline justify-between gap-5 sm:mt-5 sm:max-w-[calc(50%-40px)]">
          <span className="text-[14.5px] font-bold">{c.starterPack.contentsTotalShort}</span>
          <strong
            className="font-mono text-[17px] font-semibold tabular-nums"
            data-testid="shop-contents-total"
          >
            {shopGrams(product.contentsTotalG)}
          </strong>
        </div>
      ) : null}
    </section>
  );
}
