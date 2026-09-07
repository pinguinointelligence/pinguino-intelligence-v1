-- ============================================================================
-- REFER A FRIEND — functions
-- ============================================================================
-- Every write to the reward lane goes through one of these. Users get exactly
-- two of them (mint my code, claim a code); everything that creates value is
-- service-role only.

-- ── F1/F2: the canonical bonus-day table ────────────────────────────────────
-- The ONE place the 7 / 30 live in SQL. `referralRewardRules.ts` mirrors it and
-- a migration test asserts the two agree, so the number cannot drift between
-- the page that promises it and the function that grants it.
create or replace function public.gellatti_referral_bonus_days_v1(p_cadence text)
returns integer language sql immutable
as $$
  select case p_cadence
    when 'monthly' then 7
    when 'annual'  then 30
    else null
  end
$$;

revoke all on function public.gellatti_referral_bonus_days_v1(text) from public, anon;
grant execute on function public.gellatti_referral_bonus_days_v1(text) to authenticated, service_role;

-- ── the caller's personal referral code ─────────────────────────────────────
-- Mints on first call and is idempotent afterwards. The code is generated
-- SERVER-SIDE: a user-chosen code would need the whole partner-code validation
-- stack (banned words, impersonation, alias ownership) for a feature whose
-- owner spec asks only for "Twój link".
--
-- CROSS-NAMESPACE SAFETY: the loop refuses any candidate that already exists
-- as a partner code or slug. The two namespaces are resolved by different
-- lookups, and a string that means "partner X" in one and "user Y" in the
-- other is exactly the ambiguity that would let one purchase have two owners.
create or replace function public.gellatti_my_referral_code_v1()
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.user_referral_codes%rowtype;
  v_candidate text;
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- no 0/O/1/I: read aloud safely
  v_attempt integer := 0;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_existing from public.user_referral_codes where user_id = v_user;
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'code', v_existing.code, 'status', v_existing.status);
  end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 40 then
      -- Never return a code we could not prove unique.
      return jsonb_build_object('ok', false, 'reason', 'code_generation_exhausted');
    end if;

    v_candidate := 'G';
    for i in 1..7 loop
      v_candidate := v_candidate || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    continue when exists (
      select 1 from public.user_referral_codes where lower(code) = lower(v_candidate)
    );
    continue when exists (
      select 1 from public.partner_codes
      where lower(code) = lower(v_candidate) or lower(slug) = lower(v_candidate)
    );

    begin
      insert into public.user_referral_codes (user_id, code) values (v_user, v_candidate);
      return jsonb_build_object('ok', true, 'code', v_candidate, 'status', 'active');
    exception when unique_violation then
      -- Lost a race on either index; try another candidate.
      if exists (select 1 from public.user_referral_codes where user_id = v_user) then
        select * into v_existing from public.user_referral_codes where user_id = v_user;
        return jsonb_build_object('ok', true, 'code', v_existing.code, 'status', v_existing.status);
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.gellatti_my_referral_code_v1() from public, anon;
grant execute on function public.gellatti_my_referral_code_v1() to authenticated;

-- ── claiming someone's referral code ────────────────────────────────────────
-- Called by the REFERRED user once they have an account. Returns a typed
-- refusal rather than an error so the UI can say something true.
create or replace function public.gellatti_claim_referral_code_v1(p_code text)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_code public.user_referral_codes%rowtype;
  v_existing public.user_referral_attributions%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'reason', 'code_required');
  end if;

  select * into v_code from public.user_referral_codes
  where lower(code) = lower(btrim(p_code)) and status = 'active';
  if v_code.id is null then
    return jsonb_build_object('ok', false, 'reason', 'code_not_found');
  end if;

  -- F8: you cannot refer yourself.
  if v_code.user_id = v_user then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  -- Already attributed: permanent, and NOT repointed. Returning ok=true when
  -- it is the same referrer keeps a re-click idempotent rather than an error.
  select * into v_existing from public.user_referral_attributions where referred_user_id = v_user;
  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', v_existing.referrer_user_id = v_code.user_id,
      'reason', case when v_existing.referrer_user_id = v_code.user_id
                     then 'already_claimed_same' else 'already_claimed_other' end
    );
  end if;

  -- ONE OWNER PER CONVERSION (§9). If this person is already a partner's
  -- referral, the partner owns the purchase and money is the reward — a user
  -- reward on top would pay twice for one conversion.
  if exists (
    select 1 from public.referral_attributions ra
    where ra.user_id = v_user and ra.status in ('pending', 'active')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'partner_attribution_exists');
  end if;

  insert into public.user_referral_attributions (referrer_user_id, referred_user_id, referral_code_id)
  values (v_code.user_id, v_user, v_code.id);

  return jsonb_build_object('ok', true, 'reason', 'claimed');
