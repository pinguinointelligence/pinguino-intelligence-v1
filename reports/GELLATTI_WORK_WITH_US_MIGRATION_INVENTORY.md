# GELLATTI — WORK WITH US · MIGRATION INVENTORY

**Owner acceptance point 1.** Produced before asking anyone to apply anything.
**Branch:** `claude/work-with-us` · **Rebased onto:** `origin/staging` @ `bc915633`
**Staging DB checked live:** project `tunabqqrwabacxjcxxkz`, latest applied version `20260831084154`
**Date:** 2026-08-31

---

## 0. Corrections to what I said last report

Three things I stated were wrong, and the owner was right to hold the apply.

| I said | Actually |
| --- | --- |
| "six migrations `20260831120000 … 20260831180000`" | **Seven.** The range holds seven slots and all seven are mine. |
| implied `20260831120000` was outside this set | It **is** mine — the partner-code work from earlier in the same branch. |
| implied the branch was current | The branch was **8 commits behind** `origin/staging`. A migration appeared "deleted" purely because of that. Now rebased; nothing was ever deleted. |

And the check the owner asked for found a fourth problem that neither of us had listed — see §2.

---

## 1. THE INVENTORY

All seven are **additive**. None is applied. None conflicts after the renumber in §2.

| # | Timestamp | Filename | Purpose | Depends on | Already applied? | Conflict? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `20260831200000` | `partner_code_slots_and_alias_ownership.sql` | §8 X2+X3: code uniqueness becomes global; 3-slot ceiling | `0016_partner_program` (partner_codes) | **No** | None |
| 2 | `20260831200500` | `partner_rate_profiles.sql` | §11: per-partner versioned Elite rates; adds `commission_entries.rate_profile_version_id` | `0016`, `0018_commission_ledger` | **No** | None |
| 3 | `20260831201000` | `partner_application_more_information.sql` | §6: adds `more_information_needed`; **fixes the `in_review` bug** | `partner_application_lane`, `partner_application_slug_fix` | **No** | None — see §3 |
| 4 | `20260831201500` | `email_jobs.sql` | §1–§3: persisted email jobs, idempotent claim, Admin read | none (new table) | **No** | None |
| 5 | `20260831202000` | `partner_tier_snapshot_writer.sql` | §10: monthly Gold snapshot writer + catch-up | #2 (elite profile), `0018` (`partner_tier_snapshots`) | **No** | None |
| 6 | `20260831202500` | `payout_execution.sql` | §14: eligibility, batch, claim, settle, reconcile, **live kill switch** | `0018`, `0019_payouts` | **No** | None |
| 7 | `20260831203000` | `partner_scheduling.sql` | pg_cron invocation + `partner_job_runs` + Admin read | #5, #6 | **No** | None |

**Apply strictly in this order.** #5 references #2's table; #7 references #5 and #6.

### Verification performed

- **No duplicate timestamps among the seven** — verified by sorting the basenames.
- **Not applied** — the live `supabase_migrations` table's newest version is `20260831084154`; every one of the seven is later and absent.
- **No collision with `origin/staging`** — the only migration added to staging since my base was `20260831090000_publication_full_carries_composition`, which is now in my branch via the rebase.
- **No collision with any open PR** — all four open PR branches scanned (§2).

---

## 2. 🔴 THE PROBLEM THE OWNER'S CHECK CAUGHT — five timestamp collisions

