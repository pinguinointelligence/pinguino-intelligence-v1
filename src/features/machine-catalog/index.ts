/**
 * PINGÜINO Machine Catalog — public surface (UI/UX master spec §8–§10).
 *
 * Pure, versioned Home-machine data layer + derivation helpers. No IO, no
 * engine math, no recipe modifiers: a machine only routes to an EXISTING
 * visible serving mode and carries capacity/UX facts (owner rule / §10.1).
 */
export * from './types';
export * from './technologyMode';
export * from './machineCatalogData';
export * from './machineOnboarding';
export * from './homeBatchRule';
export * from './machineDerivation';
