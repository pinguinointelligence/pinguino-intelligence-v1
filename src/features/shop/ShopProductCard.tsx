import { cn } from '@/lib/cn';
import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import { shopAvailabilityLabelPl, shopCopy as c, shopGrams, shopMoney } from '@/copy/shop';
import type { ShopAllergen, ShopProduct } from '@/services/shop';
import { shopContentTitle } from './shopContentTitle';

/**
 * One article, one card.
 *
 * The cards used to disagree with each other: the availability chip sat beside
 * the title, so a long title pushed it onto a second line and that card stood
 * taller than its neighbours. Availability is a fact about BUYING, so it now
 * lives once, in the footer beside the price and the button — where the
 * decision is made — and the header only ever holds the name.
 *
 * The description flexes, which is what keeps every card in a row the same
 * height without truncating anything.
 */

const ALLERGEN_LABEL: Readonly<Record<ShopAllergen, string>> = {
  milk: c.product.containsMilk,
  egg: c.product.containsEgg,
};

/** Absence of a statement is not a claim of absence: an article with no
 *  allergen data renders nothing here, never „no allergens". */
export function ShopAllergenTags({ allergens }: { allergens: readonly ShopAllergen[] }) {
  if (allergens.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {allergens.map((allergen) => (
        <span
          key={allergen}
          className="inline-flex rounded-md border border-[var(--g-line)] px-1.5 py-0.5 text-[10px] tracking-[0.04em] text-[var(--g-text-muted)] uppercase"
          data-shop-allergen={allergen}
        >
          {ALLERGEN_LABEL[allergen] ?? allergen}
        </span>
      ))}
    </div>
  );
}

export function ShopProductCard({
  product,
  inCart,
  onAdd,
}: {
  product: ShopProduct;
  inCart: boolean;
  onAdd: () => void;
}) {
  const soldOut = product.availability === 'out_of_stock';
  const preorder = product.availability === 'preorder';
  const perKg =
    product.packSizeG && product.packSizeG > 0
      ? shopMoney(Math.round((product.priceCents / product.packSizeG) * 1000), product.currency)
      : null;

  return (
    <article
      className="flex flex-col rounded-[var(--g-card-radius)] border border-[var(--g-line)] bg-white p-[18px] transition-colors hover:border-[var(--g-line-strong)]"
      data-testid={`shop-card-${product.sku}`}
      data-availability={product.availability}
    >
      <h3 className="text-[17px] leading-[1.25] font-semibold tracking-[-0.02em]">
        {shopContentTitle(product.title)}
      </h3>
      {product.packSizeG ? (
        <p className="mt-1 font-mono text-[11.5px] text-[var(--g-text-secondary)]">
          {shopGrams(product.packSizeG)}
        </p>
      ) : null}
      {product.description ? (
        <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-[var(--g-text-secondary)]">
          {product.description}
        </p>
      ) : (
        <div className="flex-1" />
      )}
      <ShopAllergenTags allergens={product.allergens} />

      <footer className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--g-line)] pt-3.5">
        <div className="min-w-0">
          <p className="font-mono text-[20px] text-ink tabular-nums">
            {shopMoney(product.priceCents, product.currency)}
          </p>
          {perKg ? (
            <p className="mt-0.5 font-mono text-[11px] text-[var(--g-text-secondary)]">
              {perKg} {c.product.perKg}
            </p>
          ) : null}
          <p
            className={cn(
              'mt-1.5 text-[11px]',
              preorder
                ? 'text-[var(--g-attention-ink)]'
                : soldOut
                  ? 'text-[var(--g-lock)]'
                  : 'text-[var(--g-text-secondary)]',
            )}
          >
            {shopAvailabilityLabelPl(product.availability, product.leadTimeWeeks)}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={soldOut}
          className={cn(
            applicationSecondaryClasses(),
            'shrink-0',
            // AA-safe disabled: --g-lock on --g-line-quiet measures 5.03:1,
            // where the old `opacity-45` dropped the label to 2.88:1.
            'disabled:cursor-not-allowed disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)]',
          )}
          data-testid={`shop-add-${product.sku}`}
        >
          {inCart ? c.product.added : c.product.add}
        </button>
      </footer>
    </article>
  );
}
