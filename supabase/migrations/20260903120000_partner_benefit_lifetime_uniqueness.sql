-- ============================================================================
-- PARTNER 15-MONTH BENEFIT — the LIFETIME rule becomes a DB invariant
-- ============================================================================
-- 0017 gave `partner_benefit_uses` hard unique constraints on subscription_id
-- and stripe_subscription_id, which make double-granting impossible FOR ONE
-- SUBSCRIPTION. The domain authority is stricter than that:
--
--   src/billing/domain/attribution.ts — decideFifteenMonthBenefit
--     evidence.userHadPriorBenefit → { granted: false, reason:
--     'rebuy_not_eligible' }   // "A8: lifetime, not per subscription"
--
-- So the benefit is once per USER, for ever — and a user legitimately owns
-- many subscription rows over time (cancel, rebuy, monthly then annual).
-- Between those two facts the lifetime half was enforced only by reading
-- `userHadPriorBenefit` and then inserting, which is a TOCTOU race: two
-- concurrent eligible annual conversions on DIFFERENT subscriptions both read
-- "no prior benefit" and both insert. Neither existing constraint sees it,
-- because neither subscription id collides.
--
-- WHY user_id ALONE IS THE RIGHT KEY HERE, and not (user_id, benefit_kind):
-- this table is not a general benefit ledger. 0017 defines it as "the 15-month
-- benefit is single-use (§14.10) — One row per CONSUMED benefit", it carries no
-- kind/type discriminator, and every column describes that one benefit. A
-- future, different partner benefit would need its own column or its own table
-- anyway; at that point this constraint is replaced deliberately rather than
-- having been pre-weakened for a benefit nobody has specified.
--
-- Not partial, matching 0017's reasoning: there is no state that ever frees a
-- use up again. A row here means the lifetime benefit is spent.
--
-- SAFE TO APPLY: partner_benefit_uses holds 0 rows (staging, 2026-09-03), and
-- the writer that would fill it does not exist yet — this lands before the
-- first grant can ever happen, so no historical row can violate it.

alter table public.partner_benefit_uses
  drop constraint if exists partner_benefit_uses_user_lifetime_key;

alter table public.partner_benefit_uses
  add constraint partner_benefit_uses_user_lifetime_key unique (user_id);

comment on constraint partner_benefit_uses_user_lifetime_key
  on public.partner_benefit_uses is
  'A8 lifetime rule as a DB invariant: one 15-month partner benefit per user, '
  'ever. The per-subscription uniques from 0017 cannot express this because a '
  'user owns many subscriptions over time. Claiming the benefit is therefore an '
  'INSERT whose unique violation is the authoritative "someone already won the '
  'race" answer — never a read-then-write.';
