/**
 * Customer-shell global navigation model (presentational data only).
 *
 * Every entry points at a route that ACTUALLY EXISTS in `src/app/router.tsx`.
 * Non-existent destinations (`/production`, `/production-history`, `/costs`,
 * `/konto`, `/pomoc`) are deliberately absent — we never link a broken page. The
 * `/classic` diagnostic surface is kept OUT of the primary list (see
 * `CUSTOMER_MENU_DIAGNOSTIC_ROUTE`). Labels live in `customerShellCopy.menu`.
 */

/** Copy key → real route. `key` indexes `customerShellCopy.menu.primary`. */
export interface CustomerMenuItem {
  key: 'home' | 'start' | 'studio' | 'recipes' | 'myRecipes' | 'label' | 'subscription';
  to: string;
}

/**
 * Slice A routing (owner-approved): `/` is the public LANDING page and the
 * customer flow lives at `/start` — so the menu carries both: "Strona główna"
 * (landing) and "Stwórz recepturę" (the flow).
 */
export const CUSTOMER_MENU_ITEMS: readonly CustomerMenuItem[] = [
  { key: 'home', to: '/' },
  { key: 'start', to: '/start' },
  { key: 'studio', to: '/studio' },
  { key: 'recipes', to: '/recipes' },
  { key: 'myRecipes', to: '/my-recipes' },
  { key: 'label', to: '/label' },
  { key: 'subscription', to: '/subscription' },
];

/** The small diagnostic link — intentionally not a primary item. */
export const CUSTOMER_MENU_DIAGNOSTIC_ROUTE = '/classic' as const;
