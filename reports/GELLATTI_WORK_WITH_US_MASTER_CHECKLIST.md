# GELLATTI — WORK WITH US · MASTER CHECKLIST

**Branch:** `claude/work-with-us` · **Worktree:** `~/Developer/pinguino-work-with-us`
**Base:** `origin/staging` @ `c004d659` (fetched 2026-08-31)
**Scope authority:** the Owner WORK WITH US master prompt (2026-08-31), §§0–44, **as amended by
the Owner Correction of 2026-08-31 §§1–20** (canonical site `www.gellatti.com`, canonical mailbox
`info@gellatti.com`, Resend adapter, `/partner-program` + `/partner`, manufacturer name is
internal-only, MOBILE and TRAILER are separate products, 600 mm trailer bay depth rule, asset
manifest promoted to immediate priority).
**This file is the ONLY status authority for this workstream.** One row per independently
testable requirement. Every numbered section of the prompt has at least one row.

## Status legend

| Column | Values |
| --- | --- |
| **Work** | ⚪ TODO · 🟡 DOING · ⏳ WAITING FOR OWNER ASSET · 🔴 BLOCKED · 🟢 DONE |

**⏳ is not a blocker.** Per the owner correction of 2026-08-31, a row waiting on a marketing render never holds up backend or business implementation — it only prevents that page from freezing.
| **Auto** | ⬜ NOT RUN · ✅ PASS · ❌ FAIL |
| **Served** | ⬜ NOT RUN · ✅ PASS · ❌ FAIL |
| **Owner** | ⬜ WAITING · ✅ APPROVED · ❌ REJECTED |
| **Freeze** | 🔓 OPEN · 🧊 READY TO FREEZE · 🔒 FROZEN |

**Claude may never set Owner QA = ✅.** Only an explicit owner confirmation does that.

---

## 0. AUDIT — what actually exists on `c004d659`

This inventory was produced by reading the repository, not by trusting prior reports.

### 0.1 The financial core is real, tested, and mostly wired

`src/billing/domain/` is a set of **pure, versioned, fully-tested** modules that already encode
most of the owner's locked financial rules. This is the single most important audit finding:
**most of §10–§14 is already built and must be reused, not rebuilt.**

| Module | Locked rules implemented | Matches owner prompt? |
| --- | --- | --- |
| `commissionRules.ts` | C1–C6: rate table v1, keying by (product, cadence, tier), 15-month = ONE annual, event classifier, 8 typed refusal reasons | **§10 Standard + Gold values match the prompt exactly** (199/900/499/2900 · 249/1400/599/3900). **§11 Elite CONFLICTS** — see A-ELITE rows. |
| `tierSnapshots.ts` | T1–T6: Standard default, Gold ≥100 at monthly snapshot, Home+Pro combined, cancel-at-period-end still counts, Elite override, no retroactive recompute | §10 Gold semantics ✅ · §11 Elite override exists but carries **no per-partner rates** |
| `holdCalendar.ts` | H1–H4: two FULL calendar months (M → 1st of M+3), Europe/Madrid, DST-correct, never "60 days" | **§12 exactly as specified** ✅ |
| `payoutNetting.ts` | P1–P7: batch math, €25 threshold, negative carry-forward, deterministic idempotency key, lifecycle state machine | **§14 payout math ✅** (worker missing — see below) |
| `refundAdjustments.ts` | R1–R6: full/partial/proportional reversal, cumulative cap, append-only, dispute lost/won | **§13 exactly as specified** ✅ |
| `attribution.ts` | A1–A8: 30-day window, explicit code overrides unconverted cookie, locked on first paid conversion, one partner per payment, self-referral rejection | **§9 exactly as specified** ✅ |
| `partnerCodes.ts` | PC1–PC6: normalize (accents/spaces/case), 5–16 chars, ASCII+digits, banned words, collision-suffixed suggestions | **§8 validation rules ✅** (3-slot limit + alias ownership missing) |
| `inviteCodes.ts` | I1–I6: `PIH-XXXX-XXXX`, state machine, redemption guard, **grant spec `{scope, days, createsStripeObjects:false}`** | Not required by this prompt, but **I5 is the reusable free-time grant primitive for §18** |

**Runtime wiring:** the TS domain modules are the *specification and test oracle*; the actual
runtime is the Deno edge function `supabase/functions/stripe-webhook/dispatch.ts`, which
re-implements the same rules against the DB (reads `commission_rules`, `partner_tier_snapshots`,
enforces the `commission_entries` invoice-unique index, refuses self-referral).
`src/services/stripeWebhookEffects.test.ts` asserts parity between the two. Stripe **TEST mode is
live on staging** and the webhook endpoint receives events.

### 0.2 Database schema already present

`partner_applications` · `partners` · `partner_codes` · `referral_clicks` ·
`referral_attributions` · `partner_benefit_uses` · `partner_tier_snapshots` · `commission_rules` ·
`commission_entries` (immutable) · `commission_adjustments` (append-only) · `payout_batches` ·
`partner_payouts` · `partner_payout_items` · plus the 2026-08-26/29 additions: partner workspace
RPC, public links, content links, the partner application lane (submit / my / admin queue /
admin decision) and `franchise_inquiries`.

RLS posture is correct: **all financial writes are service-role only**, no `insert/update/delete`
grants to `authenticated`, partners read only their own rows.

### 0.3 What exists in the UI

| Route | What it actually is | Gap vs. prompt |
| --- | --- | --- |
| `/work-with-us` | `WorkWithUsPage` (209 lines) — partner block on top, then the three **"Maszyny + aplikacja / Maszyna + gotowe mieszanki / Sama aplikacja"** cards | §4 explicitly kills those three cards; needs MACHINES / MOBILE / FRANCHISE instead |
| `/partner` | **The authenticated Partner DASHBOARD** (741 lines: Overview, Codes, LinkGenerator, ContentLinks, Earnings, Payouts, Profile, Settings) | **There is NO public Partner landing page at all.** §5 needs one, and `/partner` is already taken |
| `/franchise` | `FranchisePage` in `GlobalDestinationPages.tsx` + `franchise_inquiries` + `AdminFranchiseLeadsSection` | Closest thing to "done"; needs §31 content review |
| `/:slug/:code/l/:linkSlug` | `PartnerPublicRoute` — campaign link resolution | §9 largely present |
| `/admin/:section` | `AdminPartnersSection` (474) + `AdminPartnerApplicationsPanel` (225) | §17 partial — no full Partner detail panel |

Copy authority: `src/copy/cooperation.ts` (PL + EN, `resolveCooperationCopy`). New copy goes here.

### 0.4 What does NOT exist

1. **No payout batch worker.** `payoutNetting.ts` computes batches; nothing calls it. No pg_cron
   job, no edge function. Money can be earned and held but never paid. (§14)
2. **No tier snapshot job.** `tierSnapshots.ts` is pure; nothing writes `partner_tier_snapshots`
   monthly. `dispatch.ts` *reads* the snapshot — so with no writer, Gold can never activate. (§10)
3. **No normal-user referral program.** Zero code. No tables, no reward, no UI. (§18–§21)
4. **No Miles machine catalog.** `src/features/machine-catalog` is **home appliances**
   (Ninja CREAMi, Cuisinart, KitchenAid…) for recipe formulation — a completely different domain.
   The 11 Miles professional machines do not exist anywhere. (§23–§26)
5. **No mobile route, no trailer configurator.** (§27–§30)
6. **No machine/mobile/trailer lead storage.** Only franchise has a lane. (§32)
7. **No public Partner landing.** (§5)

### 0.5 Conflicts with the OWNER OVERRIDES — must be resolved before implementing

