/**
 * Business lead presentation — operator language for the lead pipeline.
 *
 * DESIGNBOOK §10/§12: the message names the state; colour is secondary, and a
 * state is never named by its colour. Raw values stay contracts.
 */
import type { AdminStatusTone } from './adminUi';
import type {
  BusinessLead,
  BusinessLeadEvent,
  BusinessLeadStatus,
  BusinessLeadType,
} from '@/services/businessLeads';

export const BUSINESS_LEAD_STATUSES: readonly BusinessLeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'quoted',
  'won',
  'lost',
];

export interface LeadStatusCopy {
  readonly label: string;
  readonly tone: AdminStatusTone;
}

export const LEAD_STATUS_COPY: Readonly<Record<BusinessLeadStatus, LeadStatusCopy>> = Object.freeze(
  {
    new: Object.freeze({ label: 'Nowe', tone: 'attention' as const }),
    contacted: Object.freeze({ label: 'Skontaktowano', tone: 'neutral' as const }),
    qualified: Object.freeze({ label: 'Zakwalifikowane', tone: 'neutral' as const }),
    quoted: Object.freeze({ label: 'Wysłano ofertę', tone: 'neutral' as const }),
    won: Object.freeze({ label: 'Wygrane', tone: 'good' as const }),
    lost: Object.freeze({ label: 'Przegrane', tone: 'quiet' as const }),
  },
);

/**
 * Lead types in customer-facing Gellatti language. Never a manufacturer name
 * (owner correction §5/§14) and never the raw contract value.
 */
export const LEAD_TYPE_LABEL: Readonly<Record<BusinessLeadType, string>> = Object.freeze({
  machine: 'Maszyny',
  mobile: 'Sprzęt mobilny',
  trailer: 'Przyczepa Gellatti',
  franchise: 'Franchise',
});

/** The four paths, in the owner's gateway order (§7). */
export const LEAD_TYPES: readonly BusinessLeadType[] = [
  'machine',
  'mobile',
  'trailer',
  'franchise',
];

export function leadStatusLabel(status: BusinessLeadStatus): string {
  return LEAD_STATUS_COPY[status].label;
}

/** A lead nobody has touched yet is the one an operator came to find. */
export function needsFirstContact(lead: BusinessLead): boolean {
  return lead.status === 'new';
}

/** Terminal states: no further pipeline action is expected. */
export function isLeadSettled(status: BusinessLeadStatus): boolean {
  return status === 'won' || status === 'lost';
}

/**
 * The statuses an operator may move a lead to next. Settled leads stay settled
 * unless deliberately reopened, so they offer no forward moves — reopening is
 * an explicit choice, not a stray click in a dropdown.
 */
export function nextStatuses(current: BusinessLeadStatus): readonly BusinessLeadStatus[] {
  if (isLeadSettled(current)) return [];
  return BUSINESS_LEAD_STATUSES.filter((status) => status !== current);
}

/**
 * The configurator answers, flattened for display.
 *
 * Keys are camelCase contract names, so they are humanised rather than printed
 * raw — printing `machineDepthMm` at an operator is the same defect as printing
 * a status enum.
 */
export function describeConfiguration(
  configuration: Record<string, unknown>,
): readonly { readonly label: string; readonly value: string }[] {
  return Object.entries(configuration)
    .filter(([key]) => key !== 'importedFrom')
    .map(([key, value]) => ({
      label: humaniseKey(key),
      value: formatValue(value),
    }))
    .filter((entry) => entry.value !== '');
}

function humaniseKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value))
    return value
      .map((entry) => formatValue(entry))
      .filter(Boolean)
      .join(', ');
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

/** One history line, in operator language. */
export function describeEvent(event: BusinessLeadEvent): string {
  if (event.kind === 'created') return 'Zapytanie wpłynęło.';
  if (event.kind === 'assigned') return 'Przypisano opiekuna.';
  if (event.kind === 'status_changed') {
    const from = event.from_status === null ? null : leadStatusLabel(event.from_status);
    const to = event.to_status === null ? null : leadStatusLabel(event.to_status);
    const change = from === null || to === null ? 'Zmieniono status.' : `${from} → ${to}`;
    return event.note === null || event.note.trim() === '' ? change : `${change} · ${event.note}`;
  }
  return event.note ?? 'Notatka.';
}
