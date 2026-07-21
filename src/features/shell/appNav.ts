/**
 * PINGÜINO — the ONE canonical navigation configuration (source of truth).
 *
 * Every application shell (start, Studio, PINGÜINO Pro, My Recipes, …) renders THIS config through
 * the one `AppNavDrawer`. No page hardcodes its own nav array. Items are grouped, ordered, and
 * filtered by CAPABILITY (never by label/email/visual-hiding); active state is computed by an
 * explicit matcher so nested routes, `?tab=` deep-links and refresh all light the correct item.
 *
 * Every `to` is a route that ACTUALLY EXISTS in src/app/router.tsx — no dead links, never `/dev/*`.
 * The PINGÜINO Pro workspace uses the stable `/pro?tab=<id>` contract (ProWorkspacePage restores the
 * tab on direct-link + refresh); Pro subitems are gated by `requires: 'pro'`, and a single safe
 * upsell entry (`onlyNonPro`) is shown to everyone else — never the active Pro subroutes.
 */
import { copy } from '@/copy/en';

const s = copy.shell;

export type NavGroupId = 'main' | 'pro' | 'tools' | 'plan';

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
  /** Show only when the user does NOT have Pro (the single safe upsell). */
  onlyNonPro?: boolean;
  /** True when the current location should highlight this item. */
  isActive: (loc: NavLocation) => boolean;
}

const tabOf = (search: string): string =>
  new URLSearchParams(search).get('tab') ?? 'recipe';

const exact = (path: string) => (loc: NavLocation) => loc.pathname === path;
const proTab = (tab: string) => (loc: NavLocation) =>
  loc.pathname === '/pro' && tabOf(loc.search) === tab;

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  // ── Nawigacja ──
  { id: 'home', label: s.items.home, to: '/', group: 'main', order: 1, isActive: exact('/') },
  { id: 'start', label: s.items.start, to: '/start', group: 'main', order: 2, isActive: exact('/start') },
  { id: 'recipes', label: s.items.recipes, to: '/recipes', group: 'main', order: 3, isActive: exact('/recipes') },
  { id: 'myRecipes', label: s.items.myRecipes, to: '/my-recipes', group: 'main', order: 4, isActive: exact('/my-recipes') },

  // ── PINGÜINO Pro (Pro sees the 8 subitems; everyone else sees ONE safe upsell) ──
  { id: 'proUpsell', label: s.items.proHome, to: '/pro', group: 'pro', order: 10, onlyNonPro: true, isActive: exact('/pro') },
  { id: 'proRecipe', label: s.items.proRecipe, to: '/pro?tab=recipe', group: 'pro', order: 11, requires: 'pro', isActive: proTab('recipe') },
  { id: 'proMonitor', label: s.items.proMonitor, to: '/pro?tab=monitor', group: 'pro', order: 12, requires: 'pro', isActive: proTab('monitor') },
  { id: 'proVersions', label: s.items.proVersions, to: '/pro?tab=versions', group: 'pro', order: 13, requires: 'pro', isActive: proTab('versions') },
  { id: 'proProduction', label: s.items.proProduction, to: '/pro?tab=production', group: 'pro', order: 14, requires: 'pro', isActive: proTab('production') },
  { id: 'proHistory', label: s.items.proHistory, to: '/pro?tab=history', group: 'pro', order: 15, requires: 'pro', isActive: proTab('history') },
  { id: 'proCosts', label: s.items.proCosts, to: '/pro?tab=costs', group: 'pro', order: 16, requires: 'pro', isActive: proTab('costs') },
  { id: 'proExports', label: s.items.proExports, to: '/pro?tab=exports', group: 'pro', order: 17, requires: 'pro', isActive: proTab('exports') },
  { id: 'proSettings', label: s.items.proSettings, to: '/pro?tab=settings', group: 'pro', order: 18, requires: 'pro', isActive: proTab('settings') },

  // ── Narzędzia (only working, non-/dev destinations) ──
  { id: 'machine', label: s.items.machine, to: '/profile/machine', group: 'tools', order: 20, isActive: exact('/profile/machine') },
  { id: 'labels', label: s.items.labels, to: '/label', group: 'tools', order: 21, isActive: exact('/label') },

  // ── Plan i konto ──
  { id: 'subscription', label: s.items.subscription, to: '/subscription', group: 'plan', order: 30, isActive: exact('/subscription') },
];

export const NAV_GROUP_ORDER: readonly NavGroupId[] = ['main', 'pro', 'tools', 'plan'];
export const NAV_GROUP_TITLE: Record<NavGroupId, string> = {
  main: s.groups.main,
  pro: s.groups.pro,
  tools: s.groups.tools,
  plan: s.groups.plan,
};

/** Filter the canonical items for a persona's capabilities (the ONLY authorization gate). */
export function visibleNavItems(canPro: boolean): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => {
    if (item.requires === 'pro' && !canPro) return false;
    if (item.onlyNonPro && canPro) return false;
    return true;
  }).sort((a, b) => a.order - b.order);
}

/** The active item id for a location (first matcher wins), or null. */
export function activeNavId(loc: NavLocation, canPro: boolean): string | null {
  return visibleNavItems(canPro).find((item) => item.isActive(loc))?.id ?? null;
}

/** True when any item in a group is active (parent-group highlight). */
export function isGroupActive(group: NavGroupId, loc: NavLocation, canPro: boolean): boolean {
  return visibleNavItems(canPro).some((item) => item.group === group && item.isActive(loc));
}
