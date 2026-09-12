-- Deterministic inverse of 20260912193000_classifier_semantic_jsonb_operator_typing.sql.
-- Restores the exact pre-migration classifier definition whose MD5 is
-- 3e91b08949b0431401cbc83ff5e6386f.

begin;

select pg_advisory_xact_lock(
  hashtextextended('classifier-semantic-jsonb-operator-typing-v1', 0)
);

do $restore_classifier$
declare
  v_definition text;
  v_restored text;
  v_old text := $old$    v_product_semantic_binding:=
      (v_public_data#>'{productIntelligence,productProfileAuthority,semanticBindingProposal}'
        - 'exactIdentity' - 'readiness')
      ||jsonb_build_object($old$;
  v_new text := $new$    v_product_semantic_binding:=
      ((v_public_data #> ARRAY[
          'productIntelligence',
          'productProfileAuthority',
          'semanticBindingProposal'
        ]::text[])
        - ARRAY['exactIdentity','readiness']::text[])
      ||jsonb_build_object($new$;
  v_occurrences integer;
begin
  v_definition := pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_new, ''))
  ) / length(v_new);
  if v_occurrences <> 1 then
    raise exception 'expected exactly one explicit semantic jsonb expression, found %', v_occurrences;
  end if;

  v_restored := replace(v_definition, v_new, v_old);
  execute v_restored;

  if md5(pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  )) <> '3e91b08949b0431401cbc83ff5e6386f' then
    raise exception 'classifier rollback did not restore the preserved definition';
  end if;
end;
$restore_classifier$;

commit;
