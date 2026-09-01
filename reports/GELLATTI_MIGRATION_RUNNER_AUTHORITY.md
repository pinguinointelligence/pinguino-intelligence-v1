# GELLATTI — MIGRATION RUNNER AUTHORITY AND PENDING PROOF

**Owner pre-apply acceptance points 1 and 2.**
**Date:** 2026-08-31 · **DB:** `tunabqqrwabacxjcxxkz` · **Repo:** `origin/staging` @ `3f56a03d` + `claude/work-with-us`

---

## 1. WHAT THE CANONICAL RUNNER ACTUALLY IS

The owner is right that prose does not decide this. Here is what the mechanism is, established by
running it rather than by assertion.

### The Supabase CLI is NOT the runner for this project

```
$ supabase migration list
{"error":{"code":"LegacyProjectNotLinkedError","message":"Cannot find project ref. Have you run supabase link?"}}
```

There is **no `supabase/config.toml` anywhere in the repository**. The project has never been linked
as a CLI project, so `supabase migration list` and `supabase db push` have no notion of this
database at all.

### The canonical runner is the Supabase management API's `apply_migration`

Confirmed by the repository's own record — `docs/spine/ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md`
describes migrations as "applied via SQL editor / `supabase db push`" and migration 0012 as "applied
via the write-capable Supabase migration tool" — and by the shape of the register itself (§3).

`apply_migration` takes **one name and one SQL body**, applies exactly that, and writes one
`schema_migrations` row whose `version` the server assigns at apply time.

### The decisive consequence

**`apply_migration` never enumerates `supabase/migrations/`.** It has no directory scan, no diff and
no concept of "pending". It applies precisely what a human hands it, one migration at a time.

Therefore the owner's acceptance criterion —

> THE CANONICAL RUNNER MUST SEE ONLY YOUR INTENDED NEW MIGRATIONS AS PENDING.
> It must NOT propose replaying any of the five Shop migrations or any historical migration.

— **is satisfied by construction.** The canonical runner cannot propose replaying anything, because
it never proposes anything. The pending set is whatever is deliberately passed to it, and I am
proposing exactly eight.

---

## 2. 🔴 THE COUNTERFACTUAL THE OWNER WAS RIGHT TO PROBE

If anyone linked the CLI and ran `supabase db push`, it would compare **filename version prefixes**
against `schema_migrations.version`. Run as a read-only set comparison, that yields:

**42 migrations considered pending — of which 34 are already applied.**

`db push` would attempt to replay, among others:

- `20260823140000_community_creators_sharing_v1` (a large schema migration, applied in seven parts)
- `20260829190000_partner_application_lane`
- `20260829200000_gellatti_shop`
- **all five shop migrations**
- `20260831090000_publication_full_carries_composition`

That is exactly the disaster the owner's criterion exists to prevent.

> ### ⚠️ OPERATIONAL RULE
> **`supabase db push` must never be run against this project.** It would replay 34 already-applied
> migrations. This is a pre-existing property of how the register was built — it is not caused by,
> and is not fixed by, this workstream.

I have **not** "worked around migration history": nothing was renamed, no historical file was edited,
and no register row was touched. The finding is reported as-is.

---

## 3. WHY DB VERSIONS DIFFER FROM REPO FILENAME TIMESTAMPS

Not "never match" — my earlier phrasing was too strong. The truth is a clean historical split.

| Era | Register version shape | Matches filename? | Mechanism |
| --- | --- | --- | --- |
| up to `20260821123000` | round numbers (`…110000`, `…120000`) | ✅ yes | applied under the filename's own version |
| from `20260822214756` on | precise wall-clock (`…214756`, `…073556`) | ❌ no | **`apply_migration`, which stamps its own version at apply time** |

The transition is visible to the second: the last filename-matching version is `20260821123000`, the
first server-stamped one is `20260822214756`. The project switched apply mechanism on 2026-08-22.

### A second, independent path also exists: unregistered direct applies

Some migrations were applied straight to the database — SQL editor or a direct function
replacement — with the file committed afterwards so the repository history matches reality. These
change the schema but write **no register row at all**.

`20260829220000_partner_application_slug_fix.sql` documents this in its own header. It is not alone;
I verified two more by checking whether their objects exist:

| Repo file | Registered? | Objects present in DB? |
| --- | --- | --- |
| `search_relevance_stem_and_rank` | ❌ no | ✅ `gellatti_search_root` and `search_products_v1` both exist |
| `rate_events_allow_catalog_import_action` | ❌ no | ✅ the CHECK constraint contains `catalog_import` |
| `partner_application_slug_fix` | ❌ no | ✅ live function carries the fix (documented) |

So the register is an **incomplete log of what was applied**, by design of the process rather than by
accident. That is the real reason a version-based comparison is meaningless here, and it is a
stronger statement than the one I made before.

---

## 4. NAME-BASED RECONCILIATION — the actual verdict

Run as SQL against the live register, comparing every repository migration dated `20260822` or later
by **name**:

**14 repository migrations have no registered row. Eight are mine. Six are pre-existing.**

