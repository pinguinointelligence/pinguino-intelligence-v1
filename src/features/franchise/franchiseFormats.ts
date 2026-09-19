import type { OwnerAssetId } from '@/features/work-with-us/ownerAssets';
import type { FranchiseConcept } from '@/services/franchise';

/**
 * FRANCHISE — the four formats (DESIGN F1, owner correction 2026-09-18).
 *
 * Copy and photography are the DESIGN's own, transcribed from `F_FORMATS` in
 * the approved preview. Nothing here is invented: where the design states a
 * sentence, that sentence is what the page says.
 *
 * The page used to carry two lists of formats — four concept cards and, six
 * hundred pixels lower, a second grid of links to the detail pages. There is
 * one list now, and exactly ONE of these opens at a time, directly under the
 * row that opened it.
 *
 * The owner's ban list in `workWithUsLanes.ts` applies to this file in full —
 * no fee, no ROI, no payback, no amount and no percentage — and the guard in
 * `workWithUsOwnerRules.guard.test.ts` reads it.
 */
export type FranchiseFormatId = 'local' | 'food-truck' | 'cart' | 'machines';

export interface FranchiseFormat {
  readonly id: FranchiseFormatId;
  /** The card's name. The closed card carries this and its photograph, nothing else. */
  readonly label: string;
  /** The opened block's subheading — what the format is, in one line. */
  readonly lead: string;
  /** The owner photograph, closed (dimmed preview) and open (the block's image). */
  readonly image: OwnerAssetId;
  /** One or two short paragraphs. A block is not a landing page. */
  readonly body: readonly string[];
  /** Four concretes. Never a list that has to be scrolled. */
  readonly points: readonly string[];
  /**
   * The stored concept an enquiry about this format carries.
   *
   * ABSENT FOR MASZYNY on purpose: equipment is not one of the four approved
   * concept values, and minting a fifth would change a canonical contract. That
   * format is told apart by `route` instead, which is what the enquiry's
   * `source_route` allowlist exists for.
   */
  readonly concept?: FranchiseConcept;
  /** The lane page whose CTA arrives here with `?from=`, where one exists. */
  readonly route?: string;
}

export const FRANCHISE_FORMATS: readonly FranchiseFormat[] = Object.freeze([
  {
    id: 'local',
    label: 'Lokal',
    lead: 'Nowy punkt albo prostsza wersja lodziarni, którą już masz.',
    image: 'F01',
    body: [
      'Jeżeli dopiero szukasz miejsca, możemy pomóc dobrać wielkość lokalu, układ pracy i wyposażenie do realnej sprzedaży.',
      'Jeżeli masz już lodziarnię, możemy pomóc przebudować sposób pracy: uprościć produkcję, ograniczyć zależność od jednej osoby i przejść na świeże lody robione na miejscu, prowadzone przez receptury i proces Gellatti.',
    ],
    points: [
      'nowy lokal albo adaptacja istniejącego punktu',
      'świeże lody produkowane na miejscu w małych partiach',
      'prostsza produkcja prowadzona przez aplikację',
      'receptury, partie, etykiety i historia w jednym systemie',
    ],
    concept: 'lokal',
    route: '/franchise',
  },
  {
    id: 'food-truck',
    label: 'Food truck',
    lead: 'Samodzielny punkt na kołach, który dojeżdża tam, gdzie są ludzie.',
    image: 'W03',
    body: [
      'Pracuje jak mała lodziarnia: sezon, festiwal, wydarzenie. Produkcja i sprzedaż jadą razem z Tobą, a proces zostaje ten sam co w lokalu.',
    ],
    points: [
      'pełny punkt sprzedaży bez stałego adresu',
      'ten sam proces produkcji co w lokalu',
      'partie liczone pod jeden wyjazd',
      'sprzęt dobrany do miejsca i prądu',
    ],
    concept: 'przyczepa',
    route: '/trailer',
  },
  {
    id: 'cart',
    label: 'Wózek',
    lead: 'Mniejszy punkt mobilny do jednego wydarzenia.',
    image: 'W02',
    body: [
      'Wesele, event firmowy, dzień w kurorcie. Wjeżdża tam, gdzie nie wjedzie nic większego, i obsługuje konkretną liczbę gości.',
    ],
    points: [
      'obsługa pojedynczego wydarzenia',
      'mieści się tam, gdzie nie ma miejsca na więcej',
      'partia policzona pod liczbę gości',
      'gotowe do pracy bez zaplecza',
    ],
    concept: 'wozek',
    route: '/mobile',
  },
  {
    id: 'machines',
    label: 'Maszyny',
    lead: 'Sama technologia, sprzęt i proces — bez pełnego konceptu lokalu.',
    image: 'W04',
    body: [
      'Wariant dla kogoś, kto ma już swoje miejsce i swoją markę, a potrzebuje sposobu robienia lodów: układu maszyn, receptur i powtarzalnego procesu.',
    ],
    points: [
      'dobór układu maszyn',
      'receptury i proces w aplikacji',
      'produkcja małych partii',
      'do wykorzystania w istniejącym biznesie',
    ],
    route: '/machines',
  },
]);

export const franchiseFormat = (id: FranchiseFormatId): FranchiseFormat =>
  FRANCHISE_FORMATS.find((format) => format.id === id) ?? FRANCHISE_FORMATS[0]!;

/**
 * Which format a visitor arriving from a lane page is asking about.
 *
 * This is the page's deep link, and it is the one the app ALREADY has: every
 * lane CTA is `/franchise?from=<its own route>#lead`. Reading the same `?from=`
 * the enquiry reads means there is no second parameter to keep in step. With no
 * `?from=`, the page opens with no format expanded — the design's start state.
 */
export const franchiseFormatFromRoute = (
  raw: string | null | undefined,
): FranchiseFormatId | undefined =>
  raw ? FRANCHISE_FORMATS.find((format) => format.route === raw)?.id : undefined;
