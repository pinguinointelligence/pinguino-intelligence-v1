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
  /**
   * The CARD's photograph — the one dimmed under the format's name in the
   * closed tile. Unchanged by the gallery: the tiles are the page's top
   * design and the owner did not ask for them to move.
   */
  readonly image: OwnerAssetId;
  /**
   * The opened block's photographs, IN THE ORDER THEY SHOULD BE SEEN.
   *
   * One array per format, which is the whole extension point: sending more
   * pictures for a format means adding ids here, and nothing else changes.
   * A format with a single entry renders exactly as it did before — the
   * gallery draws no controls at all.
   *
   * Nothing was dropped to make room. Where a format already had a
   * photograph, that photograph is still in this list.
   */
  readonly gallery: readonly OwnerAssetId[];
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
    lead: 'Nowy punkt albo lepszy sposób pracy w lodziarni, którą już masz.',
    image: 'F01',
    /* Owner is still sending Lokal photography; F01 is the one that exists,
       so the block renders it alone and grows an arrow the day a second
       id lands here. */
    gallery: ['F01'],
    body: [
      'Jeżeli dopiero szukasz miejsca, możemy pomóc dobrać wielkość lokalu, układ pracy, wyposażenie i proces do realnej sprzedaży.',
      'Jeżeli masz już lodziarnię, zaczynamy od tego, co już działa. Nie wymieniamy dobrego sprzętu bez potrzeby — receptury i proces Gellatti dopasowujemy do odpowiednich maszyn, które już posiadasz.',
      'Gellatti nie opiera produkcji na kompletnych gotowych mieszankach. Budujesz własne receptury z konkretnych składników i dokładnie wiesz, co znajduje się w każdej partii — i możesz to pokazać klientowi.',
      'System prowadzi przez składniki, proporcje, proces i produkcję, tak aby uzyskać prawidłowy, powtarzalny efekt.',
    ],
    points: [
      'wykorzystujemy istniejące maszyny, jeśli są odpowiednie',
      'własna receptura zamiast kompletnej gotowej mieszanki',
      'naturalne rozwiązanie stabilizujące zamiast sztucznych emulgatorów i stabilizatorów',
      'pełna kontrola nad składem, procesem i kosztem',
      'skład i proces, które możesz transparentnie pokazać klientowi',
    ],
    concept: 'lokal',
    route: '/franchise',
  },
  {
    id: 'food-truck',
    label: 'Food truck',
    lead: 'Samodzielny punkt na kołach, który dojeżdża tam, gdzie są ludzie.',
    image: 'W03',
    /* OWNER ORDER, 2026-09-19. The open hatch first, because a Food Truck
       sells as something already serving people; then the trailer itself;
       then W03 — the photograph this format already carried — LAST, which is
       exactly where the owner asked for it to stay. */
    gallery: ['A07', 'A06', 'W03'],
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
    /* Same reading as the Food Truck: the cart working a real event first,
       then the one this format already carried. */
    gallery: ['A05', 'W02'],
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
    /* The room the equipment stands in, then the equipment doing its job —
       W01 is the owner's own „machines / equipment detail" frame. */
    gallery: ['W04', 'W01'],
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
