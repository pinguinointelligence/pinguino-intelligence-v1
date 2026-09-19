/**
 * PINGÜINO — one shallow, destination-only global navigation model.
 *
 * The drawer is capability-driven and has three customer outputs: guest,
 * authenticated Home, and authenticated Pro. Contextual actions (create,
 * import, export), workbench tabs (Monitor, Versions), Production subsections,
 * and internal/admin tools deliberately do not belong here.
 */
import { copy } from '@/copy/en';
import { isProductionAreaLocation } from '@/features/production-area/productionAreaSections';

const s = copy.shell;

export type NavigationAudience = 'guest' | 'home' | 'pro';
export type NavGroupId = 'product' | 'ecosystem' | 'support';

export interface NavigationCapabilities {
  authenticated: boolean;
  canSaveRecipes: boolean;
  /* What makes the navigation PRO is the professional workbench, not the right to run a
     batch. OD-32 gave a signed-in HOME customer their own production batch; reading
     `canUseProductionMode` here would also have swapped their „Gellatti Home" workspace row
     for „Gellatti Pro", flipped the plan badge and pointed the wordmark at /pro/recipe —
     where `HomeSubscriberProRedirect` bounces them straight back out. */
  canUseProfessionalFlow: boolean;
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
/*
  OWNER DECISION 2026-09-17 (Produkcja area, GEL-P0-033 navigation clause) — ONE „Produkcja”
  entry replaces four (Produkcja, Produkty, Maszyna, Ustawienia etykiety). Partie · Produkty ·
  Maszyna · Etykiety are the SECTIONS of that one area, and the entry is current on every one
  of their addresses. `PRODUCTION_AREA_SECTIONS` is the single list both the section bar and
  this entry are matched against, so the two can never disagree.

  `/pro/production` is the recipe's own Produkcja tab inside the Pro workspace, not an area
  address: it marks „Pro”, like every other `/pro/*` workbench tab.
*/
const productionAreaDestination = (loc: NavLocation) => isProductionAreaLocation(loc);
/**
 * WHICH WORKSPACE IS THIS, not what is this customer entitled to.
 *
 * The drawer's first row names the workspace the customer is IN — „Home" on the
 * HOME routes, „Pro" inside the Pro workspace. That is a different question from
 * `navigationAudience`, which answers what they may SEE and still gates every
 * other row. Deriving the row from `canUseProductionMode` made a Pro subscriber
 * read „Pro" while they were working in HOME, and left no row current there.
 */
const proWorkspaceDestination = (loc: NavLocation) =>
  loc.pathname === '/pro' ||
  [
    '/pro/recipe',
    '/pro/monitor',
    '/pro/versions',
    '/pro/production',
    '/pro/costs',
    '/pro/exports',
    '/pro/tools',
  ].includes(loc.pathname);

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  {
    // The guest's way in is the canonical HOME creator (`/home`, which the root also
    // renders) — never the legacy `/start` shell, a second and different idea screen.
    id: 'tryPinguino',
    label: s.items.tryPinguino,
    to: '/home',
    group: 'product',
    order: 1,
    audiences: ['guest'],
    isActive: anyOf('/', '/home'),
  },
  {
    // `/recipes` serves guests (the Gellatti collection), so the guest drawer names it
    // too. A guest-only twin: the signed-in entry and its `?tab=mine` stay unchanged.
    id: 'guestRecipes',
    label: s.items.recipes,
    to: '/recipes',
    group: 'product',
    order: 1.75,
    audiences: ['guest'],
    isActive: recipeDestination,
  },
  {
    id: 'howItWorks',
    label: s.items.howItWorks,
    to: '/how-it-works',
    group: 'product',
    order: 1.5,
    audiences: ['guest', 'home', 'pro'],
    isActive: exact('/how-it-works'),
  },
  {
    id: 'guestShop',
    label: s.items.shop,
    to: '/shop',
    group: 'ecosystem',
    order: 0,
    audiences: ['guest'],
    isActive: exact('/shop'),
  },
  {
    id: 'plans',
    label: s.items.plans,
    to: '/subscription',
    group: 'ecosystem',
    order: 0.5,
    audiences: ['guest'],
    isActive: exact('/subscription'),
  },
  {
    id: 'homeWorkspace',
    label: s.items.homeWorkspace,
    to: '/home',
    group: 'product',
    order: 0,
    // A Pro subscriber works in HOME too, so this row is visible to both. WHICH of
    // the two workspace rows renders is decided by the LOCATION in visibleNavItems,
    // never by the plan.
    audiences: ['home', 'pro'],
    workspaceHome: true,
    isActive: anyOf('/home', '/'),
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
    // ONE entry for the whole Produkcja area (owner decision 2026-09-17), for HOME and PRO.
    // Produkty (with „Skanuj produkt”, Moje produkty, Niezweryfikowane), Maszyna and Etykiety
    // are its sections — reached from the area's section bar, never from separate drawer rows.
    id: 'production',
    label: s.items.production,
    to: '/production',
    group: 'product',
    order: 2,
    audiences: ['home', 'pro'],
    isActive: productionAreaDestination,
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
  // COLLABORATION IA (owner decision 2026-09-03): exactly TWO user-facing
  // entries. "Współpraca" / Work With Us is retired as a category — it was a
  // third door onto the same business conversation, and every operating format
  // it led to (maszyny, wózek, przyczepa, punkt) is a concept INSIDE Franchise,
  // not a top-level system. /work-with-us now redirects into Franchise, so the
  // enquiry form, its source attribution and its subject preselection are all
  // preserved; only the duplicate entry point is gone.
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
    // Franchise owns the detail routes, so the entry stays marked current while
    // the visitor reads any one of them.
    audiences: ['guest', 'home', 'pro'],
    isActive: anyOf('/franchise', '/work-with-us', '/machines', '/mobile', '/trailer'),
  },
  // DESIGN V3.0 §☰ — „Pomoc" is support (contact, report a problem) and is
  // deliberately NOT „Dlaczego to działa?", which is knowledge. They answer
  // different questions, so they are two entries, separated.
  {
    id: 'help',
    label: s.items.help,
    to: '/help',
    group: 'support',
    order: 1,
    audiences: ['home', 'pro'],
    isActive: exact('/help'),
  },
];


