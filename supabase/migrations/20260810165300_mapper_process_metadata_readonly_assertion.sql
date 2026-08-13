-- Post-import staging/runtime assertion for the Owner-approved Aug-8 companion.
-- This migration contains no science and no data changes; it fails closed if the
-- canonical counts, manifest, RLS or client read-only boundary drift.
do $$
declare
  manifest record;
begin
  if (select count(*) from public.mapper_process_metadata) <> 2088 then
    raise exception 'Process metadata database count is not 2088';
  end if;
  if (select count(distinct ingredient_id) from public.mapper_process_metadata) <> 2088 then
    raise exception 'Process metadata database identities are not unique';
  end if;
  if (select count(*) from public.mapper_process_metadata where process_decision = 'COLD_PROCESS_OK') <> 636 then
    raise exception 'Database COLD_PROCESS_OK count is not 636';
  end if;
  if (select count(*) from public.mapper_process_metadata where process_decision = 'HEAT_REQUIRED_FOR_FUNCTION') <> 56 then
    raise exception 'Database HEAT_REQUIRED_FOR_FUNCTION count is not 56';
  end if;
  if (select count(*) from public.mapper_process_metadata where process_decision = 'HEAT_REQUIRED_FOR_SAFETY') <> 7 then
    raise exception 'Database HEAT_REQUIRED_FOR_SAFETY count is not 7';
  end if;
  if (select count(*) from public.mapper_process_metadata where process_decision = 'HEAT_REQUIRED_FOR_BOTH') <> 0 then
    raise exception 'Database HEAT_REQUIRED_FOR_BOTH count is not 0';
  end if;
  if (select count(*) from public.mapper_process_metadata where process_decision = 'UNKNOWN') <> 1389 then
    raise exception 'Database UNKNOWN count is not 1389';
  end if;

  select * into manifest
  from public.mapper_process_metadata_imports
  where dataset_version = '2026-08-08-process-v1';
  if manifest is null
    or lower(manifest.source_sha256) <> 'c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4'
    or manifest.total_rows <> 2088
    or manifest.source_columns <> 22
    or manifest.unique_ingredient_ids <> 2088
    or manifest.blank_ingredient_ids <> 0 then
    raise exception 'Process metadata import manifest is incomplete or incorrect';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'mapper_process_metadata' and c.relrowsecurity
  ) then raise exception 'RLS is not enabled for mapper_process_metadata'; end if;

  if has_table_privilege('anon', 'public.mapper_process_metadata', 'INSERT')
    or has_table_privilege('anon', 'public.mapper_process_metadata', 'UPDATE')
    or has_table_privilege('anon', 'public.mapper_process_metadata', 'DELETE')
    or has_table_privilege('authenticated', 'public.mapper_process_metadata', 'INSERT')
    or has_table_privilege('authenticated', 'public.mapper_process_metadata', 'UPDATE')
    or has_table_privilege('authenticated', 'public.mapper_process_metadata', 'DELETE') then
    raise exception 'Canonical process metadata is mutable by a normal client role';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('mapper_process_metadata', 'mapper_process_metadata_imports')
      and cmd <> 'SELECT'
  ) then raise exception 'A non-SELECT process metadata policy exists'; end if;
end $$;
