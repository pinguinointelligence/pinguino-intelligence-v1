import { describe, expect, it } from 'vitest';

import {
  BUSINESS_LEAD_STATUSES,
  LEAD_STATUS_COPY,
  LEAD_TYPES,
  LEAD_TYPE_LABEL,
  describeConfiguration,
  describeEvent,
  isLeadSettled,
  leadStatusLabel,
  needsFirstContact,
  nextStatuses,
} from './businessLeadPresentation';
import type { BusinessLead, BusinessLeadEvent } from '@/services/businessLeads';

const lead = (overrides: Partial<BusinessLead> = {}): BusinessLead => ({
  id: 'lead-1',
  reference: 'MCH-2026-00142',
  lead_type: 'machine',
  source_route: '/machines',
  model_or_format: 'V4B',
  configuration: {},
  full_name: 'Anna Kowalska',
  email: 'anna@example.com',
  phone: null,
  country: 'Polska',
  city: 'Kraków',
  message: null,
  status: 'new',
  assigned_to_user_id: null,
  created_at: '2026-08-31T09:00:00.000Z',
  updated_at: '2026-08-31T09:00:00.000Z',
  event_count: 1,
  ...overrides,
});

const event = (overrides: Partial<BusinessLeadEvent> = {}): BusinessLeadEvent => ({
  id: 'ev-1',
  kind: 'note',
  from_status: null,
  to_status: null,
  note: null,
  actor_user_id: null,
  created_at: '2026-08-31T09:00:00.000Z',
  ...overrides,
});

describe('§32 — all six operational statuses exist', () => {
  it('matches the owner list exactly', () => {
    expect(BUSINESS_LEAD_STATUSES).toEqual([
      'new',
      'contacted',
      'qualified',
      'quoted',
      'won',
      'lost',
    ]);
  });

  it('every status has a label', () => {
    for (const status of BUSINESS_LEAD_STATUSES) {
      expect(leadStatusLabel(status).length, status).toBeGreaterThan(0);
    }
  });

  it('the copy map is exhaustive and frozen', () => {
    expect(new Set(Object.keys(LEAD_STATUS_COPY))).toEqual(new Set(BUSINESS_LEAD_STATUSES));
    expect(Object.isFrozen(LEAD_STATUS_COPY)).toBe(true);
  });
});

describe('Designbook §10 — states are named, not coloured', () => {
  it('no label leaks a raw contract value', () => {
    for (const status of BUSINESS_LEAD_STATUSES) {
      const label = leadStatusLabel(status).toLowerCase();
      for (const raw of BUSINESS_LEAD_STATUSES) {
        expect(label, `${status} leaks ${raw}`).not.toContain(raw);
      }
    }
  });

  it('no label names a colour', () => {
    for (const status of BUSINESS_LEAD_STATUSES) {
      const label = leadStatusLabel(status).toLowerCase();
      for (const colour of ['zielon', 'czerwon', 'pomarańcz', 'green', 'red', 'orange']) {
        expect(label, status).not.toContain(colour);
      }
    }
  });

  it('only a won lead reads as success', () => {
    expect(LEAD_STATUS_COPY.won.tone).toBe('good');
    for (const status of BUSINESS_LEAD_STATUSES.filter((s) => s !== 'won')) {
      expect(LEAD_STATUS_COPY[status].tone, status).not.toBe('good');
    }
  });
});

