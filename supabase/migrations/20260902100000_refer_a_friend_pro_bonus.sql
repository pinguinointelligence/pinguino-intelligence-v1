-- ============================================================================
-- REFER A FRIEND — user referrals and the PRO BONUS BANK
-- ============================================================================
-- The regular-user reward lane. It is DELIBERATELY NOT the Affiliate money
-- system and shares none of its tables:
--
--   Affiliate  : partner_codes → referral_attributions → commission_entries
--                → partner_payouts.            Reward = MONEY.
--   Refer a friend: user_referral_codes → user_referral_attributions
--                → referral_rewards → pro_bonus_consumptions → entitlements.
--                                     Reward = PRO DAYS.
--
-- Nothing here writes to commission_entries, commission_adjustments,
-- partner_payouts or partner_rate_profiles. The two lanes meet at exactly one
-- point, and it is a REFUSAL: a purchase that already belongs to a partner
-- attribution can never also mint a user reward (§9 one owner per conversion).
--
-- Owner rules implemented (cited as F1..F9 in code):
--   F1  Referred MONTHLY first purchase → referrer earns +7 PRO bonus days.
--   F2  Referred ANNUAL  first purchase → referrer earns +30 PRO bonus days.
--   F3  FIRST paid purchase only — later renewals of the same referred
--       customer never earn again.
--   F4  Stripe billing is NEVER modified. Bonus days are an entitlement
--       overlay; no subscription date, price or schedule is touched.
--   F5  A referrer who already has PAID PRO does not lose the reward: days
--       sit in the bank and activate when paid PRO would otherwise end.
--   F6  A HOME referrer's days activate immediately as temporary PRO.
--   F7  Failed / unpaid / zero-value payments earn nothing; refunds and
--       disputes reverse the reward.
--   F8  Self-referral is impossible.
--   F9  A late reversal never cuts into access already granted — it offsets
--       the bank, which may go negative until future rewards absorb it.
--
-- Writes are service-role only, exactly like the financial tables: a user can
-- READ their own rows and can call two narrow SECURITY DEFINER functions
-- (mint my code, claim someone's code). They can never mint a reward or edit
-- their own bank.

-- ── entitlements vocabulary ─────────────────────────────────────────────────
-- `referral_bonus` joins the closed source_type set. It is the FOURTH kind of
-- non-Stripe grant, alongside approved_partner / admin_grant /
-- invite_home_trial — all of which already exist precisely so free access
-- never needs a fake zero-price Stripe subscription (locked decision 8).
alter table public.entitlements
  drop constraint if exists entitlements_source_type_check;
alter table public.entitlements
  add constraint entitlements_source_type_check check (source_type in
    ('paid_subscription', 'approved_partner', 'admin_grant', 'invite_home_trial',
     'referral_bonus'));

-- A referral bonus grants PRO and is ALWAYS time-bounded: an open-ended bonus
-- would be a permanent free plan, which is not what a 7-day reward is.
alter table public.entitlements
  drop constraint if exists entitlements_referral_bonus_bounded;
alter table public.entitlements
  add constraint entitlements_referral_bonus_bounded check (
    source_type <> 'referral_bonus'
    or (scope = 'pro' and ends_at is not null)
  );

-- ── user_referral_codes ─────────────────────────────────────────────────────
-- ONE personal link per user (owner §7: "Twój link" — not three campaign
-- codes; that is the Affiliate's tool, not this one).
create table if not exists public.user_referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  code text not null check (code <> ''),
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global, permanent, case-insensitive uniqueness. Permanent (not partial on
-- status) for the same reason partner code aliases are permanent: a retired
-- code that another person could claim would silently redirect someone else's
-- old message to a new owner.
create unique index if not exists user_referral_codes_code_uniq
  on public.user_referral_codes (lower(code));

drop trigger if exists user_referral_codes_touch on public.user_referral_codes;
create trigger user_referral_codes_touch
  before update on public.user_referral_codes
  for each row execute function public.touch_updated_at();

-- ── user_referral_attributions ──────────────────────────────────────────────
-- Who referred whom. One referrer per referred person, FOREVER: the unique
-- index is on referred_user_id alone, so a second claim cannot repoint an
-- existing relationship at a different beneficiary.
create table if not exists public.user_referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  referred_user_id uuid not null unique references auth.users (id) on delete cascade,
  referral_code_id uuid not null references public.user_referral_codes (id),
  claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- F8: self-referral is structurally impossible, not merely refused in code.
  constraint user_referral_no_self check (referrer_user_id <> referred_user_id)
);

create index if not exists user_referral_attributions_referrer_idx
  on public.user_referral_attributions (referrer_user_id);

-- ── referral_rewards ────────────────────────────────────────────────────────
-- The reward ledger. Immutable financial-style facts: bonus_days is never
-- edited after insert; only `status` advances (earned → reversed).
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users (id),
  referred_user_id uuid not null references auth.users (id),
  attribution_id uuid not null references public.user_referral_attributions (id),

  stripe_subscription_id text not null,
  stripe_invoice_id text not null,

  product text not null check (product in ('home', 'pro')),
  cadence text not null check (cadence in ('monthly', 'annual')),
  -- F1/F2: 7 or 30. The CHECK pins the vocabulary so a bad caller cannot
  -- invent a 3650-day reward.
  bonus_days integer not null check (bonus_days in (7, 30)),

  status text not null default 'earned' check (status in ('earned', 'reversed')),
  earned_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text,

  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint referral_rewards_reversed_shape check (
    status <> 'reversed' or (reversed_at is not null and reversal_reason is not null)
  )
);

