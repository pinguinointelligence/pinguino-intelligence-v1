-- Owner-authorized RL-05/RL-20 repair for PostgreSQL 17 error 42725.
--
-- The PL/pgSQL expression parser cannot disambiguate the chained unknown
-- literals used as jsonb path/deletion operands in the PR-ING semantic-binding
-- projection.  This patch adds explicit text[] operands only.  It changes no
-- classification rule, authority, readiness flag, PI identity, Mapper row, or
-- ProductBehavior value.

begin;

select pg_advisory_xact_lock(
  hashtextextended('classifier-semantic-jsonb-operator-typing-v1', 0)
);

do $patch_classifier$
declare
  v_definition text;
  v_patched text;
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

  if md5(v_definition) <> '3e91b08949b0431401cbc83ff5e6386f' then
    raise exception 'classifier definition drifted; refusing operator-typing repair';
  end if;

  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);
  if v_occurrences <> 1 then
    raise exception 'expected exactly one ambiguous semantic jsonb expression, found %', v_occurrences;
  end if;

  v_patched := replace(v_definition, v_old, v_new);
  if length(v_patched) - length(v_definition) <> length(v_new) - length(v_old) then
    raise exception 'classifier patch changed more than the approved expression';
  end if;

  execute v_patched;
end;
$patch_classifier$;

do $verify_classifier$
declare
  v_definition text := pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
begin
  if position($old$- 'exactIdentity' - 'readiness'$old$ in v_definition) <> 0
    or position($new$- ARRAY['exactIdentity','readiness']::text[]$new$ in v_definition) = 0
    or position($new$v_public_data #> ARRAY[$new$ in v_definition) = 0
  then
    raise exception 'classifier operator-typing repair verification failed';
  end if;
end;
$verify_classifier$;

commit;
