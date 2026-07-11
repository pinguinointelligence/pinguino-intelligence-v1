/**
 * Billing domain — shared local types (Track E).
 *
 * Pure financial domain vocabulary. This module (and everything under
 * `src/billing/domain/`) is deliberately self-contained: it imports NOTHING
 * from src/access, src/features, supabase or other tracks. Money is ALWAYS
 * integer cents (locked architecture decision #2); EUR only in v1.
 */

/** Product line. Combined Home+Pro counting rules live in tierSnapshots. */
export type Product = 'home' | 'pro';

/** Billing cadence. The 15-month initial period classifies as `annual` (Rule M1). */
export type Cadence = 'monthly' | 'annual';

/** Partner commission tier. */
export type Tier = 'standard' | 'gold' | 'elite';

/** v1 currency. Integer cents only — never floats, never major units. */
export type Currency = 'eur';

/**
 * Madrid-calendar month key, `YYYY-MM` (e.g. `2026-03`).
 * Always derived from a UTC instant via `monthKeyMadrid` (holdCalendar.ts) —
 * never from local machine time.
 */
export type MonthKey = string;

/** Milliseconds since the Unix epoch, UTC. Timestamps are always inputs (never Date.now() defaults). */
export type UtcMs = number;

/** Typed error base for illegal domain operations (invalid inputs, illegal transitions). */
export class BillingDomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BillingDomainError';
    this.code = code;
  }
}

/** Thrown when a monetary amount is not a safe non-negative integer of cents. */
export class InvalidCentsError extends BillingDomainError {
  constructor(context: string, value: unknown) {
    super('invalid_cents', `${context}: expected integer cents, got ${String(value)}`);
    this.name = 'InvalidCentsError';
  }
}

/** Thrown when a UTC timestamp input is not a finite integer of epoch milliseconds. */
export class InvalidTimestampError extends BillingDomainError {
  constructor(context: string, value: unknown) {
    super('invalid_timestamp', `${context}: expected finite epoch ms, got ${String(value)}`);
    this.name = 'InvalidTimestampError';
  }
}

/** Assert `value` is a safe integer (cents may be negative only where explicitly allowed). */
export function assertIntegerCents(value: number, context: string, allowNegative = false): void {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new InvalidCentsError(context, value);
  }
}

/** Assert `value` is a usable UTC epoch-milliseconds timestamp. */
export function assertUtcMs(value: number, context: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new InvalidTimestampError(context, value);
  }
}

/**
 * Round-half-up integer division: round(numerator / denominator) where exact
 * halves round AWAY from zero toward +∞ for non-negative inputs.
 * Pure integer arithmetic — no floating point (locked decision #2:
 * "proportional refund reversal: round-half-up on cents of the proportional product").
 * Both inputs must be non-negative safe integers with denominator > 0.
 */
export function divideRoundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new InvalidCentsError('divideRoundHalfUp.numerator', numerator);
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new InvalidCentsError('divideRoundHalfUp.denominator', denominator);
  }
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

/** Shallow-freeze helper so every returned snapshot/record is immutable. */
export function frozen<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}
