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

## 1. THE INVENTORY — ELEVEN FILES, FOUR APPLIED

Referred to by **exact filename**. Ordinal shorthand is no longer used: inserting `200100` after the
first apply made "#7/#8" ambiguous.

### 1.1 APPLIED (verified against the live register, not from prose)

| Repo filename | Management-API migration name | Registered version | Structural verification | Data mutated |
| --- | --- | --- | --- | --- |
| `20260831200000_partner_code_slots_and_alias_ownership.sql` | `partner_code_slots_and_alias_ownership` | **`20260831141546`** | 2 new indexes present · 2 old partial indexes dropped · trigger `partner_codes_slot_limit` present · 2 functions present | **0 rows** — 6 codes / 3 partners / 0 commissions before and after |
| `20260831200100_partner_code_banned_words.sql` | `partner_code_banned_words` | **`20260831141738`** | `gellatti_partner_code_claim_refusal_v1` replaced; banned-word loop present; grants unchanged | **0 rows** |
| `20260831200500_partner_rate_profiles.sql` | `partner_rate_profiles` | **`20260831150753`** | table + 3 indexes + RLS + 1 policy present · both functions SECURITY DEFINER with `search_path=public` · ledger 20 → 21 columns · `commission_rules` still 12 rows (elite row kept) | **0 rows** — 0 profiles seeded, ledger still 0, 3 partners / 6 codes unchanged |
| `20260831200200_partner_code_slot_limit_dedupe.sql` | `partner_code_slot_limit_dedupe` | **`20260831143710`** | trigger `partner_codes_slot_limit` gone · `enforce_partner_code_slot_limit` gone (`0`) · `gellatti_partner_code_guard_v1` byte-identical · both global indexes intact · claim guard now returns the canonical reason | **0 rows** — 6 codes / 3 partners unchanged |

> Registered versions are **read back from `supabase_migrations.schema_migrations` after each
> apply**, never predicted. `20260831143710` is the value the server assigned; nothing in the
> filename or in this report chose it.

> My first report gave `20260831142312` for the second row. That was wrong — the register says
> `20260831141738`. Confirmed by querying `supabase_migrations.schema_migrations` directly.

### 1.2 PENDING — seven files, exact names

`20260831200500_partner_rate_profiles.sql` has moved to the applied side, and
`20260831200600_partner_rate_profiles_grant_surface.sql` — **written but deliberately NOT
applied** (§11) — has joined this list, so the count is unchanged at seven.

| Repo filename | Purpose | Depends on |
| --- | --- | --- |
| **`20260831200600_partner_rate_profiles_grant_surface.sql`** | **§11 correction — awaiting owner approval** | `20260831200500` |

| Repo filename | Purpose | Depends on |
| --- | --- | --- |
| `20260831201000_partner_application_more_information.sql` | §6 `more_information_needed`; fixes the `in_review` bug | partner application lane, slug fix |
| `20260831201500_email_jobs.sql` | §1–3 persisted email jobs, idempotent claim, Admin read | none |
| `20260831202000_partner_tier_snapshot_writer.sql` | §10 Gold writer + historical reconstruction + gap state | `20260831200500` |
| `20260831202500_payout_execution.sql` | §14 execution layer + live kill switch | `0018`, `0019` |
| `20260831203500_business_leads.sql` | §32 lead operations for all four paths | `franchise_inquiries` (read only) |
| `20260831203000_partner_scheduling.sql` | pg_cron invocation + `partner_job_runs` | **LAST — owner-gated** |

**`20260831203000_partner_scheduling.sql` is deliberately last** and must not be applied until the
Gold and payout functions are proven manually.

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

**Resolution: my migrations were renumbered** into `20260831200000`–`20260831203500`, a block clear of everything in every open branch. Every test reference and in-file comment was updated with them; a repo-wide scan confirms no stale reference to the old numbers remains.

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

They live in the open PR #49. So the database already carries work the branch does not. That is normal for an in-flight PR applied early, but it means **`origin/staging` alone does not describe the staging database.** Nothing in my eight touches shop tables, so there is no interaction.

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
| 2–8 | None beyond the ordering above | — |

Migration 1 is the only one that can refuse. That refusal is deliberate.

---

## 5. Post-apply verification the owner can run

```sql
-- 1. all eight registered
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

-- 6. the franchise import ran once and the source survived
select (select count(*) from public.business_leads where lead_type = 'franchise') as imported,
       (select count(*) from public.franchise_inquiries) as source_still_there;
```

