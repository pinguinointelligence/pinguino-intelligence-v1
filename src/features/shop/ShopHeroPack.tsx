import { useQuery } from '@tanstack/react-query';
import { getShopCatalog } from '@/services/shop';
import { shopCopy as c, shopGrams } from '@/copy/shop';
import { ShopPackShot } from './ShopPackaging';

/**
 * The media half of the approved Shop hero.
 *
 * MASTER DESIGNBOOK §7: the Shop hero is greige copy on the left and a
 * controlled graphite half on the right holding a real packaging card. The
 * caption carries a real fact about the pack — seven ingredients, 1 125 g —
 * rather than announcing a missing photograph.
 *
 * It shares the `shop-catalog` query with the catalogue below, so the hero and
 * the product can never disagree about what is in the box.
 */
export function ShopHeroPack() {
  const catalog = useQuery({ queryKey: ['shop-catalog'], queryFn: getShopCatalog });
  const bundle = catalog.data?.find((product) => product.kind === 'bundle');
  const caption =
    bundle && bundle.contentsTotalG
      ? c.starterPack.packCaption
          .replace('{count}', String(bundle.contents.length))
          .replace('{grams}', shopGrams(bundle.contentsTotalG))
      : c.starterPack.kicker;
  return <ShopPackShot title={c.starterPack.packShotTitle} caption={caption} />;
}
