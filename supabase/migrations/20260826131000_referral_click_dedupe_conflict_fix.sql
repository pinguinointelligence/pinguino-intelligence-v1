-- partner-link-resolve uses PostgREST ON CONFLICT(dedupe_key). A partial
-- unique index cannot be inferred without its predicate; a normal unique
-- index still permits multiple NULL values and gives the API an exact arbiter.

drop index if exists public.referral_clicks_dedupe_key_uniq;
create unique index referral_clicks_dedupe_key_uniq
  on public.referral_clicks(dedupe_key);