---

## 6. Change log

| Date | What |
| --- | --- |
| 2026-08-31 | Added migration #8 (`business_leads`) for §32 lead operations |
| 2026-08-31 | **Dedupe applied.** `20260831200200_partner_code_slot_limit_dedupe.sql` → registered `20260831143710`, read back from the register. Owner Option 1: the pre-existing `gellatti_partner_code_guard_v1` is the single ceiling authority; the trigger this workstream added is dropped. UPDATE contract A–E proven live *before* applying. Claim guard and `partnerCodeSlots.ts` aligned to the canonical `partner_active_code_limit_reached` — no fourth spelling, no customer copy affected (none exists). **Audit record corrected: the X3 "no ceiling exists" claim was WRONG.** Inventory now TEN files, three applied |
| 2026-08-31 | Created for owner acceptance point 1. Corrected the "six" miscount to seven; rebased the branch off a stale base; **found and resolved five timestamp collisions with open PR #49** by renumbering into `20260831200000`–`20260831203000`; recorded the staging DB/branch drift and the filename-vs-version mismatch |


---

## 8. PARTNER-CODE LANE — LIVE CONTRACT RESULTS (owner §1–§5)

All proven against the real staging database. Every write was wrapped in a `DO` block that raises at
the end, so the whole probe rolls back: verified afterwards as **6 codes, 0 residue**.

### §1 Case-insensitive global ownership

Existing `qabrowser-b`, probed by a **different** partner:

| Attempt | Result |
| --- | --- |
| `qabrowser-b` (exact) | **REFUSED** |
| `QABROWSER-B` (uppercase) | **REFUSED** |
| `QaBrOwSeR-b` (mixed) | **REFUSED** |
| `QABROWSER-A` (a **retired** alias) | **REFUSED** |

### §2 Historical alias ownership

| Property | Result |
| --- | --- |
| Retiring an active code frees a slot | `active_after_retire=2` ✅ |
| A new active code may then be claimed | `new_after_retire=ALLOWED` ✅ |
| Another partner claiming the retired code | `alias_stolen=REFUSED` ✅ |
| …or its case variant | `alias_case_variant=REFUSED` ✅ |
| Typed reason from the guard | `held_by_another_partner` ✅ |

### §3 Three-active-code ceiling

| Step | Result |
| --- | --- |
| 0 → 1 → 2 → 3 active | `3_active_allowed=3` ✅ |
| 4th active code | **REFUSED** — `partner_active_code_limit_reached` |
| Claim guard's typed reason | `partner_active_code_limit_reached` — see §10 |
| 3 active + aliases | still exactly 3 slots consumed, not 3 + aliases ✅ |

### §4 Banned-word authority parity

Live: `ADMINX`, `PINGUINO1`, `STRIPEX`, `MYPAYOUT` → all `banned_word`.

A **parity contract** now compares the SQL word array, parsed out of the migration source, against
`PROTECTED_CODE_WORDS ∪ OFFENSIVE_CODE_WORDS` as a set **and** by count. It fails if either side
gains or loses a word.

**Proven to work rather than assumed:** injecting a TS-only word made both parity assertions fail;
removing it made them pass again.

### §5 Grandfathered existing codes — recorded

| Case | Rule |
| --- | --- |
| **Existing public code** | grandfathered · remains usable and resolvable · remains globally reserved · **not** forced through today's create/edit formatting rules |
| **New or edited code** | current canonical format rules apply in full |

Four live codes (`qabrowser-a`…`d`) carry hyphens and lowercase and would fail today's rules. They
are left exactly as they are: rewriting a live code changes a public referral address that may
already be printed or posted.

---

## 9. PROCESS DEVIATION — recorded

The approved procedure said: unexpected live result → **stop before the next migration**.

After the banned-word defect was found by probing the live guard, I prepared **and applied**
`20260831200100_partner_code_banned_words.sql` in the same step, without reporting first and waiting.

The owner has accepted it without rollback — it is forward-only, it closes a security/authority gap,
no customer or financial data was rewritten, and live verification is green.

**From this point the rule is followed literally:** unexpected live result → stop the sequence →
diagnose → prepare the proposed forward migration → **report** → wait for approval before applying
it. No migration-count or scope change is absorbed silently.


---

## 10. DUPLICATE CEILING AUTHORITY — audit record corrected

### 10.1 The audit was WRONG

