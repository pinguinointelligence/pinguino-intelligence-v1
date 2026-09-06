-- SCANNER — A CUSTOMER'S PRODUCT IS FINAL WITHIN ITS OWN SAVE.
--
-- The triggers on products/product_versions queue the canonical reclassification of every new
-- version; the queue worker runs once a minute. Between the save and that run the behaviour gate
-- answered "classification_pending" — the customer who had just added the product could not put it
-- into a recipe for up to 60 s (owner QA 2026-09-06, Biedronka kiwi yoghurt: saved 01:22:01,
-- usable 01:23:00). The canonical worker gains an optional entity filter, and the customer upsert
-- drains its own product's queue rows before it returns. Nothing else changes: same classifier,
-- same queue, same fingerprint rule; the minute worker keeps every other entity. Both idempotent.

do $patch_queue_worker_entity_filter$
declare
  v_signature regprocedure := to_regprocedure(
    'public.process_product_behavior_reclassification_queue_v1(integer)'
  );
  v_definition text;
  v_old_head text;
  v_new_head text;
  v_old_pick text;
  v_new_pick text;
begin
  if v_signature is null then
    if to_regprocedure(
      'public.process_product_behavior_reclassification_queue_v1(integer,text,text)'
    ) is not null then
      return;
    end if;
    raise exception 'process_product_behavior_reclassification_queue_v1_missing';
  end if;
  select pg_get_functiondef(v_signature) into v_definition;
  v_old_head := 'CREATE OR REPLACE FUNCTION public.process_product_behavior_reclassification_queue_v1(p_limit integer DEFAULT 100)';
  v_new_head := 'CREATE OR REPLACE FUNCTION public.process_product_behavior_reclassification_queue_v1(p_limit integer DEFAULT 100, p_entity_kind text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text)';
  v_old_pick := $old$    where q.status in ('pending','failed') and q.attempt_count<q.max_attempts
    order by q.queued_at,q.id$old$;
  v_new_pick := $new$    where q.status in ('pending','failed') and q.attempt_count<q.max_attempts
      -- one entity only when asked (a customer's own save drains its product's rows at once)
      and (p_entity_kind is null or q.entity_kind=p_entity_kind)
      and (p_entity_id is null or q.entity_id=p_entity_id)
    order by q.queued_at,q.id$new$;
  if strpos(v_definition,v_old_head)=0 or strpos(v_definition,v_old_pick)=0 then
    raise exception 'reclassification queue worker anchor drifted';
  end if;
  v_definition := replace(replace(v_definition,v_old_head,v_new_head),v_old_pick,v_new_pick);
  drop function public.process_product_behavior_reclassification_queue_v1(integer);
  execute v_definition;
  revoke all on function public.process_product_behavior_reclassification_queue_v1(integer,text,text)
    from public,anon,authenticated;
end;
$patch_queue_worker_entity_filter$;

do $patch_customer_upsert_final_within_save$
declare
  v_signature regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_definition text;
  v_old text;
  v_new text;
begin
  if v_signature is null then
    raise exception 'gellatti_upsert_customer_added_product_v1_missing';
  end if;
  select pg_get_functiondef(v_signature) into v_definition;
  if strpos(v_definition,'final within save: the canonical reclassification')>0 then
    return;
  end if;
  v_old := $old$  select product_code into v_product_code from public.products where id=v_product_id;
  return jsonb_build_object($old$;
  v_new := $new$  -- final within save: the canonical reclassification the triggers queued for this product is
  -- published NOW, inside the customer's own save, so the behaviour gate never answers
  -- "classification pending" to the customer who has just added the product (the minute worker
  -- would otherwise publish it up to 60 s later)
  perform public.process_product_behavior_reclassification_queue_v1(
    10,'catalog_product_version',
    (select current_version_id::text from public.products where id=v_product_id)
  );
  select product_code into v_product_code from public.products where id=v_product_id;
  return jsonb_build_object($new$;
  if strpos(v_definition,v_old)=0 then
    raise exception 'customer product upsert tail anchor drifted';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$patch_customer_upsert_final_within_save$;
