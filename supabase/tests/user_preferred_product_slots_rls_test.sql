begin;
select plan(16);

select ok(
  to_regclass('public.user_preferred_product_slots') is not null,
  'user preferred product slots table exists'
);

select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.user_preferred_product_slots'::regclass
      and contype = 'p'
  ),
  'PRIMARY KEY (user_id, mapper_ingredient_id)',
  'one row is enforced per user and Mapper slot'
);

select is(
  (
    select confdeltype = 'c'
    from pg_constraint
    where conrelid = 'public.user_preferred_product_slots'::regclass
      and conname = 'user_preferred_product_slots_preferred_product_id_fkey'
  ),
  true,
  'hard-deleting the preferred product removes its pointer'
);

select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.user_preferred_product_slots'::regclass
  ),
  true,
  'RLS is enabled'
);

select is(
  (
    select array_agg(policyname order by policyname)::text[]
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_preferred_product_slots'
  ),
  array[
    'user_preferred_product_slots_delete_own',
    'user_preferred_product_slots_insert_own',
    'user_preferred_product_slots_select_own',
    'user_preferred_product_slots_update_own'
  ]::text[],
  'every table operation has an explicit user-owned policy'
);

select ok(
  not has_table_privilege('anon', 'public.user_preferred_product_slots', 'SELECT'),
  'anonymous clients cannot read preferences'
);

select ok(
  not has_table_privilege('authenticated', 'public.user_preferred_product_slots', 'SELECT'),
  'authenticated clients read the active preference only through the guarded getter'
);

select ok(
  not has_table_privilege('authenticated', 'public.user_preferred_product_slots', 'INSERT')
  and not has_table_privilege('authenticated', 'public.user_preferred_product_slots', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.user_preferred_product_slots', 'DELETE'),
  'authenticated preference mutations remain RPC-only'
);

select ok(
  to_regprocedure('public.get_user_preferred_product_for_slot_v1(text)') is not null,
  'active preferred-product getter exists'
);

select ok(
  to_regprocedure('public.set_user_preferred_product_for_slot_v1(text,uuid)') is not null,
  'explicit preferred-product setter exists'
);

select ok(
  to_regprocedure('public.clear_user_preferred_product_for_slot_v1(text)') is not null,
  'explicit preferred-product clearer exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_user_preferred_product_for_slot_v1(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.set_user_preferred_product_for_slot_v1(text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.clear_user_preferred_product_for_slot_v1(text)',
    'EXECUTE'
  ),
  'authenticated users can call only the guarded preference RPC surface'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_user_preferred_product_for_slot_v1(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.set_user_preferred_product_for_slot_v1(text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.clear_user_preferred_product_for_slot_v1(text)',
    'EXECUTE'
  ),
  'anonymous clients cannot call the preference RPCs'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.set_user_preferred_product_for_slot_v1(text,uuid)'::regprocedure
  ),
  'setter is a guarded security-definer RPC'
);

select ok(
  lower(pg_get_functiondef(
    'private.user_preferred_product_slot_is_usable_v1(uuid,text,uuid)'::regprocedure
  )) like '%b.mapper_ingredient_id = btrim(p_mapper_ingredient_id)%'
  and lower(pg_get_functiondef(
    'private.user_preferred_product_slot_is_usable_v1(uuid,text,uuid)'::regprocedure
  )) like '%b.binding_status = ''ready''%',
  'validator proves current ready binding matches the requested slot'
);

select ok(
  lower(pg_get_functiondef(
    'public.set_user_preferred_product_for_slot_v1(text,uuid)'::regprocedure
  )) like '%on conflict (user_id, mapper_ingredient_id) do update%'
  and lower(pg_get_functiondef(
    'public.set_user_preferred_product_for_slot_v1(text,uuid)'::regprocedure
  )) not like '%favorite%'
  and lower(pg_get_functiondef(
    'public.set_user_preferred_product_for_slot_v1(text,uuid)'::regprocedure
  )) not like '%recently_used_at%',
  'explicit replacement never derives preference from favorite or recency'
);

select * from finish();
rollback;
