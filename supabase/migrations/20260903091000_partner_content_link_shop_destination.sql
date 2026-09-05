-- AFFILIATE LINK -> SHOP.
--
-- Starter Pack commission existed, but a partner could not build an attributed
-- link to the Shop: the destination allowlist admitted /subscription,
-- /community, /partner, /@handle and /share/*, so a Starter Pack referral had
-- to land on Pricing and ask the customer to find the Shop themselves.
--
-- ONE destination is added and the allowlist stays an allowlist. The shape
-- checks, the ownership check and every existing entry are untouched. /shop is
-- the only stable Shop route — there is no per-product path today, and the
-- Starter Pack is the first item on that page under the frozen Shop layout. If
-- a product route is ever added, it is one more line here.
--
-- The TABLE keeps its own destination_type CHECK, independent of this
-- function: that second layer is what stops a row arriving by any other route,
-- so it learns the same one type rather than being dropped.
create or replace function public.gellatti_partner_create_content_link_v1(
  p_partner_code_id uuid,
  p_destination_type text,
  p_destination_path text,
  p_label text default null::text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_partner uuid; v_id uuid; v_slug text;
begin
  select p.id into v_partner from public.partners p join public.partner_codes c on c.partner_id=p.id
    where p.user_id=auth.uid() and p.status='active' and c.id=p_partner_code_id and c.status='active';
  if v_partner is null then raise exception 'active_owned_partner_code_required'; end if;
  if p_destination_type not in ('PUBLIC_PROFILE','COMMUNITY_RECIPE','SHARED_RECIPE','PRICING','PUBLIC_PAGE','SHOP')
    or p_destination_path not like '/%' or p_destination_path like '//%'
    or not (
      p_destination_path='/subscription' or p_destination_path='/community'
      or p_destination_path='/partner'
      or p_destination_path='/shop'
      or p_destination_path like '/@%'
      or p_destination_path like '/share/%'
    ) then raise exception 'destination_not_allowed'; end if;
  v_slug:=lower(encode(extensions.gen_random_bytes(12),'hex'));
  insert into public.partner_content_links(
    partner_id,partner_code_id,link_slug,label,destination_type,destination_path
  ) values(v_partner,p_partner_code_id,v_slug,nullif(trim(p_label),''),p_destination_type,p_destination_path)
    returning id into v_id;
  return jsonb_build_object('id',v_id,'linkSlug',v_slug,'destinationPath',p_destination_path);
end;
$$;

alter table public.partner_content_links
  drop constraint if exists partner_content_links_destination_type_check;
alter table public.partner_content_links
  add constraint partner_content_links_destination_type_check
  check (destination_type = any (array['PUBLIC_PROFILE','COMMUNITY_RECIPE','SHARED_RECIPE','PRICING','PUBLIC_PAGE','SHOP']));
