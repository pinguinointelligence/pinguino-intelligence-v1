-- Deterministic rollback for
-- 20260912184500_country_slot_projection_explicit_approval.sql.

do $rollback$
declare
  v_signature constant regprocedure :=
    'public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure;
  v_approval_usable constant text := E'\n      and mapper.approved_for_engines';
  v_approval_blocked constant text := E'\n        and mapper.approved_for_engines';
  v_obsolete_usable constant text :=
    E'\n      and lower(coalesce(mapper.verification_status, \'\')) like \'verified%\'';
  v_obsolete_blocked constant text :=
    E'\n        and lower(coalesce(mapper.verification_status, \'\')) like \'verified%\'';
  v_definition text := pg_get_functiondef(v_signature);
  v_replacement text;
begin
  if position('lower(coalesce(mapper.verification_status' in v_definition) > 0
    or regexp_count(v_definition, 'mapper\.approved_for_base') <> 2
    or regexp_count(v_definition, 'mapper\.approved_for_engines') <> 2
  then
    raise exception 'RL-20 resolver projection has drifted; refusing rollback';
  end if;

  v_replacement := replace(
    replace(
      v_definition,
      v_approval_usable,
      v_approval_usable || v_obsolete_usable
    ),
    v_approval_blocked,
    v_approval_blocked || v_obsolete_blocked
  );
  if v_replacement = v_definition then
    raise exception 'RL-20 resolver projection rollback anchor was not matched';
  end if;

  execute v_replacement;

  if regexp_count(
    pg_get_functiondef(v_signature),
    'lower\(coalesce\(mapper\.verification_status'
  ) <> 2 then
    raise exception 'RL-20 resolver projection rollback was incomplete';
  end if;
end
$rollback$;
