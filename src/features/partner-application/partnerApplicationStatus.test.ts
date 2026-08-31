/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  IN_FLIGHT_APPLICATION_STATUSES,
  PARTNER_APPLICATION_STATUSES,
  PARTNER_APPLICATION_STATUS_COPY,
  applicationNeedsCustomerAction,
  isApplicationInFlight,
  isPartnerApplicationStatus,
  partnerApplicationStatusDetail,
  partnerApplicationStatusLabel,
} from './partnerApplicationStatus';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260831140000_partner_application_more_information.sql'),
  'utf8',
);
const SQL = MIGRATION.replace(/--.*$/gm, '');

describe('AS1 — the TS contract matches the database CHECK constraint', () => {
  it('declares exactly the eight statuses the migration allows', () => {
    const check =
      /add constraint partner_applications_status_check[\s\S]*?\);/.exec(SQL)?.[0] ?? '';
    for (const status of PARTNER_APPLICATION_STATUSES) {
      expect(check, status).toContain(`'${status}'`);
    }
    // and nothing extra: count the quoted values inside the CHECK
    const quoted = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(quoted)).toEqual(new Set(PARTNER_APPLICATION_STATUSES));
  });

  it('the owner-specified seven customer states are all present', () => {
    for (const status of [
      'submitted', // RECEIVED
      'under_review', // UNDER REVIEW
      'more_information_needed', // MORE INFORMATION NEEDED
      'approved',
      'rejected',
      'suspended',
      'terminated',
    ] as const) {
      expect(PARTNER_APPLICATION_STATUSES).toContain(status);
    }
  });

  it('recognises valid values and rejects anything else', () => {
    expect(isPartnerApplicationStatus('approved')).toBe(true);
    expect(isPartnerApplicationStatus('nonsense')).toBe(false);
    expect(isPartnerApplicationStatus(null)).toBe(false);
    expect(isPartnerApplicationStatus(7)).toBe(false);
  });
});

describe('AS3 — `in_review` is not part of the contract', () => {
  it('is absent from the status union', () => {
    expect(PARTNER_APPLICATION_STATUSES).not.toContain('in_review' as never);
  });

  it('the migration never adds it to the CHECK constraint', () => {
    const check =
      /add constraint partner_applications_status_check[\s\S]*?\);/.exec(SQL)?.[0] ?? '';
    expect(check).not.toContain("'in_review'");
  });

  it('the migration repoints the decision RPC away from it', () => {
    // the fixed branch writes the legal value
    expect(SQL).toContain("else 'more_information_needed' end");
    // and the function body no longer writes the illegal one
    const fn =
      /create or replace function public\.gellatti_admin_partner_application_action_v1[\s\S]*?\$\$;/.exec(
        SQL,
      )?.[0] ?? '';
    expect(fn).not.toMatch(/status\s*=\s*'in_review'/);
    expect(fn).not.toContain("else 'in_review' end");
  });

  it('the submit guard no longer tests for it', () => {
    const fn =
      /create or replace function public\.gellatti_submit_partner_application_v1[\s\S]*?\$\$;/.exec(
        SQL,
      )?.[0] ?? '';
    expect(fn).toContain("if v_status in ('submitted', 'under_review', 'approved') then");
    expect(fn).not.toMatch(/v_status in \([^)]*'in_review'/);
  });
});

