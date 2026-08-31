import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AdminEyebrow, AdminPanel, AdminStatus } from './adminUi';
import {
  LEAD_STATUS_COPY,
  LEAD_TYPES,
  LEAD_TYPE_LABEL,
  describeConfiguration,
  describeEvent,
  needsFirstContact,
  nextStatuses,
} from './businessLeadPresentation';
import { EmptyState } from '@/components/shared/EmptyState';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { customerErrorMessage } from '@/copy/customerError';
import {
  getAdminBusinessLeads,
  getBusinessLeadEvents,
  updateBusinessLead,
  type BusinessLead,
  type BusinessLeadStatus,
  type BusinessLeadType,
} from '@/services/businessLeads';
import { cn } from '@/lib/cn';

/**
 * Admin — business leads (P-LEAD-01…04).
 *
 * One place for every machine, mobile, trailer and franchise enquiry, so a lead
 * cannot disappear into an inbox (§32).
 *
 * Designbook: reuses the shared admin layer; white ground, 12 px radius,
 * hairlines, no shadows; Manrope labels with mono for the reference, contact
 * and timestamps; no decorative orange — a brand-new lead is marked with the
 * shared attention pill and nothing else.
 */

const dateTime = (value: string): string =>
  new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <dt className="text-[10px] leading-none font-extrabold tracking-[0.16em] text-[var(--g-text-secondary)] uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 truncate font-mono text-[13px] leading-none text-[var(--g-ink)]">
        {value}
      </dd>
    </div>
  );
}

function LeadHistory({ leadId }: { leadId: string }) {
  const events = useQuery({
    queryKey: ['admin', 'business-lead-events', leadId],
    queryFn: () => getBusinessLeadEvents(leadId),
  });

  if (events.isPending)
    return <p className="text-[12px] text-[var(--g-text-secondary)]">Wczytuję…</p>;
  if (events.isError) {
    return (
      <p className="text-[12px] text-[var(--g-text-secondary)]">
        {customerErrorMessage(events.error)}
      </p>
    );
  }

  return (
    <ol className="mt-2 grid gap-1.5">
      {(events.data ?? []).map((entry) => (
        <li key={entry.id} className="flex gap-3 text-[12px] leading-relaxed">
          <span className="shrink-0 font-mono text-[var(--g-text-secondary)]">
            {dateTime(entry.created_at)}
          </span>
          <span className="text-[var(--g-ink)]">{describeEvent(entry)}</span>
        </li>
      ))}
    </ol>
  );
}

