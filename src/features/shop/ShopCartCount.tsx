import { useShopCartStore } from './shopCartStore';

/**
 * The basket count for the Shop's own utility line.
 *
 * SHOP C3 §8: `Koszyk` lives BELOW the frozen global header. Putting it in the
 * header would push HOME | PRO out of its one frozen position, and at 390 the
 * row has no room for it at all.
 */
export function ShopCartCount() {
  const lines = useShopCartStore((state) => state.lines);
  return <>{lines.reduce((sum, line) => sum + line.quantity, 0)}</>;
}
