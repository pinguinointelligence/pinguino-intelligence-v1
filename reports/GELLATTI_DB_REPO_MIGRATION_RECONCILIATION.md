# GELLATTI — DB ↔ REPOSITORY MIGRATION RECONCILIATION

**Owner acceptance blocker A.** Produced before any migration is applied.
**Staging DB:** project `tunabqqrwabacxjcxxkz`, newest applied version `20260831084154`
**Repo:** `origin/staging` @ `bc915633` · branch `claude/work-with-us`
**Date:** 2026-08-31

---

## 0. Headline

**The drift is real but benign, and it is a NAMING/NUMBERING drift, not a content drift.**

Every migration applied to the staging database corresponds, statement for statement, to a
repository file. Nothing has been applied that does not exist in a branch, and nothing has been
applied whose body differs from its file. What differs is the **version number** the migration is
registered under, because Supabase assigns its own timestamp on `db push` rather than reusing the
filename.

There is therefore **no divergent schema state to repair** — only a bookkeeping mismatch, plus five
migrations that live in an open PR rather than in `origin/staging`.

---

## 1. THE RECONCILIATION TABLE

From the first divergent point (`20260829`) through my new block.

| Semantic migration | Repo filename / version | DB registered version | DB applied? | In `origin/staging`? | Source PR | Required action |
| --- | --- | --- | --- | --- | --- | --- |
| partner application lane | `20260829190000_partner_application_lane` | `20260829173849` | ✅ | ✅ | merged | none |
| franchise inquiry lane | `20260829193000_franchise_inquiry_lane` | `20260829174747` | ✅ | ✅ | merged | none |
| gellatti shop schema | `20260829200000_gellatti_shop` | `20260829175955` *(name `gellatti_shop_schema`)* | ✅ | ✅ | merged | none |
| favorites mapper visibility | `20260829210000_favorites_mapper_visibility` | `20260829183750` | ✅ | ✅ | merged | none |
| **partner application slug fix** | `20260829220000_partner_application_slug_fix` | **— none —** | ⚠️ **applied as a live function replacement, never registered** | ✅ | merged | **none** — see §3 |
| home creator default experience | `20260830100000_home_creator_default_experience` | `20260830150024` | ✅ | ✅ | merged | none |
| community root creator DNA | `20260830110000_community_root_creator_dna` | `20260830151910` | ✅ | ✅ | merged | none |
| community likes/favorites | `20260830120000_community_likes_favorites` | `20260830152019` | ✅ | ✅ | merged | none |
| home community match oracle | `20260830140000_home_community_match_oracle` | `20260830185030` | ✅ | ✅ | merged | none |
| shop: packed grams column | `20260831120000_shop_starter_pack_and_fulfilment` | `20260831073556` | ✅ | ❌ | **PR #49 (open)** | see §2 |
| shop: catalogue reports packed grams | `20260831130000_shop_catalog_packed_grams` | `20260831073641` | ✅ | ❌ | **PR #49 (open)** | see §2 |
| shop: starter pack description | `20260831140000_shop_starter_pack_description` | `20260831073707` | ✅ | ❌ | **PR #49 (open)** | see §2 |
| shop: allergens + fulfilment reads | `20260831150000_shop_allergens_and_fulfilment_reads` | `20260831075320` | ✅ | ❌ | **PR #49 (open)** | see §2 |
| shop: allergen out of prose | `20260831160000_shop_allergen_statement_moved_out_of_prose` | `20260831080735` | ✅ | ❌ | **PR #49 (open)** | see §2 |
| publication carries composition | `20260831090000_publication_full_carries_composition` | `20260831084154` | ✅ | ✅ | merged (`b2650dca`) | none |
| **my eight** | `20260831200000`–`20260831203500` | — | ❌ | ❌ (this branch) | this branch | **hold until §2 resolves** |

### Content verification performed

Not just names — actual bodies:

- `supabase_migrations.schema_migrations.statements` was read for every 2026-08-31 row and compared
  against the corresponding repository file.
- The DB stores **comment-stripped** statements, which explains why every DB body is shorter than
  its file (e.g. 4742 file bytes → 2123 stored, the difference being a comment header).
- The leading statement of each stored migration matches the leading statement of its same-named
  repo file. Verified individually for all five shop migrations and for
  `publication_full_carries_composition`.

**One thing that looked alarming and is not.** The DB migration named
`shop_starter_pack_and_fulfilment` has a body that begins
`alter table public.shop_bundle_items add column ... packed_grams`. That reads like a mismatch, but
the **repository file of the same name contains exactly that ALTER**. PR #49's filenames are simply
assigned loosely relative to their contents — `shop_starter_pack_and_fulfilment.sql` holds the
packed-grams column and `shop_catalog_packed_grams.sql` holds the catalogue function. Confusing to
read, but the DB↔file correspondence is correct and nothing is out of place.

