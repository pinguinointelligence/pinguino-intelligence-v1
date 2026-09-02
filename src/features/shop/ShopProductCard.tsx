import { cn } from '@/lib/cn';
import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import { shopAvailabilityLabelPl, shopCopy as c, shopGrams, shopMoney } from '@/copy/shop';
import type { ShopAllergen, ShopProduct } from '@/services/shop';
import { ShopReservedFrame } from './ShopPackaging';
import { shopProductName } from './shopProductName';

/**
 * One single ingredient, as a COMPACT COMMERCE ROW — Shop C3.
 *
 * Not a card: no border, no fill, no shadow. A hairline above it, a reserved
 * image frame at the left, then the name, one useful line, and price with
 * €/kg, availability and one action on a single baseline. Two columns on
 * desktop, one on a phone, so seven articles read as a catalogue rather than as
 * seven small landing pages.
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
    <>
      {allergens.map((allergen) => (
        <span key={allergen} data-shop-allergen={allergen}>
          {' · '}
          {ALLERGEN_LABEL[allergen] ?? allergen}
        </span>
      ))}
    </>
  );
}

/** Availability in words. Colour supports the statement; it never replaces it. */
export function ShopAvailabilityChip({ product }: { product: ShopProduct }) {
  const preorder = product.availability === 'preorder';
  const soldOut = product.availability === 'out_of_stock';
  return (
    <span
      className={cn(
        'shrink-0 text-[11.5px] whitespace-nowrap',
        preorder
          ? 'font-semibold text-[var(--g-attention-ink)]'
          : soldOut
            ? 'text-[var(--g-lock)]'
            : 'text-[var(--g-text-secondary)]',
      )}
      data-availability={product.availability}
    >
      {shopAvailabilityLabelPl(product.availability, product.leadTimeWeeks)}
    </span>
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
  const name = shopProductName(product);
  const perKg =
    product.packSizeG && product.packSizeG > 0
      ? shopMoney(Math.round((product.priceCents / product.packSizeG) * 1000), product.currency)
      : null;

  return (
    <article
      className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3.5 border-t border-[var(--g-line-quiet)] py-[17px] md:grid-cols-[76px_minmax(0,1fr)] md:gap-[18px] md:py-5"
      data-testid={`shop-card-${product.sku}`}
      data-availability={product.availability}
    >
      <ShopReservedFrame />

      <div className="min-w-0">
        <h3 className="text-[15.5px] leading-[1.25] font-bold tracking-[-0.015em]">{name}</h3>
        <p className="mt-1 text-[12.5px] leading-[1.45] text-[var(--g-text-secondary)]">
          {product.packSizeG ? (
            <b className="font-mono font-medium tabular-nums">{shopGrams(product.packSizeG)}</b>
          ) : null}
          {product.packSizeG && product.description ? ' · ' : null}
          {product.description}
          <ShopAllergenTags allergens={product.allergens} />
        </p>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2.5 md:mt-3 md:flex-nowrap md:gap-3.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[16px] font-semibold tabular-nums">
              {shopMoney(product.priceCents, product.currency)}
            </span>
            {perKg ? (
              <span className="font-mono text-[11px] whitespace-nowrap text-[var(--g-text-secondary)] tabular-nums">
                {perKg} {c.product.perKg}
              </span>
            ) : null}
          </div>
          <ShopAvailabilityChip product={product} />
          <button
            type="button"
            onClick={onAdd}
            disabled={soldOut}
            className={applicationSecondaryClasses(
              cn(
                'w-full shrink-0 text-[12.5px] md:w-auto',
                'disabled:cursor-not-allowed disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)] disabled:opacity-100',
              ),
            )}
            data-testid={`shop-add-${product.sku}`}
          >
            {inCart ? c.product.added : c.product.add}
          </button>
        </div>
      </div>
    </article>
  );
}
