-- ============================================================================
-- QA ONLY — harness tables for the Growth QA branch (qa-growth-e2e).
-- ============================================================================
-- Refuses to run anywhere except project ncmsonfwbgsqedgnzofg / branch
-- 14d26da6-6ce1-404d-87b7-449f1cbd700b: qa_bootstrap.environment exists only
-- there. Re-runnable. Client roles get nothing; RLS is on with no policies.
do $guard$
begin
  if not exists (
    select 1 from qa_bootstrap.environment
    where project_ref = 'ncmsonfwbgsqedgnzofg'
      and branch_id = '14d26da6-6ce1-404d-87b7-449f1cbd700b'
  ) then
    raise exception 'isolation guard: not the QA branch';
  end if;
end $guard$;

create schema if not exists qa_harness;
revoke all on schema qa_harness from public;
revoke all on schema qa_harness from anon, authenticated;

-- One row per harness run (concurrency proof, campaign, soak).
create table if not exists qa_harness.runs (
  run_id uuid primary key,
  kind text not null,
  label text not null,
  status text not null check (status in ('NOT_STARTED', 'RUNNING', 'PASSED', 'FAILED', 'INCONCLUSIVE', 'ABORTED')),
  params jsonb not null default '{}'::jsonb,
  result jsonb,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz
);

-- Every synthetic object a run created, so later runs can exclude it.
create table if not exists qa_harness.fixtures (
  run_id uuid not null references qa_harness.runs (run_id),
  kind text not null,
  object_id text not null,
  label text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (run_id, kind, object_id)
);

-- What each worker saw, written inside the worker's own transaction.
create table if not exists qa_harness.observations (
  id bigint generated always as identity primary key,
  run_id uuid not null references qa_harness.runs (run_id),
  worker text not null,
  backend_pid integer not null default pg_backend_pid(),
  observed_at timestamptz not null default clock_timestamp(),
  payload jsonb not null
);

-- Executor liveness for long runs (campaign / soak).
create table if not exists qa_harness.heartbeats (
  id bigint generated always as identity primary key,
  run_id uuid not null references qa_harness.runs (run_id),
  beat_at timestamptz not null default clock_timestamp(),
  step text not null,
  outcome text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists observations_run_idx on qa_harness.observations (run_id, worker);
create index if not exists heartbeats_run_idx on qa_harness.heartbeats (run_id, beat_at desc);

alter table qa_harness.runs enable row level security;
alter table qa_harness.fixtures enable row level security;
alter table qa_harness.observations enable row level security;
alter table qa_harness.heartbeats enable row level security;
revoke all on all tables in schema qa_harness from public, anon, authenticated;
revoke all on all sequences in schema qa_harness from public, anon, authenticated;

insert into qa_bootstrap.environment_changes (change, reason)
select 'create schema qa_harness (runs, fixtures, observations, heartbeats); RLS on, no client grants',
       'QA harness for REAL_DB_CONCURRENCY proofs and the campaign/soak executor (owner directive 2026-09-17, QA branch only)'
where not exists (
  select 1 from qa_bootstrap.environment_changes where change like 'create schema qa_harness%'
);

select jsonb_build_object(
  'tables', (select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'qa_harness' and c.relkind = 'r'),
  'rls', (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'qa_harness' and c.relkind = 'r'),
  'client_table_grants', (select count(*) from information_schema.role_table_grants where table_schema = 'qa_harness' and grantee in ('anon', 'authenticated', 'PUBLIC')),
  'client_schema_usage', has_schema_privilege('anon', 'qa_harness', 'USAGE') or has_schema_privilege('authenticated', 'qa_harness', 'USAGE'),
  'recorded_change', (select jsonb_agg(jsonb_build_object('id', id, 'change', change)) from qa_bootstrap.environment_changes where change like 'create schema qa_harness%')
) as readback;
