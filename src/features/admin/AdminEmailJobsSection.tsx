import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { AdminEyebrow, AdminPanel, AdminStatus } from './adminUi';
import {
  EMAIL_FAILURE_KIND_LABEL,
  EMAIL_JOB_STATUS_COPY,
  emailJobNextAction,
  isTrustworthyDelivery,
  needsAttention,
  subjectIdentifier,
  subjectTaxonomyPath,
} from './emailJobPresentation';
import { EmptyState } from '@/components/shared/EmptyState';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { customerErrorMessage } from '@/copy/customerError';
import { getAdminEmailJobs, type AdminEmailJob, type EmailJobStatus } from '@/services/emailJobs';
import { cn } from '@/lib/cn';

/**
 * Admin — operational email (EMAIL-06).
 *
 * Answers one question: did the message arrive, and if not, what do I do?
 *
 * Designbook compliance: reuses the existing admin design layer (AdminPanel,
 * AdminStatus, AdminEyebrow) rather than inventing a competing one; white
 * working ground; 12 px radius; hairline borders; no shadows; mono reserved for
 * data (timestamps, ids, addresses); orange never used decoratively — the
 * attention tone comes from the shared status pill.
 *
 * Bodies are deliberately not fetched or shown: an operator needs to know WHICH
 * message did not arrive, not what it said.
 */

const FILTERS: readonly (readonly [label: string, value: EmailJobStatus | 'all'])[] = [
  ['Wymaga uwagi', 'failed'],
  ['Zatrzymane', 'abandoned'],
  ['W kolejce', 'queued'],
  ['Dostarczone', 'sent'],
  ['Wszystkie', 'all'],
];

const dateTime = (value: string | null): string =>
  value === null
    ? '—'
    : new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

/** One cell of the spec strip: Manrope label, mono value (Designbook §4). */
function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <dt className="text-[10px] leading-none font-extrabold tracking-[0.16em] text-[var(--g-text-secondary)] uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 truncate font-mono text-[13px] leading-none tabular-nums text-[var(--g-ink)]">
        {value}
      </dd>
    </div>
  );
}

function JobRow({ job }: { job: AdminEmailJob }) {
  const copy = EMAIL_JOB_STATUS_COPY[job.status];
  const action = emailJobNextAction(job);
  const taxonomy = subjectTaxonomyPath(job.subject);
  const identifier = subjectIdentifier(job.subject);
  const attention = needsAttention(job);

  return (
    <article
      className={cn(
        'rounded-[12px] border p-[18px]',
        attention
          ? 'border-[#f0d7ac] bg-[var(--g-attention-surface)]'
          : 'border-[var(--g-line)] bg-white',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <AdminEyebrow>{taxonomy || job.subject_key}</AdminEyebrow>
          <h3 className="mt-1 text-[18px] leading-tight font-semibold tracking-[-0.02em] text-[var(--g-ink)]">
            {identifier === '' ? job.subject_key : identifier}
          </h3>
          <p className="mt-1 font-mono text-[12px] text-[var(--g-text-secondary)]">
            {job.recipient}
            {job.environment === 'production' ? '' : ` · ${job.environment}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AdminStatus tone={copy.tone}>{copy.label}</AdminStatus>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
        {copy.meaning}
      </p>

      {job.last_failure_message !== null ? (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--g-ink)]">
          {job.last_failure_kind !== null ? (
            <span className="font-semibold">
              {EMAIL_FAILURE_KIND_LABEL[job.last_failure_kind]}:{' '}
            </span>
          ) : null}
          {job.last_failure_message}
        </p>
      ) : null}

      {action !== null ? (
        <p className="mt-2 text-[13px] leading-relaxed font-medium text-[var(--g-ink)]">{action}</p>
      ) : null}

      {job.status === 'sent' && !isTrustworthyDelivery(job) ? (
        <p className="mt-2 text-[13px] leading-relaxed font-semibold text-[var(--g-error,#8D3133)]">
          Ta pozycja jest oznaczona jako dostarczona, ale nie ma identyfikatora od dostawcy. Zgłoś
          to — tak nie powinno się zdarzyć.
        </p>
      ) : null}

      {/* Designbook §12: a bordered spec strip — label in Manrope, value in mono.
          AdminMetric is deliberately NOT used here: it is a headline card with a
          22 px value, which would shout over the row it belongs to. */}
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-line)] sm:grid-cols-4">
        <Spec label="Próby" value={`${job.attempts} / ${job.max_attempts}`} />
        <Spec label="Utworzono" value={dateTime(job.created_at)} />
        <Spec
          label={job.status === 'sent' ? 'Wysłano' : 'Następna próba'}
          value={dateTime(job.status === 'sent' ? job.sent_at : job.next_attempt_at)}
        />
        <Spec label="Id dostawcy" value={job.provider_message_id ?? '—'} />
      </dl>
    </article>
  );
}

export function AdminEmailJobsSection() {
  const [filter, setFilter] = useState<EmailJobStatus | 'all'>('failed');

  const jobs = useQuery({
    queryKey: ['admin', 'email-jobs', filter],
    queryFn: () => getAdminEmailJobs(filter === 'all' ? undefined : filter),
  });

  const rows = jobs.data ?? [];
  const attentionCount = rows.filter(needsAttention).length;

  return (
    <section className="mt-7">
      <AdminEyebrow>Operacje</AdminEyebrow>
      <h2 className="mt-1 text-[22px] leading-tight font-bold tracking-[-0.025em] text-[var(--g-ink)]">
        Wiadomości operacyjne
      </h2>
      <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
        Wszystko, co system miał wysłać na info@gellatti.com i do klientów. Pozycja jest oznaczona
        jako dostarczona wyłącznie wtedy, gdy dostawca zwrócił identyfikator wiadomości.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map(([label, value]) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={active}
              className={cn(
                'pro-focus-ring h-9 rounded-[9px] border px-3 text-[12px] font-semibold transition-colors',
                active
                  ? 'border-[var(--g-ink)] bg-[var(--g-ink)] text-white'
                  : 'border-[var(--g-line)] bg-white text-[var(--g-text-secondary)] hover:border-[var(--g-ink)]',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {jobs.isPending ? (
        <ApplicationState kind="loading" title="Wczytuję wiadomości" body="Chwila." />
      ) : jobs.isError ? (
        <ApplicationState
          kind="error"
          title="Nie udało się wczytać wiadomości"
          body={customerErrorMessage(jobs.error)}
        />
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={filter === 'failed' ? 'Nic nie wymaga uwagi' : 'Brak wiadomości'}
            body={
              filter === 'failed'
                ? 'Żadna wiadomość nie czeka na ponowienie ani nie została zatrzymana.'
                : 'W tym widoku nie ma jeszcze żadnych pozycji.'
            }
          />
        </div>
      ) : (
        <>
          {attentionCount > 0 && filter !== 'failed' ? (
            <AdminPanel tone="ivory" className="mt-4">
              <p className="text-[13px] leading-relaxed text-[var(--g-ink)]">
                {attentionCount === 1
                  ? '1 wiadomość wymaga uwagi.'
                  : `${attentionCount} wiadomości wymaga uwagi.`}
              </p>
            </AdminPanel>
          ) : null}
          <div className="mt-4 grid gap-3">
            {rows.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