function LeadRow({ lead }: { lead: BusinessLead }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  const update = useMutation({
    mutationFn: (input: { status?: BusinessLeadStatus; note?: string }) =>
      updateBusinessLead({ leadId: lead.id, ...input }),
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'business-leads'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'business-lead-events', lead.id] });
    },
  });

  const copy = LEAD_STATUS_COPY[lead.status];
  const configuration = describeConfiguration(lead.configuration);
  const fresh = needsFirstContact(lead);

  return (
    <article
      className={cn(
        'rounded-[12px] border p-[18px]',
        fresh
          ? 'border-[#f0d7ac] bg-[var(--g-attention-surface)]'
          : 'border-[var(--g-line)] bg-white',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <AdminEyebrow>
            {LEAD_TYPE_LABEL[lead.lead_type]}
            {lead.model_or_format === null ? '' : ` · ${lead.model_or_format}`}
          </AdminEyebrow>
          <h3 className="mt-1 text-[18px] leading-tight font-semibold tracking-[-0.02em] text-[var(--g-ink)]">
            {lead.full_name}
          </h3>
          <p className="mt-1 font-mono text-[12px] text-[var(--g-text-secondary)]">
            {lead.email}
            {lead.phone === null ? '' : ` · ${lead.phone}`}
          </p>
        </div>
        <AdminStatus tone={copy.tone}>{copy.label}</AdminStatus>
      </div>

      {lead.message === null ? null : (
        <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-[var(--g-ink)]">
          {lead.message}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-line)] sm:grid-cols-4">
        <Spec label="Numer" value={lead.reference} />
        <Spec label="Skąd" value={lead.source_route ?? '—'} />
        <Spec
          label="Lokalizacja"
          value={[lead.city, lead.country].filter(Boolean).join(', ') || '—'}
        />
        <Spec label="Wpłynęło" value={dateTime(lead.created_at)} />
      </dl>

      {configuration.length > 0 ? (
        <AdminPanel tone="ivory" className="mt-3" title="Wybory z konfiguratora">
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {configuration.map((entry) => (
              <div key={entry.label} className="flex justify-between gap-3 text-[13px]">
                <dt className="text-[var(--g-text-secondary)]">{entry.label}</dt>
                <dd className="font-mono text-[var(--g-ink)]">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </AdminPanel>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {nextStatuses(lead.status).map((status) => (
          <button
            key={status}
            type="button"
            disabled={update.isPending}
            onClick={() => update.mutate({ status, note: note.trim() === '' ? undefined : note })}
            className="pro-focus-ring h-9 rounded-[9px] border border-[var(--g-line)] bg-white px-3 text-[12px] font-semibold text-[var(--g-ink)] transition-colors hover:border-[var(--g-ink)] disabled:cursor-not-allowed disabled:bg-[var(--g-ivory)] disabled:text-[var(--g-text-secondary)]"
          >
            {LEAD_STATUS_COPY[status].label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="pro-focus-ring h-9 rounded-[9px] px-2 text-[12px] font-semibold text-[var(--g-text-secondary)] underline-offset-4 hover:underline"
        >
          Historia ({lead.event_count})
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notatka do zapytania"
          aria-label="Notatka do zapytania"
          className="pro-focus-ring h-10 min-w-0 flex-1 rounded-[12px] border border-[var(--g-line)] bg-white px-3 text-[13px]"
        />
        <button
          type="button"
          disabled={update.isPending || note.trim() === ''}
          onClick={() => update.mutate({ note })}
          className="pro-focus-ring h-10 rounded-[9px] border border-[var(--g-ink)] bg-[var(--g-ink)] px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:border-[var(--g-line)] disabled:bg-[var(--g-ivory)] disabled:text-[var(--g-text-secondary)]"
        >
          Dodaj
        </button>
      </div>

      {update.isError ? (
        <p className="mt-2 text-[12px] text-[var(--g-ink)]">{customerErrorMessage(update.error)}</p>
      ) : null}

      {open ? <LeadHistory leadId={lead.id} /> : null}
    </article>
  );
}

export function AdminBusinessLeadsSection() {
  const [type, setType] = useState<BusinessLeadType | 'all'>('all');

  const leads = useQuery({
    queryKey: ['admin', 'business-leads', type],
    queryFn: () => getAdminBusinessLeads(type === 'all' ? {} : { leadType: type }),
  });

  const rows = leads.data ?? [];
  const freshCount = rows.filter(needsFirstContact).length;

  return (
    <section className="mt-7">
      <AdminEyebrow>Operacje</AdminEyebrow>
      <h2 className="mt-1 text-[22px] leading-tight font-bold tracking-[-0.025em] text-[var(--g-ink)]">
        Zapytania biznesowe
      </h2>
      <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
        Maszyny, sprzęt mobilny, przyczepa i Franchise w jednym miejscu. Każda zmiana statusu i
        każda notatka zostaje w historii zapytania.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['all', ...LEAD_TYPES] as const).map((value) => {
          const active = type === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              aria-pressed={active}
              className={cn(
                'pro-focus-ring h-9 rounded-[9px] border px-3 text-[12px] font-semibold transition-colors',
                active
                  ? 'border-[var(--g-ink)] bg-[var(--g-ink)] text-white'
                  : 'border-[var(--g-line)] bg-white text-[var(--g-text-secondary)] hover:border-[var(--g-ink)]',
              )}
            >
              {value === 'all' ? 'Wszystkie' : LEAD_TYPE_LABEL[value]}
            </button>
          );
        })}
      </div>

      {leads.isPending ? (
        <ApplicationState kind="loading" title="Wczytuję zapytania" body="Chwila." />
      ) : leads.isError ? (
        <ApplicationState
          kind="error"
          title="Nie udało się wczytać zapytań"
          body={customerErrorMessage(leads.error)}
        />
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Brak zapytań"
            body="Nikt jeszcze nie wysłał zapytania w tej kategorii."
          />
        </div>
      ) : (
        <>
          {freshCount > 0 ? (
            <AdminPanel tone="ivory" className="mt-4">
              <p className="text-[13px] leading-relaxed text-[var(--g-ink)]">
                {freshCount === 1
                  ? '1 zapytanie czeka na pierwszy kontakt.'
                  : `${freshCount} zapytania czekają na pierwszy kontakt.`}
              </p>
            </AdminPanel>
          ) : null}
          <div className="mt-4 grid gap-3">
            {rows.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
