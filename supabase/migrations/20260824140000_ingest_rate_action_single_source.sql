-- One place decides the rate class.
--
-- preflight_product_ingest_v1 and ingest_product_v1 each carried their OWN copy
-- of the source→action mapping. 20260824100000 taught the preflight about
-- `catalog_import` and left the ingest saying `manual_candidate`, so the
-- preflight reserved a slot under one action and the ingest looked that
-- reservation up under another, found nothing, and raised
--
--   valid preprocessing rate reservation required
--
-- which catalog-submit reports as 400 `product_ingest_failed`. Every row of the
-- owner's import failed on it, and only for accounts that EARN the new class —
-- everyone else still resolves to manual_candidate on both sides and agreed by
-- accident.
--
-- The duplication was the defect, so the mapping now lives in one function that
-- both call. They cannot drift again.
create or replace function public.gellatti_ingest_rate_action_v1(p_actor_user_id uuid, p_source text)
returns text language sql stable security definer
set search_path = public, extensions as $fn$
  select case
    when p_source = 'ocr' then 'ocr_scan'
    when p_source = 'catalog_import' and (
      exists (select 1 from public.admin_users a
              where a.user_id = p_actor_user_id and a.revoked_at is null)
      or public.gellatti_has_paid_access_v1(p_actor_user_id)
    ) then 'catalog_import'
    else 'manual_candidate'
  end;
$fn$;

revoke all on function public.gellatti_ingest_rate_action_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.gellatti_ingest_rate_action_v1(uuid, text) to service_role;

-- Both functions are re-pointed at the shared decision in place, preserving
-- every other line of their bodies.
do $do$
declare src text; patched text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='ingest_product_v1';
  if position('gellatti_ingest_rate_action_v1' in src) = 0 then
    patched := replace(src,
      'v_action:=case when p_source=''ocr'' then ''ocr_scan'' else ''manual_candidate'' end;',
      'v_action:=public.gellatti_ingest_rate_action_v1(p_actor_user_id,p_source);');
    execute patched;
  end if;

  select pg_get_functiondef(p.oid) into src from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='preflight_product_ingest_v1';
  if position('gellatti_ingest_rate_action_v1' in src) = 0 then
    patched := regexp_replace(src, 'v_action:=case.*?end;',
      'v_action:=public.gellatti_ingest_rate_action_v1(p_actor_user_id,p_source);', 'ns');
    execute patched;
  end if;
end
$do$;
