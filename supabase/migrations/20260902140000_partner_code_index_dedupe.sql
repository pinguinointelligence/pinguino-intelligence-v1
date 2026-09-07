-- ============================================================================
-- GELLATTI — remove the DUPLICATE partner_codes uniqueness indexes
-- ============================================================================
-- Found 2026-09-02 while proving G01/G02 of the Growth checklist. Harmless to
-- correctness, but public.partner_codes carried FOUR unique indexes enforcing
-- TWO rules, so every insert and every code/slug update maintained two extra
-- B-trees for nothing.
--
-- Live staging (tunabqqrwabacxjcxxkz) before this migration:
--
--   partner_codes_code_global_uniq       upper(code)     <- KEPT
--   partner_codes_code_permanent_uniq    lower(code)     <- dropped here
--   partner_codes_slug_global_uniq       lower(slug)     <- KEPT
--   partner_codes_slug_permanent_uniq    lower(slug)     <- dropped here
--   partner_codes_partner_idx            partner_id      (untouched)
--   partner_codes_pkey                   id              (untouched)
--
-- ── HOW THE DUPLICATION HAPPENED ────────────────────────────────────────────
-- Two workstreams reached the same conclusion six days apart and neither saw
-- the other's index:
--
--   20260826120000_admin_partner_controlled_catalog  created the `_permanent_`
--     pair, under the heading "Codes are permanent public identifiers ...
--     these all-history indexes prevent retired-code reassignment".
--
--   20260831200000_partner_code_slots_and_alias_ownership  created the
--     `_global_` pair for §8 ALIAS OWNERSHIP — the same rule, restated — and
--     dropped the original `_active_uniq` partials. Its header says uniqueness
--     "becomes GLOBAL across every status", which by then it already was.
--
-- The slug pair is the clearest evidence: both indexes are on `lower(slug)`,
-- byte-identical definitions under two different names.
--
-- ── WHY THE `_global_` PAIR WINS ────────────────────────────────────────────
-- Not seniority — the live runtime probes it by expression:
--
--   gellatti_partner_code_claim_refusal_v1 (current body: 20260831200200)
--     select * into v_holder from public.partner_codes where upper(code) = v_code;
--
--   gellatti_admin_review_partner_application_v1 (current body: 20260831201000)
--     while exists (select 1 from public.partner_codes where upper(code) = upper(v_code))
--     -- carrying the comment "partner_codes_code_global_uniq is case-insensitive"
--
-- Both probes are served by `upper(code)`; neither can use `lower(code)`.
-- `partner_codes_code_global_uniq` is also the name in the workstream's live QA
-- record (REG-03, MASTER_CHECKLIST) and the name its guard test asserts, so it
-- is the index the rest of the repository actually refers to.
--
-- ── UNIQUENESS SEMANTICS ARE UNCHANGED ──────────────────────────────────────
-- Case-insensitive GLOBAL (all-status) uniqueness survives on both columns:
--
--   code  upper(code) alone already refuses any pair of codes differing only by
--         case. `lower(code)` was enforcing the identical partition: every code
--         this application can write is `[A-Z0-9-]`/`[a-z0-9-]` ASCII, checked
--         by the `^[a-z0-9][a-z0-9-]{2,39}$` regex on every write path and by
--         `gellatti_partner_code_claim_refusal_v1`'s `invalid_characters`
--         refusal, and over ASCII upper() and lower() collapse exactly the same
--         rows. (The two functions can diverge on exotic Unicode — upper('ß')
--         is 'SS' under some collations — which would make `upper(code)` the
--         STRICTER of the two. Nothing is loosened either way.)
--
--   slug  the two indexes are literally the same expression, `lower(slug)`, and
--         slug additionally carries `check (slug = lower(slug))` from 0016.
--         Dropping one is a no-op for behaviour.
--
-- ── NOTHING REFERENCES THE DROPPED NAMES ────────────────────────────────────
-- Checked before writing this migration:
--   * no unique/primary-key CONSTRAINT is backed by either index — all four
--     were made with `create unique index`, never `alter table add constraint`,
--     so `drop index` is the correct verb (the pre-flight below re-proves this
--     against the catalog rather than trusting the file history);
--   * no `on conflict` clause anywhere in the repository targets partner_codes
--     at all — every write is a plain `insert ... values` in a SECURITY DEFINER
--     function, so no arbiter inference can break;
--   * the foreign keys into partner_codes (referral_attributions,
--     referral_clicks, partner_content_links, partner_codes.replacement_code_id)
--     all reference `id`, which is backed by partner_codes_pkey;
--   * the only source references to `partner_codes_code_permanent_uniq` are
--     assertions on the TEXT of 20260826120000, which is applied history and is
--     deliberately not edited — they keep passing.

