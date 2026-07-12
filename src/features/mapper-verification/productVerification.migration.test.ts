/// <reference types="node" />
/**
 * 0026 product-verification migration guard — contract-lockstep + safety invariants, proven
 * statically against the SQL text (comment-stripped). No live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaseSource, QueueState, ReviewRole } from './contracts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(join(REPO, 'supabase', 'migrations', '0026_product_verification.sql'), 'utf8');
const CODE = SQL.replace(/--.*$/gm, '');

const TABLES = [
  'review_roles',
  'verification_policy_versions',
  'verification_cases',
  'verification_field_candidates',
  'verification_field_decisions',
  'warning_waivers',
  'review_notes',
  'verification_case_events',
  'verification_signoffs',
] as const;

const QUEUE_STATES: QueueState[] = ['draft', 'pending_review', 'assigned', 'in_review', 'needs_more_evidence', 'blocked', 'ready_for_signoff', 'verified', 'rejected', 'reopened'];
const REVIEW_ROLES: Exclude<ReviewRole, 'none'>[] = ['reviewer', 'senior_reviewer', 'review_admin'];
const CASE_SOURCES: CaseSource[] = ['ocr', 'csv_import', 'manual_entry', 'supplier_doc', 'existing_product', 'mapper_match', 'pi_calculated', 'pi_generated'];

describe('0026 verification migration — shape & lockstep', () => {
  it('creates the nine additive tables and no existing ones', () => {
    for (const t of TABLES) expect(CODE.includes(`create table if not exists public.${t}`), t).toBe(true);
    for (const owned of ['public.products', 'public.product_snapshots', 'public.entitlements', 'public.partners']) {
      expect(new RegExp(`create table[^;]*${owned}\\b`).test(CODE), owned).toBe(false);
    }
    expect(/mapper_basement/.test(CODE)).toBe(false);
  });
  it('enables RLS on every table', () => {
    for (const t of TABLES) expect(CODE.includes(`alter table public.${t} enable row level security`), t).toBe(true);
  });
  it('queue-state / role / source checks are lockstep with the TS unions', () => {
    const states = CODE.match(/state in\s*\(([^)]*)\)/)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
    expect(new Set(states)).toEqual(new Set(QUEUE_STATES));
    const roles = CODE.match(/role text not null check \(role in \(([^)]*)\)/)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
    expect(new Set(roles)).toEqual(new Set(REVIEW_ROLES));
    const sources = CODE.match(/source in\s*\(([^)]*)\)/)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
    expect(new Set(sources)).toEqual(new Set(CASE_SOURCES));
  });
});

describe('0026 — verification safety invariants', () => {
  it('authorizes by auth.uid(), never email', () => {
    expect(CODE.includes('auth.uid()')).toBe(true);
    expect(/using \([^)]*email|with check \([^)]*email/i.test(CODE)).toBe(false);
  });

  it('PI Verified is NOT client-writable: verification_signoffs has no insert/update/delete grant', () => {
    expect(/grant select on public\.verification_signoffs to authenticated/.test(CODE)).toBe(true);
    expect(/grant[^;]*insert[^;]*verification_signoffs to authenticated/.test(CODE)).toBe(false);
    expect(/on public\.verification_signoffs\s+for (update|delete)/.test(CODE)).toBe(false);
  });

  it('sign-offs are immutable + require the four attestations', () => {
    expect(/unique \(case_id, revision\)/.test(CODE)).toBe(true);
    expect(/independent_provenance = true and red_flags_clear = true/.test(CODE)).toBe(true);
    expect(/status = 'pi_verified'/.test(CODE)).toBe(true);
  });

  it('append-only history: candidates/decisions/events/waivers/notes have no update/delete', () => {
    for (const t of ['verification_field_candidates', 'verification_field_decisions', 'verification_case_events', 'warning_waivers', 'review_notes']) {
      expect(new RegExp(`on public\\.${t}\\s+for update`).test(CODE), `${t} update`).toBe(false);
      expect(new RegExp(`on public\\.${t}\\s+for delete`).test(CODE), `${t} delete`).toBe(false);
      expect(new RegExp(`grant[^;]*delete[^;]*${t} to authenticated`).test(CODE), `${t} delete grant`).toBe(false);
    }
  });

  it('reviewer roles + waivers + policy activation are NOT client-writable (no self-promotion)', () => {
    for (const t of ['review_roles', 'verification_policy_versions', 'warning_waivers']) {
      expect(new RegExp(`grant[^;]*insert[^;]*on public\\.${t} to authenticated`).test(CODE), t).toBe(false);
    }
  });

  it('absent candidates carry no fabricated value; grants nothing to anon', () => {
    expect(/provenance <> 'absent' or \(raw_value is null and normalized_value is null\)/.test(CODE)).toBe(true);
    expect(/to anon\b/.test(CODE)).toBe(false);
  });
});
