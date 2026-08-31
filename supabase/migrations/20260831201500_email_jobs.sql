-- ============================================================================
-- GELLATTI — WORK WITH US §1-§3: persisted email jobs
-- ============================================================================
-- Owner authority, 2026-08-31:
--   business event → persisted job → idempotent claim → provider
--   → provider message id → sent/failed state → retry → Admin visibility
--
-- The TS authority is src/notifications/domain/emailJob.ts (EJ1..EJ8) and
-- emailSubject.ts (ES1..ES7); this migration is the DB enforcement of the same
-- rules, and emailJob.migration.test.ts asserts the two stay in lockstep.
--
-- THE RULE THAT SHAPES EVERYTHING HERE:
--   "Never silently mark unsent mail as sent."
-- So `sent` is reachable only from `sending`, and only WITH a provider message
-- id. A missing provider credential is allowed to block delivery; it must never
-- produce a false `sent`. Both are enforced by CHECK constraints below, not by
-- application convention.
--
-- Writes: service-role only. Nobody reads anyone else's mail.

-- ── email_jobs ───────────────────────────────────────────────────────────────
create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),

  -- EJ2: deterministic key. One business event produces at most one email; a
  -- replayed event collides here instead of sending twice.
  idempotency_key text not null unique,

  -- ES1/ES6: the closed taxonomy key, and the rendered subject that carries it
  subject_key text not null,
  subject text not null check (btrim(subject) <> ''),

  recipient text not null check (btrim(recipient) <> '' and position('@' in recipient) > 1),
  -- Rendered at enqueue time so a later copy change never rewrites mail that is
  -- already queued, and so a retry re-sends exactly what was intended.
  body_html text not null,
  body_text text not null,

  environment text not null check (environment in ('production', 'staging', 'development')),
  -- ES3: additional routing metadata. Never the only way to route a message —
  -- the subject alone must be sufficient.
  metadata jsonb not null default '{}'::jsonb,

  -- EJ4: the lifecycle
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'abandoned', 'cancelled')),

  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1),
  next_attempt_at timestamptz,

  -- EJ3: the evidence. Present if and only if the job is sent.
  provider_message_id text,
  provider_name text,
  sent_at timestamptz,

  -- EJ7: the last failure stays visible for Admin
  last_failure_kind text check (last_failure_kind in ('retryable', 'permanent')),
  last_failure_message text,
  last_failure_code text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- EJ3 AS A DATABASE CONSTRAINT, not a convention:
  -- a row may call itself 'sent' only if it actually carries the provider's
  -- message id and a sent_at. No code path can write a false success.
  constraint email_jobs_sent_requires_evidence check (
    (status = 'sent') = (provider_message_id is not null and btrim(provider_message_id) <> ''
                         and sent_at is not null)
  ),
  -- A terminal-but-unsuccessful job must never carry success evidence.
  constraint email_jobs_unsent_has_no_evidence check (
    status = 'sent' or (provider_message_id is null and sent_at is null)
  ),
  -- EJ6: only a retryable, non-terminal job may be scheduled for another go.
  constraint email_jobs_retry_only_when_failed check (
    next_attempt_at is null or status in ('queued', 'failed')
  )
);

create index if not exists email_jobs_due_idx
  on public.email_jobs (next_attempt_at)
  where status in ('queued', 'failed');

create index if not exists email_jobs_attention_idx
  on public.email_jobs (created_at desc)
  where status in ('failed', 'abandoned');

create index if not exists email_jobs_recipient_idx on public.email_jobs (recipient, created_at desc);

drop trigger if exists email_jobs_touch on public.email_jobs;
create trigger email_jobs_touch
  before update on public.email_jobs
  for each row execute function public.touch_updated_at();

