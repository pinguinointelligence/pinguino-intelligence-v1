-- Trusted Production Rescue authorization boundary.
--
-- Forward-only. The browser can no longer persist a Rescue candidate merely because it
-- presents a structurally valid recipe vector. A trusted service must first authorize the
-- exact Engine candidate against the exact owner/run/source revisions. The owner then consumes
-- that short-lived proof atomically. This migration does not execute the Engine in PostgreSQL;
-- it creates the durable hand-off boundary for the trusted Engine runtime.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.production_rescue_authorizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- Production currently has a personal-account authority model. Keep an explicit account
  -- binding so a later Workspace model cannot accidentally reuse a personal proof.
  account_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.production_runs(id) on delete cascade,
  recipe_version_id uuid not null references public.recipe_versions(id) on delete restrict,
  source_actual_revision integer not null check (source_actual_revision >= 0),
  source_rescue_revision integer not null check (source_rescue_revision >= 0),
  -- Exact canonical raw-context hash issued by the trusted Edge runtime.
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  -- Independent PostgreSQL closure over the durable source rows.
  database_source_fingerprint text not null
    check (database_source_fingerprint ~ '^[0-9a-f]{64}$'),
  recipe_input jsonb not null check (
    (jsonb_typeof(recipe_input) = 'object'
      and jsonb_typeof(recipe_input->'items') = 'array') is true
  ),
  product_composition jsonb not null check (
    (jsonb_typeof(product_composition) = 'object') is true
  ),
  -- Exact PB/candidate hashes issued by the trusted Edge runtime.
  product_behavior_fingerprint text not null
    check (product_behavior_fingerprint ~ '^[0-9a-f]{64}$'),
  database_product_behavior_fingerprint text not null
    check (database_product_behavior_fingerprint ~ '^[0-9a-f]{64}$'),
  engine_version text not null check (length(engine_version) > 0),
  config_version text not null check (length(config_version) > 0),
  practical_recipe_version text not null check (length(practical_recipe_version) > 0),
  rescue_model_version text not null check (length(rescue_model_version) > 0),
  engine_bundle_sha256 text not null check (engine_bundle_sha256 ~ '^[0-9a-f]{64}$'),
  source_closure_sha256 text not null check (source_closure_sha256 ~ '^[0-9a-f]{64}$'),
  bundler_version text not null check (length(bundler_version) > 0),
  stable_option_id text not null check (
    stable_option_id in ('keep_original_batch', 'enlarge_batch', 'leave_as_is')
  ),
  safe_metadata jsonb not null check ((jsonb_typeof(safe_metadata) = 'object') is true),
  candidate_fingerprint text not null check (candidate_fingerprint ~ '^[0-9a-f]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  database_proof_fingerprint text not null
    check (database_proof_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (
    length(idempotency_key) between 1 and 200
  ),
  authorized_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > authorized_at),
  consumed_at timestamptz,
  consumed_by uuid,
  consumed_event_id uuid unique,
  consumed_idempotency_key text,
  constraint production_rescue_authorization_personal_account check (
    account_id = owner_user_id
  ),
  constraint production_rescue_authorization_consumption_complete check (
    (consumed_at is null and consumed_by is null and consumed_event_id is null
      and consumed_idempotency_key is null)
    or
    (consumed_at is not null and consumed_by = owner_user_id and consumed_event_id is not null
      and length(consumed_idempotency_key) between 1 and 200)
  ),
  unique (account_id, idempotency_key)
);

alter table private.production_rescue_authorizations enable row level security;
revoke all on private.production_rescue_authorizations
  from public, anon, authenticated, service_role;

