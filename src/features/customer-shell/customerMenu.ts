/**
 * Customer-shell global navigation model (presentational data only).
 *
 * Every entry points at a route that ACTUALLY EXISTS in `src/app/router.tsx`.
 * Non-existent destinations (`/production`, `/production-history`, `/costs`,
 * `/konto`, `/pomoc`) are deliberately absent — we never link a broken page. The
 * legacy `/classic` surface was retired (owner decision 2026-07-17: it now
 * redirects to `/start`), so the menu no longer links it at all. Labels live in
 * `customerShellCopy.menu`.
 */

/** Copy key → real route. `key` indexes `customerShellCopy.menu.primary`. */
export interface CustomerMenuItem {
  key: 'home' | 'start' | 'studio' | 'recipes' | 'myRecipes' | 'machine' | 'label' | 'subscription';
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
  // UIUX Slice B (§8.6): the saved Home machine profile („Profil → Moja maszyna").
  { key: 'machine', to: '/profile/machine' },
  { key: 'label', to: '/label' },
  { key: 'subscription', to: '/subscription' },
];
