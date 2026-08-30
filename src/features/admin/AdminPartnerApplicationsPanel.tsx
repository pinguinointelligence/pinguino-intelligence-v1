import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { EmptyState } from '@/components/shared/EmptyState';
import { customerErrorMessage } from '@/copy/customerError';
import {
  decidePartnerApplication,
  getAdminPartnerApplications,
  type AdminPartnerApplication,
} from '@/services/partner';

const field = 'pro-focus-ring min-h-11 w-full border border-[var(--g-line)] bg-white px-3 text-sm';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Szkic',
  submitted: 'Nowe zgłoszenie',
  in_review: 'Oczekuje na informacje',
  approved: 'Zatwierdzone',
  rejected: 'Odrzucone',
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

function ApplicationRow({
  row,
  onDecide,
  pending,
}: {
  row: AdminPartnerApplication;
  onDecide: (action: 'approve' | 'reject' | 'request_information', reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState('');
  const data = row.application ?? {};
  const platforms = Array.isArray(data.platforms) ? (data.platforms as string[]) : [];
  const open = row.status === 'submitted' || row.status === 'in_review';
  return (
    <article className="border border-[var(--g-line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">
            {text(data.displayName) ?? row.email ?? 'Zgłoszenie'}
          </h3>
          <p className="mt-1 font-mono text-xs text-[var(--g-text-secondary)]">{row.email}</p>
        </div>
        <span className="border border-[var(--g-line)] px-2 py-1 text-[11px] tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
          {STATUS_LABEL[row.status] ?? row.status}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {text(data.primaryLink) ? (
          <div className="min-w-0">
            <dt className="text-[11px] tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">Główny link</dt>
            <dd className="truncate">
              <a
                href={String(data.primaryLink)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink underline underline-offset-2"
              >
                {String(data.primaryLink)}
              </a>
            </dd>
          </div>
        ) : null}
        {text(data.otherLinks) ? (
          <div className="min-w-0">
            <dt className="text-[11px] tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">Inne linki</dt>
            <dd className="truncate text-[var(--g-text-secondary)]">{String(data.otherLinks)}</dd>
          </div>
        ) : null}
        {platforms.length > 0 ? (
          <div>
            <dt className="text-[11px] tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">Platformy</dt>
            <dd className="text-[var(--g-text-secondary)]">{platforms.join(' · ')}</dd>
          </div>
        ) : null}
        {text(data.audience) ? (
          <div>
            <dt className="text-[11px] tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">Publiczność</dt>
            <dd className="text-[var(--g-text-secondary)]">{String(data.audience)}</dd>
          </div>
        ) : null}
        {text(data.country) ? (
          <div>
            <dt className="text-[11px] tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">Kraj</dt>
            <dd className="text-[var(--g-text-secondary)]">{String(data.country)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[11px] tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">Konto Gellatti</dt>
          <dd className="text-[var(--g-text-secondary)]">
            {row.partnerActive ? 'Partner aktywny' : 'Bez roli Partner'}
          </dd>
        </div>
      </dl>

      {text(data.note) ? (
        <p className="mt-4 border-t border-[var(--g-line)] pt-4 text-sm leading-relaxed text-[var(--g-text-secondary)]">
          {String(data.note)}
        </p>
      ) : null}

      {row.decision_reason ? (
        <p className="mt-3 text-xs text-[var(--g-text-secondary)]">Decyzja: {row.decision_reason}</p>
      ) : null}

      {open ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--g-line)] pt-4">
          <input
            className={`${field} max-w-xs`}
            placeholder="Powód decyzji (opcjonalnie)"
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          <Button type="button" disabled={pending} onClick={() => onDecide('approve', reason)}>
            Zatwierdź partnera
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onDecide('request_information', reason)}
          >
            Poproś o informacje
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onDecide('reject', reason)}
          >
            Odrzuć
          </Button>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Partner application queue.
 *
 * Approving here is the whole activation: the server adds the Partner role on
 * top of the account's existing plan, publishes the partner profile, mints the
 * first attribution code and notifies the applicant in one transaction. No
 * manual database editing, and no second admin step.
 */
export function AdminPartnerApplicationsPanel() {
  const queryClient = useQueryClient();
  const applications = useQuery({
    queryKey: ['admin-partner-applications'],
    queryFn: () => getAdminPartnerApplications(),
  });
  const decide = useMutation({
    mutationFn: (input: {
      applicationId: string;
      action: 'approve' | 'reject' | 'request_information';
      reason?: string;
    }) => decidePartnerApplication(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-partner-applications'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-directory', 'PARTNERS'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-directory', 'AUDIT'] }),
      ]);
    },
  });

  const rows = applications.data ?? [];
  const open = rows.filter((row) => row.status === 'submitted' || row.status === 'in_review');
  const closed = rows.filter((row) => row.status === 'approved' || row.status === 'rejected');

  return (
    <section className="mt-7">
      <SectionLabel>Zgłoszenia partnerskie</SectionLabel>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--g-text-secondary)]">
        Zgłoszenia z „Współpraca”. Zatwierdzenie od razu włącza tryb Partner obok obecnego planu,
        publikuje profil i tworzy pierwszy kod.
      </p>

      {decide.isError ? (
        <p className="mt-3 text-sm text-status-error">{customerErrorMessage(decide.error, 'admin')}</p>
      ) : null}
      {decide.data?.code ? (
        <p className="mt-3 text-sm text-ink">
          Partner aktywny. Kod: <span className="font-mono">{decide.data.code}</span>
        </p>
      ) : null}

      <div className="mt-4 grid gap-3">
        {open.length === 0 ? (
          <EmptyState title="Brak zgłoszeń oczekujących na decyzję." />
        ) : (
          open.map((row) => (
            <ApplicationRow
              key={row.id}
              row={row}
              pending={decide.isPending}
              onDecide={(action, reason) =>
                decide.mutate({ applicationId: row.id, action, reason: reason || undefined })
              }
            />
          ))
        )}
      </div>

      {closed.length > 0 ? (
        <details className="mt-4 border border-[var(--g-line)] bg-white p-5">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            Rozpatrzone ({closed.length})
          </summary>
          <div className="mt-4 grid gap-3">
            {closed.map((row) => (
              <ApplicationRow key={row.id} row={row} pending={false} onDecide={() => {}} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