-- ── EJ2: enqueue, idempotently ───────────────────────────────────────────────
-- Returns the existing job on a replay rather than raising, so a webhook retry
-- is harmless. `deduplicated` tells the caller which happened.
create or replace function public.gellatti_enqueue_email_v1(
  p_idempotency_key text,
  p_subject_key text,
  p_subject text,
  p_recipient text,
  p_body_html text,
  p_body_text text,
  p_environment text,
  p_metadata jsonb default '{}'::jsonb,
  p_max_attempts integer default 5
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
  v_new boolean := false;
begin
  insert into public.email_jobs(
    idempotency_key, subject_key, subject, recipient,
    body_html, body_text, environment, metadata, max_attempts, next_attempt_at
  ) values (
    p_idempotency_key, p_subject_key, p_subject, lower(btrim(p_recipient)),
    p_body_html, p_body_text, p_environment, coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_max_attempts, 5), now()
  )
  on conflict (idempotency_key) do nothing
  returning id, status into v_id, v_status;

  if v_id is not null then
    v_new := true;
  else
    select id, status into v_id, v_status
    from public.email_jobs where idempotency_key = p_idempotency_key;
  end if;

  return jsonb_build_object('id', v_id, 'status', v_status, 'deduplicated', not v_new);
end $$;

revoke all on function public.gellatti_enqueue_email_v1(text, text, text, text, text, text, text, jsonb, integer)
  from public, anon, authenticated;

-- ── The IDEMPOTENT CLAIM ─────────────────────────────────────────────────────
-- The heart of duplicate-safety. `for update skip locked` means two schedulers
-- running at the same instant claim DISJOINT sets: the second skips rows the
-- first has locked rather than waiting for them and then sending again.
-- Claiming moves the row to 'sending' and increments attempts in the SAME
-- statement, so a crash after the claim leaves an in-flight row that is visible
-- and countable, never an invisible re-send.
create or replace function public.gellatti_claim_email_jobs_v1(
  p_limit integer default 10,
  p_now timestamptz default now()
) returns setof public.email_jobs
language sql
volatile
security definer
set search_path = public
as $$
  with due as (
    select id
    from public.email_jobs
    where status in ('queued', 'failed')
      and attempts < max_attempts
      and (next_attempt_at is null or next_attempt_at <= p_now)
    order by next_attempt_at nulls first, created_at
    limit greatest(coalesce(p_limit, 10), 0)
    for update skip locked
  )
  update public.email_jobs j
    set status = 'sending',
        attempts = j.attempts + 1,
        next_attempt_at = null,
        updated_at = p_now
  from due
  where j.id = due.id
  returning j.*;
$$;

revoke all on function public.gellatti_claim_email_jobs_v1(integer, timestamptz)
  from public, anon, authenticated;

