/// <reference types="node" />
/**
 * ACCOUNT ACCESS migration guard (0025) — contract-lockstep + safety invariants, proven
 * statically against the SQL text (comment-stripped). No live DB. Drift between the TS
 * contracts and the SQL breaks this test.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCKING_ACCOUNT_STATES } from './contracts';
import type { AccountState, AuthProvider } from './contracts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(join(REPO, 'supabase', 'migrations', '0025_account_access.sql'), 'utf8');
const CODE = SQL.replace(/--.*$/gm, ''); // strip line comments

const TABLES = [
  'account_profiles',
  'account_states',
  'admin_users',
  'account_provider_links',
  'registered_devices',
  'app_sessions',
  'account_security_events',
] as const;

const ALL_ACCOUNT_STATES: AccountState[] = [
  'active',
  'pending_verification',
  'security_locked',
  'suspended',
  'deletion_requested',
  'disabled',
  'restored',
];
const ALL_PROVIDERS: AuthProvider[] = ['password', 'google', 'magic_link'];

describe('0025 account-access migration — shape & lockstep', () => {
  it('creates exactly the seven additive tables and no existing ones', () => {
    for (const t of TABLES) {
      expect(CODE.includes(`create table if not exists public.${t}`), t).toBe(true);
    }
    // never recreates the tables owned by earlier migrations
    for (const owned of ['public.profiles', 'public.entitlements', 'public.partners', 'public.subscriptions']) {
      expect(new RegExp(`create table[^;]*${owned}\\b`).test(CODE), owned).toBe(false);
    }
  });

  it('enables RLS on every table', () => {
    for (const t of TABLES) {
      expect(CODE.includes(`alter table public.${t} enable row level security`), t).toBe(true);
    }
  });

  it('AccountState SQL check is lockstep with the TS union', () => {
    const m = CODE.match(/state in \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const inSql = (m?.[1] ?? '').match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
    expect(new Set(inSql)).toEqual(new Set(ALL_ACCOUNT_STATES));
    // the blocking states really are a subset of the enum
    for (const s of BLOCKING_ACCOUNT_STATES) expect(inSql).toContain(s);
  });

  it('provider link check is lockstep with the TS AuthProvider union', () => {
    const m = CODE.match(/provider text not null check \(provider in \(([^)]*)\)\)/);
    const inSql = (m?.[1] ?? '').match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
    expect(new Set(inSql)).toEqual(new Set(ALL_PROVIDERS));
  });
});

describe('0025 — authorization safety invariants', () => {
  it('authorizes by auth.uid() and NEVER by email', () => {
    expect(CODE.includes('auth.uid()')).toBe(true);
    // no policy keys off an email column
    expect(/using \([^)]*email/i.test(CODE)).toBe(false);
    expect(/with check \([^)]*email/i.test(CODE)).toBe(false);
  });

  it('account_security_events is APPEND-ONLY (select + insert only)', () => {
    expect(CODE.includes('account_security_events_select_own')).toBe(true);
    expect(CODE.includes('account_security_events_insert_own')).toBe(true);
    expect(/on public\.account_security_events\s+for update/.test(CODE)).toBe(false);
    expect(/on public\.account_security_events\s+for delete/.test(CODE)).toBe(false);
    expect(/grant[^;]*update[^;]*account_security_events/.test(CODE)).toBe(false);
    expect(/grant[^;]*delete[^;]*account_security_events/.test(CODE)).toBe(false);
  });

  it('enforces ONE active session per user at the DB layer', () => {
    expect(
      /unique index[^;]*app_sessions[^;]*\(user_id\)\s*where\s*\(state = 'active'\)/s.test(CODE),
    ).toBe(true);
  });

  it('privileged tables are NOT client-writable (no self-promotion / self-restore)', () => {
    // admin_users, account_states, account_provider_links: SELECT grant only
    for (const t of ['admin_users', 'account_states', 'account_provider_links']) {
      expect(new RegExp(`grant select on public\\.${t} to authenticated`).test(CODE), t).toBe(true);
      expect(new RegExp(`grant[^;]*insert[^;]*on public\\.${t} to authenticated`).test(CODE), t).toBe(false);
      expect(new RegExp(`grant[^;]*update[^;]*on public\\.${t} to authenticated`).test(CODE), t).toBe(false);
    }
  });

  it('grants nothing to anon', () => {
    expect(/to anon\b/.test(CODE)).toBe(false);
  });

  it('every user-scoped FK cascades on user delete (no orphan identity rows)', () => {
    const cascades = CODE.match(/references auth\.users\(id\) on delete cascade/g) ?? [];
    // account_profiles, account_states, admin_users, account_provider_links,
    // registered_devices, app_sessions, account_security_events = 7
    expect(cascades.length).toBeGreaterThanOrEqual(7);
  });
});
