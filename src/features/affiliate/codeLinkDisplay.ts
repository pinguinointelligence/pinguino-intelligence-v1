/**
 * D-LINK-03 — how a partner reads their codes and campaign links.
 *
 * The partner page printed both statuses raw: `active` in the codes table,
 * `ACTIVE` / `ARCHIVED` in the links list — contract values, in two different
 * casings, straight onto the page. Same treatment as commissionDisplay: every
 * database value has copy, and an unknown value degrades to a dash instead of
 * leaking.
 *
 * The per-link numbers are read defensively on purpose. The migration that adds
 * them (20260910200000) is READY but NOT APPLIED; until the owner applies it the
 * RPC returns clicks only, and the page must show exactly what it was given — a
 * number the RPC returned, never a zero invented in the browser.
 */

export type PartnerCodeStatus = 'active' | 'retired' | 'blocked';
export type ContentLinkStatus = 'ACTIVE' | 'ARCHIVED' | 'BLOCKED';

export interface StatusCopy {
  readonly label: string;
  /** Shown as the cell's tooltip. */
  readonly help: string;
}

/** `partner_codes.status` — CHECK (status in ('active', 'retired', 'blocked')). */
export const PARTNER_CODE_STATUS_COPY: Readonly<Record<PartnerCodeStatus, StatusCopy>> =
  Object.freeze({
    active: { label: 'Aktywny', help: 'Kod jest włączony.' },
    // The page's own action for this state is "Archiwizuj", so the state reads
    // as archived — not as the database's "retired".
    retired: {
      label: 'Zarchiwizowany',
      help: 'Kod nie przypisuje już nowych osób. Jego historia i rozliczenia zostają.',
    },
    blocked: {
      label: 'Zablokowany',
      help: 'Kod zablokowało Gellatti. Nie przypisuje nowych osób; historia i rozliczenia zostają.',
    },
  });

/** `partner_content_links.status` — CHECK (status in ('ACTIVE','ARCHIVED','BLOCKED')). */
export const CONTENT_LINK_STATUS_COPY: Readonly<Record<ContentLinkStatus, StatusCopy>> =
  Object.freeze({
    ACTIVE: { label: 'Aktywny', help: 'Link jest włączony.' },
    ARCHIVED: {
      label: 'Zarchiwizowany',
      help: 'Link nie przypisuje już nowych osób. Jego wyniki zostają w historii.',
    },
    BLOCKED: {
      label: 'Zablokowany',
      help: 'Link zablokowało Gellatti. Nie przypisuje nowych osób; jego wyniki zostają w historii.',
    },
  });

const UNKNOWN: StatusCopy = Object.freeze({ label: '—', help: '' });

/**
 * Copy for a database value, or a dash — never the raw value. Shared by every
 * display map on /partner.
 */
export const statusCopyOf = <K extends string>(
  table: Readonly<Record<K, StatusCopy>>,
  value: unknown,
): StatusCopy =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(table, value)
    ? table[value as K]
    : UNKNOWN;

export const partnerCodeStatusCopy = (value: unknown): StatusCopy =>
  statusCopyOf(PARTNER_CODE_STATUS_COPY, value);

export const contentLinkStatusCopy = (value: unknown): StatusCopy =>
  statusCopyOf(CONTENT_LINK_STATUS_COPY, value);

/** A count the RPC actually returned, or null — never an invented zero. */
export const countOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Same words as the codes table's columns, so a link and a code read alike. */
const LINK_METRICS: readonly (readonly [key: string, label: string])[] = [
  ['clickCount', 'Kliknięcia'],
  ['signups', 'Rejestracje'],
  ['paidCustomers', 'Klienci'],
  ['activeSubscriptions', 'Aktywne subskrypcje'],
];

/** One campaign link's performance: every metric the RPC returned, in order. */
export function linkMetrics(
  link: Readonly<Record<string, unknown>>,
): { readonly label: string; readonly value: number }[] {
  return LINK_METRICS.flatMap(([key, label]) => {
    const value = countOrNull(link[key]);
    return value === null ? [] : [{ label, value }];
  });
}
