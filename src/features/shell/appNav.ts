/**
 * PINGÜINO — the ONE canonical navigation configuration (source of truth).
 *
 * Every application shell renders THIS config through one drawer implementation. No page hardcodes
 * its own nav array. Items are grouped, ordered, and filtered by CAPABILITY (never by label/email/
 * visual-hiding); active state is computed by an explicit matcher so nested routes and refresh all
 * light the correct item.
 *
 * Owner P0 (2026-07-22, one canonical PINGÜINO Pro): there is NO separate customer-facing product
 * called "Studio" — the professional product is PINGÜINO Pro at `/pro`, its recipe editor at
 * `/pro/recipe`, and every Pro section has a STABLE path (`/pro/<section>`). The menu structure is
 * exactly: NAWIGACJA (8 items, incl. „PINGÜINO Pro" for everyone) → PINGÜINO PRO (8 Pro-gated
 * subitems) → KONTO (the account footer). The parent „PINGÜINO Pro" item stays visibly active on
 * every `/pro/*` subroute.
 *
 * Every `to` is a route that ACTUALLY EXISTS in src/app/router.tsx — no dead links, never `/dev/*`.
 */
import { copy } from '@/copy/en';

const s = copy.shell;

export type NavGroupId = 'main' | 'pro';

export interface NavLocation {
  pathname: string;
  search: string;
}

export interface AppNavItem {
  id: string;
  label: string;
  to: string;
  group: NavGroupId;
  order: number;
  /** Show only when the user has the Pro capability. */
  requires?: 'pro';
  /** True when the current location should highlight this item. */
  isActive: (loc: NavLocation) => boolean;
}

const exact = (path: string) => (loc: NavLocation) => loc.pathname === path;
/** A stable Pro section path (`/pro/<section>`). */
const proSection = (section: string) => (loc: NavLocation) => loc.pathname === `/pro/${section}`;
/** Any PINGÜINO Pro route — the parent item stays visibly active on every subroute. */
const anyPro = (loc: NavLocation) => loc.pathname === '/pro' || loc.pathname.startsWith('/pro/');
/** The canonical recipe editor — `/pro/recipe`, and bare `/pro` (the workspace root shows it). */
const proRecipeActive = (loc: NavLocation) =>
  loc.pathname === '/pro/recipe' || loc.pathname === '/pro';

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  // ── NAWIGACJA (owner-fixed order; „PINGÜINO Pro" is visible to EVERYONE — non-Pro lands on the honest gate) ──
  { id: 'home', label: s.items.home, to: '/', group: 'main', order: 1, isActive: exact('/') },
  { id: 'start', label: s.items.start, to: '/start', group: 'main', order: 2, isActive: exact('/start') },
  { id: 'proHome', label: s.items.proHome, to: '/pro', group: 'main', order: 3, isActive: anyPro },
  { id: 'recipes', label: s.items.recipes, to: '/recipes', group: 'main', order: 4, isActive: exact('/recipes') },
  { id: 'myRecipes', label: s.items.myRecipes, to: '/my-recipes', group: 'main', order: 5, isActive: exact('/my-recipes') },
  { id: 'machine', label: s.items.machine, to: '/profile/machine', group: 'main', order: 6, isActive: exact('/profile/machine') },
  { id: 'labels', label: s.items.labels, to: '/label', group: 'main', order: 7, isActive: exact('/label') },
  { id: 'subscription', label: s.items.subscription, to: '/subscription', group: 'main', order: 8, isActive: exact('/subscription') },

  // ── PINGÜINO PRO (stable /pro/<section> paths; Pro capability only) ──
  { id: 'proRecipe', label: s.items.proRecipe, to: '/pro/recipe', group: 'pro', order: 11, requires: 'pro', isActive: proRecipeActive },
  { id: 'proMonitor', label: s.items.proMonitor, to: '/pro/monitor', group: 'pro', order: 12, requires: 'pro', isActive: proSection('monitor') },
  { id: 'proVersions', label: s.items.proVersions, to: '/pro/versions', group: 'pro', order: 13, requires: 'pro', isActive: proSection('versions') },
  { id: 'proProduction', label: s.items.proProduction, to: '/pro/production', group: 'pro', order: 14, requires: 'pro', isActive: proSection('production') },
  { id: 'proHistory', label: s.items.proHistory, to: '/pro/history', group: 'pro', order: 15, requires: 'pro', isActive: proSection('history') },
  { id: 'proCosts', label: s.items.proCosts, to: '/pro/costs', group: 'pro', order: 16, requires: 'pro', isActive: proSection('costs') },
  { id: 'proExports', label: s.items.proExports, to: '/pro/exports', group: 'pro', order: 17, requires: 'pro', isActive: proSection('exports') },
  { id: 'proSettings', label: s.items.proSettings, to: '/pro/settings', group: 'pro', order: 18, requires: 'pro', isActive: proSection('settings') },
];

export const NAV_GROUP_ORDER: readonly NavGroupId[] = ['main', 'pro'];
export const NAV_GROUP_TITLE: Record<NavGroupId, string> = {
  main: s.groups.main,
  pro: s.groups.pro,
};

/** Filter the canonical items for a persona's capabilities (the ONLY authorization gate). */
export function visibleNavItems(canPro: boolean): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => !(item.requires === 'pro' && !canPro)).sort(
    (a, b) => a.order - b.order,
  );
}

/** The active item id for a location — the MOST SPECIFIC match (longest `to`), or null. */
export function activeNavId(loc: NavLocation, canPro: boolean): string | null {
  const active = visibleNavItems(canPro).filter((item) => item.isActive(loc));
  if (active.length === 0) return null;
  return active.reduce((best, item) => (item.to.length > best.to.length ? item : best)).id;
}

/** True when any item in a group is active (parent-group highlight). */
export function isGroupActive(group: NavGroupId, loc: NavLocation, canPro: boolean): boolean {
  return visibleNavItems(canPro).some((item) => item.group === group && item.isActive(loc));
}
