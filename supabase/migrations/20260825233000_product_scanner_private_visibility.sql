-- A product created from the private photo scanner is an owner product, not a
-- global catalogue publication. Publication remains a separate, explicit
-- workflow. The canonical ingest previously classified every commercial
-- product as `shared`, which made a freshly saved PM visible to every signed-in
-- account even though its scanner overlay was correctly private.
--
-- Patch only the visibility decision inside the current governed ingest body.
-- No existing product, version, behavior binding or Mapper row is mutated here.
do $do$
declare
  src text;
  patched text;
  old_block constant text :=
    'v_visibility:=case when v_kind in (''internal_subproduct'',''internal_admin'') then
    case when v_kind=''internal_admin'' then ''internal'' else ''account_private'' end else ''shared'' end;';
  new_block constant text :=
    'v_visibility:=case
    when p_evidence->>''scannerSchema''=''gellatti_product_scan_v1'' then ''account_private''
    when v_kind in (''internal_subproduct'',''internal_admin'') then
      case when v_kind=''internal_admin'' then ''internal'' else ''account_private'' end
    else ''shared'' end;';
begin
  select pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into src;

  if position(new_block in src) > 0 then
    return;
  end if;
  if position(old_block in src) = 0 then
    raise exception 'ingest_product_v1 visibility decision drifted; refusing unsafe scanner privacy patch';
  end if;

  patched := replace(src, old_block, new_block);
  if patched = src or position(new_block in patched) = 0 then
    raise exception 'ingest_product_v1 scanner privacy patch did not apply exactly once';
  end if;
  execute patched;

  select pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into src;
  if position(new_block in src) = 0 then
    raise exception 'ingest_product_v1 scanner privacy postcondition failed';
  end if;
end
$do$;
