import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { EmptyState } from '@/components/shared/EmptyState';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { customerErrorMessage } from '@/copy/customerError';
import {
  getFranchiseInquiries,
  setFranchiseInquiryStatus,
  type FranchiseInquiry,
  type FranchiseInquiryStatus,
} from '@/services/franchise';
import { franchiseConceptLabelPl } from '@/features/franchise/franchiseConcepts';

const field = 'pro-focus-ring min-h-11 w-full border border-ink/15 bg-white px-3 text-sm';

const STATUS_LABEL: Readonly<Record<FranchiseInquiryStatus, string>> = {
  new: 'Nowe',
  contacted: 'Skontaktowano',
  qualified: 'Zakwalifikowane',
  closed: 'Zamknięte',
};
const NEXT_STATUS: readonly FranchiseInquiryStatus[] = [
  'new',
  'contacted',
  'qualified',
  'closed',
];

function LeadRow({
  row,
  onSet,
  pending,
}: {
  row: FranchiseInquiry;
  onSet: (status: FranchiseInquiryStatus, note: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState(row.admin_note ?? '');
  return (
    <article className="border border-ink/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{row.full_name}</h3>
          <p className="mt-1 font-mono text-xs text-stone-500">
            {row.email}
            {row.phone ? ` · ${row.phone}` : ''}
          </p>
        </div>
        <span className="border border-ink/15 px-2 py-1 text-[11px] tracking-[0.08em] text-stone-600 uppercase">
          {STATUS_LABEL[row.status]}
        </span>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] tracking-[0.08em] text-stone-500 uppercase">Format</dt>
          <dd className="text-stone-700">{franchiseConceptLabelPl(row.concept)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.08em] text-stone-500 uppercase">Lokalizacja</dt>
          <dd className="text-stone-700">
            {[row.city, row.country].filter(Boolean).join(', ') || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.08em] text-stone-500 uppercase">Wpłynęło</dt>
          <dd className="font-mono text-xs text-stone-600">{row.created_at.slice(0, 16).replace('T', ' ')}</dd>
        </div>
      </dl>
      {row.note ? (
        <p className="mt-4 border-t border-ink/10 pt-4 text-sm leading-relaxed text-stone-600">
          {row.note}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
        <input
          className={`${field} max-w-xs`}
          placeholder="Notatka operatora"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        {NEXT_STATUS.filter((status) => status !== row.status).map((status) => (
          <Button
            key={status}
            type="button"
            variant={status === 'qualified' ? 'primary' : 'ghost'}
            disabled={pending}
            onClick={() => onSet(status, note)}
          >
            {STATUS_LABEL[status]}
          </Button>
        ))}
      </div>
    </article>
  );
}

/** Franchise leads — the operator's queue for `/franchise` inquiries. */
export function AdminFranchiseLeadsSection() {
  const queryClient = useQueryClient();
  const inquiries = useQuery({
    queryKey: ['admin-franchise-inquiries'],
    queryFn: () => getFranchiseInquiries(),
  });
  const update = useMutation({
    mutationFn: (input: { inquiryId: string; status: FranchiseInquiryStatus; note?: string }) =>
      setFranchiseInquiryStatus(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin-franchise-inquiries'] }),
  });

  const rows = inquiries.data ?? [];
  const open = rows.filter((row) => row.status !== 'closed');
  const closed = rows.filter((row) => row.status === 'closed');

  return (
    <>
      <header className="border-b border-ink/10 pb-6">
        <SectionLabel>Zapytania biznesowe</SectionLabel>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">Franchise</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Zapytania ze strony Franchise. Format, kontakt i lokalizacja — bez warunków finansowych,
          bo te ustalasz w rozmowie.
        </p>
      </header>

      {inquiries.isLoading ? <ApplicationState kind="loading" title="Wczytuję zapytania…" /> : null}
      {inquiries.isError ? (
        <ApplicationState kind="error" title="Nie udało się wczytać zapytań." />
      ) : null}
      {update.isError ? (
        <p className="mt-4 text-sm text-[#b3261e]">{customerErrorMessage(update.error, 'admin')}</p>
      ) : null}

      <div className="mt-7 grid gap-3">
        {inquiries.isSuccess && open.length === 0 ? (
          <EmptyState title="Brak otwartych zapytań o Franchise." />
        ) : (
          open.map((row) => (
            <LeadRow
              key={row.id}
              row={row}
              pending={update.isPending}
              onSet={(status, note) =>
                update.mutate({ inquiryId: row.id, status, note: note || undefined })
              }
            />
          ))
        )}
      </div>

      {closed.length > 0 ? (
        <details className="mt-4 border border-ink/10 bg-white p-5">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            Zamknięte ({closed.length})
          </summary>
          <div className="mt-4 grid gap-3">
            {closed.map((row) => (
              <LeadRow
                key={row.id}
                row={row}
                pending={update.isPending}
                onSet={(status, note) =>
                  update.mutate({ inquiryId: row.id, status, note: note || undefined })
                }
              />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}
