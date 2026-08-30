/**
 * GELLATTI HOME CREATOR — the HOME ↔ PRO view authority (owner prompt §11–§16, §75).
 *
 * PURE: no IO, no store, no React, no clock. Every decision here is a function of
 * (entitlement, account setting, current location) so the header, the router and the
 * tests all read the SAME answer.
 *
 * THE ONE ARCHITECTURAL RULE THIS FILE ENCODES (§1):
 *   HOME is not a second application. A view mode is a PRESENTATION choice over the
 *   single live `recipeStore` recipe. Nothing here clones, versions, resets, reloads
 *   or recalculates a recipe — switching a view is a pure label change, and
 *   `homeViewStore` is deliberately incapable of touching recipe state.
 */
import type { EffectiveAccess } from '@/access/accountAccess/contracts';

/** The two presentations of the one recipe. */
export type HomeViewMode = 'home' | 'pro';

/** The account setting §12: where a PRO subscriber lands after login. */
export type DefaultExperience = HomeViewMode;

/** Owner default (§12): PRO, never "last visited". */
export const DEFAULT_EXPERIENCE_FALLBACK: DefaultExperience = 'pro';

/**
 * The entitlement facts the view authority needs. Deliberately a narrow structural
 * subset of `EffectiveAccess` so this module never depends on billing or price ids.
 */
export interface ViewEntitlement {
  readonly authed: boolean;
  readonly canHome: boolean;
  readonly canPro: boolean;
}

export const viewEntitlementFrom = (
  authed: boolean,
  access: EffectiveAccess | null,
): ViewEntitlement => ({
  authed,
  canHome: access?.canHome ?? false,
  canPro: access?.canPro ?? false,
});

/**
 * The four owner-defined header states (§11).
 *
 *  - `demo_switch`  — anonymous, or signed in with no active plan: BOTH segments show
 *                     and both are explorable as demo presentations.
 *  - `home_only`    — an active HOME subscriber: PRO is NOT rendered at all. No locked
 *                     PRO, no grey PRO, no permanent "Upgrade" (§11B, §74).
 *  - `full_switch`  — an active PRO subscriber: both segments, full access to both.
 */
export type ViewSwitchPresentation = 'demo_switch' | 'home_only' | 'full_switch';

export function resolveViewSwitchPresentation(
  entitlement: ViewEntitlement,
): ViewSwitchPresentation {
  // PRO wins over HOME: a PRO subscriber who also holds HOME still gets both (§11C).
  if (entitlement.canPro) return 'full_switch';
  if (entitlement.canHome) return 'home_only';
  return 'demo_switch';
}

/** Which segments the header renders, in order. `home_only` renders HOME alone. */
export function viewSwitchSegments(presentation: ViewSwitchPresentation): readonly HomeViewMode[] {
  return presentation === 'home_only' ? ['home'] : ['home', 'pro'];
}

/**
 * §11: the active segment is black-on-white-text, the inactive one is
 * greige-on-black-text, and the treatment REVERSES when PRO is active. Expressed as
 * data so the component cannot drift from the contract and a test can pin it.
 */
export type SegmentTreatment = 'active' | 'inactive';

export function segmentTreatment(
  segment: HomeViewMode,
  activeView: HomeViewMode,
): SegmentTreatment {
  return segment === activeView ? 'active' : 'inactive';
}

/**
 * §12 + §75: where an authenticated user lands after login.
 *
 * The SETTING decides — never the last visited view. A HOME-only subscriber always
 * lands in HOME because PRO does not exist for them; a PRO subscriber follows the
 * setting and defaults to PRO.
 */
export function resolveDefaultLandingView(input: {
  readonly entitlement: ViewEntitlement;
  readonly defaultExperience: DefaultExperience | null;
}): HomeViewMode {
  const presentation = resolveViewSwitchPresentation(input.entitlement);
  if (presentation === 'home_only') return 'home';
  if (presentation === 'demo_switch') return 'home';
  return input.defaultExperience ?? DEFAULT_EXPERIENCE_FALLBACK;
}

/**
 * §15: which PRO module the user was last in, so returning to PRO restores it.
 * Monitor and Etykieta both PRESENT as the HOME recipe screen, but PRO must come
 * back to the module the user left — that memory lives here, not in the recipe.
 */
export type ProModule =
  | 'recipe'
  | 'monitor'
  | 'production'
  | 'label'
  | 'versions'
  | 'history'
  | 'costs'
  | 'exports'
  | 'settings'
  | 'machine';

const PRO_MODULE_SECTIONS: Readonly<Record<ProModule, string>> = Object.freeze({
  recipe: '/pro/recipe',
  monitor: '/pro/monitor',
  production: '/pro/production',
  label: '/pro/label',
  versions: '/pro/versions',
  history: '/pro/history',
  costs: '/pro/costs',
  exports: '/pro/exports',
  settings: '/pro/settings',
  machine: '/pro/machine',
});

export const proModulePath = (module: ProModule): string => PRO_MODULE_SECTIONS[module];

/** Parse a `/pro/...` pathname into the module it addresses (`recipe` is the root). */
export function proModuleFromPath(pathname: string): ProModule | null {
  const normalised = pathname.replace(/\/+$/, '').toLowerCase();
  if (normalised === '/pro' || normalised === '') return 'recipe';
  const match = /^\/pro\/([a-z-]+)$/.exec(normalised);
  if (!match) return null;
  const section = match[1] as ProModule;
  return section in PRO_MODULE_SECTIONS ? section : null;
}

/**
 * §15 — the PRO module → HOME location map.
 *
 *  Receptura  → the HOME live recipe
 *  Produkcja  → HOME preparation AT THE SAME PRODUCTION STEP (the step lives in the
 *               production store and is deliberately NOT reset here)
 *  Monitor    → the HOME recipe screen
 *  Etykieta   → the HOME recipe screen (Label state untouched)
 *  everything else → the nearest coherent HOME location, which is the recipe.
 */
export type HomeLocation = 'recipe' | 'preparation' | 'account' | 'machine';

export function homeLocationForProModule(module: ProModule): HomeLocation {
  switch (module) {
    case 'production':
      return 'preparation';
    case 'settings':
      return 'account';
    case 'machine':
      return 'machine';
    default:
      return 'recipe';
  }
}

/** The HOME route for a HOME location. HOME is one sequential page; stages are hashes. */
export const HOME_ROOT_PATH = '/';

export function homePathForLocation(location: HomeLocation): string {
  switch (location) {
    case 'preparation':
      return '/#preparation';
    case 'account':
      return '/account';
    case 'machine':
      return '/#machine';
    case 'recipe':
    default:
      return '/#recipe';
  }
}

/**
 * §13: an ACTIVE HOME subscriber who opens a legacy `/pro/...` URL is redirected to
 * the corresponding HOME location — never shown an upgrade wall.
 *
 * Returns `null` when the URL should be served as-is (anyone who may see PRO: a PRO
 * subscriber, and a demo visitor exploring the read-only PRO presentation §73).
 */
export function proUrlRedirectForHomeSubscriber(input: {
  readonly entitlement: ViewEntitlement;
  readonly pathname: string;
}): string | null {
  if (resolveViewSwitchPresentation(input.entitlement) !== 'home_only') return null;
  const module = proModuleFromPath(input.pathname);
  if (module === null) return null;
  return homePathForLocation(homeLocationForProModule(module));
}
