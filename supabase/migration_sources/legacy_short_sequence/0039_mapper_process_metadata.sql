-- Separate, immutable companion for Owner-approved Mapper process evidence.
-- The canonical 62-column mapper_basement remains unchanged.
create table if not exists public.mapper_process_metadata (
  ingredient_id text primary key references public.mapper_basement(ingredient_id) on delete restrict,
  process_decision text not null check (process_decision in (
    'COLD_PROCESS_OK',
    'HEAT_REQUIRED_FOR_FUNCTION',
    'HEAT_REQUIRED_FOR_SAFETY',
    'HEAT_REQUIRED_FOR_BOTH',
    'UNKNOWN'
  )),
  reason_type text not null check (reason_type in (
    'ingredient_function', 'food_safety', 'hydration', 'raw_ingredient', 'process_requirement'
  )),
  explanation_pl text not null check (length(btrim(explanation_pl)) > 0),
  heat_sensitive boolean not null default false,
  late_addition_guidance_pl text,
  source_label text not null check (length(btrim(source_label)) > 0),
  source_reference text not null check (length(btrim(source_reference)) > 0),
  verification_status text not null check (verification_status in ('verified', 'provisional', 'unknown')),
  dataset_version text not null check (length(btrim(dataset_version)) > 0),
  imported_at timestamptz not null default now()
);

create table if not exists public.mapper_process_metadata_imports (
  dataset_version text primary key,
  source_sha256 text not null check (source_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  source_sheet text not null,
  total_rows integer not null check (total_rows = 2088),
  cold_process_ok integer not null,
  heat_required_for_function integer not null,
  heat_required_for_safety integer not null,
  heat_required_for_both integer not null,
  unknown_count integer not null,
  imported_at timestamptz not null default now(),
  check (
    cold_process_ok + heat_required_for_function + heat_required_for_safety +
    heat_required_for_both + unknown_count = total_rows
  )
);

alter table public.mapper_process_metadata enable row level security;
alter table public.mapper_process_metadata_imports enable row level security;

revoke all on public.mapper_process_metadata from anon, authenticated;
revoke all on public.mapper_process_metadata_imports from anon, authenticated;
grant select on public.mapper_process_metadata to authenticated;
grant select on public.mapper_process_metadata_imports to authenticated;

drop policy if exists mapper_process_metadata_authenticated_read on public.mapper_process_metadata;
create policy mapper_process_metadata_authenticated_read
  on public.mapper_process_metadata for select to authenticated using (true);

drop policy if exists mapper_process_metadata_imports_authenticated_read on public.mapper_process_metadata_imports;
create policy mapper_process_metadata_imports_authenticated_read
  on public.mapper_process_metadata_imports for select to authenticated using (true);

comment on table public.mapper_process_metadata is
  'Read-only runtime companion imported transactionally from Owner-approved Aug-8 process workbook; never OCR/AI/customer-written.';
