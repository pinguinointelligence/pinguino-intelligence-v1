-- Canonical Product Picker v1.9: explicit per-user exact-SKU preference.
--
-- This is intentionally separate from country/default-product authority.
-- A pointer is written only through an explicit RPC call; favorites and passive
-- recency never participate. Country resolution may consume the active pointer
-- later, after the Global Country seam is canonical.

select pg_advisory_xact_lock(
  hashtextextended('user-preferred-exact-product-slots-v1', 0)
);

create table public.user_preferred_product_slots (
  user_id uuid not null references auth.users(id) on delete cascade,
  mapper_ingredient_id text not null,
  preferred_product_id uuid not null references public.products(id) on delete cascade,
  selected_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (user_id, mapper_ingredient_id),
  constraint user_preferred_product_slots_mapper_id_check
    check (mapper_ingredient_id = btrim(mapper_ingredient_id) and mapper_ingredient_id <> '')
);

comment on table public.user_preferred_product_slots is
  'Explicit user/Mapper-slot to exact-product pointer. Never inferred from favorite or recency.';
comment on column public.user_preferred_product_slots.mapper_ingredient_id is
  'Canonical Mapper ingredient slot. One row per user and slot is enforced by the primary key.';
comment on column public.user_preferred_product_slots.preferred_product_id is
  'Exact product consciously selected for this user/slot; it never changes country defaults.';

create index user_preferred_product_slots_product_idx
  on public.user_preferred_product_slots(preferred_product_id, user_id);

-- The validator is private because it must inspect canonical products and
-- behavior bindings without turning either table into a new browser-facing API.
create or replace function private.user_preferred_product_slot_is_usable_v1(
  p_user_id uuid,
  p_mapper_ingredient_id text,
  p_product_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    p_user_id is not null
    and p_mapper_ingredient_id is not null
    and btrim(p_mapper_ingredient_id) <> ''
    and p_product_id is not null
    and public.can_use_product_relation_v1(p_user_id, p_product_id)
    and exists (
      select 1
      from public.products p
      join public.product_behavior_bindings b
        on b.id = p.current_behavior_binding_id
       and b.product_id = p.id
       and b.product_version_id = p.current_version_id
       and b.is_current
      where p.id = p_product_id
        and p.product_kind in ('commercial_product', 'customer_provisional')
        and p.is_active
        and p.merged_into_product_id is null
        and p.canonical_verification_status <> 'blocked'
        and b.binding_status = 'ready'
        and b.mapper_ingredient_id = btrim(p_mapper_ingredient_id)
    )
$function$;

revoke all on function private.user_preferred_product_slot_is_usable_v1(uuid, text, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.validate_user_preferred_product_slot_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.mapper_ingredient_id := btrim(new.mapper_ingredient_id);
  if new.mapper_ingredient_id is null or new.mapper_ingredient_id = '' then
    raise exception 'invalid_mapper_ingredient_slot' using errcode = '22023';
  end if;
  if not private.user_preferred_product_slot_is_usable_v1(
    new.user_id,
    new.mapper_ingredient_id,
    new.preferred_product_id
  ) then
    raise exception 'preferred_product_slot_mismatch' using errcode = '23514';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end
$function$;

revoke all on function private.validate_user_preferred_product_slot_v1()
  from public, anon, authenticated, service_role;

create trigger user_preferred_product_slots_validate
before insert or update on public.user_preferred_product_slots
for each row execute function private.validate_user_preferred_product_slot_v1();

alter table public.user_preferred_product_slots enable row level security;

create policy user_preferred_product_slots_select_own
  on public.user_preferred_product_slots
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_preferred_product_slots_insert_own
  on public.user_preferred_product_slots
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_preferred_product_slots_update_own
  on public.user_preferred_product_slots
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_preferred_product_slots_delete_own
  on public.user_preferred_product_slots
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- All client reads and mutations remain behind the explicit RPCs below. This
-- prevents callers from treating a stale stored pointer as active and prevents
-- passive favorite/recency writes from becoming preference writes.
revoke all on table public.user_preferred_product_slots from public, anon, authenticated;
grant select, insert, update, delete on table public.user_preferred_product_slots to service_role;

create or replace function public.get_user_preferred_product_for_slot_v1(
  p_mapper_ingredient_id text
) returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_mapper_ingredient_id text := btrim(p_mapper_ingredient_id);
  v_product_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if v_mapper_ingredient_id is null or v_mapper_ingredient_id = '' then
    return null;
  end if;

  select preference.preferred_product_id
    into v_product_id
  from public.user_preferred_product_slots preference
  where preference.user_id = v_user_id
    and preference.mapper_ingredient_id = v_mapper_ingredient_id
    and private.user_preferred_product_slot_is_usable_v1(
      v_user_id,
      preference.mapper_ingredient_id,
      preference.preferred_product_id
    );

  return v_product_id;
end
$function$;

create or replace function public.set_user_preferred_product_for_slot_v1(
  p_mapper_ingredient_id text,
  p_preferred_product_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_mapper_ingredient_id text := btrim(p_mapper_ingredient_id);
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if v_mapper_ingredient_id is null or v_mapper_ingredient_id = '' then
    raise exception 'invalid_mapper_ingredient_slot' using errcode = '22023';
  end if;
  if not private.user_preferred_product_slot_is_usable_v1(
    v_user_id,
    v_mapper_ingredient_id,
    p_preferred_product_id
  ) then
    raise exception 'preferred_product_slot_mismatch' using errcode = '23514';
  end if;

  insert into public.user_preferred_product_slots(
    user_id,
    mapper_ingredient_id,
    preferred_product_id,
    selected_at
  ) values (
    v_user_id,
    v_mapper_ingredient_id,
    p_preferred_product_id,
    statement_timestamp()
  )
  on conflict (user_id, mapper_ingredient_id) do update
  set preferred_product_id = excluded.preferred_product_id,
      selected_at = excluded.selected_at,
      updated_at = statement_timestamp();

  return p_preferred_product_id;
end
$function$;

create or replace function public.clear_user_preferred_product_for_slot_v1(
  p_mapper_ingredient_id text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_mapper_ingredient_id text := btrim(p_mapper_ingredient_id);
  v_deleted integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if v_mapper_ingredient_id is null or v_mapper_ingredient_id = '' then
    return false;
  end if;

  delete from public.user_preferred_product_slots
  where user_id = v_user_id
    and mapper_ingredient_id = v_mapper_ingredient_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end
$function$;

revoke all on function public.get_user_preferred_product_for_slot_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.set_user_preferred_product_for_slot_v1(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.clear_user_preferred_product_for_slot_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_user_preferred_product_for_slot_v1(text)
  to authenticated;
grant execute on function public.set_user_preferred_product_for_slot_v1(text, uuid)
  to authenticated;
grant execute on function public.clear_user_preferred_product_for_slot_v1(text)
  to authenticated;

comment on function public.get_user_preferred_product_for_slot_v1(text) is
  'Returns the current user explicit exact-product pointer only while it remains valid and usable; otherwise NULL.';
comment on function public.set_user_preferred_product_for_slot_v1(text, uuid) is
  'Explicitly selects or replaces one preferred exact product for the current user and Mapper slot.';
comment on function public.clear_user_preferred_product_for_slot_v1(text) is
  'Explicitly removes the current user preferred exact product for a Mapper slot.';
