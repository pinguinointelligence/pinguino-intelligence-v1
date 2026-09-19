/**
 * Produkcja — the ONE list of the area's sections (package PRODUKCJA V3, Etap 1 §1.1).
 *
 * Owner decision 2026-09-17: the hamburger carries ONE „Produkcja” entry instead of four
 * (Produkcja, Produkty, Maszyna, Ustawienia etykiety). Inside it there are four flat sections in
 * a fixed order. This list is the single source for BOTH the section bar and the active ☰ entry,
 * so the two can never disagree about which address belongs to the area.
 *
 * Every section keeps its existing address — nothing is re-routed:
 *   Partie → /production (also /pro/history, which redirects there)
 *   Produkty → /products and everything under it, /create-ingredient
 *   Maszyna → /machine, /profile/machine, /pro/machine
 *   Etykiety → /labels, /label
 *
 * `/pro/production` is NOT an area address: it is the recipe's own Produkcja tab inside the Pro
 * workspace and stays marked as „Pro” in the drawer.
 */
import { productionAreaCopy } from '@/copy/productionArea';

export type ProductionAreaSectionId = 'batches' | 'products' | 'machine' | 'labels';

export interface ProductionAreaLocation {
  pathname: string;
  search: string;
}

export interface ProductionAreaSection {
  id: ProductionAreaSectionId;
  label: string;
  /** The section's own address — the target of a first visit. */
  to: string;
  /** Whether an address belongs to this section. */
  matches: (loc: ProductionAreaLocation) => boolean;
  /**
   * The section's tools are a Pro capability. A HOME or signed-out visitor still reaches it from
   * the bar (the area is one place for everyone) and is told plainly where the tools live.
   *
   * OD-32: the capability is NAMED rather than implied. This used to be a bare `proOnly` read
   * against `canUseProductionMode`, so the moment a HOME plan gained the right to run a batch
   * it also gained the label toolset — two unrelated things behind one flag.
   */
  proOnly: boolean;
  /** Which capability actually opens it. Only meaningful when `proOnly`. */
  requires?: 'canPrintProductionLabels';
}

const nested = (path: string) => (loc: ProductionAreaLocation) =>
  loc.pathname === path || loc.pathname.startsWith(`${path}/`);
const oneOf =
  (...paths: string[]) =>
  (loc: ProductionAreaLocation) =>
    paths.includes(loc.pathname);

const c = productionAreaCopy();

export const PRODUCTION_AREA_SECTIONS: readonly ProductionAreaSection[] = [
  {
    id: 'batches',
    label: c.sections.batches,
    to: '/production',
    matches: (loc) => nested('/production')(loc) || loc.pathname === '/pro/history',
    proOnly: false,
  },
  {
    id: 'products',
    label: c.sections.products,
    to: '/products',
    matches: (loc) => nested('/products')(loc) || loc.pathname === '/create-ingredient',
    proOnly: false,
  },
  {
    id: 'machine',
    label: c.sections.machine,
    to: '/machine',
    matches: oneOf('/machine', '/profile/machine', '/pro/machine'),
    proOnly: false,
  },
  {
    id: 'labels',
    label: c.sections.labels,
    to: '/labels',
    matches: oneOf('/labels', '/label'),
    proOnly: true,
    requires: 'canPrintProductionLabels',
  },
];

export function productionAreaSection(id: ProductionAreaSectionId): ProductionAreaSection {
  const section = PRODUCTION_AREA_SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Unknown Produkcja section: ${id}`);
  return section;
}

/** The section an address belongs to, or null when it is outside the area. */
export function productionAreaSectionFor(
  loc: ProductionAreaLocation,
): ProductionAreaSection | null {
  return PRODUCTION_AREA_SECTIONS.find((section) => section.matches(loc)) ?? null;
}

/** True on every address of the area — the ☰ „Produkcja” entry is current there. */
export function isProductionAreaLocation(loc: ProductionAreaLocation): boolean {
  return productionAreaSectionFor(loc) !== null;
}
