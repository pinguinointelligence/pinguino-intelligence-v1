-- Private current price overrides above global Mapper reference prices.
-- ingredient_cost_entries remains purchase history; this table is the sole
-- current customer override source. Additive only; not applied remotely here.
create table if not exists public.customer_ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  canonical_ingredient_id text not null
    references public.mapper_basement(ingredient_id) on delete restrict,
  price_per_kg numeric not null check (price_per_kg >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, canonical_ingredient_id)
);

create or replace function public.touch_customer_ingredient_price_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.owner_user_id = old.owner_user_id;
  new.canonical_ingredient_id = old.canonical_ingredient_id;
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  return new;
end;
$$;

drop trigger if exists customer_ingredient_prices_touch_updated_at
  on public.customer_ingredient_prices;
create trigger customer_ingredient_prices_touch_updated_at
before update on public.customer_ingredient_prices
for each row execute function public.touch_customer_ingredient_price_updated_at();

alter table public.customer_ingredient_prices enable row level security;
create index if not exists customer_ingredient_prices_owner_idx
  on public.customer_ingredient_prices (owner_user_id, canonical_ingredient_id);

create policy customer_ingredient_prices_select_own
  on public.customer_ingredient_prices for select
  using (auth.uid() = owner_user_id);
create policy customer_ingredient_prices_insert_own
  on public.customer_ingredient_prices for insert
  with check (auth.uid() = owner_user_id and auth.uid() = created_by);
create policy customer_ingredient_prices_update_own
  on public.customer_ingredient_prices for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id and auth.uid() = created_by);
create policy customer_ingredient_prices_delete_own
  on public.customer_ingredient_prices for delete
  using (auth.uid() = owner_user_id);

grant select, insert, update, delete on public.customer_ingredient_prices to authenticated;