| # | Conflict | Existing behaviour | Owner override | Row |
| --- | --- | --- | --- | --- |
| X1 | **Elite is a fixed global tier** | `RATE_TABLE_V1.elite` is hardcoded 299/1900/699/4900 and frozen; DB `commission_rules` seeds the same 12 rates | §11: Elite must be a **per-partner, versioned rate profile**; the old values become *default suggestions only* | E-ELITE-01..05 |
| X2 | **Retired codes may be reissued to anyone** | `partner_codes_code_active_uniq` is `where status = 'active'` — a retired code's text is free for **another partner** to claim | §8: historical aliases "cannot be claimed by another Partner" — old social posts must never point at a different partner | D-CODE-04 |
| ~~X3~~ | ~~**No limit on active codes**~~ **AUDIT WAS WRONG** | The ceiling **already existed** in `gellatti_partner_code_guard_v1` (from `20260826122000`). The audit looked for a CHECK constraint and missed the trigger. Caught by live staging QA, corrected by `20260831200200_partner_code_slot_limit_dedupe.sql` | §8: **0–3** current public codes — was already enforced | D-CODE-02 |
| X4 | ~~`/partner` is the dashboard~~ **RESOLVED** | — | **Owner correction §4: `/partner-program` = public landing, `/partner` = authenticated dashboard.** Decided | B-LAND-01 |
| X5 | **Franchise concepts include `przyczepa`** | `FranchiseConcept = punkt \| wozek \| przyczepa \| lokal` | **Owner correction §7/§9: the TRAILER is its own product at `/trailer`, separate from both MOBILE and FRANCHISE.** The franchise `przyczepa` card must point at `/trailer` | N-TRAIL-01 |
| X6 | **Gold can never trigger** | No snapshot writer (0.4 #2) | §10 Gold automatic from 100 | E-GOLD-01 |

### 0.6 Protected / frozen assets this workstream must not break

- `src/contracts/owner-locked/**` — 16 contract files. A normal task **must not modify them**
  (AGENTS.md rule 12); adding new contracts is always allowed.
- `scripts/protectedPaths.json` — zero semantic drift permitted; any change must be declared as a
  `Protected-Change:` commit trailer.
- `staging` is a **protected branch**: direct push is rejected (`GH006`). PR + the required check
  *"Owner-locked contracts + protected paths"* is the only way in.
- §41 no-drift boundary: Engine / Solver / Mapper / HOME recipe mathematics / Production logic are
  **out of scope**. This workstream is business/commerce only.

---

## 1. ACTIVE MASTER CHECKLIST

### A — `/work-with-us` public gateway (§4) · CHECKPOINT A

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-GATE-01 | Gateway | Partner is the first and dominant section; hero states the recurring-earnings promise | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Current hero is generic cooperation copy | Rewrite hero via `cooperation.ts` |
| A-GATE-02 | Gateway | Primary CTA "Dołącz do programu Partner" routes to the Partner landing | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Today it anchors to `#partner-application` on the same page | Point at new landing route |
| A-GATE-03 | Gateway | Platform recognition strip (Instagram, TikTok, YouTube, Facebook, Reddit, X, Pinterest, blog, newsletter) using the existing icon system, no endorsement implied | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Icon set not yet audited for these 9 marks | Audit `src/components/icons`, add missing |
| A-GATE-04 | Gateway | Bridge line "Chcesz sprzedawać Gellatti, a nie tylko je polecać?" | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Copy row in `cooperation.ts` |
| A-GATE-05 | Gateway | **FOUR** premium cards MACHINES / MOBILE EQUIPMENT / GELLATTI TRAILER / FRANCHISE, each to its own route | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **Owner correction §7: four paths, not three — the trailer is NOT hidden inside Mobile or Franchise.** Replaces the old "Maszyny + aplikacja / gotowe mieszanki / sama aplikacja" cards. Card art = `GATE-01..04` (crops, no new renders) | Build cards after L/M/N routes exist |
| A-GATE-06 | Gateway | Legacy anchors/links to the removed cards redirect, nothing 404s | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | `w.offers.*` copy has downstream consumers | Grep consumers before deleting |
| A-GATE-07 | Gateway | Desktop + mobile served QA of the gateway | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After A-GATE-01..06 |

### B — Partner public landing (§5) · CHECKPOINT B

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B-LAND-01 | Partner landing | Public landing at **`/partner-program`**; `/partner` stays the authenticated dashboard | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **Route CONFIRMED by owner correction §4** — no longer an open decision | Implement the route |
| B-LAND-02 | Partner landing | Answers within seconds: who it's for · how they earn · **revenue is recurring** · own codes/links · dashboard visibility · volume raises level | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Copy + layout |
| B-LAND-03 | Partner landing | Core message "Polecasz raz. Możesz zarabiać również przy kolejnych odnowieniach." | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Copy row |
| B-LAND-04 | Partner landing | "Twój kod. Twój link. Dowolny kanał." + "Budujesz bazę klientów…" + "Wyniki, prowizje i przyszłe wypłaty…" | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Copy rows |
| B-LAND-05 | Partner landing | **Public landing MUST NOT show exact commission rates** — enforced by an automated test, not just review | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Highest-risk copy leak in this workstream | Write guard test first |
| B-LAND-06 | Partner landing | Permitted public claims only: recurring · Standard→Gold · Gold from 100 · individual conditions possible · automatic payouts · codes/links · campaign tracking · approved Partner gets Home+Pro · annual benefit where billing allows | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Copy + guard test |
| B-LAND-07 | Partner landing | Small CTA for non-creators → normal-user referral (§20) | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Depends on J rows | After J-REF-* |
| B-LAND-08 | Partner landing | Desktop + mobile served QA, signed out and signed in | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After B-LAND-01..07 |

### C — Partner application + status (§6, §7) · CHECKPOINT B

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-APP-01 | Application | Flow: landing → sign in/create account → verified identity → application → confirmation → status | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `PartnerApplicationPanel` + `gellatti_submit_partner_application_v1` exist; the *flow* around them does not | Wire to new landing |
| C-APP-02 | Application | Captures: public/creator name, country, languages, description, audience/topic, platform selection, platform URLs, site/blog/newsletter, audience size, promotion plan, code suggestions, consent | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Current panel captures a subset; `application_data` is jsonb so no migration needed | Extend form |
| C-APP-03 | Application | Asks for no unnecessary private information | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Review at C-APP-02 |
| C-APP-04 | Application | Duplicate active applications impossible for one account | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `partner_applications_open_uniq` partial unique index already enforces this | Add regression test |
| C-APP-05 | Application | Customer-facing statuses RECEIVED / UNDER REVIEW / MORE INFORMATION NEEDED / APPROVED / REJECTED / SUSPENDED / TERMINATED | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `b5963d85` | Migration adds `more_information_needed`. **It also fixed a latent bug**: the landed `request_information` action wrote `in_review`, which the CHECK rejects, so that admin action had never worked | Owner applies migration |
| C-APP-06 | Application | Customer copy never exposes internal state names | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `b5963d85` | `partnerApplicationStatus.ts` pairs each contract value with customer copy; a guard test forbids any raw value, snake_case or SQL vocabulary in a customer string | — |
| C-APP-07 | Application | Status page readable by the applicant | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `gellatti_my_partner_application_v1` exists; no dedicated page | Build page |
| C-APP-08 | Notifications | Emails: received · more info requested · approved · rejected · payout setup required · payout/account requirements | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **UNBLOCKED by owner correction §3** — Resend adapter behind a provider-agnostic `EmailProvider` port. Depends on EMAIL-01..06 | Build the email lane first |
| C-APP-09 | Approval | On approval: link partner, activate, grant HOME + PRO, grant PARTNER mode, codes available, Connect available, audit row, approval message | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `gellatti_admin_partner_application_action_v1` already approves + mints first code; grant/audit coverage unverified | Verify each of the 8 effects |
| C-APP-10 | Approval | **No fake zero-price Stripe subscriptions** for Partner free access | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | Locked decision 8 already forbids it; `entitlements` rows are the mechanism | Add regression test |
| C-APP-11 | Approval | Partner uses the SAME normal login; modes HOME \| PRO \| PARTNER | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Partner is added on top of the existing plan per the 2026-08-29 lane | Served-verify all three modes |
| C-APP-12 | Approval | No Partner-specific recipe mathematics (§41 boundary) | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | Nothing in scope touches the Engine | Guard by protected-paths check |

### D — Partner codes (§8) + campaign links (§9) · CHECKPOINT C

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D-CODE-01 | Codes | Normalization + validation: no spaces, no accents, ASCII+digits, 5–16 shown, case-insensitive, protected/offensive rejected | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `partnerCodes.ts` PC1–PC4 already exact | Re-run its tests as evidence |
| D-CODE-02 | Codes | **0–3 current public codes per Partner** (X3) | 🟡 | ✅ | ⬜ | ⬜ | 🔓 | `20260831143710` | **DB layer applied and proven against the live staging database** — 0→1→2→3 OK, 4th refused `partner_active_code_limit_reached`, retiring frees a slot, UPDATE contract A–E. The ceiling turned out to be pre-existing (`gellatti_partner_code_guard_v1`); the duplicate this workstream added is dropped. **Live-DB proof is NOT served QA** — no partner has exercised this through the app, because `managePartnerCode` and the UI are not wired | Wire the service + UI, then run served QA, then OWNER QA |
| D-CODE-03 | Codes | Global uniqueness across every Partner, live availability validation | 🟡 | ✅ | ⬜ | ⬜ | 🔓 | `b4e3a187` | Global unique indexes written; `gellatti_partner_code_claim_refusal_v1` gives live typed availability | Owner applies migration; wire the availability check into the UI |
| D-CODE-04 | Codes | **Historical aliases stay owned by the same partner and can never be claimed by another** (X2) | 🟡 | ✅ | ⬜ | ⬜ | 🔓 | `bd32c0e9`+`b4e3a187` | Fixed in domain (CS2/CS5) and in SQL: uniqueness is now GLOBAL, not active-only. Migration **refuses to run** if duplicate code text already exists, naming the codes — that ownership call moves money | Owner applies migration |
| D-CODE-05 | Codes | Aliases don't count toward the 3 displayed slots | 🟡 | ✅ | ⬜ | ⬜ | 🔓 | `20260831143710` | CS3 proven against the live DB: 3 current + aliases still consumes exactly 3 slots; an old alias stays globally reserved (`held_by_another_partner`). **Nothing DISPLAYS slots yet**, so the "displayed" half of this row is untested | Build the slot UI, then served QA |
| D-CODE-06 | Codes | Changing a code never rewrites historical conversions / commission / payout / campaign ownership | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | Attribution is by immutable `partner_id`; ledger is immutable | Add explicit regression test |
| D-CODE-07 | Codes | Admin can disable a compromised alias | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `status='blocked'` + `disabled_reason` + audit exist in the 2026-08-26 migration | Surface in admin UI |
| D-LINK-01 | Campaign links | Partner may create many trackable links (not limited by the 3 codes) | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `partner_content_links` + `createPartnerContentLink` + `LinkGenerator` exist | Served-verify |
| D-LINK-02 | Campaign links | All links resolve to immutable `partner_id` | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `PartnerPublicRoute` + `partner-link-resolve` | Regression test |
| D-LINK-03 | Campaign links | Aggregate clicks / signups / paid conversions / active subs / per-campaign performance | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Workspace RPC returns clicks + signups; paid conversions and active counts unverified | Verify RPC completeness |
| D-LINK-04 | Campaign links | No customer PII exposed anywhere in partner-visible data | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Write PII guard test over the RPC payload |
| D-ATTR-01 | Attribution | 30-day window · explicit code overrides unconverted passive · locked on first paid · one owner per payment · self-referral rejected | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `attribution.ts` A1–A8 + `referral_attributions` unique indexes | Re-run tests as evidence |

### E — Commission, tiers, hold, reversals (§10–§13) · CHECKPOINT E

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-STD-01 | Commission | Standard rates 1.99 / 9.00 / 4.99 / 29.00 | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | Match `RATE_TABLE_V1` exactly | Re-run tests |
| E-GOLD-01 | Commission | Gold rates 2.49 / 14.00 / 5.99 / 39.00 | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | Match exactly | Re-run tests |
| E-GOLD-02 | Tier | Gold automatic from 100 eligible active paid referred subs, HOME+PRO combined | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `a8580c87`+`40120b3f` | Writer built and scheduled monthly. Immutable, idempotent, Madrid boundaries, Elite override wins. Owner scenarios proven: 99 Standard, 100 Gold, drop to 87 leaves February Gold intact and March reads Standard | Owner applies migration; then served QA |
| E-GOLD-03 | Tier | cancel-at-period-end still counts until paid access ends; ended/unpaid/fraud/free excluded | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `tierSnapshots.ts` T3 | Regression test |
| E-EVT-01 | Commission | Commission events: first monthly · monthly renewal · first annual/15-month · annual renewal · monthly→annual conversion once | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | C3–C5 | Re-run tests |
| E-EVT-02 | Commission | No commission for failed/unpaid/void · zero invoice · partner's own free access · free invite · self-referral · duplicate event · fraud · Live test transaction | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | 7 of 8 covered by C6; **"Live report test transaction"** has no explicit rule | Add `livemode` refusal |
| E-ELITE-01 | Elite | Elite is manually assigned by authorized Admin | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | T4 override record exists | — |
| E-ELITE-02 | Elite | **Per-partner custom rate profile** replaces the fixed Elite table (X1) | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `20260831150753` | Domain + LIVE path done, **migration APPLIED to staging**. Live: v1 resolves 500; appending v2 leaves the June instant resolving to v1 (no retroactive rewrite); a partner with no profile resolves to NO ROW rather than the 299 default. **Grant surface finding open — see inventory §11** | Owner decision on `20260831200600`; then served QA |
| E-ELITE-03 | Elite | 2.99 / 19 / 6.99 / 49 become **default suggestions only** | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `bd32c0e9` | `ELITE_DEFAULT_SUGGESTION_RATES` (RP6). Never applied automatically — RP7 refuses instead of defaulting, asserted by test | Surface in the admin form (I-ADM-04) |
| E-ELITE-04 | Elite | Every Elite profile is **versioned** with all nine audit fields | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `20260831150753` | Table + overlap trigger + one-open-version index **applied and proven live**: an overlapping window is refused `23P01`, an adjacent (touching) window is allowed, revocation narrows the window so a later instant resolves to NO ROW | Owner decision on `20260831200600`; then served QA |
| E-ELITE-05 | Elite | No retroactive rewriting; every earned commission snapshots the effective rate | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `20260831150753` | Resolver keys on the earned instant, **proven live**. Also hardened pre-apply: it had `limit 1` with no `order by` (arbitrary pick if the overlap trigger were ever disabled) and returned a null amount beside a real version id for unknown vocabulary — a half-row that reads as resolved and pays null. Both fixed; live `bad_vocab=NO_ROW/no_version` | Served QA once the admin form exists |
| E-HOLD-01 | Hold | Two FULL calendar months, Europe/Madrid, never "60 days"; Jan→Apr 1, Feb→May 1, Dec→Mar 1 | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `holdCalendar.ts` H1–H4, DST-correct | Re-run tests |
| E-HOLD-02 | Hold | Dashboard shows earned / held / eligible date / eligible / batched / transfer / payout / reversed | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Workspace RPC returns commission status + payouts; the 8 distinct states are not all surfaced | UI work in H |
| E-REV-01 | Reversals | Full refund → full reversal; partial → proportional; cap; append-only; dispute lost/won | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `refundAdjustments.ts` R1–R6 | Re-run tests |
| E-REV-02 | Reversals | Post-payout reversal → negative balance offset against future eligible | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `payoutNetting.ts` P3 | Regression test |
| E-REV-03 | Reversals | Customer copy e.g. "Zwrot płatności · −€4.99", never raw codes, no PII | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Display map + guard test |

### F — Stripe Connect + payouts (§14) · CHECKPOINT E

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-CON-01 | Connect | Connected account create/retrieve + hosted onboarding after approval | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `create-connect-onboarding-link` edge fn + `startConnectOnboarding()` exist; never served-proven | Sandbox served run |
| F-CON-02 | Connect | Requirements state · transfers allowed · payouts enabled · resume/update onboarding | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `partners.onboarding_complete` / `payouts_enabled` columns exist; `account.updated` handled | Verify each state renders |
| F-CON-03 | Connect | Gellatti stores no raw bank/document data | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | Hosted onboarding only; no such columns | Assert by schema test |
| F-PAY-01 | Payout | **Monthly payout batch worker** — 1st of month, after reconciliation + tier snapshot | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `40120b3f` | Full execution layer + pg_cron, scheduled AFTER the tier snapshot. **Live transfers are hard-gated**: `payout_release_state` defaults to not released and every money-moving function asserts it | Owner applies migration |
| F-PAY-02 | Payout | €25 default minimum; below → carry forward | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | P2 | Regression test |
| F-PAY-03 | Payout | Dashboard distinguishes Gellatti batch / Stripe transfer / bank payout | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Three-table model supports it; UI unverified | UI work in H |
| F-PAY-04 | Payout | No exact bank arrival date promised | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Copy guard test |
| F-PAY-05 | Payout | Transfer failures + reconciliation tested | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `40120b3f` | All 12 owner failure scenarios covered by guard tests. The reconciler never auto-fails an ambiguous line — assuming failure could double-pay | Served QA |
| F-PAY-06 | Payout | **No live money — production payouts stay disabled until an explicit owner release** | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `40120b3f` | Enforced by `payout_release_state` (defaults false, no policy, no grant) + a test asserting the scheduled batch is test-mode only | Owner release is a separate, deliberate act |

### G — Welcome Partner onboarding (§15) · CHECKPOINT C

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-WEL-01 | Welcome | Approved partner lands on a guided welcome, not the accounting dashboard | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Today approval drops straight into the workspace | Build 5-step flow |
| G-WEL-02 | Welcome | Step 1 — set up to 3 public codes | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Depends on D-CODE-02 | After D |
| G-WEL-03 | Welcome | Step 2 — create first campaign link | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Reuse `LinkGenerator` |
| G-WEL-04 | Welcome | Step 3 — show the Partner's **actual exact** commission table | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Must read the resolved profile (Standard/Gold/Elite-custom), not a constant — depends on E-ELITE-02 | After E-ELITE |
| G-WEL-05 | Welcome | Step 4 — complete Stripe Connect | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Reuse F-CON-01 |
| G-WEL-06 | Welcome | Step 5 — enter Partner Dashboard | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| G-WEL-07 | Welcome | Incomplete Connect → Partner mode still usable for non-payout functions, payout state clearly shown | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |

### H — Partner dashboard (§16) · CHECKPOINT D

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H-DASH-01 | Dashboard | Reads as an earnings/growth workspace, not an admin database | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | 741-line page exists with all 8 sections; design intent not yet judged against §34 | Design pass |
| H-DASH-02 | Dashboard | Top overview: current-month estimated commission · held · eligible · next payout batch | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `Overview` exists; the 4 exact tiles unverified | Verify + build |
| H-DASH-03 | Dashboard | Tier display STANDARD / GOLD / ELITE | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `partner.tier` returned by RPC | Verify |
| H-DASH-04 | Dashboard | If Standard: progress to Gold, e.g. 76 / 100 | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Needs the active-count source — depends on E-GOLD-02 | After E-GOLD-02 |
| H-DASH-05 | Dashboard | Counts: HOME active · PRO active · TOTAL | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Same dependency | After E-GOLD-02 |
| H-DASH-06 | Dashboard | Referral tools: 3 codes · copy · public URLs · campaign builder · copy links · per-campaign performance | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `Codes` + `LinkGenerator` + `ContentLinks` exist | Add 3-slot UI |
| H-DASH-07 | Dashboard | Commissions list: product · cadence · amount · earned · eligible · status · reversal · anonymized customer ref | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `Earnings` exists; eligible date + anonymized ref unverified | Verify |
| H-DASH-08 | Dashboard | Payouts: statement · amount · batch · transfer · bank state · failure messages · negative carry-forward | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `Payouts` exists | Verify |
| H-DASH-09 | Dashboard | Settings: profile · Connect onboarding/update · notification prefs · terms/status | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `Profile` + `Settings` exist | Verify |
| H-DASH-10 | Dashboard | Cancelled subscriptions visible as business effect without PII: Active · Cancels at period end · Ended · Payment failed · Refunded/reversed | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Not surfaced today | Build |
| H-DASH-11 | Dashboard | Future renewals stop creating commission after paid entitlement ends | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | Falls out of C6 + T3 | Regression test |

### I — Admin Partner operating panel (§17) · CHECKPOINT D

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I-ADM-01 | Admin | Application queue: received · review · more info · approve · reject · reason · audit | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `AdminPartnerApplicationsPanel` (225 lines) + admin RPCs exist; "more info" blocked by C-APP-05 | Extend |
| I-ADM-02 | Admin | Partner list with search/filter, status, tier, active HOME/PRO/total, codes, Connect status, held, eligible, lifetime paid | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | `AdminPartnersSection` (474 lines) exists; column set unverified | Audit + extend |
| I-ADM-03 | Admin | Partner detail: identity, status, tier, counts, progress, 3 codes, aliases, links, attribution history, ledger, renewals, cancellations, refunds, chargebacks, adjustments, held, eligible, payout history, failed payouts, Connect, Elite rates, notes, audit | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | — | **No full detail panel exists** — the largest single admin gap | Build |
| I-ADM-04 | Admin | Owner can change: approve/reject · suspend/reactivate/terminate · tier override · assign/remove Elite · Elite rate values · code values · disable code/alias · partner status · permitted payout settings | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | — | Partial (approve/reject, code disable) | Build with I-ADM-03 |
| I-ADM-05 | Admin | Sensitive actions require confirmation + reason + audit | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Audit pattern exists in the 2026-08-26 migration | Apply to every new action |
| I-ADM-06 | Admin | **"Preview as Partner" is strictly read-only** — no impersonated writes | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Security-critical | Build + explicit write-refusal test |

### J — Normal-user referral program (§18–§21) · CHECKPOINT F

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| J-REF-01 | Referral | Separate from professional Partner; reward is free Gellatti time, never cash | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **Nothing exists (0.4 #3)** | Design + migration |
| J-REF-02 | Referral | FIRST PAID PURCHASE ONLY; later renewals create no further reward | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-03 | Referral | Monthly first purchase → referrer +7 days | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-04 | Referral | Annual first purchase → referrer +3 months | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-05 | Referral | Rewards stack (4 annual referrals = 12 months) | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-06 | Referral | PRO referrer → extends PRO; HOME referrer → extends HOME; **never silently upgrade HOME to PRO** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-07 | Referral | No current eligible paid plan → store credit safely, apply when an eligible plan begins | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-08 | Referral | States PENDING / EARNED / APPLIED / REVERSED | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-09 | Referral | Reversed when first purchase fails / void / fully refunded / chargeback / never becomes valid entitlement | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-10 | Referral | Paid first period then merely disabling auto-renew does **NOT** remove an earned reward | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Subtle; needs an explicit test | — |
| J-REF-11 | Referral | Late reversal never cuts into already-paid entitlement; use credit adjustment / future offset | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Mirrors E-REV-02 | Reuse netting pattern |
| J-REF-12 | Referral | **Reward really changes entitlement/billing time** — not a visual badge | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | The hard part. `inviteCodes.ts` I5 grant spec (`days`, `createsStripeObjects:false`) + `entitlements` rows are the reusable primitive | Design against `entitlementResolver` |
| J-REF-13 | Referral | Proven with Stripe Sandbox/Test Clock: +7d, +3mo, stacking, reversal, coherent future billing | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-14 | Referral UX | Account area "Poleć Gellatti" with ONE personal link (not 3 campaign codes) | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-15 | Referral UX | Copy · WhatsApp · Facebook · existing safe share actions | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Reuse existing share infrastructure | Audit `recipe_share_links` share UI |
| J-REF-16 | Referral UX | Dashboard ZDOBYTE / OCZEKUJE / WYKORZYSTANE / COFNIĘTE with the owner's exact examples | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| J-REF-17 | Referral UX | Never expose referred person's PII | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Guard test |
| J-PREC-01 | Precedence | One paid conversion never creates both a Partner cash commission and a normal-user free-time reward for two different owners | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **Deterministic precedence rule must be designed, documented here, and tested** | Design; preserve A2/A3 partner-code authority |
| J-PREC-02 | Precedence | Explicit valid Partner code before conversion is not double-rewarded; one owner per first paid conversion; immutable evidence; no self-referral; no client-side trust | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | With J-PREC-01 |

### EM — Email + notification lane (owner correction §§1–3) · CHECKPOINTS B/E/F/G/H/I

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EMAIL-01 | Email | Canonical site `www.gellatti.com`; canonical mailbox `info@gellatti.com`; From `Gellatti <info@gellatti.com>`; Reply-To `info@gellatti.com` | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Single mailbox by design — no extra public mailboxes unless technically necessary | Constants + config |
| EMAIL-02 | Email | **Provider-agnostic architecture:** business event → persisted job → idempotency → `EmailProvider` port → Resend adapter | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `4d790ecc` | Full chain built: `emailJob.ts` port, `email_jobs` table, `email-dispatch` adapter. The vendor is named in exactly one file | Owner applies migration + deploys the function |
| EMAIL-03 | Email | **Mandatory subject taxonomy** — stable machine-filterable prefixes `[GELLATTI][AREA][EVENT][STATE]` plus a human identifier | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `fe5176e5` | `src/notifications/domain/emailSubject.ts` — all 13 owner-documented subjects asserted literally, both worked examples reproduced, closed enumerated set, 40 tests | Wire into the send lane |
| EMAIL-04 | Email | Structured metadata attached where supported — but sorting must never depend on it | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `4d790ecc` | Sent as `X-Gellatti-*` headers by the adapter; a test proves the subject alone still identifies the message with no metadata present | — |
| EMAIL-05 | Email | **Never silently mark unsent mail as sent.** Job states must distinguish queued / sent / failed / retrying | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `db16a161` | Enforced structurally: `sent` reachable only from `sending` and only with a provider message id; `isDelivered` checks status AND evidence, so a forged row does not read as delivered | — |
| EMAIL-06 | Email | Admin can see failed and pending email jobs relevant to operations | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `be25e29a` | `AdminEmailJobsSection` — first UI under the Designbook. Each row names the state, the meaning and the next action; a `sent` row with no provider id is surfaced as a reportable problem, never a green pill | Served QA after migration |
| EMAIL-07 | Email | A missing credential blocks delivery but never produces a false `sent` | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `4d790ecc` | With no API key the worker records a RETRYABLE failure with a truthful reason and sends nothing; the job delivers itself once the key exists | Owner supplies `RESEND_API_KEY` when ready |
| EMAIL-08 | Email | Idempotency: one business event produces at most one email, replay-safe | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | `4d790ecc` | Deterministic environment-scoped key + a DB unique index; a replay returns the existing job rather than sending twice | — |

### K — QA personas (§22) · CHECKPOINT E/F

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| K-P1 | Persona | P1 Standard monthly partner: own codes, monthly HOME conversion, renewal | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After E/F |
| K-P2 | Persona | P2 Annual partner: annual conversion + later annual renewal | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| K-P3 | Persona | P3 Refund/cancel: commission → refund → reversal → cancellation state | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| K-P4 | Persona | P4 Gold boundary: 99 → 100 → Gold → decline below 100 at the next correct snapshot | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Needs fixtures/Test Clock, **not** 100 browser customers | After E-GOLD-02 |
| K-P5 | Persona | P5 Elite custom: assign, custom profile, rate change, historical commission unchanged | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After E-ELITE |
| K-P0 | Persona | P0 Normal referrer: +7d, +3mo, stacking, reversal | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After J |
| K-COL | Persona | Collision test: P2 tries to take P1's code → MUST FAIL | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After D-CODE-03/04 |
| K-3SIDE | Persona | Every financial test verified from 3 sides: CUSTOMER · PARTNER/REFERRER · ADMIN | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| K-SEC | Persona | QA credentials never exposed in final reports | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | — | Standing rule already followed | — |

### L — Machines (§23–§26) · CHECKPOINT G

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L-MACH-01 | Machines | Dedicated machine route, not a Partner subsection | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **No Miles catalog exists (0.4 #4).** `src/features/machine-catalog` is HOME appliances for formulation — a different domain that must NOT be reused | New feature module |
| L-MACH-02 | Machines | Click-by-click selector, not a raw 11-model table | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| L-MACH-03 | Machines | Q1 where to sell (café / gelateria / restaurant-hotel / events / mobile / new business) | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| L-MACH-04 | Machines | Q2 flavours (1–2 / 3–4 / 5–6 / 7+) | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| L-MACH-05 | Machines | Q3 space (countertop / compact / full counter / mobile) | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| L-MACH-06 | Machines | Q4 priority (lowest entry cost / capacity / mobility / live effect) | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| L-MACH-07 | Machines | "Recommended for you" result: machine, image, starting price, basic verified specs, use cases, benefits, inquiry CTA | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| L-MACH-08 | Machines | Every selector branch reachable, no dead ends, every intended model reachable | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Exhaustive branch test |
| L-MACH-09 | Machines | No online machine checkout; CTA "Wyślij zapytanie" | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| L-MACH-10 | Machines | Inquiry payload carries selector answers + recommended/requested model | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | With P rows |
| L-PRICE-01 | Prices | 11 working prices = supplier purchase × 2; **UFO Sandwich Press excluded** | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | — | **VERIFIED 11/11** against the quotation: every owner price is exactly 2× the EXW price. UFO (€380) correctly excluded. Evidence: `GELLATTI_MACHINE_SPEC_RECONCILIATION.md` §1 | Encode as data + test |
| L-PRICE-02 | Prices | Public wording: transport and destination tax/VAT handled in the final quote; no invented delivered pricing | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Quotation is **EXW China** (Hangzhou Gelato Tech Co., Ltd) — see N-TRAIL-05 for the related Incoterm risk | Copy + guard test |
| L-SPEC-01 | Specs | Model-by-model reconciliation evidence table (field · quotation · brochure · other · selected authority · confidence · conflict) before any public spec | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | this run | **ALL 11 models reconciled** against a real manufacturer spec page. Nothing in the public catalogue rests on a single source. 5 manufacturer questions remain (was 7) | Encode the publishable allow-list in code |
| L-SPEC-02 | Specs | Publish only basic verified fields: dimensions · power · positions · batch capacity · production time · application · price | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Publishable set now defined per model in reconciliation §4. **Weight and peak power are withheld for ALL models** (brochure exceeds quotation on 100 % of models — systematic, not a typo) | Encode the allow-list in the catalog data |
| L-SPEC-03 | Specs | Unresolved fields are omitted — never silently pick the better-looking figure | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Withheld: weight + peak power on the 7 Galaxy Pro units, weight on the Battery Cart, peak power on Milano V2, height on both Milano models, and **V6/V8 power supply (single-phase 220 V vs three-phase 380 V — installation-critical)**. **Milano output anomaly RESOLVED by evidence** — the quotation transposed V1 and V2; brochure is authority | Enforce the omission allow-list in code + test |
| L-STORY-01 | Story | Real capabilities in premium Gellatti language, not pasted brochure text | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After L-SPEC-01 |
| L-STORY-02 | Story | **Manufacturer name is INTERNAL ONLY.** Public pages name the model (V2, V4B, Battery Cart, Milano) with no manufacturer attribution, and never imply Gellatti manufactures the equipment | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **REVERSED by owner correction §5/§14.** Supplier identity stays in procurement, evidence and Admin only. Needs an automated guard so the name cannot leak into a public bundle | Copy + **public-bundle guard test** |

### M — Mobile Miles machines (§27, §28) · CHECKPOINT H

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M-MOB-01 | Mobile | **MOBILE EQUIPMENT is its own product at `/mobile` and does NOT contain the trailer** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **Changed by owner correction §7/§8** — the trailer moved out to `/trailer` (N-TRAIL-01) | Build route |
| M-MOB-02 | Mobile | Mobile equipment set = **Battery Cart · V2C · V4C** (public names, no manufacturer prefix) | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | All three confirmed in the quotation and reconciled against brochures | Build catalog data |
| M-MOB-03 | Mobile | Use cases: events, catering, outdoor, pop-ups, food markets, hotels/restaurants, temporary points | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | — |
| M-MOB-04 | Mobile | Same inquiry-based selector, no checkout | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Reuse L selector |

### N — Complete Gellatti trailer (§29, §30) · CHECKPOINT H

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N-TRAIL-01 | Trailer | Own route **`/trailer`**, "Twój własny mobilny punkt Gellatti." | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **Owner correction §9.** Franchise's `przyczepa` card must link here rather than duplicating the funnel | Build route; re-point franchise card |
| N-TRAIL-02 | Trailer | Base trailer FROM €10,000 · Lokalizacja: Niemcy | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Owner-supplied figure; no supporting document in the machine pack | Copy row |
| N-TRAIL-03 | Trailer | **9-step** configurator: trailer · machine · refrigeration/storage · water/sink · coffee · storage · branding · country/location · inquiry | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **Expanded by owner correction §13** from 5 steps to 9 | Build |
| N-TRAIL-04 | Trailer | Standard trailer ≈3.5 m × 2.1 m, real geometry preserved | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Build from `TRL-D` |
| N-TRAIL-07 | Trailer | **Machine bay rule: MAXIMUM MACHINE DEPTH 600 mm** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **New rule, owner correction §10.** Verified depths: V2 600 ✅ · V4B 600 ✅ · V4 800 ❌ · V6 800 ❌ · V8 800 ❌ · V4C 800 ❌ · Battery Cart 760 ❌. Countertop models (Milano 540, Café Specialty 550) pass on depth but are **countertop, not floor bay** — a different integration | Encode the rule + test |
| N-TRAIL-08 | Trailer | **Nominal dimensions alone never declare a fit.** Service, ventilation, door/access and electrical compatibility must each be verified | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Owner correction §10 explicitly forbids declaring fit from external dimensions | Fit-verification checklist per model |
| N-TRAIL-09 | Trailer | **V2 = CONFIRMED standard-trailer option** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Owner correction §3. V2 is 720 long × 600 deep — meets the 600 mm depth rule exactly and leaves ~620 mm of length spare in the ~1340 mm bay. The only layout that can be drawn honestly today (`T05`) | Build selector option + floorplan |
| N-TRAIL-10 | Trailer | **V4, V6, V8 are CUSTOM TRAILER · ON REQUEST** — never squeezed into the standard floorplan | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Owner correction §12. All three are 800 mm deep, failing the 600 mm bay rule outright | Selector routes them to "Indywidualny projekt przyczepy" |
| N-TRAIL-05 | Trailer | **Never publish "FOB Germany".** Public wording is exactly: "Przyczepa bazowa od €10,000. Lokalizacja: Niemcy. Maszyna, wyposażenie, branding, transport i podatki dobieramy do projektu." | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **RESOLVED by owner correction §9** — the incorrect Incoterm is banned outright rather than deferred | Copy + guard test forbidding the string "FOB" |
| **N-V4B-FIT** | **Trailer** | **TRAILER-V4B-FIT — dimensional compatibility must be proven before any floorplan is frozen** | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | — | **CONFIRMED REAL — not a quotation typo.** Owner drawing equipment zone = **1340** × 600 × 910 mm. **Both** Miles quotation **and** Miles brochure (Galaxy Pro V4-B, p.22) independently state **1370** × 600 × 910 mm. Depth and height match exactly; length is short by **30 mm** | **Measure the physical trailer's clear opening.** Cheapest fix is 30 mm off the cabinetry run, not the machine. Owner correction §3: **V4B = intended standard option, fit pending.** Marketing may list it; the technical floorplan may NOT freeze |

### O — Franchise (§31) · CHECKPOINT I

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O-FRAN-01 | Franchise | Distinct route, not ecommerce | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `/franchise` + `FranchisePage` exist | Content review |
| O-FRAN-02 | Franchise | No invented fee / ROI / turnover / CAPEX / margin promises | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Current copy already says "Szczegóły wymagają rozmowy i potwierdzonego źródła" — good posture | Guard test |
| O-FRAN-03 | Franchise | Hero "Otwórz własne Gellatti." with a premium traditional gelateria visual (display, pans, fresh gelato, live machine, coherent brand) | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Needs FRANCHISE-01..03 assets | After Q |
| O-FRAN-04 | Franchise | Inquiry captures country, city, location status, m², experience, opening time, budget, format, message, contact | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Existing form captures concept/name/email/phone/city/country/note — **missing m², experience, timing, budget, location status** | Extend form + RPC |
| O-FRAN-05 | Franchise | CTA "Porozmawiaj o Gellatti Franchise" | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Current CTA is "Wyślij zapytanie" | Copy change |

### P — Lead operations (§32) · CHECKPOINTS G/H/I

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-LEAD-01 | Leads | Canonical lead storage for machine / mobile / trailer / franchise | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | this run | `business_leads` covers all four paths. Existing franchise rows are imported idempotently; `franchise_inquiries` is left intact so the import is never the only copy | Owner applies migration |
| P-LEAD-02 | Leads | Each lead preserves id, source, route, type, model/format, configurator answers, country/city, contact, timestamp, status, assignee, notes, history | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | this run | All 15 fields present. Sequence-backed reference (`MCH-2026-00142`); configurator answers kept verbatim as jsonb; history is an append-only event log | Owner applies migration |
| P-LEAD-03 | Leads | Statuses NEW / CONTACTED / QUALIFIED / QUOTED / WON / LOST | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | this run | All six, asserted identical in SQL and TS. A legacy `closed` row maps to `qualified` rather than `lost`, because `lost` would assert an outcome nobody recorded | Owner applies migration |
| P-LEAD-04 | Leads | Admin: see all, filter by type/status, open details, see configuration, add notes, update status, audit history | 🟢 | ✅ | ⬜ | ⬜ | 🔓 | this run | `AdminBusinessLeadsSection` — filter by path, humanised configurator answers, inline notes, status moves, expandable history. A settled lead offers no forward move, so reopening is deliberate | Served QA after migration |
| P-LEAD-05 | Leads | Customer gets submission confirmation | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Verify per route |
| P-LEAD-06 | Leads | Admin notified at `info@gellatti.com` via the canonical notification system | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | **UNBLOCKED by owner correction §1–§3.** Subjects must use the §2 taxonomy | After EMAIL-01..06 |

### Q — Asset manifest (§33, owner correction §§15–18 + the owner's 23-asset render list) · **IMMEDIATE PRIORITY**

Briefs, prompts, reference-file assignments and render order live in
**`reports/GELLATTI_WORK_WITH_US_ASSET_MANIFEST.md`**. **The owner's own A/M/MB/T/F/W IDs and
prompts are the authority** (owner-approved addendum, 2026-08-31); Claude supplies the reference
file per render, the geometry guards, and the gap analysis.

**No asset-dependent page may reach OWNER FINAL / 🔒 FROZEN until its final assets are installed;**
neutral placeholders are development-only.

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q-ASSET-00 | Assets | Canonical manifest exists, built on the owner's 23-asset list | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | this run | Owner IDs adopted verbatim as authority; per-asset reference file, geometry guard and mobile-crop rule added | — |
| Q-REF-01 | Assets | **Reference pack extracted so machines are rendered from real images, not descriptions** | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | this run | 12 files at `~/Desktop/PI/machines/REFERENCE-FOR-RENDERS/` — V2, V4, V4B, V6, V8, V2C, V4C, Battery Cart, 2x Milano, 2x context | Attach the matching file to every machine render |
| Q-REF-02 | Assets | **Trailer references to be saved to disk** | ⏳ | ⬜ | ⬜ | ⬜ | 🔓 | — | `TRL-A`/`TRL-B` were pasted into chat only. T01-T04 and the W03 card use them. **Not a blocker for backend work** | **Owner: save both renders to `~/Desktop/PI/machines/trailer/`** |
| Q-A01 | Assets | A01 Partner hero (16:9, 4:5 safe) | ⏳ | ⬜ | ⬜ | ⬜ | 🔓 | — | Render order #2. Serves both `/work-with-us` and `/partner-program` | Owner renders |
| Q-A02 | Assets | A02 community admin · A03 video creator | ⏳ | ⬜ | ⬜ | ⬜ | 🔓 | — | Partner "who this is for" cards | Owner renders |
| Q-A04 | Assets | A04 machines hero · A05 battery-cart hero | ⏳ | ⬜ | ⬜ | ⬜ | 🔓 | — | Render order #3, #4. A05 must show **no power cable** — the battery is the whole claim | Owner renders |
| Q-M01 | Assets | M01-M05 machine scenes | ⏳ | ⬜ | ⬜ | ⬜ | 🔓 | — | M05 lineup must state relative scale or the generator will normalise a 374 mm countertop unit against a 910 mm floor unit | Owner renders |
| Q-MB01 | Assets | MB01-MB03 mobile scenes | ⏳ | ⬜ | ⬜ | ⬜ | 🔓 | — | MB01 mobile crop must be 4:5 not 1:1 — a square frame cuts the 2400 mm canopy off | Owner renders |
| Q-T01 | Assets | T01-T04 trailer photography | ⏳ | ⬜ | ⬜ | ⬜ | 🔓 | — | Owner generates all final renders separately and delivers the files. Waiting, not blocking | Owner renders |
| Q-T05 | Assets | T05 floorplan V2 — **vector, not generated** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | V2 verified to fit: 720 x 600 in a ~1340 x 600 bay, exactly at the 600 mm depth limit, ~620 mm spare | Author SVG |
| Q-T06 | Assets | T06 floorplan V4B | 🔴 | ⬜ | ⬜ | ⬜ | 🔓 | — | **BLOCKED — `N-V4B-FIT`**, owner agrees. 1340 available vs 1370 required, corroborated by two independent supplier sources | Measure the real clear bay length |
| Q-F01 | Assets | F01-F03 franchise | ⏳ | ⬜ | ⬜ | ⬜ | 🔓 | — | Render order #5, #10. Gellatti branding belongs on signage, never on the machine | Owner renders |
| Q-W01 | Assets | W01-W04 gateway cards | ⏳ | ⬜ | ⬜ | ⬜ | 🔓 | — | W03 blocked on Q-REF-02 | Owner renders |
| Q-GAP-01 | Assets | **G1 — V4, V6 and V8 have no visual in the list** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | The three most expensive products (EUR 15,400 / 24,000 / 33,000). `L-MACH-08` requires every model reachable with no dead end, so a V6/V8 recommendation would land on an imageless card. Reference renders already exist in the pack | Edit `V4.png`, `V6.png`, `V8.png` |
| Q-GAP-02 | Assets | **G2 — no isolated product shots for selector result cards** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Every listed asset is a scene; a cafe scene does not read at card size. These are edits, not generations | Edit the 8 reference files |
| Q-GAP-03 | Assets | **G3 — no writer / newsletter persona** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Master prompt §33 required it. Partner promises "dowolny kanal" and the platform strip includes blog + newsletter, but every persona image shows a camera | Render `G-A06` |
| Q-GAP-04 | Assets | **G4 — Milano V1/V2 and Cafe Specialty references** | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | this run | **RESOLVED — the owner was right, the references existed.** Milano V1 = brochure p.2, Milano V2 = brochure p.4, Cafe Specialty = catalogue p.22, all full spec pages. An earlier pass sampled pages instead of reading all of them. All three extracted to the reference pack | Render as edits (G-P1M, G-P2M, G-PCS) |
| Q-ASSET-12 | Assets | **No manufacturer branding in any public asset**; machines stay clean and unbranded; Gellatti branding only on environment/signage/trailer | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Owner correction §5/§6 | Review gate at asset intake |
| Q-ASSET-13 | Assets | **No social platform logos baked into photography** — real vector icons overlaid by the UI | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Owner correction §17. Every Partner brief reserves overlay space | Review gate + icon audit (A-GATE-03) |
| Q-ASSET-14 | Assets | No ugly "asset missing" block survives into an owner-approved page | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Staging currently shows literal "Asset nie jest czescia preview" placeholders | Design graceful fallback |

### R — Design language (§34)

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-DES-01 | Design | Premium · minimal · calm · precise; ivory/charcoal/warm accent; strong type; no SaaS feel; no random blue | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | Follow the V2.1 authority and the existing design-pass method | Per-route design pass |
| R-DES-02 | Design | No internal codes / SQL / engine terms / Stripe IDs / enum labels outside authorized admin developer context | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | `customerCopyGuard.test.ts` already exists — extend it | Extend guard |
| R-DES-03 | Design | All new visible copy through the canonical localization authority; language parity; no hardcoded Polish in business logic | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | `cooperation.ts` has PL+EN and `locale.ts` is the registry | Add keys in both |

### S — Security / privacy (§35)

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-SEC-01 | Security | Server authoritative: never trust client rate / tier / commission / payout status / partner identity | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | No write grants to `authenticated` on any financial table | Preserve; test each new RPC |
| S-SEC-02 | Security | Idempotency · audit · unique constraints · Stripe verification · immutable ledger | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | All present | Preserve |
| S-SEC-03 | Security | Partner sees only own permitted data; never customer name/email/card/recipes/PII | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | RLS is correct; the workspace RPC payload needs an explicit PII audit | PII guard test |
| S-SEC-04 | Security | Admin permissions explicit | 🟢 | ⬜ | ⬜ | ⬜ | 🔓 | `c004d659` | `AdminRouteGuard` + admin RPCs | Preserve |

### T — Testing + served QA (§36, §37)

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | PR/SHA | Problem / Why | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-TEST-01 | Tests | Every checklist row references its tests | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Fill as rows complete |
| T-TEST-02 | Tests | Financial matrix: duplicate/out-of-order webhooks, fail, success, refunds, partial, disputes, renewals, annual, monthly, monthly→annual, idempotency, concurrency | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Large parts exist in the domain tests + `WEBHOOK_MATRIX.md` | Inventory, then fill gaps |
| T-TEST-03 | Tests | Code matrix: collision, edit/history, 3 slots, campaign attribution, 30-day, self-referral | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Partly covered | Fill after D |
| T-TEST-04 | Tests | Tier/rate matrix: 99→100 Gold, decline below 100, Elite custom, rate versioning | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After E |
| T-TEST-05 | Tests | Payout matrix: 2-month hold, threshold, negative carry-forward, Connect incomplete/complete, failed transfer, reconciliation | 🟡 | ⬜ | ⬜ | ⬜ | 🔓 | — | Math covered; worker paths not | After F-PAY-01 |
| T-TEST-06 | Tests | Referral matrix: +7d, +3mo, stacking, 4 annual = 12 months, failed first payment, refund, chargeback, cancel-at-period-end, no double reward, no self-referral, no PII | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After J |
| T-TEST-07 | Tests | Machines matrix: every branch, every model reachable, no dead end, payload, price, disputed spec omitted, mobile+desktop | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After L |
| T-TEST-08 | Tests | Leads matrix: all 4 types, admin receipt, state update, audit, confirmation | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | After P |
| T-SQA-01 | Served QA | Every checkpoint served-verified on staging: signed out, signed in, role, desktop, mobile, empty/loading/error/success, permission boundaries, real DB, real Stripe Sandbox | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | localhost alone is never accepted | Per checkpoint |
| T-SQA-02 | Served QA | Accessibility pass | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | — | — | Per checkpoint |

### DB-ACL — database privilege debt (opened 2026-08-31)

Opened after the live grant check on `partner_rate_profiles`. The finding is structural and predates
this workstream: `ALTER DEFAULT PRIVILEGES` on schema `public`, set by `postgres` **and**
`supabase_admin`, grants `arwdDxtm` (ALL) on **every new table** to `anon` and `authenticated`.
Writing no GRANT does not produce a table with no grants.

| ID | Area | Requirement | Work | Auto | Served | Owner | Freeze | Evidence | Notes | Next |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DB-ACL-01 | DB security | **`public` schema default privileges vs financial tables** — decide whether the project-wide default should keep granting ALL on every new table to `anon`/`authenticated` | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | live `pg_default_acl` | **Not changed by this workstream, by owner instruction.** Changing global default privileges has system-wide consequences and needs its own forensic. Every new table in every future workstream inherits this until it is addressed | Owner schedules the forensic |
| DB-ACL-02 | DB security | Least-privilege forensic — **`commission_entries`** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | live ACL `anon=arwdDxtm, authenticated=arwdDxtm` | Consumer inventory required before any revoke: direct client reads/writes · RPC · SECURITY DEFINER · Edge Function/service-role · Admin · webhook/reconciliation. Classify each privilege NEEDED / NOT NEEDED / UNKNOWN | Forensic, then a proposed migration |
| DB-ACL-03 | DB security | Least-privilege forensic — **`commission_rules`** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | same ACL | as DB-ACL-02 | Forensic |
| DB-ACL-04 | DB security | Least-privilege forensic — **`partners`** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | same ACL | as DB-ACL-02 | Forensic |
| DB-ACL-05 | DB security | Least-privilege forensic — **`partner_codes`** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | same ACL | as DB-ACL-02 | Forensic |
| DB-ACL-06 | DB security | Least-privilege forensic — **`partner_tier_snapshots`** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | same ACL | as DB-ACL-02 | Forensic |
| DB-ACL-07 | DB security | **`partner_rate_profiles` least privilege — CLOSED** | 🟢 | ✅ | ✅ | ⬜ | 🔓 | `20260831153241` | `anon`/`authenticated` revoked entirely; ACL is now `postgres \| service_role` only. Proven with real probes, not `has_table_privilege`: authenticated SELECT/INSERT-own/INSERT-other/UPDATE/DELETE and the resolver call all **DENIED 42501**, anon SELECT **DENIED 42501**, while `service_role` reads 2 rows and the dispatch resolver returns 500 | OWNER QA |
| DB-ACL-08 | DB security | **No new table may rely on inherited default privileges** | 🟢 | ✅ | ✅ | ⬜ | 🔓 | `migrationGrantSurface.test.ts` | Contract over every table this workstream creates: must revoke, must never grant a write to `anon`/`authenticated`, must enable RLS. **Proven to catch drift** — deleting one `revoke` turns it red. `20260831200500` is exempt only because its correction is forward-only in `20260831200600` | Keep green |
| DB-ACL-09 | DB security | Partner dashboard rate-history read has **no privilege today** | ⚪ | ⬜ | ⬜ | ⬜ | 🔓 | `20260831153241` | Consequence of DB-ACL-07, recorded so it is not discovered as a bug later: a partner currently **cannot** read their own rate history, because no consumer exists to justify the grant. §15 step 3 / §16 will need either a narrow grant or (preferred) a SECURITY DEFINER reader | Decide when the dashboard is built |

---

## 2. Counts

| Work status | Count |
| --- | --- |
| 🟢 DONE | 49 |
| 🟡 DOING / partially built | 35 |
| ⏳ WAITING FOR OWNER ASSET (not a blocker) | 9 |
| 🔴 BLOCKED | 4 |
| ⚪ TODO | 106 |
| **Total rows** | **203** |

Auto ✅ **24** · ⬜ 179. Served ⬜ 203 · Owner ⬜ 203 · Freeze 🔓 203.

**The 4 remaining 🔴 blockers**, all needing a physical measurement or a supplier answer:
`N-V4B-FIT` and `Q-T06` (the 30 mm trailer bay), plus two rows downstream of them.

**Everything runtime now waits on two owner actions**, not on more code:
apply the six migrations, and deploy the `email-dispatch` edge function. Per repo
convention (`IMPLEMENTATION_STATUS.md`) migrations are file-first and the owner applies them, and
Claude does not deploy Edge Functions.

The 7 remaining 🔴 blockers are: `N-V4B-FIT` + `Q-T06` (the 30 mm trailer measurement),
`C-APP-05` (a `more_information_needed` application state needs a migration), and four rows
downstream of those.

Nothing is frozen. Nothing has owner approval. Most 🟢 rows are **pre-existing implementations
found by audit**, not work completed by this run — they still need evidence, served QA and owner
sign-off before they can be frozen.

---

## 3. Implementation sequence

The prompt's PHASE order is sound, with one correction: **§39 PHASE 2 (reconcile the OWNER
OVERRIDES) must come before any Partner UI**, because E-ELITE-02 changes the rate resolver that
G-WEL-04, H-DASH-03 and I-ADM-03 all read from, and D-CODE-02/04 change the code schema that
G-WEL-02 and H-DASH-06 render.

1. **PHASE 2 — override reconciliation (schema + domain):** D-CODE-02, D-CODE-04, E-ELITE-02..04,
   E-GOLD-02 (snapshot writer), F-PAY-01 (payout worker). These are the six changes that turn the
   existing engine into the owner's specified engine.
2. **PHASE 3 — gateway (A):** CHECKPOINT A.
3. **PHASE 4/5 — Partner landing, application, approval, welcome (B, C, G):** CHECKPOINTS B, C.
4. **PHASE 6 — dashboard + admin (H, I):** CHECKPOINT D.
5. **PHASE 7 — commission/payout end-to-end (E, F):** CHECKPOINT E.
6. **PHASE 8 — normal referral (J):** CHECKPOINT F.
7. **PHASE 9/10/11 — machines, mobile, trailer (L, M, N):** CHECKPOINTS G, H.
8. **PHASE 12 — franchise (O):** CHECKPOINT I.
9. **PHASE 13/14/15 — assets, personas, regression (Q, K, T):** CHECKPOINT J.

Lead operations (P) land alongside whichever of G/H/I ships first and are extended by each.

---

## 4. Owner decisions — ALL FIVE RESOLVED by the correction of 2026-08-31

| # | Question asked | Owner's answer |
| --- | --- | --- |
| 1 | Email/notification adapter | **Resend**, behind a provider-agnostic `EmailProvider` port. Canonical mailbox `info@gellatti.com`, canonical site `www.gellatti.com`. Mandatory subject taxonomy. Never mark unsent mail as sent. → EMAIL-01..08 |
| 2 | Partner landing route | **`/partner-program`** public, **`/partner`** authenticated dashboard. → B-LAND-01 |
| 3 | Miles branding rights | **Reversed:** the manufacturer name is **internal-only** and must not appear publicly. Public copy uses model names and never implies Gellatti manufactures. → L-STORY-02, Q-ASSET-12 |
| 4 | Trailer Incoterm | **"FOB Germany" is banned.** Publish the owner's exact safe wording instead. → N-TRAIL-05 |
| 5 | Trailer vs franchise overlap | **The trailer is its own product at `/trailer`**, separate from both MOBILE and FRANCHISE. → N-TRAIL-01, X5 |

### New owner actions requested by this run (not blocking development)

1. **Save the two trailer renders to disk** at `~/Desktop/PI/machines/trailer/` — they were pasted
   into chat but cannot be referenced by path, and they are the geometry authority for
   `TRAILER-01/02/03`.
2. **Request isolated product renders** for Milano V1, Milano V2 and Café Specialty from the
   supplier — three catalogue rows cannot be illustrated without them (Q-ASSET-04).
3. **Measure the trailer's real clear bay length** — the single measurement that unblocks
   `N-V4B-FIT`, `TRAILER-05` and the whole V4B standard-trailer option.
4. **Seven questions for the supplier** are collected in
   `reports/GELLATTI_MACHINE_SPEC_RECONCILIATION.md` §5 — weight, Galaxy Pro peak power, the
   V6/V8 power-supply contradiction, Milano output, the DC Cart 12-hour battery option.

## 5. Change log

| Date | Run | What changed |
| --- | --- | --- |
| 2026-08-31 | Audit + checklist creation | Repository audited against §§0–44 on `c004d659`; 137 rows created; 6 override conflicts (X1–X6) and 5 owner decisions recorded; machine quotation extracted and all 11 ×2 prices verified; TRAILER-V4B-FIT confirmed as a real 30 mm conflict from source documents |
