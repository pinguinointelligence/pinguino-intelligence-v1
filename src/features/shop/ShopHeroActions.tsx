import { useQuery } from '@tanstack/react-query';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { getShopCatalog } from '@/services/shop';
import { shopAvailabilityLabelPl, shopCopy as c } from '@/copy/shop';
import { useShopCartStore } from './shopCartStore';

/**
 * The approved Shop hero action row: an availability chip beside one primary
 * action — the same `chip + primary` pair the approved screen uses, with the
 * live product's real availability instead of a concept label.
 *
 * MASTER DESIGNBOOK §9: graphite primary is the key action; the orange chip is
 * attention, never decoration. Exactly one call to action in this view.
 */
export function ShopHeroActions() {
  const catalog = useQuery({ queryKey: ['shop-catalog'], queryFn: getShopCatalog });
  const cart = useShopCartStore();
  const bundle = catalog.data?.find((product) => product.kind === 'bundle');
  if (!bundle) return null;
  const inCart = cart.lines.some((line) => line.sku === bundle.sku);
  const soldOut = bundle.availability === 'out_of_stock';
  const preorder = bundle.availability === 'preorder';

  return (
    <>
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-[11px] py-[5px] text-[11px] font-semibold',
          preorder
            ? 'border-[var(--g-orange)]/45 bg-[var(--g-attention-surface)] text-[var(--g-attention-ink)]'
            : soldOut
              ? 'border-[var(--g-line-strong)] bg-[var(--g-line-quiet)] text-[var(--g-lock)]'
              : 'border-[var(--g-line)] bg-white text-[var(--g-text-secondary)]',
        )}
        data-testid="shop-hero-availability"
      >
        {shopAvailabilityLabelPl(bundle.availability, bundle.leadTimeWeeks)}
      </span>
      <button
        type="button"
        onClick={() => cart.add(bundle.sku)}
        disabled={soldOut}
        className={cn(
          buttonClasses('primary', 'md'),
          'disabled:cursor-not-allowed disabled:border-[var(--g-line-strong)] disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)] disabled:opacity-100',
        )}
        data-testid={`shop-add-${bundle.sku}`}
      >
        {inCart ? c.product.added : c.product.add}
      </button>
    </>
  );
}