describe('owner correction §5/§14 — no manufacturer name reaches an operator label', () => {
  it('covers the four gateway paths in order', () => {
    expect(LEAD_TYPES).toEqual(['machine', 'mobile', 'trailer', 'franchise']);
    expect(new Set(Object.keys(LEAD_TYPE_LABEL))).toEqual(new Set(LEAD_TYPES));
  });

  it('never says the manufacturer name', () => {
    for (const type of LEAD_TYPES) {
      expect(LEAD_TYPE_LABEL[type].toLowerCase(), type).not.toContain('miles');
      expect(LEAD_TYPE_LABEL[type].toLowerCase(), type).not.toContain('galaxy');
    }
  });

  it('never prints the raw type value — except where the word IS the brand term', () => {
    // 'Franchise' is deliberately exempt: it is the owner's own public name for
    // that path (§31 "Porozmawiaj o Gellatti Franchise"), so the label matching
    // the contract value is a coincidence of vocabulary, not enum leakage.
    for (const type of LEAD_TYPES.filter((t) => t !== 'franchise')) {
      expect(LEAD_TYPE_LABEL[type].toLowerCase(), type).not.toContain(type);
    }
    expect(LEAD_TYPE_LABEL.franchise).toBe('Franchise');
  });
});

describe('pipeline movement', () => {
  it('flags an untouched lead', () => {
    expect(needsFirstContact(lead())).toBe(true);
    expect(needsFirstContact(lead({ status: 'contacted' }))).toBe(false);
  });

  it('treats won and lost as settled', () => {
    expect(isLeadSettled('won')).toBe(true);
    expect(isLeadSettled('lost')).toBe(true);
    for (const status of ['new', 'contacted', 'qualified', 'quoted'] as const) {
      expect(isLeadSettled(status), status).toBe(false);
    }
  });

  it('offers every other status as a next move for a live lead', () => {
    expect(nextStatuses('new')).toEqual(['contacted', 'qualified', 'quoted', 'won', 'lost']);
    expect(nextStatuses('quoted')).not.toContain('quoted');
  });

  it('offers no forward move from a settled lead, so reopening is deliberate', () => {
    expect(nextStatuses('won')).toEqual([]);
    expect(nextStatuses('lost')).toEqual([]);
  });
});

describe('configurator answers are shown, not dumped', () => {
  it('humanises camelCase keys rather than printing them raw', () => {
    const rows = describeConfiguration({ flavourCount: '5-6', sellingPlace: 'gelateria' });
    expect(rows).toEqual([
      { label: 'Flavour count', value: '5-6' },
      { label: 'Selling place', value: 'gelateria' },
    ]);
  });

  it('renders booleans and arrays readably', () => {
    const rows = describeConfiguration({ hasLocation: true, platforms: ['instagram', 'tiktok'] });
    expect(rows).toContainEqual({ label: 'Has location', value: 'Tak' });
    expect(rows).toContainEqual({ label: 'Platforms', value: 'instagram, tiktok' });
  });

  it('drops empty values and the import marker', () => {
    expect(
      describeConfiguration({ importedFrom: 'franchise_inquiries', empty: '', concept: 'lokal' }),
    ).toEqual([{ label: 'Concept', value: 'lokal' }]);
  });

  it('survives an empty configuration', () => {
    expect(describeConfiguration({})).toEqual([]);
  });
});

describe('history reads as a sentence', () => {
  it('describes creation', () => {
    expect(describeEvent(event({ kind: 'created' }))).toBe('Zapytanie wpłynęło.');
  });

  it('describes a status change with both labels, not raw values', () => {
    const line = describeEvent(
      event({ kind: 'status_changed', from_status: 'new', to_status: 'contacted' }),
    );
    expect(line).toBe('Nowe → Skontaktowano');
    expect(line).not.toContain('new');
    expect(line).not.toContain('contacted');
  });

  it('appends a note to a status change when one was given', () => {
    expect(
      describeEvent(
        event({
          kind: 'status_changed',
          from_status: 'new',
          to_status: 'lost',
          note: 'Brak budżetu',
        }),
      ),
    ).toBe('Nowe → Przegrane · Brak budżetu');
  });

  it('returns a plain note unchanged', () => {
    expect(describeEvent(event({ kind: 'note', note: 'Oddzwonić w piątek' }))).toBe(
      'Oddzwonić w piątek',
    );
  });
});
