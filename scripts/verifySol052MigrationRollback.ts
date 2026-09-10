import { PGlite } from 'npm:@electric-sql/pglite';

const migration = await Deno.readTextFile(
  'supabase/migrations/20260908101050_sol_052_publication_eligibility.sql',
);
const rollback = await Deno.readTextFile(
  'supabase/rollbacks/20260908101050_sol_052_publication_eligibility.rollback.sql',
);

const fixture = String.raw`
create role anon;
create role authenticated;
create role service_role;
create schema extensions;
create function extensions.unaccent(p_value text) returns text language sql immutable
as 'select p_value';

create function public.gellatti_upsert_customer_added_product_v1(
  p_actor_user_id uuid, p_session_id uuid, p_idempotency_key text, p_scan_result jsonb,
  p_product_profile jsonb, p_product_behavior jsonb, p_private_overlay jsonb
) returns jsonb language plpgsql security definer set search_path=public,extensions as $body$
declare
  v_route text;
  v_ready boolean := true;
  v_conf numeric;
  v_existing_pr record;
  v_ean text := '7350042718481';
  v_pending record;
  v_product_id uuid;
begin
  v_conf:=coalesce((p_product_profile->>'productAccuracy')::numeric,0);
  v_route:=case when v_ready and v_conf>85 then 'PR'
                when v_ready then 'PM_READY'
                else 'PM_UNVERIFIED' end;
  select p.id,p.product_code,p.product_name_display,p.brand into v_existing_pr
    from public.products p
    where p.is_active and p.merged_into_product_id is null
      and p.product_code like 'PR-ING-%' and p.canonical_verification_status<>'blocked'
      and (p.ean_code_normalized=v_ean or exists(select 1 from public.product_variants pv
        where pv.product_id=p.id and pv.is_current and pv.ean=v_ean));
  if v_existing_pr.id is not null then
    return '{}'::jsonb;
  end if;

  select * into v_pending from public.customer_added_products
    where normalized_ean=v_ean
    limit 1 for update;
  if v_pending.id is null then
    return '{}'::jsonb;
  end if;
  update public.product_scan_sessions set state='finalized',exact_product_id=v_product_id,
    overlay_state='USABLE_FOR_OWNER',updated_at=statement_timestamp()
    where id=p_session_id;
  return '{}'::jsonb;
end;
$body$;

create function public.resolve_exact_products_by_gtin_v1(p_gtin text, p_scope text)
returns jsonb language plpgsql stable as $body$
declare
  v_uid uuid := null;
begin
  perform 1 from public.products p left join public.product_versions pv on pv.id=p.current_version_id
  where p.is_active and p.merged_into_product_id is null and (
    (p.visibility = 'shared' and p.product_kind = 'commercial_product'
      and coalesce(p.canonical_verification_status, '') <> 'blocked')
    or p.product_kind = 'mapper_reference'
    or (v_uid is not null and (p.owning_account_id = v_uid or p.created_by = v_uid))
    or (v_uid is not null and p.product_kind = 'customer_provisional'));
  return '{}'::jsonb;
end;
$body$;

create function public.search_products_v1(
  p_query text, p_context text, p_market text, p_tags text[], p_active boolean,
  p_kind text, p_country text, p_limit integer, p_offset integer, p_options jsonb
) returns jsonb language plpgsql stable as $body$
begin
  perform 1 from public.products p left join public.product_versions v on v.id=p.current_version_id
    where p.product_kind<>'mapper_reference' and p.is_active and p.merged_into_product_id is null
      and ((p.visibility='shared')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid()
        or exists(select 1 from public.product_ingest_events ev
          where ev.product_id=p.id and ev.actor_user_id=auth.uid())
        or exists(select 1 from public.customer_added_product_accounts linked
          where linked.product_id=p.id and linked.user_id=auth.uid()));
  return '{}'::jsonb;
end;
$body$;

create function public.canonicalize_ean_identity_v1(p_ean text, p_product_id uuid)
returns jsonb language plpgsql security definer as $body$
declare v_ean text := p_ean;
begin
  perform 1 from public.products p
  where p.is_active and p.merged_into_product_id is null
    and p.product_kind = 'commercial_product' and p.visibility = 'shared'
    and coalesce(nullif(p.barcode_normalized,''), nullif(p.ean_code_normalized,'')) = v_ean;
  return '{}'::jsonb;
end;
$body$;
`;

const signatures = [
  'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)',
  'public.resolve_exact_products_by_gtin_v1(text,text)',
  'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)',
  'public.canonicalize_ean_identity_v1(text,uuid)',
] as const;
const markers = [
  'SOL052_PUBLICATION_ELIGIBILITY_UPSERT_V2',
  'SOL052_PUBLICATION_ELIGIBILITY_EXACT_V2',
  'SOL052_PUBLICATION_ELIGIBILITY_SEARCH_V2',
  'SOL052_PUBLICATION_ELIGIBILITY_CANONICAL_V2',
] as const;

const db = new PGlite();
await db.waitReady;
try {
  await db.exec(fixture);
  const definition = async (signature: string) =>
    String(
      (
        await db.query<{ definition: string }>(
          'select pg_get_functiondef($1::regprocedure) as definition',
          [signature],
        )
      ).rows[0]?.definition,
    );
  const before = await Promise.all(signatures.map(definition));

  await db.exec(migration);
  const afterFirstApply = await Promise.all(signatures.map(definition));
  markers.forEach((marker, index) => {
    if (!afterFirstApply[index]?.includes(marker))
      throw new Error(`forward marker missing: ${marker}`);
  });
  if (!afterFirstApply[1]?.includes("v_uid is not null and p.visibility <> 'shared'"))
    throw new Error('exact resolver still lets shared rows bypass eligibility through ownership');

  // A second application must be a no-op, not an anchor failure.
  await db.exec(migration);
  const afterSecondApply = await Promise.all(signatures.map(definition));
  if (JSON.stringify(afterFirstApply) !== JSON.stringify(afterSecondApply))
    throw new Error('second migration application changed an RPC definition');

  const eligibility = await db.query<{
    nested_ok: boolean;
    flat_ok: boolean;
    target_blocked: boolean;
  }>(
    `select
       public.product_publication_identity_eligible_v1(
         '{"identity":{"displayName":"Cacao Puro","brand":"La Chocolatera"}}'::jsonb
       ) as nested_ok,
       public.product_publication_identity_eligible_v1(
         '{"displayName":"Mleko Polskie 3,2% tł., 1 l","brand":"Mlekovita"}'::jsonb
       ) as flat_ok,
       not public.product_publication_identity_eligible_v1(
         '{"identity":{"displayName":"Vitamin well","brand":"Vitamin Well AB"}}'::jsonb
       ) as target_blocked`,
  );
  if (!Object.values(eligibility.rows[0] ?? {}).every(Boolean))
    throw new Error('SQL eligibility fixture failed');

  await db.exec(rollback);
  const afterRollback = await Promise.all(signatures.map(definition));
  if (JSON.stringify(before) !== JSON.stringify(afterRollback))
    throw new Error('rollback did not restore byte-equivalent RPC definitions');

  // Rollback is also safe to retry.
  await db.exec(rollback);
  const helper = await db.query<{ helper: string | null }>(
    "select to_regprocedure('public.product_publication_identity_eligible_v1(jsonb)')::text as helper",
  );
  if (helper.rows[0]?.helper !== null)
    throw new Error('rollback left the eligibility helper behind');

  console.log('SOL-052 migration drill PASS: apply, reapply no-op, rollback, rollback no-op.');
} finally {
  await db.close();
}
