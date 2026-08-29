-- GELLATTI — Favourites and recent usage could never be written.
--
-- Both `global_catalog_favorites` and `global_catalog_recent_usage` guard their
-- `pi_base` rows with
--
--   exists (select 1 from mapper_basement m
--           where m.ingredient_id = … and m.is_active)
--
-- inside the RLS WITH CHECK. That predicate is evaluated as the CALLER, and
-- `mapper_basement` is not readable by `authenticated` (RLS returns 0 of 2089
-- rows to a signed-in customer). The EXISTS is therefore always false, so every
-- star a customer pressed was refused with
-- `42501 new row violates row-level security policy` — silently, because the UI
-- optimistically renders and then reverts.
--
-- The intent of the check — refuse a favourite that names an article which is
-- not an active Mapper identity — is right and is preserved exactly. It simply
-- has to be evaluated with the privileges that can see the dataset, so it moves
-- into a SECURITY DEFINER predicate. Nothing about `mapper_basement` itself is
-- changed: no row, no column, no grant, no new client-side visibility.

create or replace function public.gellatti_active_mapper_ingredient_v1(p_ingredient_id text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1 from public.mapper_basement m
    where m.ingredient_id = p_ingredient_id and m.is_active
  );
$$;

comment on function public.gellatti_active_mapper_ingredient_v1(text) is
  'Owner-privileged existence check for RLS predicates. The Mapper dataset stays invisible to clients; only the yes/no answer crosses the boundary.';

grant execute on function public.gellatti_active_mapper_ingredient_v1(text) to authenticated;

drop policy if exists global_catalog_favorites_pi_base_own on public.global_catalog_favorites;
create policy global_catalog_favorites_pi_base_own on public.global_catalog_favorites
  for all to authenticated
  using (user_id = auth.uid() and entity_kind = 'pi_base')
  with check (
    user_id = auth.uid()
    and entity_kind = 'pi_base'
    and catalog_product_id is null
    and mapper_ingredient_id is not null
    and public.gellatti_active_mapper_ingredient_v1(mapper_ingredient_id)
  );

drop policy if exists global_catalog_recent_pi_base_own on public.global_catalog_recent_usage;
create policy global_catalog_recent_pi_base_own on public.global_catalog_recent_usage
  for all to authenticated
  using (user_id = auth.uid() and entity_kind = 'pi_base')
  with check (
    user_id = auth.uid()
    and entity_kind = 'pi_base'
    and catalog_product_id is null
    and mapper_ingredient_id is not null
    and public.gellatti_active_mapper_ingredient_v1(mapper_ingredient_id)
  );