end;
$$;

revoke all on function public.gellatti_claim_referral_code_v1(text) from public, anon;
grant execute on function public.gellatti_claim_referral_code_v1(text) to authenticated;

-- ── recording a reward from a qualifying paid invoice ───────────────────────
-- SERVICE ROLE ONLY. Called by the Stripe webhook. Every refusal is typed and
-- returned rather than thrown, so the webhook records an honest note and never
-- retries a decision that will not change.
create or replace function public.gellatti_record_referral_reward_v1(
  p_referred_user_id uuid,
  p_stripe_subscription_id text,
  p_stripe_invoice_id text,
  p_product text,
  p_cadence text,
  p_livemode boolean,
  p_now timestamptz default now()
) returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_attr public.user_referral_attributions%rowtype;
  v_days integer;
  v_reward_id uuid;
begin
  if p_referred_user_id is null or p_stripe_invoice_id is null or p_stripe_invoice_id = '' then
    return jsonb_build_object('ok', false, 'reason', 'incomplete_input');
  end if;

  v_days := public.gellatti_referral_bonus_days_v1(p_cadence);
  if v_days is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_cadence');
  end if;
  if p_product not in ('home', 'pro') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_product');
  end if;

  -- Replay of the same invoice is a no-op, not a second reward.
  if exists (select 1 from public.referral_rewards where stripe_invoice_id = p_stripe_invoice_id) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_invoice');
  end if;

  select * into v_attr from public.user_referral_attributions
  where referred_user_id = p_referred_user_id;
  if v_attr.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_referral_attribution');
  end if;

  -- ONE OWNER PER CONVERSION, checked again at the moment value is created:
  -- a partner attribution may have been locked between the claim and the
  -- payment, and the partner's cash commission wins.
  if exists (
    select 1 from public.referral_attributions ra
    where ra.user_id = p_referred_user_id and ra.status in ('pending', 'active')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'partner_attribution_wins');
  end if;

  -- F3: first paid purchase only.
  if exists (
    select 1 from public.referral_rewards
    where referred_user_id = p_referred_user_id and status = 'earned'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'first_purchase_already_rewarded');
  end if;

  insert into public.referral_rewards (
    referrer_user_id, referred_user_id, attribution_id,
    stripe_subscription_id, stripe_invoice_id,
    product, cadence, bonus_days, earned_at, livemode
  ) values (
    v_attr.referrer_user_id, p_referred_user_id, v_attr.id,
    coalesce(p_stripe_subscription_id, ''), p_stripe_invoice_id,
    p_product, p_cadence, v_days, p_now, coalesce(p_livemode, false)
  )
  returning id into v_reward_id;

  -- F6: a referrer with no paid PRO gets the days immediately; one with paid
  -- PRO keeps them banked. `settle` decides — never this function.
  perform public.gellatti_settle_pro_bonus_v1(v_attr.referrer_user_id, p_now);

  return jsonb_build_object(
    'ok', true, 'reason', 'earned',
    'rewardId', v_reward_id, 'bonusDays', v_days,
    'referrerUserId', v_attr.referrer_user_id
  );
end;
$$;

revoke all on function public.gellatti_record_referral_reward_v1(uuid, text, text, text, text, boolean, timestamptz)
  from public, anon, authenticated;