describe('AS2 — customer copy never exposes internal vocabulary', () => {
  it('gives every status a label and a detail', () => {
    for (const status of PARTNER_APPLICATION_STATUSES) {
      expect(partnerApplicationStatusLabel(status).length, status).toBeGreaterThan(0);
      expect(partnerApplicationStatusDetail(status).length, status).toBeGreaterThan(0);
    }
  });

  it('no customer string contains a raw status value', () => {
    for (const status of PARTNER_APPLICATION_STATUSES) {
      const copy = PARTNER_APPLICATION_STATUS_COPY[status];
      const text = `${copy.label} ${copy.detail}`.toLowerCase();
      for (const raw of PARTNER_APPLICATION_STATUSES) {
        expect(text, `${status} leaks ${raw}`).not.toContain(raw);
      }
    }
  });

  it('no customer string contains snake_case, SQL or engine vocabulary', () => {
    const forbidden = [
      '_',
      'status',
      'null',
      'partner_applications',
      'rpc',
      'uuid',
      'enum',
      'constraint',
    ];
    for (const status of PARTNER_APPLICATION_STATUSES) {
      const copy = PARTNER_APPLICATION_STATUS_COPY[status];
      const text = `${copy.label} ${copy.detail}`.toLowerCase();
      for (const token of forbidden) {
        expect(text, `${status} leaks '${token}'`).not.toContain(token);
      }
    }
  });

  it('every label is human-cased, not machine-cased', () => {
    for (const status of PARTNER_APPLICATION_STATUSES) {
      const label = partnerApplicationStatusLabel(status);
      expect(label, status).not.toMatch(/^[a-z]+(_[a-z]+)+$/);
      expect(label, status).not.toMatch(/^[A-Z_]+$/);
    }
  });
});

describe('AS4 — the map is exhaustive', () => {
  it('has copy for every declared status and no orphans', () => {
    expect(new Set(Object.keys(PARTNER_APPLICATION_STATUS_COPY))).toEqual(
      new Set(PARTNER_APPLICATION_STATUSES),
    );
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PARTNER_APPLICATION_STATUS_COPY)).toBe(true);
    for (const status of PARTNER_APPLICATION_STATUSES) {
      expect(Object.isFrozen(PARTNER_APPLICATION_STATUS_COPY[status]), status).toBe(true);
    }
  });
});

describe('in-flight states mirror the database index', () => {
  it('matches the partial unique index in the migration', () => {
    const index =
      /create unique index if not exists partner_applications_open_uniq[\s\S]*?;/.exec(SQL)?.[0] ??
      '';
    for (const status of IN_FLIGHT_APPLICATION_STATUSES) {
      expect(index, status).toContain(`'${status}'`);
    }
    const quoted = [...index.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(quoted)).toEqual(new Set(IN_FLIGHT_APPLICATION_STATUSES));
  });

  it('terminal states are not in flight', () => {
    for (const status of ['approved', 'rejected', 'suspended', 'terminated'] as const) {
      expect(isApplicationInFlight(status), status).toBe(false);
    }
  });

  it('an application awaiting information is still in flight, so no duplicate can be filed', () => {
    expect(isApplicationInFlight('more_information_needed')).toBe(true);
  });
});

describe('customer action prompts', () => {
  it('asks for action exactly where the customer must do something', () => {
    expect(applicationNeedsCustomerAction('more_information_needed')).toBe(true);
    expect(applicationNeedsCustomerAction('draft')).toBe(true);
    expect(applicationNeedsCustomerAction('submitted')).toBe(false);
    expect(applicationNeedsCustomerAction('under_review')).toBe(false);
    expect(applicationNeedsCustomerAction('approved')).toBe(false);
  });
});

describe('resubmission keeps one application thread', () => {
  it('the submit RPC updates the awaiting-information row instead of inserting a second', () => {
    const fn =
      /create or replace function public\.gellatti_submit_partner_application_v1[\s\S]*?\$\$;/.exec(
        SQL,
      )?.[0] ?? '';
    expect(fn).toContain("if v_status = 'more_information_needed' then");
    expect(fn).toContain('update public.partner_applications');
    expect(fn).toContain("status = 'submitted'");
    expect(fn).toContain('partner.application_resubmitted');
  });

  it('clears the previous decision reason on resubmit', () => {
    const fn =
      /create or replace function public\.gellatti_submit_partner_application_v1[\s\S]*?\$\$;/.exec(
        SQL,
      )?.[0] ?? '';
    expect(fn).toContain('decision_reason = null');
  });
});

describe('migration safety', () => {
  it('documents the data migration required before any rollback', () => {
    expect(MIGRATION).toContain('ROLLBACK');
    expect(MIGRATION).toContain("update public.partner_applications set status = 'under_review'");
  });

  it('does not touch partners, codes or the ledger', () => {
    for (const table of ['partners', 'partner_codes', 'commission_entries', 'partner_payouts']) {
      expect(new RegExp(`(drop|delete from)[^;]*\\b${table}\\b`, 'i').test(SQL), table).toBe(false);
    }
  });
});
