-- Gellatti final Label system: exact six profile catalogue and versioned,
-- immutable print-ready evidence. Additive to Production; no Mapper/Engine data.

begin;

-- ---------------------------------------------------------------------------
-- 1. Exact customer-facing market catalogue and reusable account authority.
-- ---------------------------------------------------------------------------
update public.account_label_profiles
set market = 'WORLD',
    label_languages = case
      when jsonb_array_length(label_languages) = 0 then '["en"]'::jsonb
      else label_languages
    end
where market = 'CUSTOM';

alter table public.account_label_profiles
  drop constraint if exists account_label_profiles_market_check;
alter table public.account_label_profiles
  add constraint account_label_profiles_market_check check (
    market in ('EU','UK','US','CA','AU_NZ','WORLD')
  );

alter table public.account_label_profiles
  add column if not exists shelf_life_authority jsonb not null default
    '{"policyId":null,"authority":"","method":"none","shelfLifeDays":null,"reviewedByUser":false}'::jsonb;
alter table public.account_label_profiles
  drop constraint if exists account_label_profiles_shelf_life_authority_check;
alter table public.account_label_profiles
  add constraint account_label_profiles_shelf_life_authority_check check (
    jsonb_typeof(shelf_life_authority) = 'object'
    and shelf_life_authority->>'method' in ('none','manual_date','validated_rule')
  );

alter table public.account_label_profiles
  drop constraint if exists account_label_profiles_enabled_optional_fields_check;
alter table public.account_label_profiles
  add constraint account_label_profiles_enabled_optional_fields_check check (
    jsonb_typeof(enabled_optional_fields) = 'array'
    and enabled_optional_fields <@ '["production_date","logo","origin","customer_note","short_description","qr_code","lot_barcode","gtin","website","internal_article_id","batch_id","legal_product_name","operator","date_mark"]'::jsonb
  );

-- ---------------------------------------------------------------------------
-- 2. Migrate one-row-per-run history into append-only versioned snapshots.
-- ---------------------------------------------------------------------------
alter table public.production_run_label_snapshots
  add column if not exists snapshot_id uuid default gen_random_uuid(),
  add column if not exists snapshot_version integer,
  add column if not exists content_hash text,
  add column if not exists regulatory_profile_version text,
  add column if not exists renderer_version text,
  add column if not exists print_readiness text,
  add column if not exists package_quantity jsonb,
  add column if not exists layout_snapshot jsonb,
  add column if not exists printer_snapshot jsonb;