-- ── reversing a reward (F7/F9) ──────────────────────────────────────────────
-- A refund, void or dispute invalidates the qualifying purchase. The reward
-- flips to `reversed`, which removes its days from the bank.
--
-- F9: access ALREADY GRANTED is never clawed back. If the days were already
-- spent, the balance simply goes negative and future rewards absorb it — the
-- referrer is not logged out mid-session over someone else's refund.
create or replace function public.gellatti_reverse_referral_reward_v1(
  p_stripe_invoice_id text,
  p_reason text,
  p_now timestamptz default now()
) returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_reward public.referral_rewards%rowtype;
begin
  select * into v_reward from public.referral_rewards where stripe_invoice_id = p_stripe_invoice_id;
  if v_reward.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_reward_for_invoice');
  end if;
  if v_reward.status = 'reversed' then
    return jsonb_build_object('ok', false, 'reason', 'already_reversed');
  end if;

  update public.referral_rewards
  set status = 'reversed',
      reversed_at = p_now,
      reversal_reason = coalesce(nullif(btrim(p_reason), ''), 'unspecified')
  where id = v_reward.id;

  return jsonb_build_object(
    'ok', true, 'reason', 'reversed',
    'rewardId', v_reward.id, 'bonusDays', v_reward.bonus_days
  );
end;
$$;

revoke all on function public.gellatti_reverse_referral_reward_v1(text, text, timestamptz)
  from public, anon, authenticated;

-- ── the PRO BONUS BANK balance ──────────────────────────────────────────────
-- DERIVED, never stored:
--     earned (live rewards) − consumed + refunded-on-early-revocation
-- A negative result is legitimate (F9) and means future rewards are absorbed
-- before any new access is granted.
create or replace function public.gellatti_pro_bonus_balance_v1(p_user_id uuid)
returns integer language sql stable
set search_path to 'pg_catalog', 'public'
as $$
  select
    coalesce((select sum(bonus_days) from public.referral_rewards
              where referrer_user_id = p_user_id and status = 'earned'), 0)
    - coalesce((select sum(days) from public.pro_bonus_consumptions
                where user_id = p_user_id), 0)
    + coalesce((select sum(refunded_days) from public.pro_bonus_consumptions
                where user_id = p_user_id), 0)
$$;

revoke all on function public.gellatti_pro_bonus_balance_v1(uuid) from public, anon, authenticated;

-- ── settling the bank against real access ───────────────────────────────────
-- The whole F4/F5/F6 rule in one deterministic, idempotent function.
--
--   paid PRO active + bonus grant running → revoke the grant, hand the unused
--       whole days back to the bank. The referrer keeps what they earned
--       instead of burning it underneath a subscription they are paying for.
--   no paid PRO + balance > 0 + no grant   → grant PRO for the whole balance.
--   anything else                          → no-op.
--
-- It NEVER touches Stripe (F4): the only thing it writes is an `entitlements`
-- row and its consumption record.
create or replace function public.gellatti_settle_pro_bonus_v1(
  p_user_id uuid,
  p_now timestamptz default now()
) returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_paid_pro boolean;
  v_grant public.entitlements%rowtype;
  v_consumption public.pro_bonus_consumptions%rowtype;
  v_balance integer;
  v_used integer;
  v_refund integer;
  v_new_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'user_required');
  end if;

  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and e.scope = 'pro'
      and e.source_type = 'paid_subscription'
      and e.status = 'active'
      and e.starts_at <= p_now
      and (e.ends_at is null or e.ends_at > p_now)
  ) into v_paid_pro;

  select * into v_grant from public.entitlements e
  where e.user_id = p_user_id
    and e.scope = 'pro'
    and e.source_type = 'referral_bonus'
    and e.status = 'active'
    and (e.ends_at is null or e.ends_at > p_now)
  order by e.ends_at desc nulls last
  limit 1;

  if v_paid_pro then
    if v_grant.id is null then
      return jsonb_build_object('ok', true, 'reason', 'banked_while_paid_pro',
                                'balance', public.gellatti_pro_bonus_balance_v1(p_user_id));
    end if;

    -- Cut the bonus short and refund the days it did not need to spend.
    select * into v_consumption from public.pro_bonus_consumptions where entitlement_id = v_grant.id;
    if v_consumption.id is not null then
      -- Whole days elapsed, floored: a part-used day is not charged, which
      -- errs in the referrer's favour on a reward they were given.
      v_used := greatest(0, floor(extract(epoch from (p_now - v_consumption.applied_from)) / 86400)::int);
      v_refund := greatest(0, v_consumption.days - least(v_used, v_consumption.days));
      update public.pro_bonus_consumptions
      set refunded_days = v_refund, applied_to = p_now
      where id = v_consumption.id;
    end if;

    update public.entitlements
    set status = 'revoked', revoked_by = 'system:referral_bonus',
        revoke_reason = 'paid_pro_active', ends_at = p_now
    where id = v_grant.id;

    return jsonb_build_object('ok', true, 'reason', 'returned_to_bank',
                              'refundedDays', coalesce(v_refund, 0),
                              'balance', public.gellatti_pro_bonus_balance_v1(p_user_id));
  end if;

  if v_grant.id is not null then
    return jsonb_build_object('ok', true, 'reason', 'bonus_already_active',
                              'endsAt', v_grant.ends_at,
                              'balance', public.gellatti_pro_bonus_balance_v1(p_user_id));
  end if;

  v_balance := public.gellatti_pro_bonus_balance_v1(p_user_id);
  if v_balance <= 0 then
    return jsonb_build_object('ok', true, 'reason', 'nothing_to_activate', 'balance', v_balance);
  end if;

  -- `source_id` is polymorphic by design in 0015. A bonus grant is not owned
  -- by any single reward — it is the bank's — so it points at the user, which
  -- keeps the (user, scope, source_type, source_id) active-uniqueness index
  -- meaningful: one live bonus grant per person.
  insert into public.entitlements (
    user_id, scope, source_type, source_id, starts_at, ends_at, status, granted_by, metadata
  ) values (
    p_user_id, 'pro', 'referral_bonus', p_user_id,
    p_now, p_now + make_interval(days => v_balance), 'active', 'system:referral_bonus',
    jsonb_build_object('bonusDays', v_balance)
  )
  returning id into v_new_id;

  insert into public.pro_bonus_consumptions (user_id, entitlement_id, days, applied_from)
  values (p_user_id, v_new_id, v_balance, p_now);

  return jsonb_build_object('ok', true, 'reason', 'activated',
                            'days', v_balance,
                            'endsAt', p_now + make_interval(days => v_balance),
                            'balance', public.gellatti_pro_bonus_balance_v1(p_user_id));