-- The source proof includes every mutable Production input used by Rescue plus the immutable
-- frozen plan. Revisions remain the compare-and-swap boundary; this fingerprint also fails
-- closed if a future migration changes data without advancing its revision.
create or replace function private.production_rescue_source_fingerprint_v1(p_run_id uuid)
returns text
language plpgsql stable security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'runId', run.id,
    'ownerUserId', run.owner_user_id,
    'recipeVersionId', run.recipe_version_id,
    'status', run.status,
    'plannedBatchG', run.planned_batch_g,
    'productProfile', run.product_profile,
    'temperatureC', run.temperature_c,
    'actualRevision', run.actual_revision,
    'rescueRevision', run.rescue_revision,
    'engineVersion', run.engine_version,
    'configVersion', run.config_version,
    'rescueRecipeInput', run.rescue_recipe_input,
    'rescueProductComposition', run.rescue_product_composition,
    'recipeVersion', (
      select jsonb_build_object(
        'recipeInput', version.recipe_input,
        'productComposition', version.product_composition,
        'engineVersion', version.engine_version,
        'configVersion', version.config_version,
        'mapperDatasetVersion', version.mapper_dataset_version
      )
      from public.recipe_versions version
      where version.id = run.recipe_version_id
    ),
    'plannedItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lineId', planned.line_id,
        'name', planned.name,
        'plannedGrams', planned.planned_grams,
        'displayGrams', planned.display_grams,
        'position', planned.position,
        'processScope', planned.process_scope,
        'canonicalIngredientId', planned.canonical_ingredient_id,
        'scopePosition', planned.scope_position
      ) order by planned.position, planned.line_id)
      from public.production_run_planned_items planned
      where planned.run_id = run.id
    ), '[]'::jsonb),
    'actual', coalesce((
      select jsonb_build_object(
        'items', actual.actual_items,
        'substitutions', actual.substitutions,
        'actualTotalMixG', actual.actual_total_mix_g,
        'actualYieldG', actual.actual_yield_g,
        'wasteG', actual.waste_g,
        'operatorNotes', actual.operator_notes,
        'deviationReason', actual.deviation_reason,
        'recordedAt', actual.recorded_at
      )
      from public.production_run_actuals actual
      where actual.run_id = run.id
    ), 'null'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventId', event.id,
        'eventType', event.event_type,
        'detail', event.detail,
        'amendment', event.amendment,
        'createdBy', event.created_by,
        'createdAt', event.created_at
      ) order by event.created_at, event.id)
      from public.production_run_events event
      where event.run_id = run.id
    ), '[]'::jsonb)
  ) into v_payload
  from public.production_runs run
  where run.id = p_run_id;

  if v_payload is null then
    raise exception 'production Rescue source is unavailable' using errcode = '22023';
  end if;

  return encode(
    extensions.digest(convert_to(v_payload::text, 'utf8'), 'sha256'),
    'hex'
  );
end;
$$;

-- ProductBehavior proof binds both the global published authority and the exact behavior
-- snapshots carried by this candidate. The normal recipe authority guard is run again by the
-- authenticated consume path and catches entity-specific fact/binding changes.
create or replace function private.production_rescue_product_behavior_fingerprint_v1(
  p_product_composition jsonb
) returns text
language sql stable security definer
set search_path = pg_catalog, private, public, extensions
as $$
  select encode(extensions.digest(convert_to(
    public.product_behavior_authority_fingerprint_v1() || '|' ||
    coalesce(p_product_composition->'behaviorSnapshots', '{}'::jsonb)::text,
    'utf8'
  ), 'sha256'), 'hex')
$$;

