-- ============================================================================
-- GELLATTI — WORK WITH US §32: canonical LEAD OPERATIONS
-- ============================================================================
-- Owner §32: "A machine/mobile/franchise inquiry cannot disappear into an
-- email. Create/reuse canonical lead storage and Admin views."
--
-- Today only FRANCHISE has a lane (`franchise_inquiries`, applied 2026-08-29).
-- Machines, mobile equipment and the trailer have nowhere to land at all.
--
-- ── WHY A NEW TABLE RATHER THAN WIDENING THE FRANCHISE ONE ──────────────────
-- `franchise_inquiries` is a franchise-shaped table: its `concept` column is
-- CHECK-constrained to the four franchise formats, and its status vocabulary
-- stops at 'closed'. Widening it would leave every machine and trailer lead
-- living in a table called franchise_inquiries with a column called concept
-- holding a machine model — the shape lying about the contents.
--
-- So this is the canonical store for ALL FOUR lead types, and the existing
-- franchise rows are COPIED IN so there is one place to look. The old table is
-- deliberately NOT dropped: it keeps working, it holds the original rows, and
-- nothing that reads it breaks. Retiring it is a separate, later decision once
-- the unified admin view has been used in anger.
--
-- Writes: service-role/Edge mediated. A customer may INSERT their own lead
-- through the submit function only; nobody reads anybody else's.

-- ── business_leads ───────────────────────────────────────────────────────────
create table if not exists public.business_leads (
  id uuid primary key default gen_random_uuid(),

  -- §32: a human-quotable reference. Sequence-backed so two simultaneous
  -- submissions cannot collide, and prefixed so an operator can tell at a
  -- glance what kind of lead they are looking at.
  reference text not null unique,

  -- The four commercial paths of the new /work-with-us architecture (§7).
  lead_type text not null check (lead_type in ('machine', 'mobile', 'trailer', 'franchise')),

  -- Where the customer actually was when they asked. Kept separate from
  -- lead_type because a trailer enquiry can legitimately start on /machines.
  source_route text,

  -- The model or format asked about, in PUBLIC naming (V2, V4B, Battery Cart,
  -- Milano, lokal, punkt…). Never a manufacturer name (owner correction §5).
  model_or_format text,

  -- The selector answers, verbatim. jsonb so a configurator can gain a step
  -- without a migration, and so an operator can see exactly what was chosen.
  configuration jsonb not null default '{}'::jsonb,

  -- Contact
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (btrim(full_name) <> ''),
  email text not null check (position('@' in email) > 1),
  phone text,
  country text,
  city text,
  message text,

  -- §32 operational statuses, in full
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'quoted', 'won', 'lost')),

  assigned_to_user_id uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_leads_triage_idx
  on public.business_leads (status, created_at desc);
create index if not exists business_leads_type_idx
  on public.business_leads (lead_type, created_at desc);
create index if not exists business_leads_user_idx
  on public.business_leads (user_id);

drop trigger if exists business_leads_touch on public.business_leads;
create trigger business_leads_touch
  before update on public.business_leads
  for each row execute function public.touch_updated_at();

-- ── Lead history — APPEND ONLY ───────────────────────────────────────────────
-- §32 asks for notes and history. They are the same thing: a note IS an event.
-- Rows are never updated or deleted, so "who said what when" survives.
create table if not exists public.business_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.business_leads (id) on delete cascade,
  kind text not null check (kind in ('created', 'status_changed', 'note', 'assigned')),
  from_status text,
  to_status text,
  note text,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists business_lead_events_lead_idx
  on public.business_lead_events (lead_id, created_at);

-- ── Reference numbers ────────────────────────────────────────────────────────
create sequence if not exists public.business_lead_reference_seq;

-- MCH-2026-00142 / MOB- / TRL- / FRN-
create or replace function public.gellatti_next_lead_reference_v1(p_lead_type text)
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select case p_lead_type
           when 'machine'   then 'MCH'
           when 'mobile'    then 'MOB'
           when 'trailer'   then 'TRL'
           when 'franchise' then 'FRN'
           else 'LED'
         end
         || '-' || to_char(now() at time zone 'Europe/Madrid', 'YYYY')
         || '-' || lpad(nextval('public.business_lead_reference_seq')::text, 5, '0');
$$;

revoke all on function public.gellatti_next_lead_reference_v1(text) from public, anon, authenticated;