end;
$$;

revoke all on function public.gellatti_settle_pro_bonus_v1(uuid, timestamptz)
  from public, anon, authenticated;

-- ── the referrer's own view ─────────────────────────────────────────────────
-- Settles first so the numbers a person reads are the numbers that are true —
-- a bank that only updates when a webhook fires would show stale days after a
-- subscription lapsed.
--
-- NO PII: referred people appear as counts and statuses, never as an email or
-- a name.
create or replace function public.gellatti_my_referral_dashboard_v1()
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_code public.user_referral_codes%rowtype;
  v_now timestamptz := now();
  v_grant public.entitlements%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  perform public.gellatti_settle_pro_bonus_v1(v_user, v_now);

  select * into v_code from public.user_referral_codes where user_id = v_user;

  select * into v_grant from public.entitlements e
  where e.user_id = v_user and e.scope = 'pro' and e.source_type = 'referral_bonus'
    and e.status = 'active' and (e.ends_at is null or e.ends_at > v_now)
  order by e.ends_at desc nulls last
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'code', v_code.code,
    'invited', (select count(*) from public.user_referral_attributions
                where referrer_user_id = v_user),
    'rewarded', (select count(*) from public.referral_rewards
                 where referrer_user_id = v_user and status = 'earned'),
    'reversed', (select count(*) from public.referral_rewards
                 where referrer_user_id = v_user and status = 'reversed'),
    'daysEarned', coalesce((select sum(bonus_days) from public.referral_rewards
                            where referrer_user_id = v_user and status = 'earned'), 0),
    'bankDays', public.gellatti_pro_bonus_balance_v1(v_user),
    'activeBonusEndsAt', v_grant.ends_at,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'product', r.product, 'cadence', r.cadence,
        'bonusDays', r.bonus_days, 'status', r.status, 'earnedAt', r.earned_at
      ) order by r.earned_at desc)
      from public.referral_rewards r where r.referrer_user_id = v_user
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.gellatti_my_referral_dashboard_v1() from public, anon;
grant execute on function public.gellatti_my_referral_dashboard_v1() to authenticated;
