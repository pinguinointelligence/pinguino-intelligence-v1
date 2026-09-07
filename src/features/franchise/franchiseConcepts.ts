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

/**
 * What each format physically IS. The cards used to repeat one sentence about
 * needing a conversation, which told a reader nothing about the difference
 * between a lokal and a punkt — the one thing the card exists to explain.
 *
 * These describe the format only. Cost, scope of cooperation and who supplies
 * what are commercial authority the repo does not hold, so they stay in the
 * conversation the enquiry opens.
 */
export const FRANCHISE_CONCEPT_BLURB_PL: Readonly<Record<FranchiseConcept, string>> = {
  lokal:
    'Pełna lodziarnia z ladą, miejscem dla gości i zapleczem produkcyjnym. Produkcja i sprzedaż w jednym adresie.',
  przyczepa:
    'Samodzielny punkt na kołach. Dojeżdża na miejsce i pracuje jak mała lodziarnia — sezon, festiwal, wydarzenie.',
  wozek:
    'Mniejszy punkt mobilny do obsługi pojedynczego wydarzenia: wesela, eventu firmowego, dnia w kurorcie.',
  punkt:
    'Wydzielone stanowisko w istniejącym miejscu — galeria, lokal partnera albo lokalizacja sezonowa.',
};

export const franchiseConceptBlurbPl = (concept: FranchiseConcept): string =>
  FRANCHISE_CONCEPT_BLURB_PL[concept] ?? '';

export const FRANCHISE_CONCEPT_INITIAL: Readonly<Record<FranchiseConcept, string>> = {
  lokal: 'L',
  punkt: 'P',
  wozek: 'W',
  przyczepa: 'T',
};

/**
 * Which concept a visitor most likely means, given the page they came from.
 *
 * Franchise is the umbrella, so a question that starts on /trailer is a
 * przyczepa question — asking again would be asking something the click already
 * said. `/machines` is deliberately absent: equipment is not one of the four
 * approved formats, and inventing a fifth concept value to hold it would change
 * a canonical contract. Those enquiries keep the form's own default concept and
 * are told apart by source_route instead.
 */
export const FRANCHISE_CONCEPT_BY_ROUTE: Readonly<Record<string, FranchiseConcept>> =
  Object.freeze({
    '/franchise': 'lokal',
    '/trailer': 'przyczepa',
    '/mobile': 'wozek',
  });

/** Routes that may legitimately originate a Franchise enquiry (mirrors the RPC allowlist). */
export const FRANCHISE_SOURCE_ROUTES: readonly string[] = Object.freeze([
  '/franchise',
  '/trailer',
  '/mobile',
  '/machines',
]);

/** Read `?from=` as a trusted-by-allowlist source route; anything else is no route. */
export const franchiseSourceRouteFrom = (raw: string | null | undefined): string | undefined =>
  raw && FRANCHISE_SOURCE_ROUTES.includes(raw) ? raw : undefined;

export const franchiseConceptFromRoute = (
  raw: string | null | undefined,
): FranchiseConcept | undefined =>
  (raw && FRANCHISE_CONCEPT_BY_ROUTE[raw]) || undefined;