-- One reward per invoice: a replayed webhook can never double-reward.
create unique index if not exists referral_rewards_invoice_uniq
  on public.referral_rewards (stripe_invoice_id);

-- F3: FIRST PAID PURCHASE ONLY. At most one LIVE reward per referred person;
-- a reversed row leaves the index so a genuine later qualification can still
-- be recorded rather than being blocked forever by a refunded attempt.
create unique index if not exists referral_rewards_first_purchase_uniq
  on public.referral_rewards (referred_user_id)
  where status = 'earned';

create index if not exists referral_rewards_referrer_idx
  on public.referral_rewards (referrer_user_id, status);

drop trigger if exists referral_rewards_touch on public.referral_rewards;
create trigger referral_rewards_touch
  before update on public.referral_rewards
  for each row execute function public.touch_updated_at();

-- ── pro_bonus_consumptions ──────────────────────────────────────────────────
-- Days taken OUT of the bank to create a real PRO grant, and days handed BACK
-- when that grant is cut short because paid PRO started.
--
-- The bank is DERIVED from this table plus the reward ledger; there is no
-- mutable "balance" column anywhere. A counter would be one bad UPDATE away
-- from free PRO for life, and it could not be audited after the fact.
create table if not exists public.pro_bonus_consumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement_id uuid not null references public.entitlements (id) on delete cascade,

  days integer not null check (days > 0),
  -- Returned to the bank when the grant is revoked early (F5): the referrer
  -- keeps the value they earned rather than losing it to an overlap.
  refunded_days integer not null default 0 check (refunded_days >= 0),

  applied_from timestamptz not null,
  applied_to timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pro_bonus_refund_within_grant check (refunded_days <= days)
);

create index if not exists pro_bonus_consumptions_user_idx
  on public.pro_bonus_consumptions (user_id);
create unique index if not exists pro_bonus_consumptions_entitlement_uniq
  on public.pro_bonus_consumptions (entitlement_id);

drop trigger if exists pro_bonus_consumptions_touch on public.pro_bonus_consumptions;
create trigger pro_bonus_consumptions_touch
  before update on public.pro_bonus_consumptions
  for each row execute function public.touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- THE SUPABASE DEFAULT-PRIVILEGES TRAP: this project carries
-- `alter default privileges ... grant all on tables to anon, authenticated`,
-- so a new public table starts with FULL DML for both roles regardless of what
-- this migration grants. Every table below therefore REVOKES first and grants
-- back only SELECT. RLS policies are the real control, and every policy here
-- is `for select` — there is no insert/update/delete policy anywhere, so even
-- with the grant restored by a future default-privileges change, a user still
-- cannot write their own reward.
alter table public.user_referral_codes enable row level security;
alter table public.user_referral_attributions enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.pro_bonus_consumptions enable row level security;

revoke all on public.user_referral_codes from anon, authenticated;
revoke all on public.user_referral_attributions from anon, authenticated;
revoke all on public.referral_rewards from anon, authenticated;
revoke all on public.pro_bonus_consumptions from anon, authenticated;

grant select on public.user_referral_codes to authenticated;
grant select on public.user_referral_attributions to authenticated;
grant select on public.referral_rewards to authenticated;
grant select on public.pro_bonus_consumptions to authenticated;

drop policy if exists user_referral_codes_select_own on public.user_referral_codes;
create policy user_referral_codes_select_own on public.user_referral_codes
  for select using (auth.uid() = user_id);

-- A referrer sees who they referred; the referred person sees their own row.
-- Neither can see anybody else's relationship.
drop policy if exists user_referral_attributions_select_own on public.user_referral_attributions;
create policy user_referral_attributions_select_own on public.user_referral_attributions
  for select using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

-- Only the EARNER reads a reward row. The referred person is not shown what
-- somebody else earned from their purchase.
drop policy if exists referral_rewards_select_own on public.referral_rewards;
create policy referral_rewards_select_own on public.referral_rewards
  for select using (auth.uid() = referrer_user_id);

drop policy if exists pro_bonus_consumptions_select_own on public.pro_bonus_consumptions;
create policy pro_bonus_consumptions_select_own on public.pro_bonus_consumptions
  for select using (auth.uid() = user_id);
