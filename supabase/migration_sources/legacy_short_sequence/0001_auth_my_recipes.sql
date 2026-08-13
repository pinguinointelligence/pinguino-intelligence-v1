-- Phase 2A.2 — profiles + saved_recipes with row-level security.
--
-- recipe_input is the SOURCE OF TRUTH; the engine recomputes everything from it.
-- No calculated values are stored. Frontend uses the anon key + the user's JWT;
-- RLS scopes every row to its owner. No privileged-server-role dependency.
--
-- Apply in the Supabase SQL editor or via `supabase db push`.

-- ── profiles: one row per auth user ─────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── saved_recipes ───────────────────────────────────────────────────────────
create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  recipe_input jsonb not null,           -- SOURCE OF TRUTH (results recomputed by calculateRecipe)
  product_type text,
  serving_profile text,
  active_engine_label text not null default '−11°C Engine',
  engine_version text not null,
  config_version text not null,
  batch_grams integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_recipes_user_id_idx on public.saved_recipes (user_id);

-- ── auto-create a profile on sign-up ────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── keep updated_at fresh ───────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists saved_recipes_touch on public.saved_recipes;
create trigger saved_recipes_touch
  before update on public.saved_recipes
  for each row execute function public.touch_updated_at();

-- ── Row-Level Security ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.saved_recipes enable row level security;

-- profiles: a user reads/edits only their own row
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- saved_recipes: full CRUD only on your own rows; no public access
create policy saved_select_own on public.saved_recipes
  for select using (auth.uid() = user_id);
create policy saved_insert_own on public.saved_recipes
  for insert with check (auth.uid() = user_id);
create policy saved_update_own on public.saved_recipes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy saved_delete_own on public.saved_recipes
  for delete using (auth.uid() = user_id);
