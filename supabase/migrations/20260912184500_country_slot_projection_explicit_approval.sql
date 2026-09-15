-- RL-20 follow-up: the resolver already uses the version-bound slot-review
-- eligibility function, but its output projection repeated the obsolete
-- verification_status text-prefix gate for usable_in_base / blocked_reason.
-- Remove exactly those two predicates and preserve the rest of the live
-- resolver definition byte-for-byte through pg_get_functiondef.

do $migration$
declare
  v_signature constant regprocedure :=
    'public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure;
  v_obsolete_usable constant text :=
    E'\n      and lower(coalesce(mapper.verification_status, \'\')) like \'verified%\'';
  v_obsolete_blocked constant text :=
    E'\n        and lower(coalesce(mapper.verification_status, \'\')) like \'verified%\'';
  v_definition text := pg_get_functiondef(v_signature);
  v_replacement text;
begin
  if regexp_count(v_definition, 'lower\(coalesce\(mapper\.verification_status') <> 2
    or regexp_count(v_definition, 'mapper\.approved_for_base') <> 2
    or regexp_count(v_definition, 'mapper\.approved_for_engines') <> 2
  then
    raise exception 'RL-20 resolver projection has drifted; refusing the narrow replacement';
  end if;

  v_replacement := replace(
    replace(v_definition, v_obsolete_usable, ''),
    v_obsolete_blocked,
    ''
  );
  if v_replacement = v_definition then
    raise exception 'RL-20 obsolete resolver projection predicate was not matched';
  end if;

  execute v_replacement;

  v_definition := pg_get_functiondef(v_signature);
  if position('lower(coalesce(mapper.verification_status' in v_definition) > 0
    or regexp_count(v_definition, 'mapper\.approved_for_base') <> 2
    or regexp_count(v_definition, 'mapper\.approved_for_engines') <> 2
  then
    raise exception 'RL-20 explicit-approval resolver projection contract was not installed';
  end if;
end
$migration$;
