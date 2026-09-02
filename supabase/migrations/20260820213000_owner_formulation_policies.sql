-- Owner-approved formulation policies are separate from canonical Mapper
-- evidence. This forward-only migration does not update mapper_basement.

create table if not exists public.owner_product_dosage_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'published', 'retired')),
  exact_mapper_ingredient_id text not null
    references public.mapper_basement(ingredient_id) on delete restrict,
  exact_catalog_product_version_id uuid null
    references public.product_versions(id) on delete restrict,
  min_percent numeric not null check (min_percent >= 0 and min_percent <= 100),
  preferred_percent numeric not null check (preferred_percent >= 0 and preferred_percent <= 100),
  max_percent numeric not null check (max_percent >= 0 and max_percent <= 100),
  presence_semantics text not null
    check (presence_semantics in ('optional_zero_or_range')),
  provenance text not null,
  source_version text not null,
  policy_payload jsonb not null,
  created_at timestamptz not null default now(),
  check (min_percent <= preferred_percent and preferred_percent <= max_percent),
  unique (policy_key, version)
);

create unique index if not exists owner_product_dosage_policy_one_published_generic
  on public.owner_product_dosage_policy_versions (exact_mapper_ingredient_id)
  where status = 'published' and exact_catalog_product_version_id is null;

create unique index if not exists owner_product_dosage_policy_one_published_specific
  on public.owner_product_dosage_policy_versions (exact_catalog_product_version_id)
  where status = 'published' and exact_catalog_product_version_id is not null;

insert into public.owner_product_dosage_policy_versions (
  policy_key, version, status, exact_mapper_ingredient_id,
  exact_catalog_product_version_id, min_percent, preferred_percent, max_percent,
  presence_semantics, provenance, source_version, policy_payload
) values (
  'gellatti-generic-inulin', 1, 'published', 'PI-ING-000456', null,
  2, 4, 8, 'optional_zero_or_range',
  'owner-approved Gellatti formulation policy',
  'owner-gellatti-inulin-v1',
  jsonb_build_object('minPercent',2,'preferredPercent',4,'maxPercent',8,
    'presenceSemantics','optional_zero_or_range')
)
on conflict (policy_key, version) do update set
  status = excluded.status,
  exact_mapper_ingredient_id = excluded.exact_mapper_ingredient_id,
  exact_catalog_product_version_id = excluded.exact_catalog_product_version_id,
  min_percent = excluded.min_percent,
  preferred_percent = excluded.preferred_percent,
  max_percent = excluded.max_percent,
  presence_semantics = excluded.presence_semantics,
  provenance = excluded.provenance,
  source_version = excluded.source_version,
  policy_payload = excluded.policy_payload;

alter table public.owner_product_dosage_policy_versions enable row level security;
revoke all on table public.owner_product_dosage_policy_versions
  from public, anon, authenticated, service_role;

comment on table public.owner_product_dosage_policy_versions is
  'Server-owned Owner formulation dosage authority. It is not Mapper/manufacturer evidence.';

-- The Production hotfix wrapped the evidence resolver. Patch only that private
-- evidence gate; the process-readiness wrapper remains byte-for-byte intact.
do $patch_owner_dosage_resolver$
declare
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.resolve_product_behavior_evidence_gate_v1(text,text,jsonb)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    'v_mapper_recommended_dose jsonb;',
    'v_mapper_recommended_dose jsonb;
  v_owner_recommended_dose jsonb;'
  );
  v_patched := replace(
    v_patched,
    'v_profile_allowed := case',
    'select p.policy_payload || jsonb_build_object(
      ''sourceVersion'',p.source_version,
      ''provenance'',p.provenance,
      ''policyId'',p.policy_key,
      ''policyVersion'',p.version
    )
    into v_owner_recommended_dose
    from public.owner_product_dosage_policy_versions p
    where p.status=''published''
      and p.exact_mapper_ingredient_id=v_mapping
      and (
        p.exact_catalog_product_version_id is null
        or p.exact_catalog_product_version_id=v_version_id
      )
    order by (p.exact_catalog_product_version_id is not null) desc,p.version desc
    limit 1;
  v_mapper_recommended_dose:=coalesce(v_owner_recommended_dose,v_mapper_recommended_dose);

  v_profile_allowed := case'
  );

  if v_patched = v_definition
    or strpos(v_patched, 'v_owner_recommended_dose jsonb') = 0
    or strpos(v_patched, 'owner_product_dosage_policy_versions') = 0
    or strpos(v_patched, 'v_mapper_recommended_dose:=coalesce') = 0 then
    raise exception 'owner dosage resolver patch drifted';
  end if;
  execute v_patched;