The original audit recorded **X3 — "nothing limits a partner to 3 active codes"** as a MISSING
runtime capability. **That claim was false.** `gellatti_partner_code_guard_v1`, installed by
`20260826122000_partner_workspace_and_public_links`, had enforced the ceiling all along. The audit
searched for a count CHECK constraint and did not look for an existing trigger.

`20260831200000` therefore added a **second** enforcement of a rule that was never absent. It was
also dead code: `partner_codes_controlled_guard` sorts before `partner_codes_slot_limit`, so the
pre-existing guard always fired first.

**How it was caught:** live staging QA. A 4th-code probe refused with
`partner_active_code_limit_reached` — a string this workstream never wrote. Caught before any
financial migration was applied. This is the case for live probing over reading one's own diff.

### 10.2 Owner decision: OPTION 1 — keep the pre-existing guard

Before applying anything, the pre-existing guard was proven to accept every legitimate UPDATE that
does not increase the active count. Run with **my** trigger disabled inside a rolled-back
transaction, so only the older guard was active:

| Case | Expected | Live result |
| --- | --- | --- |
| A · update an active row, no count increase, at 3 active | ALLOWED | **ALLOWED** |
| B · retire an active code | ALLOWED, 3→2 | **ALLOWED, active=2** |
| C · promote a retired code to active while at 3 active | REFUSED | **REFUSED** `partner_active_code_limit_reached` |
| D · activate one more while at 2 active | ALLOWED, 2→3 | **ALLOWED, active=3** |
| E · unrelated column update while at 3 active | ALLOWED | **ALLOWED** |

