-- ============================================================================
-- GELLATTI HOME CREATOR V1 — §12: "Default experience after login" (PRO | HOME)
-- ============================================================================
-- Additive, forward-only, RLS-safe. Nothing is dropped, rewritten or migrated.
--
-- WHY A COLUMN AND NOT A NEW TABLE: this is a 1:1 account attribute with exactly
-- the same ownership and lifetime as `account_profiles`, which already carries
-- `preferred_language` and `notification_prefs` under owner-only RLS
-- (select/insert/update own). A separate table would duplicate that policy
-- surface for one enum and give a second place for the two to disagree.
--
-- WHY NOT "last visited view": §12 is explicit — the login default is a stated
-- SETTING, never inferred from history. Storing the setting is what makes that
-- guarantee checkable; there is deliberately no "last view" column here.
--
-- DEFAULT 'pro' matches the owner default. A HOME-only subscriber never reads
-- this value (the client resolves them to HOME because PRO does not exist for
-- them), so the default is safe for every tier.

alter table public.account_profiles
  add column if not exists default_experience text not null default 'pro';

-- Idempotent CHECK: added only when absent, so re-running is a no-op and no
-- existing constraint is dropped.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.account_profiles'::regclass
      and conname = 'account_profiles_default_experience_check'
  ) then
    alter table public.account_profiles
      add constraint account_profiles_default_experience_check
      check (default_experience in ('home', 'pro'));
  end if;
end $$;

comment on column public.account_profiles.default_experience is
  'GELLATTI HOME §12 — which presentation a PRO subscriber lands in after login. Owner default is ''pro''. This is a STATED SETTING, never the last visited view.';

-- No new grant is required: `account_profiles` already grants
-- select, insert, update to `authenticated`, and the owner-only policies
-- (auth.uid() = user_id) cover the new column unchanged. Explicitly asserted
-- here so a future reader does not "helpfully" add a broader grant.
