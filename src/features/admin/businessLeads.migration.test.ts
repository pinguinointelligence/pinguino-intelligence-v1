/// <reference types="node" />
/**
 * Business leads migration guard (20260831203500) — §32 lead operations.
 *
 * Proven statically against the SQL text. The TS presentation layer and the
 * database must agree on the status vocabulary and the four lead types.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BUSINESS_LEAD_STATUSES, LEAD_TYPES } from './businessLeadPresentation';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const RAW = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260831203500_business_leads.sql'),
  'utf8',
);
const SQL = RAW.replace(/--.*$/gm, '');

const fn = (name: string) =>
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`).exec(SQL)?.[0] ?? '';

const LEADS_TABLE =
  /create table if not exists public\.business_leads[\s\S]*?\n\);/.exec(SQL)?.[0] ?? '';
const EVENTS_TABLE =
  /create table if not exists public\.business_lead_events[\s\S]*?\n\);/.exec(SQL)?.[0] ?? '';

describe('§32 — the contract matches the TS presentation layer', () => {
  it('the status CHECK lists exactly the six operational statuses', () => {
    const check = /status text not null default 'new'\s*\n?\s*check \(status in \(([^)]*)\)\)/.exec(
      LEADS_TABLE,
    );
    expect(check).not.toBeNull();
    const quoted = [...(check?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(new Set(quoted)).toEqual(new Set(BUSINESS_LEAD_STATUSES));
  });

  it('the lead_type CHECK lists exactly the four gateway paths', () => {
    const check = /lead_type text not null check \(lead_type in \(([^)]*)\)\)/.exec(LEADS_TABLE);
    expect(check).not.toBeNull();
    const quoted = [...(check?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(new Set(quoted)).toEqual(new Set(LEAD_TYPES));
  });

  it('the update function refuses a status outside the contract', () => {
    const update = fn('gellatti_admin_update_business_lead_v1');
    expect(update).toContain('unsupported_lead_status');
    for (const status of BUSINESS_LEAD_STATUSES) expect(update, status).toContain(`'${status}'`);
  });
});

describe('§32 — every field the owner listed is stored', () => {
  it('carries id, source, route, type, model/format, configuration, contact and timestamps', () => {
    for (const column of [
      'reference',
      'lead_type',
      'source_route',
      'model_or_format',
      'configuration jsonb',
      'full_name',
      'email',
      'phone',
      'country',
      'city',
      'message',
      'status',
      'assigned_to_user_id',
      'created_at',
      'updated_at',
    ]) {
      expect(LEADS_TABLE, column).toContain(column);
    }
  });

  it('gives every lead a unique human-quotable reference', () => {
    expect(LEADS_TABLE).toContain('reference text not null unique');
    const ref = fn('gellatti_next_lead_reference_v1');
    for (const prefix of ['MCH', 'MOB', 'TRL', 'FRN']) expect(ref, prefix).toContain(`'${prefix}'`);
    // sequence-backed, so two simultaneous submissions cannot collide
    expect(ref).toContain("nextval('public.business_lead_reference_seq')");
  });

  it('keeps configurator answers verbatim, so a new step needs no migration', () => {
    expect(LEADS_TABLE).toContain("configuration jsonb not null default '{}'::jsonb");
  });
});

describe('history is append-only', () => {
  it('records the four event kinds', () => {
    expect(EVENTS_TABLE).toContain(
      "kind text not null check (kind in ('created', 'status_changed', 'note', 'assigned'))",
    );
  });

  it('keeps both sides of a status change', () => {
    expect(EVENTS_TABLE).toContain('from_status text');
    expect(EVENTS_TABLE).toContain('to_status text');
  });

  it('is never updated or deleted by any function in this migration', () => {
    expect(/update public\.business_lead_events/i.test(SQL)).toBe(false);
    expect(/delete from public\.business_lead_events/i.test(SQL)).toBe(false);
  });

  it('a submitted lead immediately gets its first history row', () => {
    const submit = fn('gellatti_submit_business_lead_v1');
    expect(submit).toContain('insert into public.business_lead_events');
    expect(submit).toContain("'created'");
  });

  it('a status change writes history and an audit entry', () => {
    const update = fn('gellatti_admin_update_business_lead_v1');
    expect(update).toContain("'status_changed'");
    expect(update).toContain('gellatti_write_audit_v1');
  });

  it('a note alone is recorded without inventing a status change', () => {
    const update = fn('gellatti_admin_update_business_lead_v1');
    expect(update).toContain("values (p_lead_id, 'note'");
    expect(update).toContain('lead_update_requires_status_or_note');
  });
});

describe('the franchise import brings the old rows into one place', () => {
  it('copies from franchise_inquiries', () => {
    expect(SQL).toContain('from public.franchise_inquiries f');
  });

  it('is idempotent — a deterministic reference plus on-conflict-do-nothing', () => {
    expect(SQL).toContain("'FRN-LEGACY-' || left(replace(f.id::text, '-', ''), 10)");
    expect(SQL).toContain('on conflict (reference) do nothing');
  });

  it('never asserts an outcome nobody recorded', () => {
    // 'closed' has no counterpart in the richer vocabulary; mapping it to
    // 'lost' would invent a result, so it lands on 'qualified' with the truth
    // preserved in the imported note.
    expect(SQL).toContain("case f.status when 'closed' then 'qualified' else f.status end");
    expect(SQL).toContain('Status źródłowy: zamknięte.');
  });

  it('leaves the source table completely untouched', () => {
    expect(
      /(?:drop|alter|delete from|update)\s+(?:table\s+)?(?:if exists\s+)?public\.franchise_inquiries/i.test(
        SQL,
      ),
    ).toBe(false);
  });

  it('says so in the rollback, so the import is never the only copy', () => {
    expect(RAW).toContain('franchise_inquiries is NOT touched');
  });
});

describe('security posture', () => {
  it('submitting does not require an account — a machine enquiry never should', () => {
    expect(SQL).toContain(
      'grant execute on function public.gellatti_submit_business_lead_v1(jsonb) to anon, authenticated',
    );
  });

  it('every admin function checks a permission', () => {
    for (const name of [
      'gellatti_admin_business_leads_v1',
      'gellatti_admin_business_lead_events_v1',
      'gellatti_admin_update_business_lead_v1',
    ]) {
      expect(fn(name), name).toContain('gellatti_admin_has_permission_v1');
      expect(fn(name), name).toContain('administrator_required');
    }
  });

  it('the reference minter is not client-callable', () => {
    expect(SQL).toContain(
      'revoke all on function public.gellatti_next_lead_reference_v1(text) from public, anon, authenticated',
    );
  });

  it('a customer sees only their own leads, and cannot write any', () => {
    expect(SQL).toContain('create policy business_leads_select_own');
    expect(SQL).toContain('user_id = auth.uid()');
    expect(SQL).toContain('grant select on public.business_leads to authenticated');
    expect(/grant\s+(insert|update|delete|all)[^;]*?\bon\b[^;]*?business_leads\b/i.test(SQL)).toBe(
      false,
    );
  });

  it('the event log is operator-facing only — no policy, no grant', () => {
    expect(SQL).toContain('alter table public.business_lead_events enable row level security');
    expect(/create policy[^;]*business_lead_events/i.test(SQL)).toBe(false);
    expect(/grant[^;]*?\bon\b[^;]*?business_lead_events\b/i.test(SQL)).toBe(false);
  });

  it('every function pins an explicit search_path', () => {
    const headers = [...SQL.matchAll(/create or replace function public\.(\w+)[\s\S]*?as \$\$/g)];
    expect(headers.length).toBeGreaterThan(0);
    for (const [body, name] of headers) {
      if (!/security definer/.test(body)) continue;
      expect(/set search_path = public/.test(body), `${name} has no search_path`).toBe(true);
    }
  });
});