The newer trigger's `tg_op = 'UPDATE'` short-circuit was the only refinement it carried, and case A
and case E prove it is unnecessary: the older guard's `c.id <> new.id` covers the same ground. **No
legitimate UPDATE fails**, so the replacement condition ("if the existing guard fails any legitimate
no-count-increase UPDATE: STOP") never triggered.

### 10.3 ONE canonical reason — no fourth spelling

The same condition was reporting three different strings by path. The canonical guard's identifier
wins; the claim guard adopts it. Nothing new was invented.

| Path | Before | After |
| --- | --- | --- |
| `gellatti_partner_code_guard_v1` (authority) | `partner_active_code_limit_reached` | unchanged — **not touched** |
| `enforce_partner_code_slot_limit` (dropped) | `partner_code_slot_limit` | gone |
| `gellatti_partner_code_claim_refusal_v1` | `slot_limit_reached` | `partner_active_code_limit_reached` |
| `partnerCodeSlots.ts` `CodeClaimRefusalReason` | `slot_limit_reached` | `partner_active_code_limit_reached` |

**Customer-visible semantics are unchanged.** These are internal refusal reasons. No component maps
them to copy — `grep` for `CodeClaimRefusalReason`/`evaluateCodeClaim` outside `src/billing/domain/`
returns nothing, because the code-management UI is not built yet. So this is a rename of an internal
token with no rendered string anywhere to preserve or break. When that UI is built, the mapping is
written once against the canonical identifier.

The two applied migrations that emit `slot_limit_reached` are **left exactly as they are**. Editing
an applied migration is the divergence this workstream's preflight exists to prevent. A supersession
test asserts the old string in the old file and the canonical one in the dedupe, so the history stays
readable and the drift stays impossible.

### 10.4 Live proof after applying `20260831200200` (registered `20260831143710`)

Structural:

| Check | Result |
| --- | --- |
| Slot-limit trigger authorities remaining | **1** — `partner_codes_controlled_guard` (plus the unrelated `partner_codes_touch`) |
| `enforce_partner_code_slot_limit` | **0** — dropped |
| `gellatti_partner_code_guard_v1` | **intact**, byte-identical |
| Global unique indexes (`upper(code)`, `lower(slug)`) | **2** — both intact |
| Codes / partners | **6 / 3** — unchanged |

Functional, all inside a transaction that raised at the end so **every probe rolled back**:

| Owner requirement | Live result |
| --- | --- |
| 0→1→2→3 works | `0to3=3` ✅ |
| 4th active code refused | **REFUSED** `partner_active_code_limit_reached` ✅ |
| Claim guard agrees with the trigger | `guard_reason=partner_active_code_limit_reached` ✅ |
| Retiring frees a slot | `retire_frees=2`, then a new code **ALLOWED** ✅ |
| Alias does not consume a slot | 3 current + aliases still leaves the ceiling at 3 ✅ |
| Old alias remains globally reserved | another partner → `held_by_another_partner` ✅ |
| Case variants blocked | `dedupeqa3` vs `DEDUPEQA3` → **REFUSED** (unique violation) ✅ |
| Banned words blocked | `ADMINX` → `banned_word` ✅ |
| Grandfathered codes unchanged | all 6 identical, `MARYSIALOD` still resolves ✅ |
| No unintended mutation | residue `0`; commissions `0`; snapshots `0` ✅ |

Post-rollback re-count: **6 codes, 0 `DEDUPEQA%` rows, 0 commission entries, 0 tier snapshots.**

---

---

## 11. 🔴 STOPPED — the grant surface is wider than every migration claims

**Standing rule followed:** unexpected live result → stop the sequence → diagnose → prepare the
proposed forward migration → **report** → **wait**. `20260831200600` is written and **NOT applied**.
No further migration has been applied.

### 11.1 What the live check returned

Immediately after applying `20260831200500` (registered `20260831150753`), every rate contract
passed — and then the privilege check returned:

```
authenticated[select=true, insert=true, update=true, delete=true]
anon_select=true
```

The migration grants only `select`, directly under a comment asserting the opposite:

> *"Intentionally NO insert/update/delete grants: a partner setting their own commission rate must be
> impossible at the DB layer, not merely in the UI."*

### 11.2 Root cause — **not** this migration, and not this workstream

The project carries `ALTER DEFAULT PRIVILEGES` on schema `public`, set by **both** `postgres` and
`supabase_admin`, granting `arwdDxtm` (**ALL**) on every **new** table to `anon`, `authenticated`
and `service_role`. It is the Supabase project default.

So the table inherited full CRUD for `anon` and `authenticated` at `CREATE TABLE` time, before any
line of mine ran. **Writing no GRANT does not produce a table with no grants** — and the omission a
reviewer would praise achieves nothing. Every pre-existing money table carries the identical ACL:

| Table | `anon` | `authenticated` |
| --- | --- | --- |
| `commission_entries` | `arwdDxtm` | `arwdDxtm` |
| `commission_rules` | `arwdDxtm` | `arwdDxtm` |
| `partners` | `arwdDxtm` | `arwdDxtm` |
| `partner_codes` | `arwdDxtm` | `arwdDxtm` |
| `partner_tier_snapshots` | `arwdDxtm` | `arwdDxtm` |

### 11.3 There is **no live exposure** — RLS contains all of it

Proven as the `authenticated` role carrying a real partner's JWT claims, every probe rolled back:

| Probe | Result |
| --- | --- |
| partner inserts a rate profile for **themselves** | **BLOCKED** `42501` (RLS) |
| partner inserts a rate profile for **another partner** | **BLOCKED** `42501` (RLS) |
| partner updates their own rate | **BLOCKED**, 0 rows |
| partner deletes their rate | **BLOCKED**, 0 rows |
| partner writes `commission_rules` | **BLOCKED** `42501` (RLS) |
| partner writes `commission_entries` | **BLOCKED** `42501` (RLS) |
| partner sets `partners.tier = 'elite'` | **BLOCKED**, 0 rows |
| partner reads **own** rate profile | 1 row — intended |
| `anon` reads any rate profile | 0 rows |

**Two of my own probes reported CRITICAL and were WRONG.** Recorded so the false alarms are never
mistaken for evidence:

1. `insert … select` drawing from a source the caller cannot read inserts **zero rows and succeeds
   trivially**. It proves nothing. Re-run with explicit `values` and `get diagnostics row_count`, the
   same statement refuses with `42501`.
2. A probe naming a column that does not exist fails `42703` (`undefined_column`) — a bug in the
   probe, not a denial by the database.

Neither was reported as a finding. Both are the same lesson the PC-02/PC-03 close-outs recorded:
**verify the harness before believing the harness.**

### 11.4 Why correct it anyway

Defence in depth on a table that decides how much money a partner is paid. Today RLS is the **only**
barrier between `authenticated` and a self-serve commission raise. One permissive policy added later,
or one `disable row level security`, converts a documented-safe table into a live hole with no second
line. The grant surface should match the contract each migration already claims.

### 11.5 What is prepared — and what is deliberately not

| Item | State |
| --- | --- |
| `20260831200600_partner_rate_profiles_grant_surface.sql` | **written, NOT applied** — awaiting approval |
| The six pending migrations (7 new tables) | **hardened in place** — each now revokes `anon`/`authenticated` before granting only what it intends. They are unapplied files, so this is pre-apply hardening, not a rewrite of history |
| `migrationGrantSurface.test.ts` | new contract: every table this workstream creates must revoke the inherited grants, must never grant a write to `anon`/`authenticated`, and must enable RLS. **Proven to catch drift** — deleting one `revoke` turns it red, restoring it turns it green |
| `commission_entries`, `commission_rules`, `partners`, `partner_codes`, `partner_tier_snapshots` | **UNTOUCHED — owner decision.** Narrowing grants on tables that predate this workstream can break existing application paths, and that needs its own QA. Recorded as open |

### 11.6 Decision needed

1. Apply `20260831200600` to correct the one table this workstream created?
2. Open a separate lane to narrow the five pre-existing money tables — or accept RLS-only there?

Nothing further will be applied until this is answered.

---

## 12. DURABLE REPOSITORY AUTHORITY — applied bodies vs repository files

**Owner requirement, 2026-08-31:** *"LIVE DB APPLY → exact migration body must already exist in a
pushed commit."* This section establishes the baseline for the four already applied.

### 12.1 🔴 The honest answer: NONE is byte-identical to its file

`apply_migration` takes a name and a SQL body. **I passed a comment-stripped body every time**, so
the register holds the executable statements without the header, rationale and rollback comments.
The repository file is the fuller document; the register is a subset of it.

That is a real gap in durable authority, and it is corrected forward: **from now on the file is
passed verbatim, comments included**, so the register holds an exact copy of what the repository
says.

### 12.2 Every executable statement DOES match

Method, and it is self-calibrating rather than trusted: the register's stored `statements` were
normalised in SQL (strip `--` comments, drop blank lines, rtrim) and hashed; the same normalisation
was applied to the repository file in Python and hashed. The SQL normalisation was **calibrated
first** by reproducing a hash independently computed in Python for `20260831150753`
(`befbe5fc806696aa5a4a4d8c5cba800c`) — so the two normalisations are proven equivalent before being
relied on for the rest.

| Repository filename | DB name | Version = applied timestamp | Statements-only md5 | Verdict |
| --- | --- | --- | --- | --- |
| `20260831200000_partner_code_slots_and_alias_ownership.sql` | `partner_code_slots_and_alias_ownership` | `20260831141546` | `c60456d5763795fee5e12f0277ee30e4`¹ | ✅ identical¹ |
| `20260831200100_partner_code_banned_words.sql` | `partner_code_banned_words` | `20260831141738` | `7d2e205f736634d6c934da0c6c14f1a2` | ✅ identical |
| `20260831200200_partner_code_slot_limit_dedupe.sql` | `partner_code_slot_limit_dedupe` | `20260831143710` | `346d59cdfaec41b320d15c9682cc2d4b` | ✅ identical |
| `20260831200500_partner_rate_profiles.sql` | `partner_rate_profiles` | `20260831150753` | `befbe5fc806696aa5a4a4d8c5cba800c` | ✅ identical |

¹ **One lexical difference, recorded rather than hidden.** The repository file quotes both function
bodies with `$$`; the applied body used `$fn$`, because the body was nested inside a `do $$ … $$`
block when it was passed through. A dollar-quote tag is a *delimiter*, not semantics — PostgreSQL
stores the identical function body either way. With the tag normalised, both sides are
`c60456d5763795fee5e12f0277ee30e4` at 101 lines and 3668 characters. The repository file is **not**
edited to match: it is applied history.

> `supabase_migrations.schema_migrations` carries no timestamp column — the columns are
> `version, statements, name, created_by, idempotency_key, rollback`. The **version is** the
> server-assigned wall-clock at apply time, and is the only applied-timestamp that exists. It is
> read back from the database after every apply, never inferred.

### 12.3 Pushed commit holding each applied body

| Repository filename | Commit holding the applied bytes |
| --- | --- |
| `20260831200000_partner_code_slots_and_alias_ownership.sql` | `af9dbe47` |
| `20260831200100_partner_code_banned_words.sql` | `1bf8c33d` |
| `20260831200200_partner_code_slot_limit_dedupe.sql` | `5efb4a49` |
| `20260831200500_partner_rate_profiles.sql` | `5efb4a49` |

Remote branch and PR recorded in §12.4 below once pushed.

