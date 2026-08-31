import { useQuery } from '@tanstack/react-query';
import { getShopCatalog } from '@/services/shop';
import { shopCopy as c, shopMoney } from '@/copy/shop';
import { SHOP_SHIPPING_FLAT_CENTS } from './shopShipping';

/**
 * The three facts a buyer wants before scrolling: what shipping costs, how long
 * the Starter Pack takes, and that the amount shown is the amount charged.
 *
 * They fill the left half of the hero, which was otherwise a large empty band
 * under a one-line blurb. The lead time is read from the catalogue rather than
 * written into copy, so it cannot drift from what Admin has set.
 */
export function ShopHeroFacts() {
  const catalog = useQuery({ queryKey: ['shop-catalog'], queryFn: getShopCatalog });
  const bundle = catalog.data?.find((product) => product.kind === 'bundle');
  const weeks = bundle?.leadTimeWeeks ?? null;

  const facts: Array<[string, string]> = [
    [
      c.hero.shippingLabel,
      c.hero.shippingValue.replace('{shipping}', shopMoney(SHOP_SHIPPING_FLAT_CENTS)),
    ],
    ...(weeks
      ? ([
          [c.hero.starterLabel, c.hero.starterValue.replace('{weeks}', String(weeks))],
        ] as Array<[string, string]>)
      : []),
    [c.hero.paymentLabel, c.hero.paymentValue],
  ];

  return (
    <dl
      className="grid w-full border-t border-[var(--g-line-strong)] sm:grid-cols-3"
      data-testid="shop-hero-facts"
    >
      {facts.map(([term, detail], index) => (
        <div
          key={term}
          className={
            index > 0
              ? 'border-t border-[var(--g-line-strong)] pt-4 sm:border-t-0 sm:border-l sm:pl-[18px]'
              : 'pt-4 pr-[18px]'
          }
        >
          <dt className="text-[9px] font-bold tracking-[0.1em] text-[var(--g-text-muted)] uppercase">
            {term}
          </dt>
          <dd className="mt-1.5 text-[12.5px] leading-[1.45] text-[var(--g-ink)]">
            {detail.split('\n').map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
