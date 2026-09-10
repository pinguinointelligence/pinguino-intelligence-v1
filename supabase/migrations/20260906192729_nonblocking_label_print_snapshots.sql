-- Owner correction GEL-P0-033: missing editable label content is disclosed at
-- print time and may be omitted. Snapshot authority still remains server-owned,
-- append-only and bound to the completed ACTUAL Production run.

create or replace function public.production_save_label_snapshot_v3(
  p_run_id uuid, p_master_label jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_profile public.account_label_profiles%rowtype;
  v_label_mass numeric;
  v_actual_mass numeric;
  v_market text;
  v_readiness text;
  v_hash text;
  v_existing uuid;
  v_snapshot_id uuid := gen_random_uuid();
  v_version integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));

  select frozen.actual_final_batch_g into v_actual_mass
  from public.production_completed_snapshots frozen
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
    raise exception 'Label snapshot does not match its run authority' using errcode = '23514';
  end if;

  v_market := p_master_label->>'market';
  if v_market not in ('EU','UK','US','CA','AU_NZ','WORLD') then
    raise exception 'Only the six established Label profiles are supported' using errcode = '23514';
  end if;
  v_readiness := p_master_label#>>'{snapshotEvidence,printReadiness}';
  if (v_market = 'WORLD' and v_readiness is distinct from 'PRINT_READY_UNIVERSAL')
    or (v_market <> 'WORLD' and v_readiness is distinct from 'PRINT_READY_REGULATORY') then
    raise exception 'Snapshot requires the correct print-ready evidence'
      using errcode = '23514';
  end if;
  if nullif(p_master_label->>'marketProfileVersion', '') is null
    or nullif(p_master_label#>>'{snapshotEvidence,rendererVersion}', '') is null then
    raise exception 'Versioned regulatory profile and renderer evidence required'
      using errcode = '23514';
  end if;

  select coalesce(sum((ingredient->>'actualGrams')::numeric), 0)
    into v_label_mass
  from jsonb_array_elements(coalesce(p_master_label->'ingredients', '[]'::jsonb)) ingredient;
  if abs(v_label_mass - v_actual_mass) > 0.000001 then
    raise exception 'Label ingredients must come from the completed ACTUAL batch'
      using errcode = '23514';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(p_master_label::text, 'UTF8'), 'sha256'),
    'hex'
  );
  select snapshot_id into v_existing
  from public.production_run_label_snapshots
  where run_id = p_run_id and owner_user_id = v_uid and content_hash = v_hash;
  if found then return v_existing; end if;

  select coalesce(max(snapshot_version), 0) + 1 into v_version
  from public.production_run_label_snapshots where run_id = p_run_id;

  insert into public.production_run_label_snapshots (
    snapshot_id, snapshot_version, content_hash, run_id, owner_user_id,
    master_label, account_profile_snapshot, logo_path,
    regulatory_profile_version, renderer_version, print_readiness,
    package_quantity, layout_snapshot, printer_snapshot, created_at
  ) values (
    v_snapshot_id, v_version, v_hash, p_run_id, v_uid,
    p_master_label,
    jsonb_build_object(
      'market', p_master_label->'market',
      'uiLanguage', p_master_label->'uiLanguage',
      'labelLanguages', p_master_label->'labelLanguages',
      'businessName', p_master_label->'businessName',
      'enabledOptionalFields', p_master_label->'enabledOptionalFields',
      'facilityDefaults', p_master_label->'operator',
      'shelfLifeAuthority', p_master_label->'shelfLifeAuthority',
      'presentation', jsonb_build_object(
        'format', p_master_label->'format',
        'size', p_master_label->'size',
        'layoutMode', p_master_label->'layoutMode',
        'printer', p_master_label->'printer'
      ),
      'updatedAt', v_profile.updated_at
    ),
    nullif(p_master_label->>'logoPath', ''),
    p_master_label->>'marketProfileVersion',
    p_master_label#>>'{snapshotEvidence,rendererVersion}',
    v_readiness,
    coalesce(p_master_label->'packageQuantity', 'null'::jsonb),
    jsonb_build_object(
      'format', p_master_label->'format',
      'size', p_master_label->'size',
      'layoutMode', p_master_label->'layoutMode',
      'geometry', p_master_label#>'{snapshotEvidence,geometry}'
    ),
    p_master_label->'printer',
    clock_timestamp()
  );
  return v_snapshot_id;
end;
$$;

revoke all on function public.production_save_label_snapshot_v3(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.production_save_label_snapshot_v3(uuid, jsonb)
  to authenticated;
revoke execute on function public.production_save_label_snapshot_v2(uuid, jsonb)
  from authenticated;