update public.production_run_label_snapshots
set snapshot_id = coalesce(snapshot_id, gen_random_uuid()),
    snapshot_version = coalesce(snapshot_version, 1),
    content_hash = coalesce(
      content_hash,
      encode(extensions.digest(convert_to(master_label::text, 'UTF8'), 'sha256'), 'hex')
    ),
    regulatory_profile_version = coalesce(
      regulatory_profile_version,
      nullif(master_label->>'marketProfileVersion', ''),
      'legacy-unversioned'
    ),
    renderer_version = coalesce(
      renderer_version,
      nullif(master_label#>>'{snapshotEvidence,rendererVersion}', ''),
      'legacy-renderer'
    ),
    print_readiness = coalesce(
      print_readiness,
      nullif(master_label#>>'{snapshotEvidence,printReadiness}', ''),
      'LEGACY_SNAPSHOT'
    ),
    package_quantity = coalesce(
      package_quantity,
      master_label->'packageQuantity',
      jsonb_build_object(
        'value', master_label->'netQuantityG',
        'unit', 'g',
        'netWeightG', master_label->'netQuantityG',
        'netVolumeMl', null,
        'source', 'legacy_snapshot',
        'confirmedAt', null
      )
    ),
    layout_snapshot = coalesce(
      layout_snapshot,
      jsonb_build_object(
        'format', master_label->'format',
        'size', master_label->'size',
        'layoutMode', coalesce(master_label->'layoutMode', '"manual"'::jsonb)
      )
    ),
    printer_snapshot = coalesce(
      printer_snapshot,
      nullif(master_label->'printer', 'null'::jsonb),
      '{"profileId":null,"profileVersion":"legacy-unconfigured","verificationStatus":"UNVERIFIED"}'::jsonb
    );

alter table public.production_run_label_snapshots
  alter column snapshot_id set not null,
  alter column snapshot_version set not null,
  alter column content_hash set not null,
  alter column regulatory_profile_version set not null,
  alter column renderer_version set not null,
  alter column print_readiness set not null,
  alter column package_quantity set not null,
  alter column layout_snapshot set not null,
  alter column printer_snapshot set not null;

alter table public.production_run_label_snapshots
  drop constraint if exists production_run_label_snapshots_pkey;
alter table public.production_run_label_snapshots
  add constraint production_run_label_snapshots_pkey primary key (snapshot_id);
alter table public.production_run_label_snapshots
  drop constraint if exists production_run_label_snapshots_run_version_key;
alter table public.production_run_label_snapshots
  add constraint production_run_label_snapshots_run_version_key
    unique (run_id, snapshot_version);
alter table public.production_run_label_snapshots
  drop constraint if exists production_run_label_snapshots_run_hash_key;
alter table public.production_run_label_snapshots
  add constraint production_run_label_snapshots_run_hash_key
    unique (run_id, content_hash);
alter table public.production_run_label_snapshots
  drop constraint if exists production_run_label_snapshots_print_readiness_check;
alter table public.production_run_label_snapshots
  add constraint production_run_label_snapshots_print_readiness_check check (
    print_readiness in (
      'PRINT_READY_UNIVERSAL','PRINT_READY_REGULATORY','LEGACY_SNAPSHOT'
    )
  );

create index if not exists production_run_label_snapshots_owner_created_idx
  on public.production_run_label_snapshots (owner_user_id, created_at desc);
create index if not exists production_run_label_snapshots_run_version_idx
  on public.production_run_label_snapshots (run_id, snapshot_version desc);

-- ---------------------------------------------------------------------------
-- 3. Server-owned, fail-closed creation of a new immutable version.
-- ---------------------------------------------------------------------------
create or replace function public.production_save_label_snapshot_v2(
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
  v_fop_exemption text;
  v_fop_reference_ml numeric;
  v_fop_reference_g numeric;
  v_fop_serving_g numeric;
  v_fop_basis_g numeric;
  v_fop_threshold numeric;
  v_fop_saturated_g numeric;
  v_fop_sugars_g numeric;
  v_fop_sodium_mg numeric;
  v_fop_required boolean := false;
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
    raise exception 'Snapshot requires the correct print-ready preflight evidence'
      using errcode = '23514';
  end if;
  if nullif(p_master_label->>'marketProfileVersion', '') is null
    or nullif(p_master_label#>>'{snapshotEvidence,rendererVersion}', '') is null then
    raise exception 'Versioned regulatory profile and renderer evidence required'
      using errcode = '23514';
  end if;

  if coalesce(jsonb_typeof(p_master_label->'packageQuantity'), '') <> 'object'
    or coalesce(nullif(p_master_label#>>'{packageQuantity,value}', '')::numeric, 0) <= 0
    or coalesce(p_master_label#>>'{packageQuantity,source}', '') not in ('selected_fill','measured_fill') then
    raise exception 'Confirmed consumer package quantity required; batch mass is not package fill'
      using errcode = '23514';
  end if;
  if v_market = 'CA' and (
    coalesce(nullif(p_master_label#>>'{packageQuantity,netVolumeMl}', '')::numeric, 0) <= 0
    or coalesce(p_master_label#>>'{packageQuantity,unit}', '') not in ('mL','ml','L','l')
  ) then
    raise exception 'Canadian ice cream/frozen dessert package quantity must be confirmed by volume'
      using errcode = '23514';
  end if;

  -- Recompute the federal high-in decision from the frozen label evidence.
  -- A missing official symbol blocks only a product that actually requires
  -- FOP; non-FOP/exempt products remain valid Canadian snapshots.
  if v_market = 'CA' then
    v_fop_exemption := coalesce(
      p_master_label#>>'{regulatoryNutrition,canadaFopExemption}', 'unknown'
    );
    if v_fop_exemption not in ('exempt','prohibited') then
      v_fop_reference_ml := nullif(
        p_master_label#>>'{regulatoryNutrition,canadaReferenceAmountMl}', ''
      )::numeric;
      v_fop_reference_g := coalesce(
        nullif(p_master_label#>>'{regulatoryNutrition,canadaReferenceAmountG}', '')::numeric,
        v_fop_reference_ml * nullif(
          p_master_label#>>'{regulatoryNutrition,productDensityGPerMl}', ''
        )::numeric
      );
      v_fop_serving_g := nullif(
        p_master_label#>>'{regulatoryNutrition,servingQuantityG}', ''
      )::numeric;
      v_fop_saturated_g := nullif(
        p_master_label#>>'{nutritionSource,saturated_fat_g}', ''
      )::numeric;
      v_fop_sugars_g := nullif(
        p_master_label#>>'{nutritionSource,sugars_g}', ''
      )::numeric;
      v_fop_sodium_mg := nullif(
        p_master_label#>>'{regulatoryNutrition,sodiumMgPer100g}', ''
      )::numeric;
      if coalesce(v_fop_reference_ml, 0) <= 0
        or coalesce(v_fop_reference_g, 0) <= 0
        or coalesce(v_fop_serving_g, 0) <= 0
        or v_fop_saturated_g is null
        or v_fop_sugars_g is null
        or v_fop_sodium_mg is null then
        raise exception 'Complete Canadian FOP assessment data is required'
          using errcode = '23514';
      end if;
      v_fop_basis_g := greatest(v_fop_reference_g, v_fop_serving_g);
      v_fop_threshold := case
        when p_master_label#>>'{regulatoryNutrition,canadaFopProductClass}' = 'main_dish'
          then 30
        when v_fop_reference_ml <= 30 then 10
        else 15
      end;
      v_fop_required :=
        (v_fop_saturated_g * v_fop_basis_g / 20) >= v_fop_threshold
        or (v_fop_sugars_g * v_fop_basis_g / 100) >= v_fop_threshold
        or (v_fop_sodium_mg * v_fop_basis_g / 2300) >= v_fop_threshold;
    end if;
    if v_fop_required and (
      nullif(p_master_label#>>'{regulatoryNutrition,canadaFopAssetId}', '') is null
      or nullif(
        p_master_label#>>'{regulatoryNutrition,canadaFopAssetPackageVersion}', ''
      ) is null
    ) then
      raise exception 'Official Health Canada FOP asset package authority is required'
        using errcode = '23514';
    end if;
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
    p_master_label->'packageQuantity',
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

revoke all on function public.production_save_label_snapshot_v2(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.production_save_label_snapshot_v2(uuid, jsonb)
  to authenticated;
revoke execute on function public.production_save_label_snapshot_v1(uuid, jsonb)
  from authenticated;

create or replace function public.reject_label_snapshot_mutation_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  raise exception 'Run Label Snapshot history is immutable' using errcode = '23514';
end;
$$;

drop trigger if exists production_run_label_snapshots_immutable
  on public.production_run_label_snapshots;
create trigger production_run_label_snapshots_immutable
before update or delete on public.production_run_label_snapshots
for each row execute function public.reject_label_snapshot_mutation_v1();

revoke insert, update, delete on public.production_run_label_snapshots
  from public, anon, authenticated;
grant select on public.production_run_label_snapshots to authenticated;

comment on table public.production_run_label_snapshots is
  'Append-only exact print evidence. Regulatory updates create a new per-run version; old output is never rewritten.';
comment on column public.production_run_label_snapshots.content_hash is
  'SHA-256 over canonical jsonb text of the exact immutable Master Label payload.';
comment on column public.account_label_profiles.shelf_life_authority is
  'Reusable business shelf-life policy/authority. No expiry is invented by the application.';

commit;