export const NAV_GROUP_ORDER: readonly NavGroupId[] = ['product', 'ecosystem', 'support'];

export function navigationAudience(capabilities: NavigationCapabilities): NavigationAudience {
  if (!capabilities.authenticated) return 'guest';
  if (capabilities.canUseProfessionalFlow) return 'pro';
  if (capabilities.canSaveRecipes) return 'home';
  return 'guest';
}

export function isProWorkspaceLocation(loc: NavLocation): boolean {
  return proWorkspaceDestination(loc);
}

/**
 * `loc` decides ONLY which of the two workspace rows is shown; every other row is
 * still chosen by `audience` alone. Called without a location — as the entitlement
 * contracts do — a Pro customer keeps the Pro row, so that story is unchanged.
 */
export function visibleNavItems(audience: NavigationAudience, loc?: NavLocation): AppNavItem[] {
  const entitled = APP_NAV_ITEMS.filter((item) => item.audiences.includes(audience));
  const workspaces = entitled.filter((item) => item.workspaceHome);
  const keep =
    workspaces.length > 1
      ? (loc === undefined || isProWorkspaceLocation(loc) ? 'proWorkspace' : 'homeWorkspace')
      : null;
  return entitled
    .filter((item) => !item.workspaceHome || keep === null || item.id === keep)
    .sort(
      (left, right) =>
        NAV_GROUP_ORDER.indexOf(left.group) - NAV_GROUP_ORDER.indexOf(right.group) ||
        left.order - right.order,
    );
}

export function activeNavId(loc: NavLocation, audience: NavigationAudience): string | null {
  const active = visibleNavItems(audience, loc).filter((item) => item.isActive(loc));
  if (active.length === 0) return null;
  return active.reduce((best, item) => (item.to.length > best.to.length ? item : best)).id;
}

export function isGroupActive(
  group: NavGroupId,
  loc: NavLocation,
  audience: NavigationAudience,
): boolean {
  return visibleNavItems(audience, loc).some((item) => item.group === group && item.isActive(loc));
}
