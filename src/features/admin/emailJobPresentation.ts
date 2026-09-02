/**
 * Email job presentation — operator-facing language for the delivery states.
 *
 * DESIGNBOOK (§12 status bars, §10 chips): "The message names the state and next
 * action; color is secondary" and "do not name a state by its color in customer
 * copy". So each state carries a written label and, where something is wrong, a
 * written next action. The tone only reinforces it.
 *
 * Raw statuses are contracts shared with the `email_jobs` CHECK constraint and
 * are never rendered directly.
 */
import type { AdminStatusTone } from './adminUi';
import type { AdminEmailJob, EmailFailureKind, EmailJobStatus } from '@/services/emailJobs';

export interface EmailJobStatusCopy {
  readonly label: string;
  readonly tone: AdminStatusTone;
  /** What the operator should understand, in one line. */
  readonly meaning: string;
}

export const EMAIL_JOB_STATUS_COPY: Readonly<Record<EmailJobStatus, EmailJobStatusCopy>> =
  Object.freeze({
    queued: Object.freeze({
      label: 'W kolejce',
      tone: 'quiet' as const,
      meaning: 'Czeka na wysyłkę.',
    }),
    sending: Object.freeze({
      label: 'Wysyłanie',
      tone: 'neutral' as const,
      meaning: 'Trwa próba wysyłki u dostawcy.',
    }),
    sent: Object.freeze({
      label: 'Dostarczone',
      tone: 'good' as const,
      meaning: 'Dostawca potwierdził przyjęcie i zwrócił identyfikator wiadomości.',
    }),
    failed: Object.freeze({
      label: 'Ponowi próbę',
      tone: 'attention' as const,
      meaning: 'Wysyłka się nie udała. Kolejna próba jest zaplanowana.',
    }),
    abandoned: Object.freeze({
      label: 'Zatrzymane',
      tone: 'attention' as const,
      meaning: 'Wysyłka została zatrzymana. Wymaga decyzji operatora.',
    }),
    cancelled: Object.freeze({
      label: 'Anulowane',
      tone: 'quiet' as const,
      meaning: 'Zdarzenie zostało wycofane, zanim cokolwiek wysłano.',
    }),
  });

export const EMAIL_FAILURE_KIND_LABEL: Readonly<Record<EmailFailureKind, string>> = Object.freeze({
  retryable: 'Do ponowienia',
  permanent: 'Trwały',
});

/**
 * The single most useful line an operator can read: what to DO about this row.
 *
 * `missing_credential` is called out by name because it is the one failure that
 * is entirely ours and entirely fixable — and because it is the case the owner
 * insisted must never look like success.
 */
export function emailJobNextAction(job: AdminEmailJob): string | null {
  if (job.status === 'sent' || job.status === 'cancelled') return null;
  if (job.last_failure_code === 'missing_credential') {
    return 'Brak klucza dostawcy — nic nie zostało wysłane. Uzupełnij konfigurację; wiadomość wyśle się sama.';
  }
  if (job.status === 'abandoned') {
    return job.last_failure_kind === 'permanent'
      ? 'Dostawca odrzucił tę wiadomość. Sprawdź adres i treść.'
      : 'Wyczerpano wszystkie próby. Sprawdź konfigurację dostawcy.';
  }
  if (job.status === 'failed') return 'Kolejna próba nastąpi automatycznie.';
  return null;
}

/** True when this row is what the operator opened the panel to find. */
export function needsAttention(job: AdminEmailJob): boolean {
  return job.status === 'failed' || job.status === 'abandoned';
}

/**
 * A delivered job must carry the provider's own identifier. A row claiming
 * `sent` without one would mean the "never a false sent" rule had been broken
 * somewhere, so the panel surfaces it rather than displaying a green pill.
 */
export function isTrustworthyDelivery(job: AdminEmailJob): boolean {
  return job.status === 'sent' && (job.provider_message_id ?? '').trim() !== '';
}

/** `[GELLATTI][PARTNER][APPLICATION][NEW] …` → `PARTNER · APPLICATION · NEW`. */
export function subjectTaxonomyPath(subject: string): string {
  const tokens = [...subject.matchAll(/\[([A-Z][A-Z-]*)\]/g)].map((m) => m[1]);
  return tokens.filter((token) => token !== 'GELLATTI').join(' · ');
}

/** The human half of the subject, after the bracket taxonomy. */
export function subjectIdentifier(subject: string): string {
  return subject.replace(/^(?:\[[A-Z][A-Z-]*\])+\s*/, '').trim();
}