-- ── EJ3: settle a claimed job ────────────────────────────────────────────────
-- Success REQUIRES a provider message id. A blank one is refused here as well
-- as by the CHECK constraint, so the failure is a clear error rather than a
-- constraint violation the caller might misread.
create or replace function public.gellatti_mark_email_sent_v1(
  p_id uuid,
  p_provider_message_id text,
  p_provider_name text,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_provider_message_id is null or btrim(p_provider_message_id) = '' then
    raise exception 'email_sent_requires_provider_message_id';
  end if;

  update public.email_jobs
    set status = 'sent',
        provider_message_id = p_provider_message_id,
        provider_name = p_provider_name,
        sent_at = p_now,
        next_attempt_at = null,
        last_failure_kind = null,
        last_failure_message = null,
        last_failure_code = null,
        updated_at = p_now
    where id = p_id and status = 'sending'
    returning status into v_status;

  if v_status is null then
    raise exception 'email_job_not_claimed_or_already_settled';
  end if;
  return jsonb_build_object('id', p_id, 'status', v_status);
end $$;

revoke all on function public.gellatti_mark_email_sent_v1(uuid, text, text, timestamptz)
  from public, anon, authenticated;

-- EJ5/EJ6/EJ7: a permanent failure abandons immediately; a retryable one backs
-- off exponentially unless the attempt budget is spent.
create or replace function public.gellatti_mark_email_failed_v1(
  p_id uuid,
  p_failure_kind text,
  p_failure_message text,
  p_failure_code text default null,
  p_now timestamptz default now(),
  p_base_backoff_seconds integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.email_jobs%rowtype;
  v_terminal boolean;
  v_next timestamptz;
  v_status text;
begin
  if p_failure_kind not in ('retryable', 'permanent') then
    raise exception 'unsupported_email_failure_kind';
  end if;

  select * into v_job from public.email_jobs where id = p_id and status = 'sending';
  if v_job.id is null then
    raise exception 'email_job_not_claimed_or_already_settled';
  end if;

  v_terminal := (p_failure_kind = 'permanent') or (v_job.attempts >= v_job.max_attempts);
  v_status := case when v_terminal then 'abandoned' else 'failed' end;
  v_next := case
    when v_terminal then null
    -- mirrors backoffDelayMs(): base * 2^(attempts-1)
    else p_now + make_interval(secs => p_base_backoff_seconds * power(2, greatest(v_job.attempts - 1, 0)))
  end;

  update public.email_jobs
    set status = v_status,
        next_attempt_at = v_next,
        last_failure_kind = p_failure_kind,
        last_failure_message = p_failure_message,
        last_failure_code = p_failure_code,
        provider_message_id = null,
        sent_at = null,
        updated_at = p_now
    where id = p_id;

  return jsonb_build_object('id', p_id, 'status', v_status, 'nextAttemptAt', v_next);
end $$;

revoke all on function public.gellatti_mark_email_failed_v1(uuid, text, text, text, timestamptz, integer)
  from public, anon, authenticated;

-- ── EJ7: Admin visibility ────────────────────────────────────────────────────
-- Failed and pending jobs, newest first. Recipients are shown because an
-- operator needs to know which message did not arrive; no body is returned.
create or replace function public.gellatti_admin_email_jobs_v1(
  p_status text default null,
  p_limit integer default 100
) returns table (
  id uuid,
  subject_key text,
  subject text,
  recipient text,
  environment text,
  status text,
  attempts integer,
  max_attempts integer,
  next_attempt_at timestamptz,
  provider_name text,
  provider_message_id text,
  last_failure_kind text,
  last_failure_message text,
  last_failure_code text,
  sent_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER', auth.uid()) then
    raise exception 'administrator_required';
  end if;
  return query
    select j.id, j.subject_key, j.subject, j.recipient, j.environment, j.status,
           j.attempts, j.max_attempts, j.next_attempt_at, j.provider_name,
           j.provider_message_id, j.last_failure_kind, j.last_failure_message,
           j.last_failure_code, j.sent_at, j.created_at
    from public.email_jobs j
    where (p_status is null and j.status in ('queued', 'sending', 'failed', 'abandoned'))
       or (p_status is not null and j.status = p_status)
    order by j.created_at desc
    limit greatest(coalesce(p_limit, 100), 1);
end $$;

revoke all on function public.gellatti_admin_email_jobs_v1(text, integer) from public, anon;
grant execute on function public.gellatti_admin_email_jobs_v1(text, integer) to authenticated;

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.email_jobs enable row level security;
-- No select policy: email bodies and the operational stream are not customer
-- data. Admin reads go through the SECURITY DEFINER function above, which
-- checks the permission explicitly.
-- Intentionally NO grants of any kind to anon or authenticated.

-- ── GRANT SURFACE ───────────────────────────────────────────────────────────
-- The project carries ALTER DEFAULT PRIVILEGES on schema public granting ALL
-- (`arwdDxtm`) on every NEW table to anon and authenticated. A new table is
-- therefore fully writable by any signed-in user the moment it is created, and
-- omitting a grant achieves nothing. RLS contains it, but a table that decides
-- money or holds personal data should not have RLS as its ONLY barrier.
-- Found live after 20260831200500; see
-- 20260831200600_partner_rate_profiles_grant_surface.sql for the full evidence.
revoke all on public.email_jobs from anon, authenticated;
-- ============================================================================
-- ROLLBACK (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
--   drop function if exists public.gellatti_admin_email_jobs_v1(text, integer);
--   drop function if exists public.gellatti_mark_email_failed_v1(uuid, text, text, text, timestamptz, integer);
--   drop function if exists public.gellatti_mark_email_sent_v1(uuid, text, text, timestamptz);
--   drop function if exists public.gellatti_claim_email_jobs_v1(integer, timestamptz);
--   drop function if exists public.gellatti_enqueue_email_v1(text, text, text, text, text, text, text, jsonb, integer);
--   drop table if exists public.email_jobs;
-- Dropping the table discards the record of what was and was not delivered.
-- ============================================================================
