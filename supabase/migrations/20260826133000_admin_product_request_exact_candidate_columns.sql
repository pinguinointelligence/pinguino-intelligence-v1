-- Correct the read-only exact-candidate projection to use canonical product
-- table columns and the accepted product/variant EAN authority.
do $$
declare
  v_definition text;
  v_old text := $old$'exactMatchCandidate',exists(
        select 1
        from public.products candidate
        where candidate.active
          and candidate.verification_status = 'verified'
          and (
            (r.detected_ean is not null and candidate.ean = r.detected_ean)
            or (
              r.detected_ean is null
              and r.product_name is not null
              and lower(btrim(candidate.product_name_display)) = lower(btrim(r.product_name))
              and lower(btrim(coalesce(candidate.brand, ''))) = lower(btrim(coalesce(r.brand, '')))
            )
          )
      ),$old$;
  v_new text := $new$'exactMatchCandidate',exists(
        select 1
        from public.products candidate
        where candidate.is_active
          and candidate.merged_into_product_id is null
          and candidate.visibility = 'shared'
          and candidate.canonical_verification_status <> 'blocked'
          and (
            (
              r.detected_ean is not null
              and (
                regexp_replace(coalesce(candidate.ean_code_normalized,''),'\D','','g') = r.detected_ean
                or exists(
                  select 1
                  from public.product_variants candidate_variant
                  where candidate_variant.product_id = candidate.id
                    and candidate_variant.is_current
                    and regexp_replace(coalesce(candidate_variant.ean,''),'\D','','g') = r.detected_ean
                )
              )
            )
            or (
              r.detected_ean is null
              and r.product_name is not null
              and lower(btrim(candidate.product_name_display)) = lower(btrim(r.product_name))
              and lower(btrim(coalesce(candidate.brand, ''))) = lower(btrim(coalesce(r.brand, '')))
            )
          )
      ),$new$;
begin
  select pg_get_functiondef(
    'public.gellatti_admin_product_requests_v1(text,integer)'::regprocedure
  ) into v_definition;

  if position('candidate.ean_code_normalized' in v_definition) > 0 then
    return;
  end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'admin_product_request_exact_candidate_anchor_missing';
  end if;

  execute replace(v_definition,v_old,v_new);
end;
$$;
