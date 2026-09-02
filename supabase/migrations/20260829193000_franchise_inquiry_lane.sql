-- GELLATTI — Franchise inquiry lane.
--
-- `/franchise` presented four approved concepts and then handed the visitor a
-- `mailto:` link, so a real business lead never reached the operator and Admin
-- had nothing to work with. This adds the smallest honest funnel: one stored
-- inquiry, one admin queue, one status the operator can move.
--
-- No financial term, no price and no ROI claim is introduced anywhere: the
-- concepts stay exactly as approved and the inquiry only opens a conversation.

create table if not exists public.franchise_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  concept text not null check (concept in ('punkt', 'wozek', 'przyczepa', 'lokal')),
  full_name text not null,
  email text not null,
  phone text,
  city text,
  country text,
  note text,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  handled_by text,
  handled_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists franchise_inquiries_status_created_idx
  on public.franchise_inquiries (status, created_at desc);

alter table public.franchise_inquiries enable row level security;

-- Reads are admin-only through the RPC below; the author may see their own row.
drop policy if exists franchise_inquiries_owner_read on public.franchise_inquiries;
create policy franchise_inquiries_owner_read on public.franchise_inquiries
  for select to authenticated
  using (user_id = auth.uid() or public.gellatti_admin_has_permission_v1('SUPPORT', auth.uid()));

-- Writing goes exclusively through the validating SECURITY DEFINER function.
drop policy if exists franchise_inquiries_no_direct_write on public.franchise_inquiries;
create policy franchise_inquiries_no_direct_write on public.franchise_inquiries
  for insert to authenticated with check (false);

create or replace function public.gellatti_submit_franchise_inquiry_v1(
  p_inquiry jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_inquiry->>'email', '')));
  v_concept text := lower(btrim(coalesce(p_inquiry->>'concept', '')));
  v_name text := btrim(coalesce(p_inquiry->>'fullName', ''));
begin
  if v_concept not in ('punkt', 'wozek', 'przyczepa', 'lokal') then
    raise exception 'franchise_concept_required';
  end if;
  if v_name = '' then raise exception 'franchise_name_required'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'franchise_email_invalid';
  end if;

  insert into public.franchise_inquiries(
    user_id, concept, full_name, email, phone, city, country, note
  ) values (
    auth.uid(), v_concept, v_name, v_email,
    nullif(btrim(coalesce(p_inquiry->>'phone', '')), ''),
    nullif(btrim(coalesce(p_inquiry->>'city', '')), ''),
    nullif(btrim(coalesce(p_inquiry->>'country', '')), ''),
    nullif(btrim(coalesce(p_inquiry->>'note', '')), '')
  ) returning id into v_id;

  -- The lead queue lives at /admin/franchise; sending the operator to
  -- /admin/operations made them hunt for it.
  insert into public.user_notifications(
    admin_permission, notification_type, entity_type, entity_id, title, body, deep_link, dedupe_key
  ) values (
    'SUPPORT', 'FRANCHISE_INQUIRY_SUBMITTED', 'franchise_inquiries', v_id::text,
    'Nowe zapytanie o Franchise',
    v_name || ' · ' || v_concept,
    '/admin/franchise', 'franchise-inquiry:' || v_id::text
  ) on conflict (dedupe_key) do nothing;

  perform public.gellatti_write_audit_v1(
    'franchise.inquiry_submitted', 'franchise_inquiries', v_id::text,
    jsonb_build_object('concept', v_concept), null, v_id::text, 'user',
    coalesce(auth.uid()::text, 'anonymous')
  );

  return jsonb_build_object('id', v_id, 'status', 'new');
end;
$$;

grant execute on function public.gellatti_submit_franchise_inquiry_v1(jsonb) to anon, authenticated;

create or replace function public.gellatti_admin_franchise_inquiries_v1(
  p_status text default null,
  p_limit integer default 200
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('SUPPORT', v_admin) then
    raise exception 'support_administrator_required';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(entries) order by entries.created_at desc)
    from (
      select f.*
      from public.franchise_inquiries f
      where (p_status is null or f.status = p_status)
      order by f.created_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) entries
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.gellatti_admin_franchise_inquiries_v1(text, integer) to authenticated;

create or replace function public.gellatti_admin_franchise_inquiry_action_v1(
  p_inquiry_id uuid,
  p_status text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('SUPPORT', v_admin) then
    raise exception 'support_administrator_required';
  end if;
  if p_status not in ('new', 'contacted', 'qualified', 'closed') then
    raise exception 'unsupported_franchise_status';
  end if;
  update public.franchise_inquiries
    set status = p_status,
        admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note),
        handled_by = v_admin::text,
        handled_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where id = p_inquiry_id;
  if not found then raise exception 'franchise_inquiry_not_found'; end if;
  perform public.gellatti_write_audit_v1(
    'franchise.inquiry_' || p_status, 'franchise_inquiries', p_inquiry_id::text,
    jsonb_build_object('status', p_status), p_note, p_inquiry_id::text, 'admin', v_admin::text
  );
  return jsonb_build_object('id', p_inquiry_id, 'status', p_status);
end;
$$;

grant execute on function public.gellatti_admin_franchise_inquiry_action_v1(uuid, text, text) to authenticated;
