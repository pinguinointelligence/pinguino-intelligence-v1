-- D-LINK-03 — per-campaign performance in the Affiliate workspace.
--
-- STATUS: READY / NOT APPLIED — production-shared DB. Staging and production
-- share one Supabase project, so applying this changes production. The owner
-- applies it; nothing in this file has been run. Do not `db push`.
--
-- What a partner could not see. The workspace RPC gives every CODE its clicks,
-- signups, paid customers, revenue and commission, but every campaign LINK
-- only its clicks. A partner with ten links could not tell which one brought a
-- paying customer, and the workspace said nowhere how many referred
-- subscriptions are active right now.
--
-- Added — four keys, all AGGREGATE counts (D-LINK-04: no customer identity
-- leaves this RPC):
--   codes[].activeSubscriptions
--   links[].signups · links[].paidCustomers · links[].activeSubscriptions
--
-- A link's signups and paid customers are the attributions whose recorded
-- click came through that link — referral_clicks.context->>'contentLinkId',
-- the key its clickCount already uses. An attribution made by typing the code
-- has no click, so it belongs to the code and to no link.
--
-- "Active" is NOT a new rule. gellatti_partner_active_referred_count_v2 is
-- v1 (20260831202000) with two optional narrowing arguments; its body is v1's
-- body plus the narrowing, and a contract test fails if the two ever differ.
-- v1 itself is left untouched, so its callers (the tier snapshot writers) keep
-- exactly the rule they have. Live v1 carries no comments; with comments
-- stripped it equals the repo text (normalised md5 27f9bc2c4bb9d0a00ac628b2070ed088).
--
-- Everything else in the workspace function is byte-identical to the live
-- definition (20260826122000; prosrc md5 7e6742486c1385f3dedacbd21c13d06f) —
-- also contract-tested. Safe in either order with the frontend: the page shows
-- these numbers only when the RPC returns them.
--
-- ROLLBACK: supabase/rollbacks/20260910200000_partner_workspace_link_performance.rollback.sql

create or replace function public.gellatti_partner_active_referred_count_v2(
  p_partner_id uuid,
  p_at timestamptz,
  p_partner_code_id uuid,
  p_content_link_id uuid
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct cs.id)::integer
  from public.referral_attributions ra
  join public.customer_subscriptions cs on cs.id = ra.subscription_id
  join public.partners p on p.id = ra.partner_id
  where ra.partner_id = p_partner_id
    -- D-LINK-03: narrow to one code or to one campaign link. null narrows
    -- nothing, so (partner, at, null, null) counts exactly what v1 counts.
    and (p_partner_code_id is null or ra.partner_code_id = p_partner_code_id)
    and (p_content_link_id is null or exists (
      select 1 from public.referral_clicks rc
      where rc.id = ra.click_id
        and rc.context->>'contentLinkId' = p_content_link_id::text
    ))
    -- A3: ownership is permanent once locked. Same rule as the as-of function.
    and ra.locked_at is not null
    and ra.locked_at <= p_at
    -- T3: a real OTHER customer. A partner never counts their own subscription.
    and cs.user_id <> p.user_id
    -- T3: fraud-reversed commissions never count. Same rule as the as-of function.
    and not exists (
      select 1 from public.commission_adjustments ca
      join public.commission_entries ce on ce.id = ca.commission_entry_id
      where ce.partner_id = p_partner_id
        and ce.stripe_subscription_id = cs.stripe_subscription_id
        and ca.reason = 'fraud'
    )
    and (
      -- T3: active/trialing count; if cancelling at period end they count only
      -- while the paid window has not closed.
      (cs.status in ('active', 'trialing')
        and (
          not cs.cancel_at_period_end
          or (cs.current_period_end is not null and cs.current_period_end > p_at)
        ))
      -- T3: past_due counts only inside the already-paid window
      or (cs.status = 'past_due'
        and cs.current_period_end is not null
        and cs.current_period_end > p_at)
      -- T3: canceled / unpaid / incomplete / incomplete_expired / paused never count
    );
$$;

revoke all on function public.gellatti_partner_active_referred_count_v2(uuid, timestamptz, uuid, uuid)
  from public, anon, authenticated;

-- The live workspace function, plus the four aggregate keys above.
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
      'activeSubscriptions',public.gellatti_partner_active_referred_count_v2(v_partner.id,now(),c.id,null),
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
        where rc.partner_code_id=l.partner_code_id and rc.context->>'contentLinkId'=l.id::text),
      'signups',(select count(*) from public.referral_attributions ra
        join public.referral_clicks rc on rc.id=ra.click_id
        where rc.partner_code_id=l.partner_code_id and rc.context->>'contentLinkId'=l.id::text),
      'paidCustomers',(select count(distinct ra.user_id) from public.referral_attributions ra
        join public.referral_clicks rc on rc.id=ra.click_id
        where rc.partner_code_id=l.partner_code_id and rc.context->>'contentLinkId'=l.id::text
          and ra.status='active'),
      'activeSubscriptions',public.gellatti_partner_active_referred_count_v2(v_partner.id,now(),null,l.id)
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

grant execute on function public.gellatti_partner_workspace_v1() to authenticated;
