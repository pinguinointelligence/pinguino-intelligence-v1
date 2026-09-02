/**
 * PINGÜINO — one shallow, destination-only global navigation model.
 *
 * The drawer is capability-driven and has three customer outputs: guest,
 * authenticated Home, and authenticated Pro. Contextual actions (create,
 * import, export), workbench tabs (Monitor, Versions), Production subsections,
 * and internal/admin tools deliberately do not belong here.
 */
import { copy } from '@/copy/en';

const s = copy.shell;

export type NavigationAudience = 'guest' | 'home' | 'pro';
export type NavGroupId = 'product' | 'ecosystem';

export interface NavigationCapabilities {
  authenticated: boolean;
  canSaveRecipes: boolean;
  canUseProductionMode: boolean;
}

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
  audiences: readonly NavigationAudience[];
  /** Plan workspace entries are rendered as the drawer's canonical title link. */
  workspaceHome?: boolean;
  isActive: (loc: NavLocation) => boolean;
}

const exact = (path: string) => (loc: NavLocation) => loc.pathname === path;
const anyOf =
  (...paths: string[]) =>
  (loc: NavLocation) =>
    paths.includes(loc.pathname);
const pathOrNested = (path: string) => (loc: NavLocation) =>
  loc.pathname === path || loc.pathname.startsWith(`${path}/`);

const recipeDestination = (loc: NavLocation) =>
  pathOrNested('/recipes')(loc) || loc.pathname === '/my-recipes';
const productionDestination = (loc: NavLocation) =>
  pathOrNested('/production')(loc) || ['/pro/production', '/pro/history'].includes(loc.pathname);
const productsDestination = (loc: NavLocation) =>
  pathOrNested('/products')(loc) ||
  ['/create-ingredient', '/products/import'].includes(loc.pathname);
const communityDestination = (loc: NavLocation) =>
  ['/community', '/top100', '/creator'].includes(loc.pathname);
const machineDestination = (loc: NavLocation) =>
  ['/machine', '/profile/machine', '/pro/machine'].includes(loc.pathname);
const proWorkspaceDestination = (loc: NavLocation) =>
  loc.pathname === '/pro' ||
  [
    '/pro/recipe',
    '/pro/monitor',
    '/pro/versions',
    '/pro/costs',
    '/pro/exports',
    '/pro/tools',
  ].includes(loc.pathname);

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  {
    id: 'tryPinguino',
    label: s.items.tryPinguino,
    to: '/start',
    group: 'product',
    order: 1,
    audiences: ['guest'],
    isActive: exact('/start'),
  },
  {
    id: 'howItWorks',
    label: s.items.howItWorks,
    to: '/how-it-works',
    group: 'product',
    order: 2,
    audiences: ['guest'],
    isActive: exact('/how-it-works'),
  },
  {
    id: 'guestShop',
    label: s.items.shop,
    to: '/shop',
    group: 'product',
    order: 3,
    audiences: ['guest'],
    isActive: exact('/shop'),
  },
  {
    id: 'plans',
    label: s.items.plans,
    to: '/subscription',
    group: 'product',
    order: 4,
    audiences: ['guest'],
    isActive: exact('/subscription'),
  },
  {
    id: 'homeWorkspace',
    label: s.items.homeWorkspace,
    to: '/home',
    group: 'product',
    order: 0,
    audiences: ['home'],
    workspaceHome: true,
    isActive: anyOf('/home'),
  },
  {
    id: 'proWorkspace',
    label: s.items.proWorkspace,
    to: '/pro/recipe',
    group: 'product',
    order: 0,
    audiences: ['pro'],
    workspaceHome: true,
    isActive: proWorkspaceDestination,
  },
  {
    id: 'recipes',
    label: s.items.recipes,
    to: '/recipes?tab=mine',
    group: 'product',
    order: 1,
    audiences: ['home', 'pro'],
    isActive: recipeDestination,
  },
  {
    id: 'production',
    label: s.items.production,
    to: '/production',
    group: 'product',
    order: 2,
    audiences: ['pro'],
    isActive: productionDestination,
  },
  {
    id: 'products',
    label: s.items.products,
    to: '/products',
    group: 'product',
    order: 3,
    audiences: ['home', 'pro'],
    isActive: productsDestination,
  },
  {
    id: 'machine',
    label: s.items.machine,
    to: '/machine',
    group: 'product',
    order: 5,
    audiences: ['home', 'pro'],
    isActive: machineDestination,
  },
  {
    id: 'memberShop',
    label: s.items.shop,
    to: '/shop',
    group: 'ecosystem',
    order: 1,
    audiences: ['home', 'pro'],
    isActive: exact('/shop'),
  },
  {
    id: 'community',
    label: s.items.community,
    to: '/community',
    group: 'ecosystem',
    order: 0,
    audiences: ['guest', 'home', 'pro'],
    isActive: communityDestination,
  },
  /**
   * GELLATTI AFFILIATE — the public programme destination.
   *
   * It takes the ecosystem slot Work With Us used to hold in the drawer. Work
   * With Us is NOT deleted: `/work-with-us` still routes and still serves the
   * business-equipment lanes (machines, mobile, trailer, franchise, leads), and
   * the Franchise entry below still reaches that family. What changed is the
   * PRIMARY drawer, where the owner wants the recurring-commission programme
   * rather than the equipment gateway.
   */
  {
    id: 'affiliate',
    label: s.items.affiliate,
    to: '/affiliate',
    group: 'ecosystem',
    order: 2,
    audiences: ['guest', 'home', 'pro'],
    isActive: exact('/affiliate'),
  },
  {
    id: 'franchise',
    label: s.items.franchise,
    to: '/franchise',
    group: 'ecosystem',
    order: 3,
    audiences: ['guest', 'home', 'pro'],
    isActive: exact('/franchise'),
  },
];

export const NAV_GROUP_ORDER: readonly NavGroupId[] = ['product', 'ecosystem'];

export function navigationAudience(capabilities: NavigationCapabilities): NavigationAudience {
  if (!capabilities.authenticated) return 'guest';
  if (capabilities.canUseProductionMode) return 'pro';
  if (capabilities.canSaveRecipes) return 'home';
  return 'guest';
}

export function visibleNavItems(audience: NavigationAudience): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => item.audiences.includes(audience)).sort(
    (left, right) =>
      NAV_GROUP_ORDER.indexOf(left.group) - NAV_GROUP_ORDER.indexOf(right.group) ||
      left.order - right.order,
  );
}

export function activeNavId(loc: NavLocation, audience: NavigationAudience): string | null {
  const active = visibleNavItems(audience).filter((item) => item.isActive(loc));
  if (active.length === 0) return null;
  return active.reduce((best, item) => (item.to.length > best.to.length ? item : best)).id;
}

export function isGroupActive(
  group: NavGroupId,
  loc: NavLocation,
  audience: NavigationAudience,
): boolean {
  return visibleNavItems(audience).some((item) => item.group === group && item.isActive(loc));
}
