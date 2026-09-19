-- SELF-HEALING RE-POINT, WITH THE BRAKES ON — owner contract 2026-09-08 §2.
--
-- 20260908010000 gave an EAN one canonical address and moved the one that was wrong. This makes
-- that operation safe to run from an ORDINARY LOOKUP, which is a different risk: a read path that
-- can write is a read path that can corrupt. Every condition below is a refusal, not a preference.
--
--   * the variant must currently address a PRIVATE customer row — the only state that is wrong;
--   * exactly ONE shared product may exist for the code;
--   * both rows must carry the SAME normalized EAN, compared here and not assumed;
--   * the move is MONOTONIC: private -> shared, never shared -> private, never shared -> shared;
--   * more than one candidate changes nothing at all;
--   * it is serialised on the EAN, so concurrent scans cannot both move it;
--   * a failure is swallowed by the caller: a read must never break because a repair could not run.
--
-- Every decision is written to `canonical_ean_repoint_audit` — including the refusals, because a
-- repair that declines is exactly the event someone will later need to explain.

create table if not exists public.canonical_ean_repoint_audit (
  id uuid primary key default gen_random_uuid(),
  ean text not null,
  from_product_id uuid,
  to_product_id uuid,
  outcome text not null,
  reason text not null,
  code_version text not null,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
comment on table public.canonical_ean_repoint_audit is
  'Every canonical EAN re-point decision, taken or refused. Append-only history; never read by the runtime.';

create index if not exists canonical_ean_repoint_audit_ean_idx
  on public.canonical_ean_repoint_audit (ean, created_at desc);

alter table public.canonical_ean_repoint_audit enable row level security;
-- Service role only: this is an operational record, not customer-facing, and it names product ids
-- across accounts. No anon or authenticated policy is defined, so neither can read or write it.
revoke all on table public.canonical_ean_repoint_audit from public, anon, authenticated;

create or replace function public.canonicalize_ean_identity_v1(
  p_ean text,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  c_version constant text := 'canonical-ean-identity/2026-09-08';
  v_ean text := regexp_replace(coalesce(p_ean,''), '\D', '', 'g');
  v_canonical uuid;
  v_canonical_ean text;
  v_shared_count int;
  v_variant public.product_variants%rowtype;
  v_current_kind text;
  v_moved boolean := false;
  v_reason text;
begin
  if length(v_ean) < 8 or length(v_ean) > 14 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_ean', 'moved', false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('canonical-ean:'||v_ean, 0));

  select count(*) into v_shared_count
  from public.products p
  where p.is_active and p.merged_into_product_id is null
    and p.product_kind = 'commercial_product' and p.visibility = 'shared'
    and coalesce(nullif(p.barcode_normalized,''), nullif(p.ean_code_normalized,'')) = v_ean;

  -- More than one candidate: change nothing. Picking would be exactly the ordering-luck failure
  -- this whole change exists to remove.
  if v_shared_count > 1 then
    insert into public.canonical_ean_repoint_audit(ean, outcome, reason, code_version, actor_user_id)
      values (v_ean, 'refused', 'ambiguous_shared_products', c_version, p_actor_user_id);
    return jsonb_build_object('ok', false, 'reason', 'ambiguous_shared_products',
                              'shared_products', v_shared_count, 'moved', false);
  end if;
  if v_shared_count = 0 then
    -- No shared product yet: a private row may legitimately hold the code.
    return jsonb_build_object('ok', true, 'reason', 'no_shared_product_yet', 'moved', false);
  end if;

  select p.id, coalesce(nullif(p.barcode_normalized,''), nullif(p.ean_code_normalized,''))
    into v_canonical, v_canonical_ean
  from public.products p
  where p.is_active and p.merged_into_product_id is null
    and p.product_kind = 'commercial_product' and p.visibility = 'shared'
    and coalesce(nullif(p.barcode_normalized,''), nullif(p.ean_code_normalized,'')) = v_ean;

  -- Compared, not assumed: the address and the identity must be about the same article.
  if v_canonical_ean is distinct from v_ean then
    insert into public.canonical_ean_repoint_audit(ean, to_product_id, outcome, reason, code_version, actor_user_id)
      values (v_ean, v_canonical, 'refused', 'ean_mismatch', c_version, p_actor_user_id);
    return jsonb_build_object('ok', false, 'reason', 'ean_mismatch', 'moved', false);
  end if;

  select * into v_variant from public.product_variants where ean = v_ean for update;

  if not found then
    perform set_config('app.canonical_product_ingest', 'v1', true);
    insert into public.product_variants (product_id, ean, is_current)
      values (v_canonical, v_ean, true);
    perform set_config('app.canonical_product_ingest', '', true);
    insert into public.canonical_ean_repoint_audit(ean, to_product_id, outcome, reason, code_version, actor_user_id)
      values (v_ean, v_canonical, 'created', 'canonical_had_no_address', c_version, p_actor_user_id);
    return jsonb_build_object('ok', true, 'reason', 'address_created', 'moved', true,
                              'canonical_product_id', v_canonical);
  end if;

  if v_variant.product_id = v_canonical then
    if not v_variant.is_current then
      perform set_config('app.canonical_product_ingest', 'v1', true);
      update public.product_variants set is_current = true where id = v_variant.id;
      perform set_config('app.canonical_product_ingest', '', true);
      v_moved := true;
    end if;
    return jsonb_build_object('ok', true, 'reason', 'already_canonical', 'moved', v_moved,
                              'canonical_product_id', v_canonical);
  end if;

  select p.product_kind into v_current_kind from public.products p where p.id = v_variant.product_id;

  -- THE MONOTONIC GATE. Only a private customer row may be moved off the address. A shared row is
  -- never demoted, and one shared row is never swapped for another.
  if v_current_kind is distinct from 'customer_provisional' then
    v_reason := case when v_current_kind = 'commercial_product'
                     then 'refuses_shared_to_shared' else 'refuses_non_private_source' end;
    insert into public.canonical_ean_repoint_audit(ean, from_product_id, to_product_id, outcome, reason, code_version, actor_user_id)
      values (v_ean, v_variant.product_id, v_canonical, 'refused', v_reason, c_version, p_actor_user_id);
    return jsonb_build_object('ok', false, 'reason', v_reason, 'moved', false);
  end if;

  perform set_config('app.canonical_product_ingest', 'v1', true);
  update public.product_variants
    set product_id = v_canonical, is_current = true
    where id = v_variant.id;
  -- Closed immediately: the flag is transaction-scoped, and the rest of the caller's transaction
  -- must not inherit an open door.
  perform set_config('app.canonical_product_ingest', '', true);

  insert into public.canonical_ean_repoint_audit(ean, from_product_id, to_product_id, outcome, reason, code_version, actor_user_id)
    values (v_ean, v_variant.product_id, v_canonical, 'moved', 'private_to_shared_canonical', c_version, p_actor_user_id);

  return jsonb_build_object('ok', true, 'reason', 'canonicalized', 'moved', true,
                            'canonical_product_id', v_canonical,
                            'previous_product_id', v_variant.product_id);
end;
$$;

revoke all on function public.canonicalize_ean_identity_v1(text, uuid) from public, anon, authenticated;
grant execute on function public.canonicalize_ean_identity_v1(text, uuid) to service_role;
-- The one-argument form from 20260908010000 is superseded; drop it so no caller can reach the
-- version without the monotonic gate.
drop function if exists public.canonicalize_ean_identity_v1(text);