-- The Edge candidate fingerprint is preserved byte-for-byte for Preview binding. This separate
-- database proof covers every stored authority field so a private-row mutation fails closed.
create or replace function private.production_rescue_database_proof_fingerprint_v1(
  p_owner_user_id uuid,
  p_account_id uuid,
  p_run_id uuid,
  p_recipe_version_id uuid,
  p_source_actual_revision integer,
  p_source_rescue_revision integer,
  p_source_fingerprint text,
  p_database_source_fingerprint text,
  p_recipe_input jsonb,
  p_product_composition jsonb,
  p_product_behavior_fingerprint text,
  p_database_product_behavior_fingerprint text,
  p_engine_version text,
  p_config_version text,
  p_practical_recipe_version text,
  p_rescue_model_version text,
  p_engine_bundle_sha256 text,
  p_source_closure_sha256 text,
  p_bundler_version text,
  p_stable_option_id text,
  p_safe_metadata jsonb,
  p_candidate_fingerprint text,
  p_request_fingerprint text,
  p_idempotency_key text,
  p_authorized_at timestamptz,
  p_expires_at timestamptz
) returns text
language sql immutable security definer
set search_path = pg_catalog, private, public, extensions
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'ownerUserId', p_owner_user_id,
    'accountId', p_account_id,
    'runId', p_run_id,
    'recipeVersionId', p_recipe_version_id,
    'sourceActualRevision', p_source_actual_revision,
    'sourceRescueRevision', p_source_rescue_revision,
    'sourceFingerprint', p_source_fingerprint,
    'databaseSourceFingerprint', p_database_source_fingerprint,
    'recipeInput', p_recipe_input,
    'productComposition', p_product_composition,
    'productBehaviorFingerprint', p_product_behavior_fingerprint,
    'databaseProductBehaviorFingerprint', p_database_product_behavior_fingerprint,
    'engineVersion', p_engine_version,
    'configVersion', p_config_version,
    'practicalRecipeVersion', p_practical_recipe_version,
    'rescueModelVersion', p_rescue_model_version,
    'engineBundleSha256', p_engine_bundle_sha256,
    'sourceClosureSha256', p_source_closure_sha256,
    'bundlerVersion', p_bundler_version,
    'stableOptionId', p_stable_option_id,
    'safeMetadata', p_safe_metadata,
    'candidateFingerprint', p_candidate_fingerprint,
    'requestFingerprint', p_request_fingerprint,
    'idempotencyKey', p_idempotency_key,
    'authorizedAt', p_authorized_at,
    'expiresAt', p_expires_at
  )::text, 'utf8'), 'sha256'), 'hex')
$$;

create or replace function private.production_rescue_authorization_response_v1(
  p_authorization_id uuid
) returns jsonb
language sql stable security definer
set search_path = pg_catalog, private, public
as $$
  select jsonb_build_object(
    'authorizationId', authz.id,
    'runId', authz.run_id,
    'candidateFingerprint', authz.candidate_fingerprint,
    'authorizedAt', authz.authorized_at,
    'expiresAt', authz.expires_at,
    'stableOptionId', authz.stable_option_id,
    'expectedActualRevision', authz.source_actual_revision,
    'expectedRescueRevision', authz.source_rescue_revision,
    'recipeInput', authz.recipe_input,
    'productComposition', authz.product_composition,
    'safeMetadata', authz.safe_metadata,
    'engineVersion', authz.engine_version,
    'configVersion', authz.config_version,
    'practicalRecipeVersion', authz.practical_recipe_version,
    'rescueModelVersion', authz.rescue_model_version,
    'engineBundleSha256', authz.engine_bundle_sha256,
    'sourceClosureSha256', authz.source_closure_sha256,
    'bundlerVersion', authz.bundler_version,
    'requestFingerprint', authz.request_fingerprint
  )
  from private.production_rescue_authorizations authz
  where authz.id = p_authorization_id
$$;