-- ── 0. Pre-flight: refuse to drop unless the survivors are provably enough ──
-- The failure this guards against is dropping the duplicates while the index
-- that carries the rule is missing, invalid, partial or non-unique — which
-- would silently re-open the exact alias-hijack §8 exists to prevent.
do $$
declare
  v_code_oid oid := to_regclass('public.partner_codes_code_global_uniq');
  v_slug_oid oid := to_regclass('public.partner_codes_slug_global_uniq');
  v_def      text;
begin
  if v_code_oid is null or v_slug_oid is null then
    raise exception
      'partner_codes: partner_codes_code_global_uniq and partner_codes_slug_global_uniq must both exist before the duplicates are dropped (found code=%, slug=%). Apply 20260831200000 first.',
      coalesce(v_code_oid::text, 'MISSING'), coalesce(v_slug_oid::text, 'MISSING');
  end if;

  -- UNIQUE, VALID, READY and NOT partial — anything less does not carry the rule.
  if not exists (
    select 1 from pg_catalog.pg_index
    where indexrelid = v_code_oid
      and indisunique and indisvalid and indisready and indpred is null
  ) then
    raise exception
      'partner_codes: partner_codes_code_global_uniq is not a valid, non-partial UNIQUE index — refusing to drop the duplicate. Definition: %',
      pg_catalog.pg_get_indexdef(v_code_oid);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index
    where indexrelid = v_slug_oid
      and indisunique and indisvalid and indisready and indpred is null
  ) then
    raise exception
      'partner_codes: partner_codes_slug_global_uniq is not a valid, non-partial UNIQUE index — refusing to drop the duplicate. Definition: %',
      pg_catalog.pg_get_indexdef(v_slug_oid);
  end if;

  -- Case-INSENSITIVE, not a plain (code)/(slug) index. A bare column index
  -- would leave `QABROWSER-B` claimable next to `qabrowser-b`.
  v_def := pg_catalog.pg_get_indexdef(v_code_oid);
  if v_def !~ 'upper\(\(?code' then
    raise exception
      'partner_codes: partner_codes_code_global_uniq is not case-insensitive — refusing to drop lower(code). Definition: %', v_def;
  end if;

  v_def := pg_catalog.pg_get_indexdef(v_slug_oid);
  if v_def !~ 'lower\(\(?slug' then
    raise exception
      'partner_codes: partner_codes_slug_global_uniq is not case-insensitive — refusing to drop lower(slug). Definition: %', v_def;
  end if;
end $$;

-- ── 1. Drop the redundant pair ──────────────────────────────────────────────
-- Plain DROP INDEX, not CONCURRENTLY: partner_codes holds a handful of rows
-- (16 kB per index) and apply_migration runs inside a transaction, where
-- DROP INDEX CONCURRENTLY is not permitted. The ACCESS EXCLUSIVE lock is held
-- for microseconds.
drop index if exists public.partner_codes_code_permanent_uniq;
drop index if exists public.partner_codes_slug_permanent_uniq;

-- ── 2. Post-check: exactly one case-insensitive unique index per column ─────
do $$
declare
  v_code_n int;
  v_slug_n int;
  v_left   text;
begin
  select count(*) into v_code_n
  from pg_catalog.pg_index i
  where i.indrelid = 'public.partner_codes'::regclass
    and i.indisunique and i.indisvalid and i.indpred is null
    and pg_catalog.pg_get_indexdef(i.indexrelid) ~ '\((upper|lower)\(\(?code';

  select count(*) into v_slug_n
  from pg_catalog.pg_index i
  where i.indrelid = 'public.partner_codes'::regclass
    and i.indisunique and i.indisvalid and i.indpred is null
    and pg_catalog.pg_get_indexdef(i.indexrelid) ~ '\((upper|lower)\(\(?slug';

  select string_agg(c.relname || ' = ' || pg_catalog.pg_get_indexdef(i.indexrelid), E'\n  ')
    into v_left
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c on c.oid = i.indexrelid
  where i.indrelid = 'public.partner_codes'::regclass;

  if v_code_n <> 1 or v_slug_n <> 1 then
    raise exception
      'partner_codes: expected exactly ONE case-insensitive global unique index per column after dedupe, found code=% slug=%. Indexes now: %',
      v_code_n, v_slug_n, v_left;
  end if;

  raise notice 'partner_codes indexes after dedupe: %', v_left;
end $$;

-- ============================================================================
-- ROLLBACK (not applied):
--   create unique index partner_codes_code_permanent_uniq
--     on public.partner_codes (lower(code));
--   create unique index partner_codes_slug_permanent_uniq
--     on public.partner_codes (lower(slug));
-- Reverting restores two indexes that enforce rules `partner_codes_code_global_uniq`
-- and `partner_codes_slug_global_uniq` already enforce. It changes no behaviour;
-- it only reinstates the duplicate write cost.
-- ============================================================================
