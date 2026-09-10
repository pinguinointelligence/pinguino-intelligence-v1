/**
 * E-REV-03 / D-LINK-04 — what a partner is shown about a commission.
 *
 * The commissions table rendered `String(row.status)`, `String(row.product)`,
 * `String(row.cadence)` and the raw payment-provider invoice id straight into the page.
 * So a partner read `held`, `eligible`, `home`, `one_off` and `in_1Abc…` —
 * internal contract values and a raw code, which is exactly what E-REV-03
 * forbids.
 *
 * This is the same shape `partnerApplicationStatus.ts` already uses for
 * applications (C-APP-06): a Record keyed by the contract type, so the map is
 * exhaustive by construction and a new status cannot be added to the database
 * without the compiler demanding copy for it.
 *
 * THE INVOICE ID IS NOT MAPPED, IT IS REMOVED. There is no customer-safe
 * rendering of it: it identifies a specific customer's invoice, it means
 * nothing to the partner, and the row is already identified by its date, plan
 * and amount. Keeping a "shortened" version would still be a raw code.
 */

export type CommissionStatus = 'held' | 'eligible' | 'paid' | 'reversed';
export type CommissionProduct = 'home' | 'pro' | 'shop_starter_pack';
export type CommissionCadence = 'monthly' | 'annual' | 'one_off';

export interface CommissionStatusCopy {
  /** What the partner sees in the table cell. */
  readonly label: string;
  /** Why the money is in that state, in plain language. */
  readonly help: string;
  /** A reversal is money going back out, and must never read as an earning. */
  readonly negative: boolean;
}

export const COMMISSION_STATUS_COPY: Readonly<Record<CommissionStatus, CommissionStatusCopy>> =
  Object.freeze({
    held: {
      label: 'W trakcie',
      help: 'Płatność jest zaksięgowana. Kwota czeka na okres zwrotów.',
      negative: false,
    },
    eligible: {
      label: 'Do wypłaty',
      help: 'Kwota przeszła okres zwrotów i wejdzie do najbliższej wypłaty.',
      negative: false,
    },
    paid: {
      label: 'Wypłacone',
      help: 'Kwota została wypłacona.',
      negative: false,
    },
    reversed: {
      label: 'Zwrot płatności',
      help: 'Klient otrzymał zwrot, więc wynagrodzenie zostało cofnięte.',
      negative: true,
    },
  });

export const COMMISSION_PRODUCT_COPY: Readonly<Record<CommissionProduct, string>> = Object.freeze({
  home: 'HOME',
  pro: 'PRO',
  shop_starter_pack: 'Zestaw Startowy',
});

export const COMMISSION_CADENCE_COPY: Readonly<Record<CommissionCadence, string>> = Object.freeze({
  monthly: 'miesięcznie',
  annual: 'rocznie',
  one_off: 'jednorazowo',
});

/**
 * Display helpers take the raw value because the workspace RPC returns jsonb.
 * An unknown value falls back to a neutral dash rather than leaking the raw
 * string — a value the database allows but this module has not been taught is
 * a bug to fix in the map, not something to show a partner.
 */
const lookup = <T extends string>(map: Readonly<Record<T, string>>, value: unknown): string =>
  typeof value === 'string' && value in map ? map[value as T] : '—';

export const commissionProductLabel = (value: unknown): string =>
  lookup(COMMISSION_PRODUCT_COPY, value);

export const commissionCadenceLabel = (value: unknown): string =>
  lookup(COMMISSION_CADENCE_COPY, value);

export const commissionStatusCopy = (value: unknown): CommissionStatusCopy =>
  typeof value === 'string' && value in COMMISSION_STATUS_COPY
    ? COMMISSION_STATUS_COPY[value as CommissionStatus]
    : { label: '—', help: '', negative: false };

/**
 * E-REV-03's own example: a reversal reads "Zwrot płatności · −€4.99".
 * `format` is passed in so this module never owns a second money formatter.
 */
export const commissionAmountLabel = (
  amountCents: unknown,
  status: unknown,
  format: (cents: number) => string,
): string => {
  const cents = typeof amountCents === 'number' ? amountCents : 0;
  const magnitude = format(Math.abs(cents));
  return commissionStatusCopy(status).negative ? `−${magnitude}` : magnitude;
};

/* ── Payout status ─────────────────────────────────────────────────────────
 *
 * A SECOND raw-status render lived in the payouts list, found by the guard
 * test rather than by reading. Its vocabulary is different from a commission's
 * and considerably worse to show raw: a partner reading
 * `skipped_negative_balance` learns nothing and is alarmed by it.
 *
 * The three `skipped_*` states are not failures and must not read as one —
 * they are ordinary, explainable reasons a payout did not run this time.
 */
export type PayoutStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'skipped_below_threshold'
  | 'skipped_negative_balance'
  | 'skipped_not_payable';

export const PAYOUT_STATUS_COPY: Readonly<Record<PayoutStatus, CommissionStatusCopy>> =
  Object.freeze({
    pending: {
      label: 'Zaplanowana',
      help: 'Wypłata czeka na najbliższy termin.',
      negative: false,
    },
    processing: {
      label: 'W realizacji',
      help: 'Przelew jest w drodze.',
      negative: false,
    },
    paid: { label: 'Wypłacona', help: 'Środki zostały przelane.', negative: false },
    failed: {
      label: 'Nieudana',
      help: 'Przelew się nie powiódł. Sprawdź dane wypłat — kwota nie przepada.',
      negative: false,
    },
    skipped_below_threshold: {
      label: 'Poniżej progu',
      help: 'Kwota nie osiągnęła jeszcze progu wypłaty i przechodzi na następny termin.',
      negative: false,
    },
    skipped_negative_balance: {
      label: 'Do wyrównania',
      help: 'Zwroty przewyższyły naliczenia. Kolejne wynagrodzenia najpierw wyrównają saldo.',
      negative: false,
    },
    skipped_not_payable: {
      label: 'Konto niegotowe',
      help: 'Dane do wypłat nie są jeszcze kompletne. Kwota czeka.',
      negative: false,
    },
  });

export const payoutStatusCopy = (value: unknown): CommissionStatusCopy =>
  typeof value === 'string' && value in PAYOUT_STATUS_COPY
    ? PAYOUT_STATUS_COPY[value as PayoutStatus]
    : { label: '—', help: '', negative: false };