`claude/shop-final` (**PR #49**, open) contains five migrations occupying **exactly** the timestamps my first five used:

| Timestamp | PR #49 | Mine (before renumber) |
| --- | --- | --- |
| `20260831120000` | `shop_starter_pack_and_fulfilment` | `partner_code_slots_and_alias_ownership` |
| `20260831130000` | `shop_catalog_packed_grams` | `partner_rate_profiles` |
| `20260831140000` | `shop_starter_pack_description` | `partner_application_more_information` |
| `20260831150000` | `shop_allergens_and_fulfilment_reads` | `email_jobs` |
| `20260831160000` | `shop_allergen_statement_moved_out_of_prose` | `partner_tier_snapshot_writer` |

Merging both branches would have put five pairs of identically-timestamped migrations in one directory. Ordering would then depend on filename sort within the same timestamp — undefined for our purposes, and impossible to reason about later.

**PR #49 has precedence:** its work is already applied to the staging database (as versions `20260831073556`–`20260831080735`), so those timestamps are effectively spoken for.

**Resolution: my seven were renumbered** into `20260831200000`–`20260831203000`, a block clear of everything in every open branch. Every test reference and in-file comment was updated with them; a repo-wide scan confirms no stale reference to the old numbers remains.

### Open-PR scan (all four branches)

| Branch | Migrations in the 2026-08-30/31 window | Overlaps my new block? |
| --- | --- | --- |
| `claude/shop-final` | 5 shop migrations at `…120000`–`…160000` | **No** |
| `claude/home-adopted-recipe-race` | only migrations already on staging | No |
| `claude/v21-label-tokens` | only migrations already on staging | No |
| `claude/v21-served-evidence` | none | No |

---

## 3. Two pre-existing facts worth recording

Neither is caused by this workstream, and neither blocks it. Both are things an operator should know.

### 3.1 The staging DB is ahead of the staging branch

Five migrations are **applied to the staging database but absent from `origin/staging`**:
`shop_starter_pack_and_fulfilment`, `shop_catalog_packed_grams`, `shop_starter_pack_description`,
`shop_allergens_and_fulfilment_reads`, `shop_allergen_statement_moved_out_of_prose`.

They live in the open PR #49. So the database already carries work the branch does not. That is normal for an in-flight PR applied early, but it means **`origin/staging` alone does not describe the staging database.** Nothing in my seven touches shop tables, so there is no interaction.

### 3.2 Applied *versions* do not match repo *filenames*

The migration table records different timestamps from the filenames for the same logical migration:

| Repo filename | Applied version |
| --- | --- |
| `20260829190000_partner_application_lane` | `20260829173849` |
| `20260829193000_franchise_inquiry_lane` | `20260829174747` |
| `20260829200000_gellatti_shop` | `20260829175955` (`gellatti_shop_schema`) |
| `20260830100000_home_creator_default_experience` | `20260830150024` |

So a name-based comparison is the only reliable way to tell what is applied. A timestamp-based one gives false answers.

**And one repo migration is not registered at all:** `20260829220000_partner_application_slug_fix.sql` appears nowhere in the migration table. Its own header explains why — the fix was applied directly to the live function as soon as it was found, and the file exists so the recorded history matches reality.

**Why that matters to migration #3 of mine:** it re-declares
`gellatti_admin_partner_application_action_v1`, and I based the re-declaration on the slug-fix
version, so the slug fix is carried forward. Both paths converge correctly:

- **On staging** (slug fix live but unregistered) → my `create or replace` supersedes the live function, slug fix intact.
- **On a fresh `db reset`** (all files replayed in order) → lane → slug fix → mine. Mine is last and wins, slug fix intact.

---

## 4. What each migration needs before it is applied

| # | Precondition | If unmet |
| --- | --- | --- |
| 1 | No two `partner_codes` rows share a code or slug | The migration **refuses to run** and names the offending codes. It will not guess which partner keeps a code, because that decision moves money. |
| 2–7 | None beyond the ordering above | — |

Migration 1 is the only one that can refuse. That refusal is deliberate.

---

## 5. Post-apply verification the owner can run

```sql
-- 1. all seven registered
select version, name from supabase_migrations.schema_migrations
where version >= '20260831200000' order by version;

-- 2. the live payout gate is CLOSED (must return false)
select live_payouts_released from public.payout_release_state;

-- 3. the cron jobs exist
select jobname, schedule from cron.job where jobname like 'gellatti-partner-%';

-- 4. no partner exceeds three active codes (must return zero rows)
select partner_id, count(*) from public.partner_codes
where status = 'active' group by partner_id having count(*) > 3;

-- 5. the application status constraint carries the new state
select pg_get_constraintdef(oid) from pg_constraint
where conname = 'partner_applications_status_check';
```

---

## 6. Change log

| Date | What |
| --- | --- |
| 2026-08-31 | Created for owner acceptance point 1. Corrected the "six" miscount to seven; rebased the branch off a stale base; **found and resolved five timestamp collisions with open PR #49** by renumbering into `20260831200000`–`20260831203000`; recorded the staging DB/branch drift and the filename-vs-version mismatch |
