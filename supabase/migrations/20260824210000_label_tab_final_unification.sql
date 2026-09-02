-- Label tab final unification: persist the existing optional Master Label
-- fields in the account profile and freeze the selection with every run label.

alter table public.account_label_profiles
  add column if not exists enabled_optional_fields jsonb not null
  default '["logo","origin","customer_note"]'::jsonb;

alter table public.account_label_profiles
  drop constraint if exists account_label_profiles_enabled_optional_fields_check;
alter table public.account_label_profiles
  add constraint account_label_profiles_enabled_optional_fields_check check (
    jsonb_typeof(enabled_optional_fields) = 'array'
    and enabled_optional_fields <@ '["logo","origin","customer_note"]'::jsonb
  );

create or replace function public.production_save_label_snapshot_v1(
  p_run_id uuid, p_master_label jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_profile public.account_label_profiles%rowtype;
  v_label_mass numeric;
begin
  perform 1 from public.production_completed_snapshots frozen
  where frozen.run_id = p_run_id and frozen.owner_user_id = v_uid;
  if not found then
    raise exception 'owned completed Production snapshot required' using errcode = '42501';
  end if;
  select * into v_profile from public.account_label_profiles
  where owner_user_id = v_uid;
  if not found then
    raise exception 'Account Label Profile required' using errcode = '23514';
  end if;
  if coalesce(jsonb_typeof(p_master_label), '') <> 'object'
    or p_master_label->>'sourceCompletionSessionId' is distinct from p_run_id::text then
    raise exception 'Label snapshot does not match its run/profile authority' using errcode = '23514';
  end if;
  select coalesce(sum((ingredient->>'actualGrams')::numeric), 0)
    into v_label_mass
  from jsonb_array_elements(coalesce(p_master_label->'ingredients', '[]'::jsonb)) ingredient;
  if abs(v_label_mass - (
    select frozen.actual_final_batch_g from public.production_completed_snapshots frozen
    where frozen.run_id = p_run_id and frozen.owner_user_id = v_uid
  )) > 0.000001 then
    raise exception 'Label ingredients must come from the completed ACTUAL batch'
      using errcode = '23514';
  end if;
  insert into public.production_run_label_snapshots (
    run_id, owner_user_id, master_label, account_profile_snapshot, logo_path, created_at
  ) values (
    p_run_id, v_uid, p_master_label,
    jsonb_build_object(
      'market', p_master_label->'market',
      'uiLanguage', p_master_label->'uiLanguage',
      'labelLanguages', p_master_label->'labelLanguages',
      'businessName', p_master_label->'businessName',
      'enabledOptionalFields', p_master_label->'enabledOptionalFields',
      'facilityDefaults', p_master_label->'operator',
      'presentation', jsonb_build_object(
        'format', p_master_label->'format',
        'widthMm', p_master_label#>'{size,widthMm}',
        'heightMm', p_master_label#>'{size,heightMm}',
        'copies', p_master_label->'copies'
      ),
      'updatedAt', v_profile.updated_at
    ),
    nullif(p_master_label->>'logoPath', ''), clock_timestamp()
  ) on conflict (run_id) do nothing;
  if exists (
    select 1 from public.production_run_label_snapshots frozen
    where frozen.run_id = p_run_id and frozen.owner_user_id = v_uid
      and frozen.master_label = p_master_label
  ) then return p_run_id; end if;
  raise exception 'Run Label Snapshot is immutable' using errcode = '23505';
end;
$$;

revoke all on function public.production_save_label_snapshot_v1(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.production_save_label_snapshot_v1(uuid, jsonb)
  to authenticated;

comment on column public.account_label_profiles.enabled_optional_fields is
  'Existing optional Master Label fields enabled for future labels. Required market fields cannot be disabled.';
