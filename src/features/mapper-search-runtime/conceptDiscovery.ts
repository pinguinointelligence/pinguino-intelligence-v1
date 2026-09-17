/**
 * Owner-approved DISCOVERY links (2026-09-17), read as a concept → products index.
 *
 * They widen only the question „which existing recipes match this idea?”. Product
 * SELECTION never reads this module: the frozen SA-03/SA-04 order in `conceptDefaults`
 * stays the single authority for what a generic idea becomes, and the generator refuses
 * any link whose product is already part of that order.
 */
import { MAPPER_CONCEPT_DISCOVERY_LINKS } from './generated/conceptDiscoveryLinks';
import type { MapperConceptDiscoveryData } from './conceptDiscoveryTypes';

export type ConceptDiscoveryIndex = ReadonlyMap<string, readonly string[]>;

let index: ConceptDiscoveryIndex | null = null;

/** Concept key → the owner-approved products that may only be used to FIND recipes. */
export function conceptDiscoveryIndex(
  data: MapperConceptDiscoveryData = MAPPER_CONCEPT_DISCOVERY_LINKS,
): ConceptDiscoveryIndex {
  if (data === MAPPER_CONCEPT_DISCOVERY_LINKS && index) return index;
  const built = new Map<string, string[]>();
  for (const link of data.links) {
    built.set(link.conceptKey, [...(built.get(link.conceptKey) ?? []), link.piId]);
  }
  if (data === MAPPER_CONCEPT_DISCOVERY_LINKS) index = built;
  return built;
}
