alter table public.franchise_inquiries
  add column if not exists source_route text;

comment on column public.franchise_inquiries.source_route is
  'Route the enquiry started on (/franchise, /trailer, /mobile, /machines). Absorbed from the retired business_leads flow. Nullable: pre-existing rows have none, and a direct visit legitimately has none.';

create or replace function public.gellatti_submit_franchise_inquiry_v1(p_inquiry jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_inquiry->>'email', '')));
  v_concept text := lower(btrim(coalesce(p_inquiry->>'concept', '')));
  v_name text := btrim(coalesce(p_inquiry->>'fullName', ''));
  v_source text := btrim(coalesce(p_inquiry->>'sourceRoute', ''));
begin
  if v_concept not in ('punkt', 'wozek', 'przyczepa', 'lokal') then
    raise exception 'franchise_concept_required';
  end if;
  if v_name = '' then raise exception 'franchise_name_required'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'franchise_email_invalid';
  end if;
  if v_source not in ('/franchise', '/trailer', '/mobile', '/machines') then
    v_source := null;
  end if;

  insert into public.franchise_inquiries(
    user_id, concept, full_name, email, phone, city, country, note, source_route
  ) values (
    auth.uid(), v_concept, v_name, v_email,
    nullif(btrim(coalesce(p_inquiry->>'phone', '')), ''),
    nullif(btrim(coalesce(p_inquiry->>'city', '')), ''),
    nullif(btrim(coalesce(p_inquiry->>'country', '')), ''),
    nullif(btrim(coalesce(p_inquiry->>'note', '')), ''),
    v_source
  ) returning id into v_id;

  insert into public.user_notifications(
    admin_permission, notification_type, entity_type, entity_id, title, body, deep_link, dedupe_key
  ) values (
    'SUPPORT', 'FRANCHISE_INQUIRY_SUBMITTED', 'franchise_inquiries', v_id::text,
    'Nowe zapytanie o Franchise',
    v_name || ' · ' || v_concept || coalesce(' · ' || v_source, ''),
    '/admin/franchise', 'franchise-inquiry:' || v_id::text
  ) on conflict (dedupe_key) do nothing;

  perform public.gellatti_write_audit_v1(
    'franchise.inquiry_submitted', 'franchise_inquiries', v_id::text,
    jsonb_build_object('concept', v_concept, 'source_route', v_source), null, v_id::text, 'user',
    coalesce(auth.uid()::text, 'anonymous')
  );

  return jsonb_build_object('id', v_id, 'status', 'new');
end;
$function$;
