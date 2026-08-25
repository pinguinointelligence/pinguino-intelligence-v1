-- The scanner privacy repair applies to future ingests. A historic scanner PM
-- that was already saved as `shared` must still be removable by its creator
-- through the ordinary retire operation; direct table cleanup remains forbidden.
--
-- Keep the exception deliberately narrow: PM article, same creator, immutable
-- scanner ingest evidence, and the creator-owned private overlay must all agree.
do $do$
declare
  src text;
  patched text;
  old_guard constant text :=
    'and ((p.visibility=''account_private'' and p.owning_account_id=p_actor_user_id) or v_is_admin)';
  new_guard constant text :=
    'and (
        (p.visibility=''account_private'' and p.owning_account_id=p_actor_user_id)
        or (
          p.visibility=''shared''
          and p.product_code like ''PM-ING-%''
          and p.created_by=p_actor_user_id
          and exists (
            select 1 from public.product_evidence scanner_evidence
            where scanner_evidence.product_id=p.id
              and scanner_evidence.owner_user_id=p_actor_user_id
              and scanner_evidence.evidence->>''scannerSchema''=''gellatti_product_scan_v1''
          )
          and exists (
            select 1 from public.product_scan_overlay_states scanner_overlay
            where scanner_overlay.product_id=p.id
              and scanner_overlay.creator_user_id=p_actor_user_id
          )
        )
        or v_is_admin
      )';
begin
  select pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into src;

  if position(new_guard in src) > 0 then
    return;
  end if;
  if position(old_guard in src) = 0 then
    raise exception 'ingest_product_v1 retire authority drifted; refusing unsafe legacy scanner patch';
  end if;

  patched := replace(src, old_guard, new_guard);
  if patched = src or position(new_guard in patched) = 0 then
    raise exception 'ingest_product_v1 legacy scanner retire patch did not apply exactly once';
  end if;
  execute patched;

  select pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into src;
  if position(new_guard in src) = 0 then
    raise exception 'ingest_product_v1 legacy scanner retire postcondition failed';
  end if;
end
$do$;
