/**
 * Module — emailSubject: the MANDATORY operational email subject taxonomy.
 *
 * OWNER AUTHORITY (2026-08-31 correction §2). Every operational email reaching
 * `info@gellatti.com` must make its purpose obvious from the Subject alone.
 *
 * LOCKED RULES implemented here (cited as ES1..ES7 in code):
 *  ES1 Internal subjects are built from STABLE, machine-filterable prefixes:
 *        [GELLATTI][AREA][EVENT][STATE]
 *      followed by a useful human identifier.
 *  ES2 The prefixes are STABLE ACROSS LANGUAGES. They are contracts, never
 *      translated — Google Workspace filters key on them. Only the
 *      customer-facing subject may be localized (see `customerSubject`).
 *  ES3 Google Workspace sorting must work from the SUBJECT ALONE. Structured
 *      metadata (area/event/entity_id/environment) is attached where the
 *      provider supports it, but a filter must never DEPEND on a custom header.
 *  ES4 A non-production environment is marked IN THE SUBJECT, so a staging mail
 *      can never be mistaken for a real operational one.
 *  ES5 The human identifier is sanitised: no newlines (header-injection
 *      defence), collapsed whitespace, and truncated so the whole subject stays
 *      within a safe length for mail clients.
 *  ES6 Every (area, event, state) triple used by the product is enumerated in
 *      OPERATIONAL_SUBJECTS, so the taxonomy is a closed set that tests can
 *      assert exhaustively rather than free-form strings at call sites.
 *  ES7 Customer-facing subjects carry NO bracket taxonomy — the customer sees a
 *      normal, localized sentence. The taxonomy is for the internal mailbox.
 *
 * Pure + deterministic. No IO, no Date.now().
 */

/** ES1: the fixed brand token that opens every operational subject. */
export const SUBJECT_ROOT = 'GELLATTI' as const;

/** ES1: business areas. Stable contract values — never translated (ES2). */
export type EmailArea = 'PARTNER' | 'MACHINE' | 'MOBILE' | 'TRAILER' | 'FRANCHISE' | 'REFERRAL';

/** ES1: what happened. Stable contract values. */
export type EmailEvent =
  | 'APPLICATION'
  | 'CONNECT'
  | 'PAYOUT'
  | 'REFUND'
  | 'INQUIRY'
  | 'REWARD'
  | 'REVERSAL';

/** ES1: the state qualifier. Optional — some events carry no state. */
export type EmailState =
  | 'NEW'
  | 'MORE-INFO'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTION-REQUIRED'
  | 'READY'
  | 'FAILED';

/** ES4: environments that must be visible in the subject. */
export type EmailEnvironment = 'production' | 'staging' | 'development';

/**
 * ES6: the closed set of operational subjects the product may send. Adding a
 * new operational email means adding a row here, which the exhaustiveness test
 * then covers automatically.
 */
export interface OperationalSubjectSpec {
  readonly area: EmailArea;
  readonly event: EmailEvent;
  readonly state?: EmailState;
}

export const OPERATIONAL_SUBJECTS = {
  partnerApplicationNew: { area: 'PARTNER', event: 'APPLICATION', state: 'NEW' },
  partnerApplicationMoreInfo: { area: 'PARTNER', event: 'APPLICATION', state: 'MORE-INFO' },
  partnerApplicationApproved: { area: 'PARTNER', event: 'APPLICATION', state: 'APPROVED' },
  partnerApplicationRejected: { area: 'PARTNER', event: 'APPLICATION', state: 'REJECTED' },
  partnerConnectActionRequired: { area: 'PARTNER', event: 'CONNECT', state: 'ACTION-REQUIRED' },
  partnerPayoutReady: { area: 'PARTNER', event: 'PAYOUT', state: 'READY' },
  partnerPayoutFailed: { area: 'PARTNER', event: 'PAYOUT', state: 'FAILED' },
  partnerRefundReversal: { area: 'PARTNER', event: 'REFUND', state: 'REVERSAL' as EmailState },
  machineInquiryNew: { area: 'MACHINE', event: 'INQUIRY', state: 'NEW' },
  mobileInquiryNew: { area: 'MOBILE', event: 'INQUIRY', state: 'NEW' },
  trailerInquiryNew: { area: 'TRAILER', event: 'INQUIRY', state: 'NEW' },
  franchiseInquiryNew: { area: 'FRANCHISE', event: 'INQUIRY', state: 'NEW' },
  referralReward: { area: 'REFERRAL', event: 'REWARD' },
  referralReversal: { area: 'REFERRAL', event: 'REVERSAL' },
} as const satisfies Record<string, OperationalSubjectSpec>;

