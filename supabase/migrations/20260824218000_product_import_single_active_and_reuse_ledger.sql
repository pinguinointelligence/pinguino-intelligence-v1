-- Exactly one clean owner reimport may be active, and an idempotent replay is
-- represented honestly as REUSED without pretending that it mutated a product.
create unique index if not exists product_import_one_active_clean_idx
  on public.product_import_runs(mode)
  where mode='CLEAN_OWNER_REIMPORT' and status in ('IMPORTING','CANCELLING','ROLLING_BACK');

create or replace function public.record_product_import_row_outcome_v1(
  p_actor_user_id uuid,p_import_run_id uuid,p_row_index integer,p_source_row_id text,
  p_display_name text,p_outcome text,p_error text default null,p_result jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_actions text[]:='{}';
begin
  if not exists(select 1 from public.product_import_runs
    where id=p_import_run_id and actor_user_id=p_actor_user_id) then
    raise exception 'import run not found';
  end if;
  if p_outcome='SKIPPED' then v_actions:=array['SKIPPED']; end if;
  if p_outcome='REVIEW' then v_actions:=array['REVIEW']; end if;
  if p_outcome='REUSED' then v_actions:=array['REUSED']; end if;
  insert into public.product_import_run_rows(
    import_run_id,row_index,source_row_id,display_name,outcome,actions,error,result_snapshot
  ) values(
    p_import_run_id,p_row_index,nullif(p_source_row_id,''),nullif(p_display_name,''),
    p_outcome,v_actions,nullif(p_error,''),coalesce(p_result,'{}'::jsonb)
  ) on conflict(import_run_id,row_index) do nothing;
  return public.product_import_run_state_v1(p_actor_user_id,p_import_run_id);
end;
$$;

revoke all on function public.record_product_import_row_outcome_v1(
  uuid,uuid,integer,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.record_product_import_row_outcome_v1(
  uuid,uuid,integer,text,text,text,text,jsonb
) to service_role;

notify pgrst,'reload schema';
