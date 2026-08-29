import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShopCartLine {
  sku: string;
  quantity: number;
}

interface ShopCartState {
  lines: ShopCartLine[];
  add: (sku: string) => void;
  setQuantity: (sku: string, quantity: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
}

/**
 * The cart is a customer convenience, not a source of truth: it holds SKUs and
 * quantities only. Every price, availability and lead time is resolved on the
 * server at checkout, so a stale or edited cart can never change what is
 * charged.
 */
export const useShopCartStore = create<ShopCartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (sku) =>
        set((state) => {
          const existing = state.lines.find((line) => line.sku === sku);
          return existing
            ? {
                lines: state.lines.map((line) =>
                  line.sku === sku
                    ? { ...line, quantity: Math.min(20, line.quantity + 1) }
                    : line,
                ),
              }
            : { lines: [...state.lines, { sku, quantity: 1 }] };
        }),
      setQuantity: (sku, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((line) => line.sku !== sku)
              : state.lines.map((line) =>
                  line.sku === sku ? { ...line, quantity: Math.min(20, quantity) } : line,
                ),
        })),
      remove: (sku) => set((state) => ({ lines: state.lines.filter((line) => line.sku !== sku) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'gellatti-shop-cart-v1' },
  ),
);