revoke all on function private.production_rescue_source_fingerprint_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.production_rescue_product_behavior_fingerprint_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.production_rescue_database_proof_fingerprint_v1(
  uuid, uuid, uuid, uuid, integer, integer, text, text, jsonb, jsonb, text, text,
  text, text, text, text, text, text, text, text, jsonb, text, text, text,
  timestamptz, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function private.production_rescue_authorization_response_v1(uuid)
  from public, anon, authenticated, service_role;

-- Called only after the trusted runtime has run the exact shared Engine/correction solver and
-- accepted this candidate as native-safe. The database binds that attestation to server-owned
-- source/PB fingerprints, frozen Engine/config versions, a short expiry, and one request key.
create or replace function public.production_create_rescue_authorization_v1(
  p_owner_user_id uuid,
  p_account_id uuid,
  p_run_id uuid,
  p_recipe_version_id uuid,
  p_source_fingerprint text,
  p_expected_actual_revision integer,
  p_expected_rescue_revision integer,
  p_recipe_input jsonb,
  p_product_composition jsonb,
  p_candidate_fingerprint text,
  p_product_behavior_fingerprint text,
  p_engine_version text,
  p_config_version text,
  p_practical_recipe_version text,
  p_rescue_model_version text,
  p_engine_bundle_sha256 text,
  p_source_closure_sha256 text,
  p_bundler_version text,
  p_request_fingerprint text,
  p_stable_option_id text,
  p_safe_metadata jsonb,
  p_deadline_at timestamptz,
  p_expires_at timestamptz,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, private, public, extensions
set statement_timeout = '15s'
as $$
declare
  v_at timestamptz := clock_timestamp();
  v_run public.production_runs%rowtype;
  v_version public.recipe_versions%rowtype;
  v_database_source_fingerprint text;
  v_database_product_behavior_fingerprint text;
  v_database_proof_fingerprint text;
  v_authorization private.production_rescue_authorizations%rowtype;
  v_id uuid;
  v_previous_claims text;
  v_previous_sub text;
  v_owner_claims jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'trusted Production Rescue service required' using errcode = '42501';
  end if;
  if p_owner_user_id is null or p_account_id is null or p_owner_user_id <> p_account_id then
    raise exception 'exact personal Production account required' using errcode = '22023';
  end if;
  if p_expected_actual_revision is null or p_expected_actual_revision < 0
    or p_expected_rescue_revision is null or p_expected_rescue_revision < 0 then
    raise exception 'non-negative Production source revisions required' using errcode = '22023';
  end if;
  if coalesce(length(p_engine_version), 0) = 0
    or coalesce(length(p_config_version), 0) = 0
    or coalesce(length(p_practical_recipe_version), 0) = 0
    or coalesce(length(p_rescue_model_version), 0) = 0
    or coalesce(length(p_bundler_version), 0) = 0 then
    raise exception 'exact Engine, config and Rescue model versions required'
      using errcode = '22023';
  end if;
  if coalesce(p_source_fingerprint ~ '^[0-9a-f]{64}$', false) is not true
    or coalesce(p_candidate_fingerprint ~ '^[0-9a-f]{64}$', false) is not true
    or coalesce(p_product_behavior_fingerprint ~ '^[0-9a-f]{64}$', false) is not true
    or coalesce(p_engine_bundle_sha256 ~ '^[0-9a-f]{64}$', false) is not true
    or coalesce(p_source_closure_sha256 ~ '^[0-9a-f]{64}$', false) is not true
    or coalesce(p_request_fingerprint ~ '^[0-9a-f]{64}$', false) is not true then
    raise exception 'trusted Rescue cryptographic fingerprints required'
      using errcode = '22023';
  end if;
  if p_stable_option_id is null or p_stable_option_id not in (
    'keep_original_batch', 'enlarge_batch', 'leave_as_is'
  ) or coalesce(jsonb_typeof(p_safe_metadata), '') <> 'object' then
    raise exception 'trusted Rescue option metadata required' using errcode = '22023';
  end if;
  if coalesce(length(p_idempotency_key), 0) not between 1 and 200 then
    raise exception 'bounded idempotency key required' using errcode = '22023';
  end if;

  -- Return the exact stored proof before re-reading mutable source state. This makes a lost
  -- service response safely retryable even if the owner consumed the proof in the meantime.
  select * into v_authorization
  from private.production_rescue_authorizations authz
  where authz.account_id = p_account_id
    and authz.idempotency_key = p_idempotency_key
  for share;
  if found then
    if v_authorization.owner_user_id is distinct from p_owner_user_id
      or v_authorization.run_id is distinct from p_run_id
      or v_authorization.recipe_version_id is distinct from p_recipe_version_id
      or v_authorization.source_actual_revision is distinct from p_expected_actual_revision
      or v_authorization.source_rescue_revision is distinct from p_expected_rescue_revision
      or v_authorization.source_fingerprint is distinct from p_source_fingerprint
      or v_authorization.recipe_input is distinct from p_recipe_input
      or v_authorization.product_composition is distinct from p_product_composition
      or v_authorization.candidate_fingerprint is distinct from p_candidate_fingerprint
      or v_authorization.product_behavior_fingerprint
        is distinct from p_product_behavior_fingerprint
      or v_authorization.engine_version is distinct from p_engine_version
      or v_authorization.config_version is distinct from p_config_version
      or v_authorization.practical_recipe_version
        is distinct from p_practical_recipe_version
      or v_authorization.rescue_model_version is distinct from p_rescue_model_version
      or v_authorization.engine_bundle_sha256 is distinct from p_engine_bundle_sha256
      or v_authorization.source_closure_sha256 is distinct from p_source_closure_sha256
      or v_authorization.bundler_version is distinct from p_bundler_version
      or v_authorization.request_fingerprint is distinct from p_request_fingerprint
      or v_authorization.stable_option_id is distinct from p_stable_option_id
      or v_authorization.safe_metadata is distinct from p_safe_metadata then
      raise exception 'Production Rescue idempotency key payload mismatch'
        using errcode = '23505';
    end if;
    return private.production_rescue_authorization_response_v1(v_authorization.id);
  end if;

  if p_deadline_at is null or p_deadline_at <= v_at
    or p_deadline_at > v_at + interval '15 seconds' then
    raise exception 'Production Rescue ProductBehavior authorization deadline exceeded'
      using errcode = '57014';
  end if;
  if p_expires_at is null or p_expires_at <= v_at
    or p_expires_at > v_at + interval '5 minutes' then
    raise exception 'Production Rescue authorization expiry must be within five minutes'
      using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_recipe_input), '') <> 'object'
    or coalesce(jsonb_typeof(p_recipe_input->'items'), '') <> 'array'
    or coalesce(jsonb_typeof(p_product_composition), '') <> 'object'
    or coalesce(jsonb_typeof(p_product_composition->'behaviorSnapshots'), '') <> 'object' then
    raise exception 'complete trusted Rescue candidate required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.entitlements entitlement
    where entitlement.user_id = p_owner_user_id
      and entitlement.scope = 'pro'
      and entitlement.status = 'active'
      and entitlement.starts_at <= statement_timestamp()
      and (entitlement.ends_at is null or entitlement.ends_at > statement_timestamp())
  ) then
    raise exception 'active Pro entitlement required' using errcode = '42501';
  end if;

  select * into v_run from public.production_runs
  where id = p_run_id and owner_user_id = p_owner_user_id
    and recipe_version_id = p_recipe_version_id and status = 'in_progress'
  for share;
  if not found then
    raise exception 'exact owned in-progress Production source required' using errcode = '42501';
  end if;
  select * into v_version from public.recipe_versions
  where id = p_recipe_version_id and owner_user_id = p_owner_user_id
    and recipe_id = v_run.recipe_id;
  if not found then
    raise exception 'exact owned recipe version required' using errcode = '42501';
  end if;
  if v_run.actual_revision is distinct from p_expected_actual_revision
    or v_run.rescue_revision is distinct from p_expected_rescue_revision then
    raise exception 'Production Rescue source revision conflict; recompute required'
      using errcode = '40001';
  end if;
  if v_run.engine_version is distinct from p_engine_version
    or v_run.config_version is distinct from p_config_version
    or v_version.engine_version is distinct from p_engine_version
    or v_version.config_version is distinct from p_config_version then
    raise exception 'trusted Rescue Engine/config does not match the frozen version'
      using errcode = '22023';
  end if;

  v_database_source_fingerprint :=
    private.production_rescue_source_fingerprint_v1(p_run_id);

  -- The existing ProductBehavior guard is owner-aware. The service-only function performs a
  -- transaction-local owner impersonation solely for this guard, then restores the JWT settings
  -- before any proof is persisted. Any guard error/timeout aborts the statement and stores no row.
  v_previous_claims := current_setting('request.jwt.claims', true);
  v_previous_sub := current_setting('request.jwt.claim.sub', true);
  v_owner_claims := coalesce(nullif(v_previous_claims, ''), '{}')::jsonb
    || jsonb_build_object('sub', p_owner_user_id::text);
  perform set_config('request.jwt.claims', v_owner_claims::text, true);
  perform set_config('request.jwt.claim.sub', p_owner_user_id::text, true);
  perform public.assert_recipe_behavior_authority_v1(
    p_recipe_input, p_product_composition, 'BATCH_RESCUE'
  );
  perform set_config('request.jwt.claims', coalesce(v_previous_claims, '{}'), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  if clock_timestamp() >= p_deadline_at then
    raise exception 'Production Rescue ProductBehavior authorization deadline exceeded'
      using errcode = '57014';
  end if;

  v_database_product_behavior_fingerprint :=
    private.production_rescue_product_behavior_fingerprint_v1(p_product_composition);
  v_database_proof_fingerprint :=
    private.production_rescue_database_proof_fingerprint_v1(
    p_owner_user_id, p_account_id, p_run_id, p_recipe_version_id,
    p_expected_actual_revision, p_expected_rescue_revision, p_source_fingerprint,
    v_database_source_fingerprint, p_recipe_input, p_product_composition,
    p_product_behavior_fingerprint, v_database_product_behavior_fingerprint,
    p_engine_version, p_config_version, p_practical_recipe_version,
    p_rescue_model_version, p_engine_bundle_sha256, p_source_closure_sha256,
    p_bundler_version, p_stable_option_id, p_safe_metadata,
    p_candidate_fingerprint, p_request_fingerprint, p_idempotency_key, v_at, p_expires_at
  );

  if clock_timestamp() >= p_deadline_at then
    raise exception 'Production Rescue ProductBehavior authorization deadline exceeded'
      using errcode = '57014';
  end if;

  insert into private.production_rescue_authorizations (
    owner_user_id, account_id, run_id, recipe_version_id,
    source_actual_revision, source_rescue_revision, source_fingerprint,
    database_source_fingerprint, recipe_input, product_composition,
    product_behavior_fingerprint, database_product_behavior_fingerprint,
    engine_version, config_version, practical_recipe_version, rescue_model_version,
    engine_bundle_sha256, source_closure_sha256, bundler_version,
    stable_option_id, safe_metadata, candidate_fingerprint, request_fingerprint,
    database_proof_fingerprint,
    idempotency_key, authorized_at, expires_at
  ) values (
    p_owner_user_id, p_account_id, p_run_id, p_recipe_version_id,
    p_expected_actual_revision, p_expected_rescue_revision, p_source_fingerprint,
    v_database_source_fingerprint, p_recipe_input, p_product_composition,
    p_product_behavior_fingerprint, v_database_product_behavior_fingerprint,
    p_engine_version, p_config_version, p_practical_recipe_version,
    p_rescue_model_version, p_engine_bundle_sha256, p_source_closure_sha256,
    p_bundler_version, p_stable_option_id, p_safe_metadata, p_candidate_fingerprint,
    p_request_fingerprint, v_database_proof_fingerprint,
    p_idempotency_key, v_at, p_expires_at
  ) on conflict (account_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    if clock_timestamp() >= p_deadline_at then
      raise exception 'Production Rescue ProductBehavior authorization deadline exceeded'
        using errcode = '57014';
    end if;
    return private.production_rescue_authorization_response_v1(v_id);
  end if;

  select * into v_authorization
  from private.production_rescue_authorizations authz
  where authz.account_id = p_account_id
    and authz.idempotency_key = p_idempotency_key
  for share;
  if not found
    or v_authorization.owner_user_id is distinct from p_owner_user_id
    or v_authorization.run_id is distinct from p_run_id
    or v_authorization.recipe_version_id is distinct from p_recipe_version_id
    or v_authorization.source_actual_revision is distinct from p_expected_actual_revision
    or v_authorization.source_rescue_revision is distinct from p_expected_rescue_revision
    or v_authorization.source_fingerprint is distinct from p_source_fingerprint
    or v_authorization.database_source_fingerprint
      is distinct from v_database_source_fingerprint
    or v_authorization.recipe_input is distinct from p_recipe_input
    or v_authorization.product_composition is distinct from p_product_composition
    or v_authorization.candidate_fingerprint is distinct from p_candidate_fingerprint
    or v_authorization.product_behavior_fingerprint
      is distinct from p_product_behavior_fingerprint
    or v_authorization.database_product_behavior_fingerprint
      is distinct from v_database_product_behavior_fingerprint
    or v_authorization.engine_version is distinct from p_engine_version
    or v_authorization.config_version is distinct from p_config_version
    or v_authorization.practical_recipe_version is distinct from p_practical_recipe_version
    or v_authorization.rescue_model_version is distinct from p_rescue_model_version
    or v_authorization.engine_bundle_sha256 is distinct from p_engine_bundle_sha256
    or v_authorization.source_closure_sha256 is distinct from p_source_closure_sha256
    or v_authorization.bundler_version is distinct from p_bundler_version
    or v_authorization.request_fingerprint is distinct from p_request_fingerprint
    or v_authorization.stable_option_id is distinct from p_stable_option_id
    or v_authorization.safe_metadata is distinct from p_safe_metadata then
    raise exception 'Production Rescue idempotency key payload mismatch' using errcode = '23505';
  end if;

  return private.production_rescue_authorization_response_v1(v_authorization.id);
end;
$$;

-- Owner consumption is the only authenticated Rescue write. The proof row and run row are both
-- locked. First consumption calls the existing cumulative structural/PB/physical validator and
-- records the Rescue event/revision in the same transaction. The browser supplies only its
-- authorization basis and idempotency key; the durable event UUID is generated once by the DB.
create or replace function public.production_consume_rescue_authorization_v1(
  p_authorization_id uuid,
  p_expected_actual_revision integer,
  p_expected_rescue_revision integer,
  p_idempotency_key text
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_at timestamptz := clock_timestamp();
  v_authorization private.production_rescue_authorizations%rowtype;
  v_run public.production_runs%rowtype;
  v_version public.recipe_versions%rowtype;
  v_database_source_fingerprint text;
  v_database_product_behavior_fingerprint text;
  v_database_proof_fingerprint text;
  v_event_id uuid;
begin
  if p_authorization_id is null
    or p_expected_actual_revision is null or p_expected_actual_revision < 0
    or p_expected_rescue_revision is null or p_expected_rescue_revision < 0
    or coalesce(length(p_idempotency_key), 0) not between 1 and 200 then
    raise exception 'Rescue authorization, caller basis and idempotency key are required'
      using errcode = '22023';
  end if;

  select * into v_authorization
  from private.production_rescue_authorizations authz
  where authz.id = p_authorization_id
  for update;
  if not found or v_authorization.owner_user_id is distinct from v_uid
    or v_authorization.account_id is distinct from v_uid then
    raise exception 'owned Production Rescue authorization required' using errcode = '42501';
  end if;
  if v_authorization.source_actual_revision is distinct from p_expected_actual_revision
    or v_authorization.source_rescue_revision is distinct from p_expected_rescue_revision then
    raise exception 'Production Rescue caller basis does not match the authorization'
      using errcode = '40001';
  end if;

  -- Successful consumption remains safely retryable after expiry or later run revisions.
  if v_authorization.consumed_at is not null then
    if v_authorization.consumed_by = v_uid
      and v_authorization.consumed_idempotency_key = p_idempotency_key
      and exists (
        select 1 from public.production_run_events event
        where event.id = v_authorization.consumed_event_id
          and event.run_id = v_authorization.run_id
          and event.owner_user_id = v_uid and event.event_type = 'rescue_applied'
      ) then
      return v_authorization.run_id;
    end if;
    raise exception 'Production Rescue authorization was already consumed'
      using errcode = '23505';
  end if;

  if v_authorization.expires_at <= v_at then
    raise exception 'Production Rescue authorization expired' using errcode = '22023';
  end if;

  select * into v_run from public.production_runs
  where id = v_authorization.run_id and owner_user_id = v_uid
    and recipe_version_id = v_authorization.recipe_version_id
    and status = 'in_progress'
  for update;
  if not found then
    raise exception 'exact owned in-progress Production source required' using errcode = '42501';
  end if;
  select * into v_version from public.recipe_versions
  where id = v_authorization.recipe_version_id and owner_user_id = v_uid
    and recipe_id = v_run.recipe_id;
  if not found then
    raise exception 'exact owned recipe version required' using errcode = '42501';
  end if;
  if v_run.actual_revision is distinct from v_authorization.source_actual_revision
    or v_run.rescue_revision is distinct from v_authorization.source_rescue_revision then
    raise exception 'Production Rescue authorization source is stale'
      using errcode = '40001';
  end if;
  if v_run.engine_version is distinct from v_authorization.engine_version
    or v_run.config_version is distinct from v_authorization.config_version
    or v_version.engine_version is distinct from v_authorization.engine_version
    or v_version.config_version is distinct from v_authorization.config_version then
    raise exception 'Production Rescue authorization Engine/config is stale'
      using errcode = '22023';
  end if;

  v_database_source_fingerprint :=
    private.production_rescue_source_fingerprint_v1(v_authorization.run_id);
  if v_database_source_fingerprint
    is distinct from v_authorization.database_source_fingerprint then
    raise exception 'Production Rescue authorization source fingerprint is stale'
      using errcode = '40001';
  end if;
  v_database_product_behavior_fingerprint :=
    private.production_rescue_product_behavior_fingerprint_v1(
      v_authorization.product_composition
    );
  if v_database_product_behavior_fingerprint
    is distinct from v_authorization.database_product_behavior_fingerprint then
    raise exception 'Production Rescue ProductBehavior authority is stale'
      using errcode = '22023';
  end if;
  v_database_proof_fingerprint :=
    private.production_rescue_database_proof_fingerprint_v1(
    v_authorization.owner_user_id, v_authorization.account_id,
    v_authorization.run_id, v_authorization.recipe_version_id,
    v_authorization.source_actual_revision, v_authorization.source_rescue_revision,
    v_authorization.source_fingerprint, v_authorization.database_source_fingerprint,
    v_authorization.recipe_input, v_authorization.product_composition,
    v_authorization.product_behavior_fingerprint,
    v_authorization.database_product_behavior_fingerprint,
    v_authorization.engine_version, v_authorization.config_version,
    v_authorization.practical_recipe_version, v_authorization.rescue_model_version,
    v_authorization.engine_bundle_sha256, v_authorization.source_closure_sha256,
    v_authorization.bundler_version, v_authorization.stable_option_id,
    v_authorization.safe_metadata, v_authorization.candidate_fingerprint,
    v_authorization.request_fingerprint, v_authorization.idempotency_key,
    v_authorization.authorized_at, v_authorization.expires_at
  );
  if v_database_proof_fingerprint
    is distinct from v_authorization.database_proof_fingerprint then
    raise exception 'Production Rescue database proof is invalid' using errcode = '22023';
  end if;

  v_event_id := gen_random_uuid();
  perform public.production_apply_rescue_v1(
    v_authorization.run_id,
    v_authorization.source_rescue_revision,
    v_authorization.source_actual_revision,
    v_authorization.recipe_input,
    v_authorization.product_composition,
    v_event_id
  );

  update private.production_rescue_authorizations set
    consumed_at = v_at,
    consumed_by = v_uid,
    consumed_event_id = v_event_id,
    consumed_idempotency_key = p_idempotency_key
  where id = v_authorization.id and consumed_at is null;
  if not found then
    raise exception 'Production Rescue authorization consumption conflict'
      using errcode = '40001';
  end if;

  return v_authorization.run_id;
end;
$$;

-- Retire the browser-callable structural validator as a write endpoint. It remains callable by
-- the owner of the new SECURITY DEFINER consume function inside the atomic transaction only.
revoke all on function public.production_apply_rescue_v1(
  uuid, integer, integer, jsonb, jsonb, uuid
) from public, anon, authenticated, service_role;

revoke all on function public.production_create_rescue_authorization_v1(
  uuid, uuid, uuid, uuid, text, integer, integer, jsonb, jsonb,
  text, text, text, text, text, text, text, text, text, text, text,
  jsonb, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public.production_create_rescue_authorization_v1(
  uuid, uuid, uuid, uuid, text, integer, integer, jsonb, jsonb,
  text, text, text, text, text, text, text, text, text, text, text,
  jsonb, timestamptz, timestamptz, text
) to service_role;

revoke all on function public.production_consume_rescue_authorization_v1(
  uuid, integer, integer, text
)
  from public, anon, authenticated, service_role;
grant execute on function public.production_consume_rescue_authorization_v1(
  uuid, integer, integer, text
)
  to authenticated;