-- ── Submit ───────────────────────────────────────────────────────────────────
-- Callable by anyone: a machine enquiry must not require an account. The row is
-- attributed to auth.uid() when there is one, so a signed-in customer's leads
-- can be shown back to them.
create or replace function public.gellatti_submit_business_lead_v1(
  p_lead jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_reference text;
  v_type text := btrim(coalesce(p_lead->>'leadType', ''));
begin
  if v_type not in ('machine', 'mobile', 'trailer', 'franchise') then
    raise exception 'unsupported_lead_type';
  end if;
  if coalesce(btrim(p_lead->>'fullName'), '') = '' then
    raise exception 'lead_full_name_required';
  end if;
  if position('@' in coalesce(p_lead->>'email', '')) < 2 then
    raise exception 'lead_email_required';
  end if;

  v_reference := public.gellatti_next_lead_reference_v1(v_type);

  insert into public.business_leads (
    reference, lead_type, source_route, model_or_format, configuration,
    user_id, full_name, email, phone, country, city, message
  ) values (
    v_reference,
    v_type,
    nullif(btrim(coalesce(p_lead->>'sourceRoute', '')), ''),
    nullif(btrim(coalesce(p_lead->>'modelOrFormat', '')), ''),
    coalesce(p_lead->'configuration', '{}'::jsonb),
    auth.uid(),
    btrim(p_lead->>'fullName'),
    lower(btrim(p_lead->>'email')),
    nullif(btrim(coalesce(p_lead->>'phone', '')), ''),
    nullif(btrim(coalesce(p_lead->>'country', '')), ''),
    nullif(btrim(coalesce(p_lead->>'city', '')), ''),
    nullif(btrim(coalesce(p_lead->>'message', '')), '')
  ) returning id into v_id;

  insert into public.business_lead_events (lead_id, kind, to_status, actor_user_id)
    values (v_id, 'created', 'new', auth.uid());

  return jsonb_build_object('id', v_id, 'reference', v_reference, 'status', 'new');
end $$;

revoke all on function public.gellatti_submit_business_lead_v1(jsonb) from public, anon;
grant execute on function public.gellatti_submit_business_lead_v1(jsonb) to anon, authenticated;

-- ── Admin: list ──────────────────────────────────────────────────────────────
create or replace function public.gellatti_admin_business_leads_v1(
  p_lead_type text default null,
  p_status text default null,
  p_limit integer default 200
) returns table (
  id uuid, reference text, lead_type text, source_route text, model_or_format text,
  configuration jsonb, full_name text, email text, phone text, country text, city text,
  message text, status text, assigned_to_user_id uuid, created_at timestamptz,
  updated_at timestamptz, event_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER', auth.uid()) then
    raise exception 'administrator_required';
  end if;
  return query
    select l.id, l.reference, l.lead_type, l.source_route, l.model_or_format,
           l.configuration, l.full_name, l.email, l.phone, l.country, l.city,
           l.message, l.status, l.assigned_to_user_id, l.created_at, l.updated_at,
           (select count(*)::integer from public.business_lead_events e where e.lead_id = l.id)
    from public.business_leads l
    where (p_lead_type is null or l.lead_type = p_lead_type)
      and (p_status is null or l.status = p_status)
    order by l.created_at desc
    limit greatest(coalesce(p_limit, 200), 1);
end $$;

revoke all on function public.gellatti_admin_business_leads_v1(text, text, integer) from public, anon;
grant execute on function public.gellatti_admin_business_leads_v1(text, text, integer) to authenticated;

-- ── Admin: one lead's history ────────────────────────────────────────────────
create or replace function public.gellatti_admin_business_lead_events_v1(
  p_lead_id uuid
) returns table (
  id uuid, kind text, from_status text, to_status text, note text,
  actor_user_id uuid, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER', auth.uid()) then
    raise exception 'administrator_required';
  end if;
  return query
    select e.id, e.kind, e.from_status, e.to_status, e.note, e.actor_user_id, e.created_at
    from public.business_lead_events e
    where e.lead_id = p_lead_id
    order by e.created_at;
end $$;

revoke all on function public.gellatti_admin_business_lead_events_v1(uuid) from public, anon;
grant execute on function public.gellatti_admin_business_lead_events_v1(uuid) to authenticated;

-- ── Admin: update status / add a note ────────────────────────────────────────
-- One entry point, because both are the same operational act: something
-- happened, and the record should say so. Either may be omitted, but not both.
create or replace function public.gellatti_admin_update_business_lead_v1(
  p_lead_id uuid,
  p_status text default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_before text;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER', v_admin) then
    raise exception 'administrator_required';
  end if;
  if p_status is null and coalesce(btrim(p_note), '') = '' then
    raise exception 'lead_update_requires_status_or_note';
  end if;
  if p_status is not null
     and p_status not in ('new', 'contacted', 'qualified', 'quoted', 'won', 'lost') then
    raise exception 'unsupported_lead_status';
  end if;

  select status into v_before from public.business_leads where id = p_lead_id;
  if v_before is null then raise exception 'lead_not_found'; end if;

  if p_status is not null and p_status is distinct from v_before then
    update public.business_leads
      set status = p_status, updated_at = now()
      where id = p_lead_id;
    insert into public.business_lead_events
      (lead_id, kind, from_status, to_status, note, actor_user_id)
      values (p_lead_id, 'status_changed', v_before, p_status, nullif(btrim(p_note), ''), v_admin);
    perform public.gellatti_write_audit_v1(
      'lead.status_changed', 'business_leads', p_lead_id::text,
      jsonb_build_object('from', v_before, 'to', p_status),
      p_note, p_lead_id::text, 'admin', v_admin::text
    );
  elsif coalesce(btrim(p_note), '') <> '' then
    insert into public.business_lead_events (lead_id, kind, note, actor_user_id)
      values (p_lead_id, 'note', btrim(p_note), v_admin);
  end if;

  return jsonb_build_object('id', p_lead_id, 'status', coalesce(p_status, v_before));
end $$;

revoke all on function public.gellatti_admin_update_business_lead_v1(uuid, text, text) from public, anon;
grant execute on function public.gellatti_admin_update_business_lead_v1(uuid, text, text) to authenticated;

-- ── Bring the existing franchise rows into the one place ─────────────────────
-- Idempotent: keyed on a deterministic reference derived from the source row,
-- so re-running imports nothing twice. The source table is left untouched.
insert into public.business_leads (
  reference, lead_type, source_route, model_or_format, configuration,
  user_id, full_name, email, phone, country, city, message, status, created_at, updated_at
)
select
  'FRN-LEGACY-' || left(replace(f.id::text, '-', ''), 10),
  'franchise',
  '/franchise',
  f.concept,
  jsonb_build_object('concept', f.concept, 'importedFrom', 'franchise_inquiries'),
  f.user_id, f.full_name, f.email, f.phone, f.country, f.city, f.note,
  -- 'closed' has no counterpart in the richer vocabulary; 'lost' would assert
  -- an outcome nobody recorded, so a closed legacy row lands on 'qualified'
  -- with the truth kept in the imported event below.
  case f.status when 'closed' then 'qualified' else f.status end,
  f.created_at, f.updated_at
from public.franchise_inquiries f
on conflict (reference) do nothing;

insert into public.business_lead_events (lead_id, kind, note, created_at)
select l.id,
       'note',
       'Zaimportowano z wcześniejszej listy zapytań Franchise.'
         || case when f.admin_note is null then '' else ' Notatka: ' || f.admin_note end
         || case when f.status = 'closed' then ' Status źródłowy: zamknięte.' else '' end,
       f.created_at
from public.franchise_inquiries f
join public.business_leads l
  on l.reference = 'FRN-LEGACY-' || left(replace(f.id::text, '-', ''), 10)
where not exists (
  select 1 from public.business_lead_events e where e.lead_id = l.id and e.kind = 'note'
);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.business_leads enable row level security;
alter table public.business_lead_events enable row level security;

-- A signed-in customer may see the leads they submitted, and nothing else.
create policy business_leads_select_own on public.business_leads
  for select using (auth.uid() is not null and user_id = auth.uid());

grant select on public.business_leads to authenticated;
-- No policy and no grant on the event log: history is operator-facing, read
-- through the permission-checked admin function only.
-- No insert/update/delete grants anywhere: every write goes through a function.

-- ── GRANT SURFACE ───────────────────────────────────────────────────────────
-- The project carries ALTER DEFAULT PRIVILEGES on schema public granting ALL
-- (`arwdDxtm`) on every NEW table to anon and authenticated. A new table is
-- therefore fully writable by any signed-in user the moment it is created, and
-- omitting a grant achieves nothing. RLS contains it, but a table that decides
-- money or holds personal data should not have RLS as its ONLY barrier.
-- Found live after 20260831200500; see
-- 20260831200600_partner_rate_profiles_grant_surface.sql for the full evidence.
revoke all on public.business_leads from anon, authenticated;
grant select on public.business_leads to authenticated;  -- the one intended read
revoke all on public.business_lead_events from anon, authenticated;
-- ============================================================================
-- ROLLBACK (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
--   drop function if exists public.gellatti_admin_update_business_lead_v1(uuid, text, text);
--   drop function if exists public.gellatti_admin_business_lead_events_v1(uuid);
--   drop function if exists public.gellatti_admin_business_leads_v1(text, text, integer);
--   drop function if exists public.gellatti_submit_business_lead_v1(jsonb);
--   drop function if exists public.gellatti_next_lead_reference_v1(text);
--   drop table if exists public.business_lead_events;
--   drop table if exists public.business_leads;
--   drop sequence if exists public.business_lead_reference_seq;
-- franchise_inquiries is NOT touched by this migration and survives a rollback
-- intact, so the imported franchise rows are never the only copy.
-- ============================================================================