end;
$patch_owner_dosage_resolver$;

-- The owner policy participates in the exact product evidence fingerprint.
-- Only products with an applicable policy receive different fingerprint bytes.
create or replace function public.product_behavior_entity_fingerprint_v1(
  p_entity_kind text,
  p_entity_id text
) returns text
language plpgsql stable security definer
set search_path=public,extensions
as $$
declare
  v_local text;
  v_policy text;
  v_mapping text;
  v_version_exists boolean:=false;
  v_product_exists boolean:=false;
  v_is_current boolean:=false;
begin
  if p_entity_kind='mapper' then
    select coalesce(to_jsonb(m)::text,'')||'|'||coalesce(to_jsonb(pm)::text,''),m.ingredient_id
    into v_local,v_mapping
    from public.mapper_basement m
    left join public.mapper_process_metadata pm on pm.ingredient_id=m.ingredient_id
    where m.ingredient_id=p_entity_id;
  elsif p_entity_kind='catalog_product_version' then
    select coalesce(to_jsonb(v)::text,'')||'|'||coalesce((to_jsonb(p)-array['current_behavior_binding_id','updated_at'])::text,'')||'|'||
      coalesce(b.mapper_ingredient_id,'')||'|'||
      coalesce(to_jsonb(m)::text,'')||'|'||coalesce(to_jsonb(pm)::text,''),b.mapper_ingredient_id
    into v_local,v_mapping
    from public.product_versions v
    join public.products p on p.id=v.product_id
    left join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    left join public.mapper_basement m on m.ingredient_id=b.mapper_ingredient_id
    left join public.mapper_process_metadata pm on pm.ingredient_id=b.mapper_ingredient_id
    where v.id=p_entity_id::uuid;
    if v_local is null then
      select exists(select 1 from public.product_versions v where v.id=p_entity_id::uuid),
        exists(select 1 from public.product_versions v join public.products p on p.id=v.product_id
          where v.id=p_entity_id::uuid),
        exists(select 1 from public.product_versions v join public.products p on p.id=v.product_id
          where v.id=p_entity_id::uuid and p.current_version_id=v.id)
      into v_version_exists,v_product_exists,v_is_current;
    end if;
  else
    raise exception 'unsupported classification entity kind';
  end if;
  if v_local is null then
    raise exception 'classification entity not found (kind=%, id=%, version=%, product=%, current=%)',
      p_entity_kind,p_entity_id,v_version_exists,v_product_exists,v_is_current;
  end if;

  select string_agg(to_jsonb(p)::text,'|' order by p.version,p.policy_key)
  into v_policy
  from public.owner_product_dosage_policy_versions p
  where p.status='published'
    and p.exact_mapper_ingredient_id=v_mapping
    and (
      p.exact_catalog_product_version_id is null
      or (p_entity_kind='catalog_product_version'
        and p.exact_catalog_product_version_id::text=p_entity_id)
    );
  if v_policy is not null then
    v_local:=v_local||'|owner-dosage|'||v_policy;
  end if;

  return encode(extensions.digest(
    public.product_behavior_authority_fingerprint_v1()||'|'||v_local,'sha256'
  ),'hex');
end $$;

revoke all on function public.product_behavior_entity_fingerprint_v1(text,text)
  from public,anon,authenticated;
grant execute on function public.product_behavior_entity_fingerprint_v1(text,text)
  to service_role;

do $refresh_inulin_binding$
begin
  perform public.classify_mapper_product_behavior_v2('PI-ING-000456','owner-formulation-policy-inulin-v1');
end;
$refresh_inulin_binding$;
