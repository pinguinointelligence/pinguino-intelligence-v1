# Gellatti Community / Creators / Sharing / Demo / TOP 100 / Partner attribution — v1 foundation

**Branch** `claude/community-creators-partners` · **HEAD** `c280471` · **Base** `e03beca` (origin/staging)
**Worktree** `~/Developer/pinguino-intelligence-v1-community`
**Date** 2026-08-23

---

## 1. Requested scope

The full Community / Creator / Direct-Sharing / Demo-conversion / TOP 100 / Partner-attribution
foundation, sitting **on top of** the existing recipe system. Explicitly deferred by the spec
itself: the final Demo UI (§15), followers/DMs/comments/feed (§40), and the §82 future list.

## 2. Completed work

### Architecture

| Concern | Where it lives |
| --- | --- |
| 13 tables, 32 RPCs | `supabase/migrations/20260823140000_community_creators_sharing_v1.sql` |
| Grant + policy hardening | `supabase/migrations/20260823141500_community_sharing_v1_grant_and_policy_hardening.sql` |
| Pure domain (10 modules) | `src/features/community/domain/**` |
| Service boundary | `src/services/community.ts` (RPC-only; no table reads) |
| UI | `src/features/community/ui/**`, `src/pages/community/**` |
| Copy (pl + en, key-complete) | `src/copy/community.ts` |

**Visibility.** Three states, never conflated: `private` (default; **no existing recipe was
touched or published**), `unlisted` (a share link), `published` (an explicit publication).
Sharing never publishes (§11) — `visibility.test.ts` + a source guard prove
`gellatti_create_share_link_v1` writes no publication row.

**Immutable versions (§5).** Publications and share links both bind `recipe_version_id` →
`public.recipe_versions` (SELECT+INSERT only since 0027). Publishing V2 creates a second row;
a partial unique index makes republishing the same version idempotent rather than duplicated.

**The three roles (§85), never one `referrer` field.** `creator_user_id` (authorship, permanent),
`shared_by_user_id` (who sent it), `partner_id` (who earns) are three separate columns on
`recipe_share_links`. `AttributionByline` renders creator/sharer/"based on" and **cannot** render a
Partner — commercial attribution never appears as authorship.

**Partner attribution reuses the existing platform.** No new commission table. Opening a share
writes evidence into `referral_clicks` / `referral_attributions` (migrations 0016–0021), so
`commission_entries` stays the one money path. `decideShareAttribution` wraps the existing
`decideAttribution` and adds exactly one evidence kind, with the §32 precedence:
existing lock → explicit code → share journey → stored referral → nobody.

**Owner rule (2026-08-23), encoded not just documented.** Commission eligibility is decided by
Partner status **at the moment of the qualifying referral/purchase**. `isCommissionEligible()`
takes *only* partner status — recipe metrics are not in its signature, so popularity cannot create
a payment entitlement. Non-retroactivity is structural: `partnerIdForNewShare` stores `NULL` when
the sharer is not active, and `gellatti_open_share_v1` re-checks `gellatti_partner_is_active_v1`
at every attribution point. The Partner page distinguishes "not a Partner" from "no commissions
yet", because implying earnings are coming is exactly what the rule forbids.

**Ranking (§38/§39).** Views are not an input — there is no view field to weight. Weights are
versioned data (`RANKING_WEIGHTS_V1`), raw components are stored with every snapshot so a rank is
auditable and replayable, and the SQL boards are lockstep-tested against the TS module.

### Demo security (§16) — the load-bearing part

Non-entitled callers never **receive** a formulation. `gellatti_demo_safe_projection_v1` is a
whitelist built from named safe fields, so a new Engine field is absent by construction.
`recipe_input` leaves the database through exactly three functions — `gellatti_open_share_v1`,
`gellatti_open_received_share_v1`, `gellatti_get_publication_full_v1` — each calling
`gellatti_has_paid_access_v1` first, none executable by `anon`. Verified against the live catalog,
not just the source.

## 3. Two real vulnerabilities found and fixed

Applying to staging surfaced that **Supabase project default privileges grant ALL DML on every new
`public` table to `anon` and `authenticated`**, regardless of the migration's `grant` statements.
Nothing leaked (RLS denied every unintended command), but it means policies — not grants — are the
whole access control, and two policies had been written as if grants did part of the work.

- **HOLE 1 (serious).** `recipe_share_recipients_update_own` did not pin `share_link_id`. A user
  with one legitimate recipient row could repoint it at any share-link id and then call
  `gellatti_open_received_share_v1`, which proves access by membership in that table — a paying
  user could have read the full formulation of any share whose id they obtained.
