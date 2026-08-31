import { useQuery } from '@tanstack/react-query';
import { getShopCatalog, type ShopProduct } from '@/services/shop';
import { shopCopy as c, shopGrams } from '@/copy/shop';
import { shopContentTitle } from './shopContentTitle';

/**
 * The Starter Pack, presented.
 *
 * The Shop hero used to end in a dashed rectangle that said, in words, that no
 * photograph existed. Gellatti has no packaging photography yet — so instead of
 * announcing the absence, this panel presents the product with the one thing
 * the shop genuinely owns: exactly what is in the box.
 *
 * Seven rows, each bar drawn to scale against the largest portion, so the 250 g
 * items read as twice the 125 g ones at a glance, and the box total closes it.
 * Nothing here is decorative — every number comes from `shop_bundle_items`.
 *
 * The ivory here is `--color-education-ivory`, NOT `--color-ivory`: the light
 * PRO theme deliberately remaps the historical `ivory` TEXT token to ink, so
 * `text-ivory` on this page would paint near-black on near-black graphite and
 * the panel would render blank. The three greys are the inverse vocabulary
 * `destinationEditorial.tsx` already established for copy on graphite
 * (#aaa7a1 eyebrow, #c6c3bd body, #a9a69f note) rather than three new
 * near-misses beside them.
 */

export function ShopStarterSpecimenPanel({ bundle }: { bundle: ShopProduct }) {
  const largest = bundle.contents.reduce(
    (max, entry) => Math.max(max, entry.packSizeG ?? 0),
    0,
  );
  return (
    <div
      className="flex flex-col justify-center bg-[var(--g-graphite)] p-[clamp(26px,3.2vw,42px)]"
      data-testid="shop-starter-specimen"
    >
      <span className="block text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[#aaa7a1] uppercase">
        {c.starterPack.kicker}
      </span>
      <h2 className="mt-2 text-[21px] font-bold tracking-[-0.03em] text-white">{bundle.title}</h2>
      <p className="mt-0.5 text-[11.5px] text-[#a9a69f]">{c.starterPack.specimenSub}</p>

      <ul className="mt-[22px] grid gap-[19px]">
        {bundle.contents.map((entry) => (
          <li
            key={entry.sku}
            className="grid grid-cols-[minmax(0,1fr)_86px] items-baseline gap-[14px]"
          >
            <span className="truncate text-[12.5px] text-[#c6c3bd]">
              {shopContentTitle(entry.title)}
            </span>
            <span className="text-right font-mono text-[12px] text-[var(--color-education-ivory)] tabular-nums">
              {entry.packSizeG ? shopGrams(entry.packSizeG) : '—'}
            </span>
            <span className="col-span-2 mt-[5px] block h-[3px] bg-white/10">
              <span
                className="block h-[3px] bg-[var(--color-education-ivory)]"
                style={{
                  width: largest > 0 ? `${Math.round(((entry.packSizeG ?? 0) / largest) * 100)}%` : '0%',
                }}
              />
            </span>
          </li>
        ))}
      </ul>

      {bundle.contentsTotalG ? (
        <div className="mt-[22px] flex items-baseline justify-between border-t border-white/12 pt-4">
          <span className="text-[9px] font-bold tracking-[0.1em] text-[#a9a69f] uppercase">
            {c.starterPack.packTotal}
          </span>
          <strong className="font-mono text-[22px] font-medium text-[var(--color-education-ivory)] tabular-nums">
            {shopGrams(bundle.contentsTotalG)}
          </strong>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The hero's right half. It shares the `shop-catalog` query with the catalogue
 * below, so the hero and the product card can never disagree about what is in
 * the box. Until the catalogue resolves the panel holds the band's height with
 * plain graphite rather than flashing a skeleton into the page composition.
 */
export function ShopStarterSpecimen() {
  const catalog = useQuery({ queryKey: ['shop-catalog'], queryFn: getShopCatalog });
  const bundle = catalog.data?.find((product) => product.kind === 'bundle');
  if (!bundle) return <div className="min-h-[190px] bg-[var(--g-graphite)]" />;
  return <ShopStarterSpecimenPanel bundle={bundle} />;
}
