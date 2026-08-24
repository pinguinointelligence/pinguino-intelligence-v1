-- Rollback and full audit/reset may legitimately touch the entire staging PR
-- population. Their caller stays service-role-only; only these two functions
-- receive a larger statement budget.
alter function public.rollback_product_import_run_v1(uuid,uuid)
  set statement_timeout='120s';
alter function public.snapshot_and_clean_pr_catalog_v1(uuid,text)
  set statement_timeout='120s';
