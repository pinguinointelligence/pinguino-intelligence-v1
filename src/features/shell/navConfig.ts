/**
 * Top-navigation model (Phase 6C) — the eight centered nav items and the content
 * of each Tesla-style mega menu. STRUCTURE lives here; all user-facing strings
 * come from `copy.nav` (never hardcode product copy in components or config).
 *
 * Each item declares its own `size` and `layout`, so every menu can differ — a
 * compact Start panel, a large PI Calculator / Recipes panel, the polished
 * four-offer Work With Us panel, etc. Menus render as one transparent surface;
 * item groups are transparent (no boxed cards) — see MegaMenu / MegaMenuItem.
 */
import { copy } from '@/copy/en';

const nav = copy.nav;

/** Dropdown footprint — drives the panel max-width in MegaMenu. */
export type NavMenuSize = 'compact' | 'medium' | 'large' | 'panel';

/** Which transparent layout the panel renders. */
export type NavMenuLayout = 'links' | 'product' | 'browse' | 'offers' | 'plans' | 'steps' | 'docs';

export interface NavLink {
  label: string;
  /** Route target. Omit for a not-yet-routable entry (renders as "Coming soon"). */
  to?: string;
  /** Marks a future/locked entry — shown muted with a "Coming soon" chip. */
  soon?: boolean;
}

export interface NavGroup {
  /** Optional column / offer heading. */
  title?: string;
  /** Short supporting copy (offers / product groups). */
  body?: string;
  /** Render a subtle image/object placeholder for this group (browse / offers). */
  image?: boolean;
  links: NavLink[];
}

export interface NavItem {
  id: string;
  label: string;
  /** The label itself is clickable and navigates here. */
  to: string;
  size: NavMenuSize;
  layout: NavMenuLayout;
  blurb?: string;
  /** Menu content. Absent → the item is a plain link with no dropdown. */
  groups?: NavGroup[];
  /** PI Calculator surfaces the active engine label in its panel footer. */
  engineLabel?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'start',
    label: nav.items.start,
    to: '/',
    size: 'compact',
    layout: 'links',
    blurb: nav.start.blurb,
    groups: [
      {
        links: [
          { label: nav.start.talk, to: '/' },
          { label: nav.start.new, to: '/' },
          { label: nav.start.continue, to: '/' },
          { label: nav.start.how, to: '/subscription' },
        ],
      },
    ],
  },
  {
    id: 'calculator',
    label: nav.items.calculator,
    to: '/calculator',
    size: 'large',
    layout: 'product',
    blurb: nav.calculator.blurb,
    engineLabel: nav.engineLabel,
    groups: [
      {
        links: [
          { label: nav.calculator.manual, to: '/calculator' },
          { label: nav.calculator.studio, to: '/studio' },
          { label: nav.calculator.builder, to: '/studio' },
          { label: nav.calculator.panel, to: '/studio' },
          { label: nav.calculator.rescue, soon: true },
        ],
      },
    ],
  },
  {
    id: 'recipes',
    label: nav.items.recipes,
    to: '/recipes',
    size: 'large',
    layout: 'browse',
    blurb: nav.recipes.blurb,
    groups: [
      {
        title: nav.recipes.browse,
        image: true,
        links: [
          { label: nav.recipes.mine, to: '/recipes' },
          { label: nav.recipes.pinguino, to: '/recipes' },
          { label: nav.recipes.featured, to: '/recipes' },
          { label: nav.recipes.recent, to: '/recipes' },
          { label: nav.recipes.startFrom, to: '/recipes' },
        ],
      },
      {
        title: nav.recipes.categories,
        links: [
          { label: nav.recipes.gelato, to: '/recipes' },
          { label: nav.recipes.sorbet, to: '/recipes' },
          { label: nav.recipes.vegan, to: '/recipes' },
          { label: nav.recipes.protein, to: '/recipes' },
        ],
      },
    ],
  },
  {
    id: 'label',
    label: nav.items.label,
    to: '/label',
    size: 'medium',
    layout: 'links',
    blurb: nav.label.blurb,
    groups: [
      {
        links: [
          { label: nav.label.nutrition, to: '/label', soon: true },
          { label: nav.label.production, to: '/label', soon: true },
          { label: nav.label.statement, to: '/label', soon: true },
          { label: nav.label.allergen, to: '/label', soon: true },
          { label: nav.label.export, to: '/label', soon: true },
        ],
      },
    ],
  },
  {
    id: 'api',
    label: nav.items.api,
    to: '/api',
    size: 'large',
    layout: 'docs',
    blurb: nav.api.blurb,
    groups: [
      {
        links: [
          { label: nav.api.overview, to: '/api' },
          { label: nav.api.shops, to: '/api' },
          { label: nav.api.machines, to: '/api' },
        ],
      },
      {
        links: [
          { label: nav.api.partner, to: '/api' },
          { label: nav.api.docs, to: '/api' },
          { label: nav.api.status, to: '/api' },
        ],
      },
    ],
  },
  {
    id: 'work',
    label: nav.items.work,
    to: '/work-with-us',
    size: 'panel',
    layout: 'offers',
    blurb: nav.work.blurb,
    groups: [
      {
        title: nav.work.offers.app.title,
        body: nav.work.offers.app.body,
        image: true,
        links: [{ label: nav.learnMore, to: '/work-with-us' }],
      },
      {
        title: nav.work.offers.machinesApp.title,
        body: nav.work.offers.machinesApp.body,
        image: true,
        links: [{ label: nav.learnMore, to: '/work-with-us' }],
      },
      {
        title: nav.work.offers.machineMixtures.title,
        body: nav.work.offers.machineMixtures.body,
        image: true,
        links: [{ label: nav.learnMore, to: '/work-with-us' }],
      },
      {
        title: nav.work.offers.ingredients.title,
        body: nav.work.offers.ingredients.body,
        image: true,
        links: [{ label: nav.learnMore, to: '/work-with-us' }],
      },
    ],
  },
  {
    id: 'subscription',
    label: nav.items.subscription,
    to: '/subscription',
    size: 'medium',
    layout: 'plans',
    blurb: nav.subscription.blurb,
    groups: [
      {
        links: [
          { label: nav.subscription.free, to: '/subscription' },
          { label: nav.subscription.pro, to: '/subscription' },
          { label: nav.subscription.team, soon: true },
          { label: nav.subscription.manage, soon: true },
          { label: nav.subscription.change, soon: true },
        ],
      },
    ],
  },
  {
    id: 'ingredient',
    label: nav.items.ingredient,
    to: '/create-ingredient',
    size: 'medium',
    layout: 'steps',
    blurb: nav.ingredient.blurb,
    groups: [
      {
        image: true,
        links: [
          { label: nav.ingredient.describe, to: '/create-ingredient', soon: true },
          { label: nav.ingredient.photo, to: '/create-ingredient', soon: true },
          { label: nav.ingredient.camera, to: '/create-ingredient', soon: true },
          { label: nav.ingredient.review, to: '/create-ingredient', soon: true },
          { label: nav.ingredient.add, to: '/create-ingredient', soon: true },
        ],
      },
    ],
  },
];

/** Distinct placeholder destinations introduced by the nav (Slice 1 stub routes). */
export const NAV_PLACEHOLDER_ROUTES = [
  '/calculator',
  '/label',
  '/api',
  '/work-with-us',
  '/subscription',
  '/create-ingredient',
] as const;
