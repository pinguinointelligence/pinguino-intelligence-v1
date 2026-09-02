-- INTIMPORT targeted web enrichment — server-side usage ledger.
--
-- Two jobs, both of which must be server-side to mean anything:
--   1. the import-wide external-call cap (a client-supplied counter is not a
--      spend control);
--   2. the research cache — one canonical product is researched once, however
--      many rows or countries map to it.
--
-- Structured evidence and provenance are retained; raw page bodies are not.

create table if not exists public.intimport_enrichment_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  /** One owner import run. Scopes the call cap. */
  import_id text not null check (length(import_id) between 1 and 64),
  /** sha256 over (import, identity, requested fields) — the cache key. */
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{64}$'),
  model text not null,
  web_calls smallint not null default 0 check (web_calls >= 0 and web_calls <= 4),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  fields_requested text[] not null default '{}',
  /** Structured field-level evidence with provenance. Never raw page HTML. */
  result_json jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists intimport_enrichment_import_idx
  on public.intimport_enrichment_usage (user_id, import_id, created_at desc);

alter table public.intimport_enrichment_usage enable row level security;

-- Read-your-own only. All writes go through the service role in the Edge
-- Function, so a client can never fabricate usage rows to raise its own cap.
create policy intimport_enrichment_select_own on public.intimport_enrichment_usage
  for select using (auth.uid() = user_id);