| Repo version | Repo name | Verdict | Explanation |
| --- | --- | --- | --- |
| `20260823140000` | `community_creators_sharing_v1` | applied, registered under **seven** names | split into `…_part1_schema` … `…_part6_analytics_moderation_rankings` plus two fixes at apply time |
| `20260824110000` | `search_relevance_stem_and_rank` | applied, unregistered | objects verified present (§3) |
| `20260824120000` | `search_multi_word_concepts` | applied, unregistered | same pattern |
| `20260824130000` | `rate_events_allow_catalog_import_action` | applied, unregistered | constraint verified present (§3) |
| `20260829200000` | `gellatti_shop` | applied, **renamed** | registered as `gellatti_shop_schema` |
| `20260829220000` | `partner_application_slug_fix` | applied, unregistered | documented in its own header |
| **`20260831200000`** | **`partner_code_slots_and_alias_ownership`** | **PENDING** | mine |
| **`20260831200500`** | **`partner_rate_profiles`** | **PENDING** | mine |
| **`20260831201000`** | **`partner_application_more_information`** | **PENDING** | mine |
| **`20260831201500`** | **`email_jobs`** | **PENDING** | mine |
| **`20260831202000`** | **`partner_tier_snapshot_writer`** | **PENDING** | mine |
| **`20260831202500`** | **`payout_execution`** | **PENDING** | mine |
| **`20260831203000`** | **`partner_scheduling`** | **PENDING** | mine |
| **`20260831203500`** | **`business_leads`** | **PENDING** | mine |

**No shop migration appears as pending.** All five are registered and matched by name.

---

## 5. PENDING = EXACTLY THESE EIGHT

Filenames confirmed exactly as listed by the owner.

| # | Version | Filename | Dependencies | Objects created / changed |
| --- | --- | --- | --- | --- |
| 1 | `20260831200000` | `partner_code_slots_and_alias_ownership.sql` | `0016_partner_program` | 2 indexes created, 2 dropped; trigger `partner_codes_slot_limit`; **no table created or altered** |
| 2 | `20260831200500` | `partner_rate_profiles.sql` | #1 order only; `0016`, `0018` | **table** `partner_rate_profiles`; **alters** `commission_entries` (+1 nullable column); 2 indexes; 1 trigger |
| 3 | `20260831201000` | `partner_application_more_information.sql` | `partner_application_lane`, `partner_application_slug_fix` | **alters** `partner_applications` (CHECK swap); 1 index rebuilt; 2 functions replaced |
| 4 | `20260831201500` | `email_jobs.sql` | none | **table** `email_jobs`; 3 indexes; 1 trigger |
| 5 | `20260831202000` | `partner_tier_snapshot_writer.sql` | **#2** (reads `partner_rate_profiles`); `0018` | **table** `partner_tier_snapshot_gaps`; reads `partner_tier_snapshots`, `stripe_webhook_events` |
| 6 | `20260831202500` | `payout_execution.sql` | `0018`, `0019` | **table** `payout_release_state` (+ seed row) |
| 7 | `20260831203000` | `partner_scheduling.sql` | **#5, #6** | **table** `partner_job_runs`; 2 pg_cron schedules |
| 8 | `20260831203500` | `business_leads.sql` | `franchise_inquiries` (read only) | **tables** `business_leads`, `business_lead_events`; sequence; imports franchise rows |

### SECURITY DEFINER functions, grants and safety

| # | SECURITY DEFINER fns | REVOKEs | GRANTs | Retry-safe | Transaction-safe |
| --- | ---: | ---: | ---: | --- | --- |
| 1 | 2 | 2 | 1 | ✅ *(see note)* | ✅ |
| 2 | 2 | 2 | 1 | ✅ | ✅ |
| 3 | 2 | 0 | 2 | ✅ | ✅ |
| 4 | 5 | 5 | 1 | ✅ | ✅ |
| 5 | 10 | 10 | 2 | ✅ | ✅ |
| 6 | 11 | 11 | 1 | ✅ | ✅ |
| 7 | 4 | 4 | 1 | ✅ | ✅ |
| 8 | 5 | 5 | 5 | ✅ | ✅ |

**Transaction-safe: all eight.** No `CREATE INDEX CONCURRENTLY`, no `VACUUM`, no `ALTER TYPE ... ADD
VALUE` — verified by scan. Each runs inside a single transaction and rolls back cleanly on failure.

**Retry-safe: all eight.** Every DDL uses `if not exists` / `create or replace` / `drop ... if
exists`, and every data write uses `on conflict do nothing`. Migration 3's CHECK swap is
`drop constraint if exists` followed by `add constraint`, which is safe on re-run because the drop
precedes the add.

> **Note on #1.** It contains a deliberate pre-flight that **raises and aborts** if two
> `partner_codes` rows already share a code or slug, naming the offenders. That is a refusal, not a
> retry failure: the migration will not guess which partner keeps a code, because that decision moves
> money. Once the data is resolved it applies cleanly, and re-running after success is a no-op.

**Every SECURITY DEFINER function in all eight pins an explicit literal `search_path`** — 41
functions, asserted by `financialFunctionPermissions.test.ts`. Every mutating function is revoked
from `public, anon, authenticated`; the only GRANTs are admin read functions (which check a
permission themselves) and the customer-facing lead submit.

---

## 6. Recommended apply procedure

Apply **one at a time, in the order above, by name**, using `apply_migration`. After each, confirm a
new register row appeared. The register will show my chosen names under server-assigned versions —
that is normal here and is exactly what §3 describes.

**Do not use `supabase db push`** (§2).

Post-apply verification is in `GELLATTI_WORK_WITH_US_MIGRATION_INVENTORY.md` §5.

---

## 7. Change log

| Date | What |
| --- | --- |
| 2026-08-31 | Created for owner acceptance points 1 and 2. CLI proven not to be the runner (no `config.toml`, project not linked). Canonical runner identified as `apply_migration`, which cannot propose a replay because it never enumerates. **`db push` counterfactual measured: 42 pending, 34 already applied — must never be run.** Version/name divergence explained as a mechanism switch on 2026-08-22 plus a second unregistered direct-apply path, with three instances verified against live objects. Name-based reconciliation run in SQL: 14 unmatched, 8 mine, 6 pre-existing and explained. My earlier "versions never match" corrected to the accurate split |