export type OperationalSubjectKey = keyof typeof OPERATIONAL_SUBJECTS;

/**
 * ES5: a conservative ceiling. Mail clients commonly truncate display around
 * 78 chars and RFC 5322 recommends folding beyond 78 octets; 160 keeps the
 * taxonomy plus a useful identifier well inside what clients and filters
 * handle without folding surprises.
 */
export const MAX_SUBJECT_LENGTH = 160 as const;

/**
 * ES5: strip anything that could break a header or a filter.
 * CR/LF removal is a header-injection defence: an identifier ultimately derives
 * from user-supplied data (a creator name, a city), so it is untrusted.
 */
export function sanitizeSubjectIdentifier(raw: string): string {
  return (
    raw
      .replace(/[\r\n]+/g, ' ') // ES5: header-injection defence
      // Stripping control characters IS the purpose here: they are the header-injection
      // and filter-corruption vector, so the rule's warning is the intended behaviour.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** ES1: the bracket prefix alone, e.g. `[GELLATTI][PARTNER][APPLICATION][NEW]`. */
export function buildSubjectPrefix(
  spec: OperationalSubjectSpec,
  environment: EmailEnvironment,
): string {
  const tokens: string[] = [SUBJECT_ROOT, spec.area, spec.event];
  if (spec.state !== undefined) tokens.push(spec.state);
  // ES4: mark anything that is not production, so staging mail is unmistakable.
  if (environment !== 'production') tokens.push(environment.toUpperCase());
  return tokens.map((token) => `[${token}]`).join('');
}

/**
 * ES1/ES3/ES5: the full internal subject — prefix plus a human identifier.
 *
 * The identifier is what makes the mail scannable by a person once the filter
 * has done its job: `Spain · V4B · ES-2026-00142`, `GelatoConAnna · Italy`.
 * Truncation only ever removes identifier characters, never prefix tokens, so
 * a filter can still match a truncated subject.
 */
export function buildOperationalSubject(input: {
  readonly key: OperationalSubjectKey;
  readonly identifier?: string;
  readonly environment: EmailEnvironment;
}): string {
  const spec: OperationalSubjectSpec = OPERATIONAL_SUBJECTS[input.key];
  const prefix = buildSubjectPrefix(spec, input.environment);
  const identifier = sanitizeSubjectIdentifier(input.identifier ?? '');
  if (identifier === '') return prefix;

  const separator = ' ';
  const room = MAX_SUBJECT_LENGTH - prefix.length - separator.length;
  if (room <= 0) return prefix; // ES3: the prefix is never sacrificed
  const trimmed =
    identifier.length <= room
      ? identifier
      : `${identifier.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  return `${prefix}${separator}${trimmed}`;
}

/**
 * ES1: join identifier parts with the owner's separator, dropping empties so a
 * missing city never produces `Spain ·  · ES-2026-00142`.
 */
export function joinIdentifierParts(...parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .map((part) => sanitizeSubjectIdentifier(part ?? ''))
    .filter((part) => part !== '')
    .join(' · ');
}

/**
 * ES3: structured metadata for providers that support it. This is strictly
 * ADDITIONAL to the subject — never the only way to route a message.
 */
export interface EmailMetadata {
  readonly area: string;
  readonly event: string;
  readonly entity_id: string;
  readonly environment: string;
}

export function buildEmailMetadata(input: {
  readonly key: OperationalSubjectKey;
  readonly entityId: string;
  readonly environment: EmailEnvironment;
}): EmailMetadata {
  const spec: OperationalSubjectSpec = OPERATIONAL_SUBJECTS[input.key];
  return Object.freeze({
    area: spec.area,
    event: spec.event,
    entity_id: input.entityId,
    environment: input.environment,
  });
}

/**
 * ES7: the customer-facing subject. NO bracket taxonomy — a customer receives a
 * normal sentence in their own language. The internal taxonomy exists for the
 * operational mailbox, not for the person who applied to the partner program.
 *
 * Environment marking is still applied off-production (ES4) so a staging send
 * is never mistaken for a real customer email.
 */
export function buildCustomerSubject(input: {
  readonly localizedSubject: string;
  readonly environment: EmailEnvironment;
}): string {
  const subject = sanitizeSubjectIdentifier(input.localizedSubject);
  const marked =
    input.environment === 'production'
      ? subject
      : `[${input.environment.toUpperCase()}] ${subject}`;
  return marked.length <= MAX_SUBJECT_LENGTH
    ? marked
    : `${marked.slice(0, MAX_SUBJECT_LENGTH - 1).trimEnd()}…`;
}