- **HOLE 2.** `community_publications_update_own` checked only ownership, so a creator could write
  `status`, `ranking_eligible`, `public_projection` and `recipe_version_id` — un-hiding a
  moderated publication, restoring their own ranking, swapping the public body, or repointing a
  live publication at a different version (breaking §5).

Both fixed in `20260823141500`, which also revokes the inherited default and re-grants exactly what
was intended. It deliberately does **not** change the project-wide default privileges — that would
silently alter every future table in the repo, far outside this feature's scope.

## 4. Tests

**New:** 12 files, ~230 assertions.
`creatorHandle` · `demoSafeRecipe` · `visibility` · `lineage` · `ranking` ·
`partnerShareAttribution` · `shareContinuation` · `shareUrls` · `analyticsEvents` ·
`unlockBenefits` · `communitySharing.migration` (50 guards) · `demoSecurity` (renders the tree and
proves no gram reaches the DOM, attributes, or OG metadata) · `acceptanceScenarios` (A–O) ·
`communityRoutes` · `copy/community`.

`acceptanceScenarios.test.ts` ends with an explicit **NOT COVERED** list (refund reversal,
webhook-retry idempotency, live RLS, end-to-end confirmed make) so a green run is never mistaken
for end-to-end proof.

**Commands and results (on `c280471`):**

```
npx tsc -b --noEmit          clean
npx eslint src supabase      1 error, 4 warnings — all pre-existing, none in this branch
                             (internetRecipeMatrix.report.test.ts arrived with origin/staging)
npx vitest run               632 files passed, 1 skipped · 7939 passed, 100 skipped
npm run build                built (dist/assets/index-*.js)
```

Regressions retested: full suite, incl. `routes.test.tsx`, `canonicalPro`/`canonicalShell` shell
guards, `RecipesHubPage`, `SubscriptionPage`, `billingCheckout`, `createCheckoutSession`.

**Two guard tests earned their keep:** the migration guard caught a `creator_profiles` INSERT grant
that would have bypassed the reserved-handle table (`@admin` was claimable); the shell guard caught
`CreatorStudioPage` colliding with the retired legacy `StudioPage` (renamed to `CreatorHubPage`
rather than weakening the guard).

## 5. Live staging verification

Two transactions, both `ROLLBACK` — staging holds **zero** rows in every Community table and zero
test users afterwards (verified). Only the 43-row reserved-handle seed persists.

| Check | Result |
| --- | --- |
| Token length / raw token recoverable from DB | 43 chars (32 CSPRNG bytes) / **false** |
| Reserved handle `@admin` | refused `handle_reserved` |
| anon: `recipe_input` in payload / contains `512` / contains cost `3.4` | **false / false / false** |
| anon: sees creator name + ingredient names | true (a Demo that is actually useful, §17) |
| anon: `gellatti_get_publication_full_v1` | permission denied |
| anon: direct table read | `42501` |
| free signed-in: entitlement / gets grams | `shared_recipe_demo` / **false** |
| paid: entitlement / gets grams | `full` / **true** |
| received list after open | 1 |
| **HOLE 1** repoint own membership | refused `42501` |
| stranger reopen by share id | `not_found` |
| stranger sees publications / share links / recipe_versions | 0 / 0 / 0 |
| stranger forges membership / edits publication | refused / 0 rows |
| **HOLE 2** creator rewrites `public_projection` | refused `42501` |
| creator un-hides moderated publication / restores ranking / repoints version | refused / refused / refused |
| creator renames own title | allowed (correct) |
| Final state after all attacks | `hidden_by_moderation / rankable=false` |

**Advisors:** 0 ERROR-level advisories from this feature. The 4 `rls_enabled_no_policy` (INFO) are
the four server-owned tables that must have no policy; the 8 `anon_security_definer_function_executable`
are exactly the documented public reader API. All 10 ERRORs and all 7 mutable-`search_path`
functions are pre-existing and unrelated.

## 6. Database

| Migration | Status |
| --- | --- |
| `20260823140000_community_creators_sharing_v1.sql` | **applied to staging** (as 6 ordered parts) |
| `20260823141500_community_sharing_v1_grant_and_policy_hardening.sql` | **applied to staging** |

Applied via the Supabase MCP, which is scoped to `pinguino-staging` (`tunabqqrwabacxjcxxkz`) only —
deliberately chosen over the CLI, which is authenticated to production too. Two transcription slips
during chunked apply were caught by catalog verification and corrected on staging
(`gellatti_list_sent_shares_v1` missing its revoke; `gellatti_list_received_shares_v1` losing its
grant). The live catalog now matches the repo file exactly.

