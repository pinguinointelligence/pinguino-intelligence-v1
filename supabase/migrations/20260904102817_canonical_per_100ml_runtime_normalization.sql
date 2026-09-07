-- Frozen Owner normalization: 1 ml = 1 g and 1 L = 1000 g.
--
-- The product root already preserves the manufacturer's raw nutrition basis.
-- These three runtime seams must accept that raw per-100-ml declaration and
-- expose the same numeric values as Gellatti's normalized per-100-g working
-- profile. No new authority or country resolver is introduced here.

select pg_advisory_xact_lock(
  hashtextextended('canonical-per-100ml-runtime-normalization-v1', 0)
);

do $patch_ingest$
declare
  v_definition text;
  v_old text := $old$coalesce(v_facts->>'nutritionBasis',v_facts#>>'{nutrition,basis}')='per_100g'$old$;
  v_new text := $new$coalesce(v_facts->>'nutritionBasis',v_facts#>>'{nutrition,basis}') in ('per_100g','per_100ml')$new$;
begin
  v_definition := pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  if strpos(v_definition, v_new) = 0 then
    if strpos(v_definition, v_old) = 0 then
      raise exception 'ingest_product_v1 nutrition readiness anchor drifted';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
    execute v_definition;
  end if;
end;
$patch_ingest$;

do $patch_live_overlay$
declare
  v_definition text;
  v_old text := $old$if jsonb_typeof(v_nutrition) <> 'object' or coalesce(v_nutrition->>'basis','') <> 'per_100g' then$old$;
  v_new text := $new$if jsonb_typeof(v_nutrition) <> 'object' or coalesce(v_nutrition->>'basis','') not in ('per_100g','per_100ml') then$new$;
begin
  v_definition := pg_get_functiondef(
    'public.propose_live_overlay_mapper_identity_v1(uuid)'::regprocedure
  );
  if strpos(v_definition, v_new) = 0 then
    if strpos(v_definition, v_old) = 0 then
      raise exception 'live overlay nutrition basis anchor drifted';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
    execute v_definition;
  end if;
end;
$patch_live_overlay$;

do $patch_behavior_projection$
declare
  v_definition text;
  v_old_gate text := $old$and v_public_facts->'nutrition'->>'basis'='per_100g'$old$;
  v_new_gate text := $new$and v_public_facts->'nutrition'->>'basis' in ('per_100g','per_100ml')$new$;
  v_old_projection text := $old$then jsonb_build_object(
            'basis','per_100g',
            'energyKcal',v_public_facts->'nutrition'->'energyKcal',$old$;
  v_new_projection text := $new$then jsonb_build_object(
            'basis','per_100g',
            'sourceBasis',v_public_facts->'nutrition'->>'basis',
            'normalizationBasis',case
              when v_public_facts->'nutrition'->>'basis'='per_100ml'
                then 'GELLATTI_1ML_1G_NORMALIZATION'
              else 'SOURCE_PER_100G'
            end,
            'energyKcal',v_public_facts->'nutrition'->'energyKcal',$new$;
begin
  v_definition := pg_get_functiondef(
    'public.resolve_product_behavior_evidence_gate_v1(text,text,jsonb)'::regprocedure
  );
  if strpos(v_definition, v_new_gate) = 0 then
    if strpos(v_definition, v_old_gate) = 0 then
      raise exception 'product behavior nutrition basis anchor drifted';
    end if;
    v_definition := replace(v_definition, v_old_gate, v_new_gate);
  end if;
  if strpos(v_definition, 'GELLATTI_1ML_1G_NORMALIZATION') = 0 then
    if strpos(v_definition, v_old_projection) = 0 then
      raise exception 'product behavior nutrition projection anchor drifted';
    end if;
    v_definition := replace(v_definition, v_old_projection, v_new_projection);
  end if;
  execute v_definition;
end;
$patch_behavior_projection$;
