-- Expose request source and a read-only exact-match candidate signal to the
-- Admin queue. This does not classify, approve, or mutate catalog products.
do $$
declare
  v_definition text;
  v_needle text := '''scannerProvenance'',r.scanner_provenance,';
  v_replacement text := '''source'',r.source,
      ''scannerProvenance'',r.scanner_provenance,
      ''exactMatchCandidate'',exists(
        select 1
        from public.products candidate
        where candidate.active
          and candidate.verification_status = ''verified''
          and (
            (r.detected_ean is not null and candidate.ean = r.detected_ean)
            or (
              r.detected_ean is null
              and r.product_name is not null
              and lower(btrim(candidate.product_name_display)) = lower(btrim(r.product_name))
              and lower(btrim(coalesce(candidate.brand, ''''))) = lower(btrim(coalesce(r.brand, '''')))
            )
          )
      ),';
begin
  select pg_get_functiondef(
    'public.gellatti_admin_product_requests_v1(text,integer)'::regprocedure
  ) into v_definition;

  if position('exactMatchCandidate' in v_definition) > 0 then
    return;
  end if;
  if position(v_needle in v_definition) = 0 then
    raise exception 'admin_product_request_projection_anchor_missing';
  end if;

  execute replace(v_definition, v_needle, v_replacement);
end;
$$;