Indexes: creator handle, publication slug/discovery/category, lineage parent+root, share token
hash, recipient lookup, partner attribution, ranking windows.

**Rollback:** additive only. `drop table` the 13 tables (cascade) and `drop function` the 32
`gellatti_*` functions. No existing table, policy or function was altered, so nothing needs
restoring.

## 7. Deployment

- **Local + staging DATABASE:** applied and verified.
- **Staging APP:** **not deployed.** The branch is committed and rebased but **not pushed** —
  pushing to `origin/staging` auto-deploys, which was not authorized.
- **Production:** **untouched.** `main` unchanged; the MCP cannot reach it.

## 8. Remaining / not done

1. **Not pushed to `origin/staging`** — one `git push` away, awaiting authorization.
2. **Served browser QA not run** — needs an owner sign-in; Claude does not type credentials.
3. **`Use this recipe` / `Create my version` buttons are not wired** on the public and share pages.
   The RPC (`gellatti_record_derivation_v1`), the lineage domain and the service call all exist and
   are tested; what is missing is the click handler that saves the copy through the existing recipe
   path and then calls it. This is the single largest deliberate gap.
4. **`gellatti_record_make_v1` is not called** by the production flow — it needs a hook at the
   point a production run completes.
5. **Ranking snapshots are admin-triggered**, not scheduled.
6. Category/country Community filters, share expiry UI, and report/moderation UI are schema-ready
   but unrendered (§37 says not to overbuild filters before there is content).
7. **N (§77) refund reversal and webhook-retry idempotency** are unit-tested in
   `src/billing/domain/refundAdjustments.test.ts` but not exercised end-to-end against a real
   Stripe event.

## 9. Blockers

None technical. Two need the owner: authorization to push to `origin/staging`, and a signed-in
session for served QA.

---

# Round 2 — wiring closed, staging deployed and served-verified

**HEAD** `36ee7aa` · **Base** `d2d5c63` (origin/staging) · **Pushed to `origin/staging`**
**Served deployment** `dpl_ASCCWaV1xrk9uVSjo7GKbrhQfQ5B` READY · alias `staging.pinguinoai.com`
**Served bundle** `index-DMRTDk4O.js` · 3 337 363 B · sha256 `70b51c3ed1f8b992…`

## 1–2. „Użyj tej receptury" / „Stwórz moją wersję" — wired end to end

`useRecipeDerivation` runs four ordered steps: read the source through the
entitlement-gated RPC → create an INDEPENDENT recipe through the existing
`RecipesRepository.createRecipe` → `create_recipe_with_v1` → stamp lineage and
the usage event → open the editor. The source is only ever read; no step in the
plan can write to it. A copy keeps the original name, a remix is renamed so it
cannot impersonate the original, and the note records the source while
`recipe_lineage` remains the authority the user cannot edit.

Idempotency has two layers: an in-flight `useRef` (effective on the next
synchronous click, before any re-render) and `derived_recipe_id` uniqueness in
the database. If attribution fails after the recipe saved, the user KEEPS the
recipe and is told exactly that — no saved work is deleted to tidy bookkeeping.

## 3. Confirmed make — one authoritative trigger

Hooked into `supabaseProduction.completeRun` and nowhere else. New
`gellatti_record_make_for_run_v1` takes ONLY a run id and resolves the
publication server-side from lineage, so the client asserts no attribution at
all. Called from all three completion paths (fresh success, already-completed,
recovered-after-error) and idempotent by `production_run_id`, so at most one
make per run; a genuine second making is a new run and does count. It never
throws — a Community counter must not fail a user's production run.

Two anti-gaming corrections found while wiring: `remix_count` now counts
DISTINCT remixers, and the redundant unique index on
`(publication_id, user_id, occurred_at)` is dropped — `occurred_at` defaults to
transaction time, so it could have silently rejected a legitimate second make.

## 4–6. Live scenarios on staging (all in rolled-back transactions)

