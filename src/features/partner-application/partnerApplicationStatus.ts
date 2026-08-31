/**
 * Partner application status — the contract values and their customer display.
 *
 * OWNER SPEC §6: seven customer-visible statuses, and
 * "customer copy must not expose technical/internal state names".
 *
 * LOCKED RULES (cited as AS1..AS5 in code):
 *  AS1 The raw values are CONTRACTS shared with the database CHECK constraint.
 *      They are never translated and never rendered directly.
 *  AS2 Every status has a customer label and a customer explanation, in
 *      customer language. No snake_case, no enum name, no SQL vocabulary ever
 *      reaches a customer surface.
 *  AS3 `more_information_needed` is a real state (migration 20260831201000).
 *      The value `in_review` that appeared in the earlier lane was a typo for a
 *      state that did not exist — it is not part of this contract.
 *  AS4 The map is exhaustive by construction: `Record<PartnerApplicationStatus, …>`
 *      means adding a status without its copy is a compile error.
 *  AS5 `draft` is an internal state a customer never reaches through the UI, but
 *      it still carries copy — a status with no label is how internal vocabulary
 *      leaks out in the first place.
 *
 * Pure. No IO.
 */

/** AS1: the eight contract values, matching the DB CHECK constraint exactly. */
export const PARTNER_APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'more_information_needed',
  'approved',
  'rejected',
  'suspended',
  'terminated',
] as const;

export type PartnerApplicationStatus = (typeof PARTNER_APPLICATION_STATUSES)[number];

export function isPartnerApplicationStatus(value: unknown): value is PartnerApplicationStatus {
  return (
    typeof value === 'string' && (PARTNER_APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

/** What the customer is shown for each state. */
export interface PartnerApplicationStatusCopy {
  /** Short label for a badge or heading. */
  readonly label: string;
  /** One sentence explaining what it means and what happens next. */
  readonly detail: string;
  /** True when the customer is expected to do something. */
  readonly actionRequired: boolean;
  /** True when the application is still live (no second application allowed). */
  readonly inFlight: boolean;
}

/**
 * AS2/AS4: PL-first customer copy. Exhaustive by type — a new status without
 * copy will not compile.
 */
export const PARTNER_APPLICATION_STATUS_COPY: Readonly<
  Record<PartnerApplicationStatus, PartnerApplicationStatusCopy>
> = Object.freeze({
  draft: Object.freeze({
    label: 'Szkic',
    detail: 'Zgłoszenie nie zostało jeszcze wysłane.',
    actionRequired: true,
    inFlight: true,
  }),
  submitted: Object.freeze({
    label: 'Zgłoszenie przyjęte',
    detail: 'Mamy Twoje zgłoszenie. Odezwiemy się na podany adres e-mail.',
    actionRequired: false,
    inFlight: true,
  }),
  under_review: Object.freeze({
    label: 'W trakcie sprawdzania',
    detail: 'Zespół Gellatti czyta Twoje zgłoszenie.',
    actionRequired: false,
    inFlight: true,
  }),
  more_information_needed: Object.freeze({
    label: 'Potrzebujemy więcej informacji',
    detail: 'Uzupełnij zgłoszenie, żebyśmy mogli je dokończyć.',
    actionRequired: true,
    inFlight: true,
  }),
  approved: Object.freeze({
    label: 'Zatwierdzone',
    detail: 'Tryb Partner jest aktywny na Twoim koncie.',
    actionRequired: false,
    inFlight: false,
  }),
  rejected: Object.freeze({
    label: 'Nie tym razem',
    detail: 'Tym razem nie rozpoczynamy współpracy. Możesz zgłosić się ponownie później.',
    actionRequired: false,
    inFlight: false,
  }),
  suspended: Object.freeze({
    label: 'Współpraca wstrzymana',
    detail: 'Tryb Partner jest chwilowo nieaktywny. Napisz do nas, jeśli chcesz to wyjaśnić.',
    actionRequired: true,
    inFlight: false,
  }),
  terminated: Object.freeze({
    label: 'Współpraca zakończona',
    detail: 'Tryb Partner został zamknięty.',
    actionRequired: false,
    inFlight: false,
  }),
});

/** AS2: the customer label. Never render a raw status value. */
export function partnerApplicationStatusLabel(status: PartnerApplicationStatus): string {
  return PARTNER_APPLICATION_STATUS_COPY[status].label;
}

export function partnerApplicationStatusDetail(status: PartnerApplicationStatus): string {
  return PARTNER_APPLICATION_STATUS_COPY[status].detail;
}

/**
 * The states that block a second application. Mirrors the DB partial unique
 * index `partner_applications_open_uniq`.
 */
export const IN_FLIGHT_APPLICATION_STATUSES: readonly PartnerApplicationStatus[] =
  PARTNER_APPLICATION_STATUSES.filter((status) => PARTNER_APPLICATION_STATUS_COPY[status].inFlight);

export function isApplicationInFlight(status: PartnerApplicationStatus): boolean {
  return PARTNER_APPLICATION_STATUS_COPY[status].inFlight;
}

/** True when the customer has something to do. Drives the status page's CTA. */
export function applicationNeedsCustomerAction(status: PartnerApplicationStatus): boolean {
  return PARTNER_APPLICATION_STATUS_COPY[status].actionRequired;
}
