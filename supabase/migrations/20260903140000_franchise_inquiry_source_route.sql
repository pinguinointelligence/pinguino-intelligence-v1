-- ============================================================================
-- FRANCHISE ENQUIRY CONSOLIDATION — route attribution on the canonical table
-- ============================================================================
-- Owner decision 2026-09-03: FranchiseInquiryForm → franchise_inquiries →
-- AdminFranchiseLeadsSection is the ONE Franchise enquiry authority. The legacy
-- LeadEnquirySection wrote to `business_leads`, whose one genuinely useful extra
-- capability was `source_route` — which page the question started on, so Admin
-- can tell a trailer enquiry from a machines one when the chosen concept does
-- not say it.
--
-- That capability moves here rather than being rebuilt: one column, nullable,
-- because leads created before this migration legitimately have no route and a
-- visitor may reach the form directly.
--
-- business_leads is NOT dropped. It holds real historical rows (3 on staging:
-- franchise, machine, trailer) and deleting customer enquiries to tidy an
-- architecture is not a trade worth making. It simply stops receiving writes.

alter table public.franchise_inquiries
  add column if not exists source_route text;

comment on column public.franchise_inquiries.source_route is
  'Route the enquiry started on (/franchise, /trailer, /mobile, /machines). '
  'Absorbed from the retired business_leads flow. Nullable: pre-existing rows '
  'have none, and a direct visit legitimately has none.';

-- The writer takes the route from the SAME jsonb draft, but does not trust it.
-- source_route is rendered to an operator in the Admin lead queue, so an
-- arbitrary client string here would be both a junk-data and an injection-shaped
-- risk. Only the four routes that can legitimately originate a Franchise
-- enquiry are stored; anything else is recorded as no route rather than
-- rejected, because a bad route is not a reason to lose a real customer lead.
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

  -- The lead queue lives at /admin/franchise; sending the operator to
  -- /admin/operations made them hunt for it.
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