| | Result |
| --- | --- |
| S1 Marysia publishes → Katarzyna uses | entitled read `full`; **1** usage event after a double submit; 1 lineage row; unique_users 1; **original unchanged**, still 1 version; copy owned by Katarzyna; source reads „Marysia / copy" |
| S2 Jan remixes → publishes remix | remix creator **Jan**, root creator **Marysia**, „Na podstawie Pistachio Salted Caramel by Marysia", Marysia remix_count 1 |
| S3 confirmed make | recorded; retry → `already_recorded`; makers 1 / makes 1; genuine 2nd run → makers **1** / makes **2**; `in_progress` run → `run_not_completed_by_caller`; rating allowed only after a make; stranger cannot claim another's run |
| S4 direct share → Demo → subscription | anon sees title+creator and **no grams**; free `shared_recipe_demo`, no grams; Otrzymane shows Demo state, Created by / Shared by; after subscribing `full` **with** grams and Otrzymane flips to unlocked; share-derived remix attributes to Marysia |
| S5 Partner Jan shares Marysia's recipe | creator **Marysia**, sharer **Jan**, partner **Jan**; 3 opens → **exactly 1** attribution, to Jan; Marysia gets **0**; unique opens 1; Jan opening his own link → **0** attributions |
| S6 non-Partner share | no attribution; Marysia activating as a Partner **later** leaves her earlier link `partner_id = NULL` |
| Udostępnione mi | sent list shows counts and the Partner flag but **never a recipient**; revoke blocks both the token and the library route; remove hides only the recipient's row — source recipe, share record and Katarzyna's copy all intact |
| „Na podstawie" publicly | remix page reads „Pistachio Salted Caramel — Marysia (@marysia)"; original carries no `based_on`; Jan cannot delete (42501) or rewrite (42501) his lineage — attribution survives the attack |

## 5. Post-wiring security re-check

`serviceBoundary.test.ts` (12 guards) proves the new client code created no path
around the RLS fixes: no Community feature or page imports the Supabase client;
the service touches exactly three narrow owner-scoped tables and reads every
formulation through one of the three gated RPCs; no direct write to any
server-owned table exists anywhere in the app; nothing client-side sends a
partner id, an entitlement or an amount; the derivation hook contains no local
access check at all.

Served edge headers confirmed on `staging.pinguinoai.com`:
`/share/*` → `X-Robots-Tag: noindex, nofollow, noarchive`,
`Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`;
`/community` and `/@handle` correctly indexable.

## Served route behaviour (read in-browser — curl hits Vercel's bot checkpoint)

`/community` and `/top100` render with all four windows and honest empty states ·
`/recipes` shows **MOJE | UDOSTĘPNIONE MI | PINGÜINO | INSPIRACJE** plus
COMMUNITY → `/community` and TOP 100 → `/top100`, with OTRZYMANE / WYSŁANE
PRZEZE MNIE inside · `/share/<bogus>` → „Nie znaleziono tej receptury." ·
`/@admin` → real 404 (reserved handle refused at the route gate) · `/creator` →
Creator hub + profile form · `/partner` → „Nie masz jeszcze statusu Gellatti
Partner" with the eligibility rule stated verbatim.

## Two gaps the SERVED-bundle check caught (fixed in `36ee7aa`)

1. **`publishRecipe` and `createShareLink` were tree-shaken out of the deployed
   bundle.** Both dialogs existed and were tested, but no routed page mounted
   them, so Rollup dropped the service functions — both loops had **no entry
   point**. Now mounted on each saved-recipe row, bound to the SELECTED version.
2. **A published remix showed no „Na podstawie" publicly.** The lineage was
   stored and unforgeable, but the public reader returned none.
   `gellatti_publication_card_v1` now carries `based_on`.

Reading the source would not have found either. Reading the served bundle did.

## Build

```
npx tsc -b --noEmit    clean
npx eslint src supabase 0 errors, 4 warnings (all pre-existing react-refresh)
npx vitest run          637 files passed, 1 skipped · 8006 passed, 100 skipped
npm run build           built
```

## Migrations applied to staging this round

`20260823152000_community_make_by_run_and_remix_dedupe` ·
`20260823154500_community_publication_based_on`. Production untouched.

## Remaining — honest

1. **No rating SUBMIT control.** `gellatti_rate_publication_v1` is live and
   live-tested (a rating is refused without a confirmed make), and
   `VerifiedRating` displays results, but nothing in the UI lets a maker leave
   one — confirmed by its absence from the served bundle (23/24 probes present).
2. **Owner browser QA of signed-in flows is not done.** Everything verified in
   the browser above is the logged-out surface; publish / share / use / remix
   as a real signed-in Pro account needs the owner's session, and Claude does
   not type credentials.
3. Refund reversal and webhook-retry idempotency remain unit-tested only, not
   exercised against a real Stripe event.
4. Category/country filters, share expiry UI and the report/moderation UI stay
   schema-ready but unrendered.
