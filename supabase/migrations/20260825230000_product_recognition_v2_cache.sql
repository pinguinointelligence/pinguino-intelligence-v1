-- Product Recognition V2 semantic-call ledger and exact-evidence cache.
--
-- This table is independent from Mapper and imports. It records only bounded,
-- authenticated semantic calls made through the existing INTIMPORT server
-- backend. One unchanged evidence fingerprint is classified once per owner.

create table if not exists public.intimport_semantic_classification_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id text not null check (length(import_id) between 1 and 64),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{64}$'),
  classifier_version text not null,
  model text not null,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  evidence_fingerprint text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists intimport_semantic_usage_import_idx
  on public.intimport_semantic_classification_usage (user_id, import_id, created_at desc);

alter table public.intimport_semantic_classification_usage enable row level security;

create policy intimport_semantic_usage_select_own
  on public.intimport_semantic_classification_usage
  for select using (auth.uid() = user_id);

revoke insert, update, delete on public.intimport_semantic_classification_usage
  from anon, authenticated;

-- Serialize reservations per owner/import before the provider is called. A
-- client may send concurrent rows (or have two tabs open), so counting first
-- and inserting later would allow both requests through the same final slot.
create or replace function public.reserve_intimport_semantic_classification(
  p_user_id uuid,
  p_import_id text,
  p_idempotency_key text,
  p_classifier_version text,
  p_model text,
  p_evidence_fingerprint text,
  p_cap integer
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reserved_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_import_id, 0));

  if exists (
    select 1
    from public.intimport_semantic_classification_usage
    where user_id = p_user_id and idempotency_key = p_idempotency_key
  ) then
    return 'CACHE_EXISTS';
  end if;

  select count(*) into reserved_count
  from public.intimport_semantic_classification_usage
  where user_id = p_user_id and import_id = p_import_id;

  if reserved_count >= greatest(p_cap, 0) then
    return 'CAP_REACHED';
  end if;

  insert into public.intimport_semantic_classification_usage (
    user_id,
    import_id,
    idempotency_key,
    classifier_version,
    model,
    input_tokens,
    output_tokens,
    latency_ms,
    evidence_fingerprint,
    result_json
  ) values (
    p_user_id,
    p_import_id,
    p_idempotency_key,
    p_classifier_version,
    p_model,
    0,
    0,
    0,
    p_evidence_fingerprint,
    jsonb_build_object('status', 'RESERVED')
  );

  return 'RESERVED';
end;
$$;

revoke all on function public.reserve_intimport_semantic_classification(
  uuid, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.reserve_intimport_semantic_classification(
  uuid, text, text, text, text, text, integer
) to service_role;
