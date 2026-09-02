-- Forward-only parity repair after the owner-approved Mapper 2088 -> 2089
-- expansion. Historical migrations remain immutable; only the currently
-- callable product-import guards are republished with the new exact count.
do $$
declare
  v_function regprocedure;
  v_before text;
  v_after text;
begin
  foreach v_function in array array[
    'public.product_import_clean_preflight_v1(uuid)'::regprocedure,
    'public.start_product_import_run_v1(uuid,text,text,text,text,text,integer)'::regprocedure,
    'public.snapshot_and_clean_pr_catalog_v1(uuid,text)'::regprocedure,
    'public.snapshot_pr_catalog_v1(uuid,text)'::regprocedure,
    'public.clean_pr_catalog_batch_v1(uuid,uuid,integer)'::regprocedure,
    'public.register_product_import_external_snapshot_v1(uuid,text,text,text,jsonb,uuid[])'::regprocedure
  ] loop
    select pg_get_functiondef(v_function) into strict v_before;
    if strpos(v_before,'2088')=0 then
      raise exception 'expected Mapper 2088 guard is absent from %',v_function;
    end if;
    v_after:=replace(v_before,'2088','2089');
    execute v_after;
  end loop;

  foreach v_function in array array[
    'public.product_import_clean_preflight_v1(uuid)'::regprocedure,
    'public.start_product_import_run_v1(uuid,text,text,text,text,text,integer)'::regprocedure,
    'public.snapshot_and_clean_pr_catalog_v1(uuid,text)'::regprocedure,
    'public.snapshot_pr_catalog_v1(uuid,text)'::regprocedure,
    'public.clean_pr_catalog_batch_v1(uuid,uuid,integer)'::regprocedure,
    'public.register_product_import_external_snapshot_v1(uuid,text,text,text,jsonb,uuid[])'::regprocedure
  ] loop
    select pg_get_functiondef(v_function) into strict v_after;
    if strpos(v_after,'2088')>0 or strpos(v_after,'2089')=0 then
      raise exception 'Mapper 2089 runtime guard parity failed for %',v_function;
    end if;
  end loop;
end;
$$;

notify pgrst,'reload schema';
