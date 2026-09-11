-- ROLLBACK for 20260910200000_partner_workspace_link_performance.sql
--
-- STATUS: READY / NOT APPLIED. Run only if the forward migration was applied.
-- Restores gellatti_partner_workspace_v1 to the definition that is live today
-- (20260826122000; prosrc md5 7e6742486c1385f3dedacbd21c13d06f), then drops
-- the v2 counter, which nothing else calls.

begin;

create or replace function public.gellatti_partner_workspace_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_partner public.partners%rowtype;
begin
  select * into v_partner from public.partners where user_id=auth.uid();
  if v_partner.id is null then
    return jsonb_build_object('ok',false,'reason','not_a_partner');
  end if;
  if v_partner.status<>'active' then
    return jsonb_build_object('ok',false,'reason','partner_not_active','status',v_partner.status);
  end if;
  return jsonb_build_object(
    'ok',true,
    'partner',jsonb_build_object(
      'id',v_partner.id,'status',v_partner.status,'tier',v_partner.tier,
      'onboardingComplete',v_partner.onboarding_complete,
      'payoutsEnabled',v_partner.payouts_enabled,
      'connectAccountPresent',v_partner.stripe_connect_account_id is not null
    ),
    'profile',coalesce((select jsonb_build_object(
      'slug',p.slug,'displayName',p.display_name,'logoPath',p.logo_path,
      'shortDescription',p.short_description,'websiteUrl',p.website_url,
      'socialLinks',p.social_links,'defaultDestinationPath',p.default_destination_path,
      'moderationStatus',p.moderation_status,'updatedAt',p.updated_at
    ) from public.partner_public_profiles p where p.partner_id=v_partner.id),'{}'::jsonb),
    'codes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'code',c.code,'slug',c.slug,'label',c.internal_label,
      'status',c.status,'createdAt',c.created_at,
      'clickCount',(select count(*) from public.referral_clicks rc where rc.partner_code_id=c.id),
      'uniqueVisitors',(select count(distinct rc.visitor_hash) from public.referral_clicks rc
        where rc.partner_code_id=c.id and rc.visitor_hash is not null),
      'signups',(select count(*) from public.referral_attributions ra where ra.partner_code_id=c.id),
      'paidCustomers',(select count(distinct ra.user_id) from public.referral_attributions ra
        where ra.partner_code_id=c.id and ra.status='active'),
      'grossAttributedRevenueCents',coalesce((select sum(invoice_amount.amount_cents)
        from public.commission_entries ce
        join public.referral_attributions ra on ra.id=ce.attribution_id and ra.partner_code_id=c.id
        left join lateral (
          select max(coalesce((swe.payload#>>'{data,object,amount_paid}')::bigint,0)) amount_cents
          from public.stripe_webhook_events swe
          where swe.state='processed'
            and swe.event_type in ('invoice.paid','invoice.payment_succeeded')
            and swe.payload#>>'{data,object,id}'=ce.stripe_invoice_id
        ) invoice_amount on true),0),
      'refundCommissionCents',coalesce((select abs(sum(ca.amount_cents))
        from public.commission_adjustments ca
        join public.commission_entries ce on ce.id=ca.commission_entry_id
        join public.referral_attributions ra on ra.id=ce.attribution_id
        where ra.partner_code_id=c.id and ca.amount_cents<0),0),
      'pendingCommissionCents',coalesce((select sum(ce.amount_cents)
        from public.commission_entries ce join public.referral_attributions ra on ra.id=ce.attribution_id
        where ra.partner_code_id=c.id and ce.status='held'),0),
      'approvedCommissionCents',coalesce((select sum(ce.amount_cents)
        from public.commission_entries ce join public.referral_attributions ra on ra.id=ce.attribution_id
        where ra.partner_code_id=c.id and ce.status='eligible'),0),
      'paidCommissionCents',coalesce((select sum(ce.amount_cents)
        from public.commission_entries ce join public.referral_attributions ra on ra.id=ce.attribution_id
        where ra.partner_code_id=c.id and ce.status='paid'),0)
    ) order by c.created_at) from public.partner_codes c where c.partner_id=v_partner.id),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'linkSlug',l.link_slug,'label',l.label,
      'destinationType',l.destination_type,'destinationPath',l.destination_path,
      'status',l.status,'partnerCodeId',l.partner_code_id,'createdAt',l.created_at,
      'clickCount',(select count(*) from public.referral_clicks rc
        where rc.partner_code_id=l.partner_code_id and rc.context->>'contentLinkId'=l.id::text)
    ) order by l.created_at desc) from public.partner_content_links l
      where l.partner_id=v_partner.id),'[]'::jsonb),
    'commissions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',ce.id,'status',ce.status,'product',ce.product,'cadence',ce.cadence,
      'amountCents',ce.amount_cents,'currency',ce.currency,
      'earnedAt',ce.earned_at,'eligibleAt',ce.eligible_at,
      'livemode',ce.livemode,'invoiceId',ce.stripe_invoice_id
    ) order by ce.earned_at desc) from public.commission_entries ce
      where ce.partner_id=v_partner.id),'[]'::jsonb),
    'payouts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',pp.id,'status',pp.status,'amountCents',pp.amount_cents,
      'carryForwardCents',pp.carry_forward_cents,'currency',pp.currency,
      'paidAt',pp.paid_at,'createdAt',pp.created_at,
      'failureReason',pp.failure_reason
    ) order by pp.created_at desc) from public.partner_payouts pp
      where pp.partner_id=v_partner.id),'[]'::jsonb)
  );
end;
$$;

drop function if exists public.gellatti_partner_active_referred_count_v2(uuid, timestamptz, uuid, uuid);

commit;
