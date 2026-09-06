begin;
select plan(22);

select ok(
  to_regclass('public.country_product_slot_assignments') is not null,
  'country/Mapper-slot assignment table exists'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.country_product_slot_assignments'::regclass),
  true,
  'country assignment table has RLS enabled'
);

select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'country_product_slot_assignments'
      and indexname = 'country_product_slot_one_active_primary_idx'
      and indexdef like '%WHERE (active AND (assignment_kind = ''PRIMARY_DEFAULT''::text))%'
  ),
  'one active primary is enforced per country/slot'
);

select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'country_product_slot_assignments'
      and indexname = 'country_product_slot_fallback_priority_idx'
  ),
  'safe fallback priorities are unique per country/slot'
);

select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'country_product_slot_assignments'
      and policyname = 'country_product_slot_assignments_catalog_admin'
  ),
  'country assignments use the CATALOG-admin policy'
);

select ok(
  not has_table_privilege('anon', 'public.country_product_slot_assignments', 'SELECT')
  and not has_table_privilege('anon', 'public.country_product_slot_assignments', 'INSERT'),
  'anonymous clients have no direct assignment-table access'
);

select ok(
  to_regprocedure('public.resolve_country_product_slots_v1(text[],text,text)') is not null,
  'bounded country product resolver exists'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure),
  'country resolver is security definer'
);

select ok(
  has_function_privilege('anon', 'public.resolve_country_product_slots_v1(text[],text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.resolve_country_product_slots_v1(text[],text,text)', 'EXECUTE'),
  'guest and signed-in pickers use the same bounded resolver'
);

select ok(
  lower(pg_get_functiondef('public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure))
    like '%''user_preferred''::text%0 as authority_rank%',
  'user preferred exact SKU has first precedence'
);

select ok(
  lower(pg_get_functiondef('public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure))
    like '%''country_primary_default''%then 1%''country_safe_fallback''%else 2%',
  'primary-country default precedes explicit safe fallback'
);

select ok(
  lower(pg_get_functiondef('public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure))
    like '%assignment.country_code = effective_country.country_code%',
  'commercial country candidates are exact-country only'
);

select ok(
  lower(pg_get_functiondef('public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure))
    like '%private.choose_country_product_resolution_v1(%',
  'live resolver uses the directly tested precedence kernel'
);

select ok(
  lower(pg_get_functiondef('private.country_product_slot_assignment_is_usable_v1(text,text,uuid)'::regprocedure))
    like '%upper(coalesce(variant_market.market, variant.market)) = upper(btrim(p_country_code))%'
  and lower(pg_get_functiondef('private.country_product_slot_assignment_is_usable_v1(text,text,uuid)'::regprocedure))
    like '%binding.mapper_ingredient_id = btrim(p_mapper_ingredient_id)%'
  and lower(pg_get_functiondef('private.country_product_slot_assignment_is_usable_v1(text,text,uuid)'::regprocedure))
    like '%private.exact_product_has_picker_profile_v1(%',
  'assignment validation binds exact country/Mapper slot and exact Engine profile'
);

select ok(
  to_regprocedure('public.merge_guest_product_country_v1(text,text,text)') is not null,
  'guest-to-account Product Country merger exists'
);

select ok(
  not has_function_privilege('anon', 'public.merge_guest_product_country_v1(text,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.merge_guest_product_country_v1(text,text,text)', 'EXECUTE'),
  'only signed-in accounts may merge guest country state'
);

select ok(
  lower(pg_get_functiondef('public.merge_guest_product_country_v1(text,text,text)'::regprocedure))
    like '%''explicit_conflict''%'
  and lower(pg_get_functiondef('public.merge_guest_product_country_v1(text,text,text)'::regprocedure))
    like '%v_conflict_choice = ''account''%'
  and lower(pg_get_functiondef('public.merge_guest_product_country_v1(text,text,text)'::regprocedure))
    like '%''guest_chosen''%',
  'different explicit choices wait for a conscious account/guest decision'
);

select ok(
  lower(pg_get_functiondef('public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure))
    not like '%order by%price%'
  and lower(pg_get_functiondef('public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure))
    not like '%order by%recently_used_at%'
  and lower(pg_get_functiondef('public.resolve_country_product_slots_v1(text[],text,text)'::regprocedure))
    not like '%order by%brand%',
  'price, passive recency, and brand never become winner authority'
);

select is(
  (
    select resolution_source
    from private.choose_country_product_resolution_v1(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      array['00000000-0000-0000-0000-000000000003'::uuid]
    )
  ),
  'USER_PREFERRED',
  'valid user-preferred SKU wins over country primary and fallback'
);

select is(
  (
    select product_id
    from private.choose_country_product_resolution_v1(
      null,
      '00000000-0000-0000-0000-000000000002'::uuid,
      array['00000000-0000-0000-0000-000000000003'::uuid]
    )
  ),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'country primary wins when the preferred SKU is absent or invalid'
);

select is(
  (
    select product_id
    from private.choose_country_product_resolution_v1(
      null,
      null,
      array[
        '00000000-0000-0000-0000-000000000003'::uuid,
        '00000000-0000-0000-0000-000000000004'::uuid
      ]
    )
  ),
  '00000000-0000-0000-0000-000000000003'::uuid,
  'first explicitly ranked same-country fallback wins'
);

select is(
  (
    select count(*)
    from private.choose_country_product_resolution_v1(null, null, '{}'::uuid[])
  ),
  0::bigint,
  'no exact candidate returns no row so the client keeps generic Mapper fallback'
);

select * from finish();
rollback;
