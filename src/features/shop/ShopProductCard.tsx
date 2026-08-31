import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { shopAvailabilityLabelPl, shopCopy as c, shopGrams, shopMoney } from '@/copy/shop';
import type { ShopAllergen, ShopProduct } from '@/services/shop';
import { shopContentTitle } from './shopContentTitle';
import { ShopPackFrame } from './ShopPackaging';

/**
 * One article, in the approved Shop card language.
 *
 * MASTER DESIGNBOOK §7 "Shop" and the approved screen (`?preview=shop`): a
 * white 12 px card with an 18 px inset, opening on a dashed neutral packaging
 * frame; then the product title with its pack size in mono, an availability
 * chip aligned to the title, one short line of copy, and a single graphite
 * action. No second CTA, no orange, no shadow on the card itself.
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

/** The availability chip. State is named in words; colour only supports it. */
export function ShopAvailabilityChip({ product }: { product: ShopProduct }) {
  const preorder = product.availability === 'preorder';
  const soldOut = product.availability === 'out_of_stock';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px]',
        preorder
          ? 'border-[var(--g-orange)]/45 bg-[var(--g-attention-surface)] text-[var(--g-attention-ink)]'
          : soldOut
            ? 'border-[var(--g-line-strong)] bg-[var(--g-line-quiet)] text-[var(--g-lock)]'
            : 'border-status-ideal/35 bg-status-ideal/10 text-[#46513f]',
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
  const name = shopContentTitle(product.title);
  const perKg =
    product.packSizeG && product.packSizeG > 0
      ? shopMoney(Math.round((product.priceCents / product.packSizeG) * 1000), product.currency)
      : null;

  return (
    <article
      className="flex flex-col rounded-[12px] border border-[var(--g-line)] bg-white p-[18px]"
      data-testid={`shop-card-${product.sku}`}
      data-availability={product.availability}
    >
      <ShopPackFrame
        title={name}
        meta={product.packSizeG ? shopGrams(product.packSizeG) : null}
      />

      <div className="mt-[18px] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[19px] leading-[1.2] font-bold tracking-[-0.02em]">{name}</h3>
          {product.packSizeG ? (
            <p className="mt-1 font-mono text-[12px] text-[var(--g-text-secondary)]">
              {shopGrams(product.packSizeG)}
            </p>
          ) : null}
        </div>
        <ShopAvailabilityChip product={product} />
      </div>

      {product.description ? (
        <p className="mt-3 flex-1 text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
          {product.description}
        </p>
      ) : (
        <div className="flex-1" />
      )}
      <ShopAllergenTags allergens={product.allergens} />

      <div className="mt-[18px] flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[20px] text-ink tabular-nums">
            {shopMoney(product.priceCents, product.currency)}
          </p>
          {perKg ? (
            <p className="mt-0.5 font-mono text-[11px] text-[var(--g-text-secondary)]">
              {perKg} {c.product.perKg}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={soldOut}
          className={cn(
            buttonClasses('primary', 'sm'),
            'shrink-0',
            // Readable disabled: --g-lock on --g-line-quiet is 5.03:1, where the
            // shared `disabled:opacity-45` drops the label to 2.88:1.
            'disabled:cursor-not-allowed disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)] disabled:opacity-100',
          )}
          data-testid={`shop-add-${product.sku}`}
        >
          {inCart ? c.product.added : c.product.add}
        </button>
      </div>
    </article>
  );
}
