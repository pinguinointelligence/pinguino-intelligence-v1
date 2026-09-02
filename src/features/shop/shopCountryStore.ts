import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getShopCountries,
  starterPackModeFor,
  type ShopCountry,
  type StarterPackMode,
} from '@/services/shopCountries';

interface ShopCountryState {
  /** ISO-3166-1 alpha-2, or null until the customer answers. */
  selected: string | null;
  countries: ShopCountry[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  select: (iso2: string) => void;
  load: () => Promise<void>;
}

/**
 * WHERE ARE YOU STARTING? — the answer, remembered.
 *
 * Only the ISO code is persisted. Availability is NOT: a country that was
 * local-only yesterday may ship today, and a stale cached flag would offer a
 * customer a pack we cannot send. The list is re-read from the authority on
 * every load, and the persisted code is merely a pointer into it.
 *
 * Nothing here decides a price. The store holds a choice; the server resolves
 * what that choice costs.
 */
export const useShopCountryStore = create<ShopCountryState>()(
  persist(
    (set, get) => ({
      selected: null,
      countries: [],
      loaded: false,
      loading: false,
      error: null,
      select: (iso2) => set({ selected: iso2.toUpperCase() }),
      load: async () => {
        if (get().loading || get().loaded) return;
        set({ loading: true, error: null });
        try {
          const countries = await getShopCountries();
          set({ countries, loaded: true, loading: false });
        } catch (cause) {
          set({
            loading: false,
            loaded: true,
            error: cause instanceof Error ? cause.message : 'unavailable',
          });
        }
      },
    }),
    {
      name: 'gellatti-shop-country',
      /* The choice survives a reload; the availability that choice implies does
         not. Persisting `countries` would let an old build promise shipping to
         a country Admin has since switched off. */
      partialize: (state) => ({ selected: state.selected }),
    },
  ),
);

/** The resolved country record for the current choice, or null. */
export const selectedShopCountry = (state: ShopCountryState): ShopCountry | null =>
  state.countries.find((country) => country.iso2 === state.selected) ?? null;

/** How the Starter Pack is fulfilled right now. `none` before a choice is made. */
export const selectedStarterPackMode = (state: ShopCountryState): StarterPackMode =>
  state.selected == null ? 'none' : starterPackModeFor(selectedShopCountry(state));