---

## 2. THE FIVE SHOP MIGRATIONS — what to do

**Do not merge PR #49 wholesale.** Per the owner: its functional and visual work follow different
approval paths.

### Schema objects the five actually touch

| Migration | Objects |
| --- | --- |
| packed grams column | `shop_bundle_items.packed_grams` (add column + comment) |
| catalogue packed grams | `gellatti_shop_catalog_v1()` (replace) |
| starter pack description | `shop_products` (one data UPDATE) |
| allergens + fulfilment reads | `shop_products.allergen_statement`, order/fulfilment read functions |
| allergen out of prose | `shop_products` (one data UPDATE) |

**Every one is confined to the `shop_*` namespace.** Verified in both directions:

- none of my eight migrations references any `shop_*` object;
- none of the five references `partner`, `commission`, `payout`, `entitlement` or `referral`.

### Why my eight can be applied without resolving PR #49 first

The dependency graph between the two sets is **empty**. My eight touch partner, billing, email and
lead objects; the five touch shop objects. Applying mine changes nothing the five depend on, and the
five have already changed nothing mine depend on.

The only interaction was the **timestamp collision**, and that is already resolved — my block was
renumbered to `20260831200000`–`20260831203500`, clear of `…120000`–`…160000`.

### Recommended resolution, in order of preference

**Option 1 — land PR #49's migrations only (recommended).**
Cherry-pick the five migration files onto `staging` as a migrations-only commit, leaving the Shop
visual work in PR #49 for its own approval path. This is clean because the five are pure SQL files
with no TSX dependency: nothing in them imports or renders anything. `origin/staging` then describes
the database again, and PR #49 shrinks to the visual work it should be judged on.

**Option 2 — repair the register without moving files.**
Leave the files in PR #49 and accept that `origin/staging` under-describes the database until #49
lands. Safe for my eight (no interaction), but the drift persists and the next person to run
`supabase db reset` from `origin/staging` gets a database that is missing the shop changes.

**Option 3 — do nothing and block everything.**
Not recommended: it holds partner/billing work hostage to an unrelated Shop review, for a conflict
that has already been shown not to exist.

**My recommendation is Option 1**, and it is a decision for the owner, not for me — it moves commits
between branches.

---

## 3. The unregistered slug fix — not a problem, and why

`20260829220000_partner_application_slug_fix.sql` exists in `origin/staging` but appears **nowhere**
in the migration register.

Its own header explains why: the fix was applied directly to the live function the moment it was
found, and the file exists so the recorded history matches reality. So the live function is correct
and the register simply never saw it.

**Why this matters to migration #3 of mine**, which re-declares the same function
(`gellatti_admin_partner_application_action_v1`): I based my re-declaration on the slug-fix version,
so the fix is carried forward either way.

| Path | Order | Result |
| --- | --- | --- |
| On staging (fix live, unregistered) | live function → my `create or replace` | slug fix intact |
| Fresh `supabase db reset` | lane → slug fix → mine | slug fix intact, mine last |

Both converge. Nothing to repair.

---

## 4. Determinism check

The question the owner asked — can repository authority and database state be reconciled
**deterministically**? Yes, with one caveat:

- **Deterministic by name.** Every applied migration maps 1:1 to a repository file by `name`, and
  every body matches. A name-based comparison is exact.
- **NOT deterministic by version.** The register's timestamps are assigned at push time and differ
  from filenames for 9 of the 15 rows examined. Any tooling that compares by version will report
  false drift.

**Recommendation:** whatever check is used before future applies should compare by `name`, not by
`version`. The §5 script below does that.

---

## 5. Pre-apply verification script

Run before applying anything, and expect zero rows from the first query:

```sql
-- Any repo migration name NOT registered? (expects only the slug fix, explained in §3)
-- Paste the repo names as a VALUES list; compare by NAME, never by version.
select name from supabase_migrations.schema_migrations
where version >= '20260829000000' order by version;

-- Confirm my eight are absent before the apply
select count(*) as should_be_zero from supabase_migrations.schema_migrations
where version >= '20260831200000';

-- Confirm the shop objects the five created are present (proves the DB really has that work)
select
  (select count(*) from information_schema.columns
    where table_name = 'shop_bundle_items' and column_name = 'packed_grams') as packed_grams_column,
  (select count(*) from information_schema.columns
    where table_name = 'shop_products' and column_name = 'allergen_statement') as allergen_column;
```

---

## 6. Change log

| Date | What |
| --- | --- |
| 2026-08-31 | Created for owner acceptance blocker A. All 2026-08-29 → 2026-08-31 migrations reconciled by name AND by stored statement body. Drift confirmed as numbering-only, not content. Five shop migrations located in open PR #49, proven to share zero objects with this workstream in both directions. Three resolution options given, Option 1 recommended, decision left with the owner |
