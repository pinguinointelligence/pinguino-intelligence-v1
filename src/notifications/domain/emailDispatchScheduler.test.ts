/// <reference types="node" />
/**
 * The scheduled caller for `email-dispatch` — source invariants.
 *
 * Context for anyone reading this later: for its whole life the email lane had
 * a queue, a claim, a backoff ladder and a deployed worker, and NOTHING that
 * ever called the worker. The two `cron.job` rows were both plain SQL and
 * `pg_net` was not installed, so no scheduled job in the project could make an
 * HTTP call at all. These assertions exist so that gap cannot silently return.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8');

const SCHEDULER = read('supabase', 'migrations', '20260903120000_email_dispatch_scheduler.sql');
const EMAIL_JOBS = read('supabase', 'migrations', '20260831201500_email_jobs.sql');
const WORKER = read('supabase', 'functions', 'email-dispatch', 'index.ts');

/** Collapse whitespace so formatting differences never fail a predicate match. */
const flatten = (value: string) => value.replace(/\s+/g, ' ').trim();

describe('a scheduled caller actually exists', () => {
  it('installs pg_net — without it a cron job cannot reach an Edge Function', () => {
    expect(SCHEDULER).toContain('create extension if not exists pg_net');
  });

  it('registers the schedule against the tick', () => {
    expect(SCHEDULER).toContain("cron.schedule(\n  'gellatti-email-dispatch'");
    expect(SCHEDULER).toContain('gellatti_dispatch_email_queue_tick_v1()');
  });

  it('unschedules first, so the migration is re-runnable', () => {
    const unschedule = SCHEDULER.indexOf("cron.unschedule('gellatti-email-dispatch')");
    const schedule = SCHEDULER.indexOf("cron.schedule(\n  'gellatti-email-dispatch'");
    expect(unschedule).toBeGreaterThan(-1);
    expect(unschedule).toBeLessThan(schedule);
  });
});

describe('the tick is inert until it is deliberately configured', () => {
  it('reads its endpoint and credential from Vault BY NAME, never pinned here', () => {
    expect(SCHEDULER).toContain('gellatti_edge_functions_base_url');
    expect(SCHEDULER).toContain('gellatti_edge_dispatch_key');
    expect(SCHEDULER).toContain('vault.decrypted_secrets');
  });

  it('no-ops when either secret is absent, so applying it changes nothing anywhere', () => {
    expect(SCHEDULER).toContain("jsonb_build_object('skipped', 'not_configured')");
    const guard = SCHEDULER.indexOf("'not_configured'");
    const post = SCHEDULER.indexOf('net.http_post');
    expect(guard).toBeLessThan(post);
  });

  it('is operator-only — a client session cannot reach it', () => {
    expect(flatten(SCHEDULER)).toContain(
      'revoke all on function public.gellatti_dispatch_email_queue_tick_v1() from public, anon, authenticated',
    );
  });
});

describe('the tick does not wake the worker for an empty queue', () => {
  it('skips the HTTP call when nothing is due', () => {
    expect(SCHEDULER).toContain("jsonb_build_object('skipped', 'nothing_due')");
    expect(SCHEDULER.indexOf("'nothing_due'")).toBeLessThan(SCHEDULER.indexOf('net.http_post'));
  });

  it("uses the CLAIM's own definition of due — the two must not drift apart", () => {
    /* `gellatti_claim_email_jobs_v1` stays the authority on what "due" means.
       The tick only counts, so it cannot share the `for update skip locked`
       query; this pins the predicate text instead. If the claim's rule ever
       changes, this fails and the tick must be updated with it. */
    const predicate = flatten(`
      status in ('queued', 'failed')
        and attempts < max_attempts
        and (next_attempt_at is null or next_attempt_at <= `);
    expect(flatten(EMAIL_JOBS)).toContain(predicate);
    expect(flatten(SCHEDULER)).toContain(predicate);
  });
});

describe('the worker authorises its caller itself', () => {
  it('does not treat verify_jwt as access control', () => {
    /* The anon key is a valid project JWT and is published in the frontend
       bundle, so `verify_jwt` alone left this endpoint reachable by any
       visitor (measured: HTTP 200 with only the anon key). The worker compares
       the presented bearer against the service role key it already holds. */
    expect(WORKER).toContain('secretEquals(presented, serviceRoleKey)');
    expect(WORKER).toContain("json(403, { error: 'forbidden' })");
  });

  it('authorises BEFORE it reads provider config, claims, or touches the queue', () => {
    const auth = WORKER.indexOf('secretEquals(presented, serviceRoleKey)');
    const credential = WORKER.indexOf("if (apiKey.trim() === '')");
    const claim = WORKER.indexOf('gellatti_claim_email_jobs_v1');
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(credential);
    expect(auth).toBeLessThan(claim);
  });

  it('compares in constant time over a fixed length', () => {
    expect(WORKER).toContain('diff |= a.charCodeAt(index) ^ b.charCodeAt(index)');
  });
});
