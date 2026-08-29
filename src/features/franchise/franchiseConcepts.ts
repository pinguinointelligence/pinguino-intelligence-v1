import type { FranchiseConcept } from '@/services/franchise';

/** Display map over the contract values (see `src/copy/locale.ts` rule 2):
 *  the stored concept stays byte-exact, only the label is localized. */
export const FRANCHISE_CONCEPT_LABEL_PL: Readonly<Record<FranchiseConcept, string>> = {
  lokal: 'Lokal firmowy',
  punkt: 'Punkt',
  wozek: 'Wózek',
  przyczepa: 'Przyczepa',
};

export const FRANCHISE_CONCEPT_LABEL_EN: Readonly<Record<FranchiseConcept, string>> = {
  lokal: 'Company location',
  punkt: 'Point',
  wozek: 'Cart',
  przyczepa: 'Trailer',
};

export const franchiseConceptLabelPl = (concept: FranchiseConcept): string =>
  FRANCHISE_CONCEPT_LABEL_PL[concept] ?? concept;

/** Owner priority (2026-08-29): a location and a foodtruck first; the two
 *  smaller formats stay available because they are part of the approved
 *  concept set and nothing working is removed. */
export const FRANCHISE_CONCEPT_ORDER: readonly FranchiseConcept[] = [
  'lokal',
  'przyczepa',
  'wozek',
  'punkt',
];

export const FRANCHISE_CONCEPT_INITIAL: Readonly<Record<FranchiseConcept, string>> = {
  lokal: 'L',
  punkt: 'P',
  wozek: 'W',
  przyczepa: 'T',
};
