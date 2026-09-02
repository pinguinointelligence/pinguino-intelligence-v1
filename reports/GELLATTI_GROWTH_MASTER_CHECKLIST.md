# GELLATTI GROWTH MASTER CHECKLIST

**Canonical ledger — 199 rows** (A12 B9 C16 D7 E17 F16 G12 H22 I14 J8 K22 L10 M9 N25).
Earlier prints said `TOTAL 172`. That denominator was wrong; the row text was always these 199.

**Branch** `claude/gellatti-affiliate` @ `211dee25` · base `origin/staging` (webhook files unchanged since `8b7244eb`)
**Legend** 🟢 proven with evidence · 🟡 built, proof partial · 🔴 blocked · ⚪ not started

```
ARCHITECTURE / AUTHORITY                                                    12/12
A01 🟢 origin/staging SHA recorded          A02 🟢 Partner/Affiliate DB authority audited
A03 🟢 Standard/Gold live 199/900/499/2900 · 249/1400/599/3900
A04 🟢 gellatti_gold_threshold_v1() = 100   A05 🟢 partner_rate_profiles, NO ROW default
A06 🟢 Link/code attribution authority      A07 🟢 Renewal commission — C4/C5 + dispatch
A08 🟢 Application/approval authority       A09 🟢 gellatti_partner_workspace_v1
A10 🟢 Payout eligibility — DB layer NOT applied (deliberate)
A11 🟢 Admin controls — 9 RPCs + 2 panels   A12 🟢 reuse/missing/must-build map

PUBLIC IA / MENU                                                              9/9
B01 🟢 Hamburger entry Affiliate            B02 🟢 Route /affiliate
B03 🟢 Global header authority              B04 🟢 HOME|PRO neutral
B05 🟢 Work With Us out of primary nav      B06 🟢 /work-with-us intact (test)
B07 🟢 No Machines/Trailer/Franchise mix
B08 🟢 Desktop nav — 1440 drawer: Affiliate->/affiliate, no Work With Us, no overflow
B09 🟢 Mobile nav — 390 drawer: identical result

AFFILIATE PAGE — VISUAL / COPY                                               14/16
C01-C14 🟢 hero · CTA · approved/pending · explainer · Standard · Gold ·
           Elite no public rate · "Indywidualne warunki." · audience · 3-step ·
           application · six sections pinned by test
C15 🟡 Desktop visual QA — 1440 local preview: tiers present, Elite no €, 0 overflow
C16 🟡 Mobile visual QA  — 390  local preview: same; SERVED run pending merge

AFFILIATE PUBLIC COPY — FROZEN MEANING                                        7/7
D01-D07 🟢 no "lifetime" · recurring renewals · attribution · Standard vs Gold ·
           threshold interpolated · no digit in any Elite string · 18-pattern leak guard

AFFILIATE CALCULATOR                                                        15/17
E01-E14 🟢 implemented · Standard · Gold · 4 inputs · monthly · annual-renewal ·
           total · average · Elite no rate · Elite routes to conversation
E15 🟢 Invalid input proven in-browser: negative->0, text->0, huge clamps at 1e6
       10 HOME-m + 5 PRO-m = 44,85 € ; +3/2 annual = 85 € ; 623,20 €/yr ; 51,93 €/mo
E16 🟡 Calculator desktop QA (local 1440)   E17 🟡 Calculator mobile QA (local 390)

AFFILIATE APPLICATION                                                         1/16
F01 🟢 Existing authority reused — same panel, same RPC, same row
F02-F16 ⚪ signed-out/in flow · attribution · schema · validation · double-submit ·
           success · error · no code leak · pending · admin see/approve/reject/
           more-info · applicant status        [needs served sign-in]

AFFILIATE LINK / CODE            G01-G12 ⚪  backend exists, served proof pending
COMMISSION ENGINE                H01-H22 ⚪  backend exists; no Stripe TEST event available
AFFILIATE DASHBOARD              I01-I14 ⚪
PAYOUT / SETTLEMENT              J01-J08 ⚪  kill switch stays OFF (checkpoint §4)

REFER-A-FRIEND — REGULAR USER                                               17/22
K01 🟢 "Poleć Gellatti" in /account         K02 🟢 Code GPQPBPM6, mint idempotent
K03 🟢 Separate from Affiliate — copy guard bans money words; links out to /affiliate
K04 🟢 Monthly = +7 days (live)             K05 🟢 Annual = +30 days (live)
K06 🟢 HOME referrer temp PRO — 7 d auto-activated, ends 2026-09-09 (live)
K07 🟡 PRO referrer banks instead — implemented + copy; not live-proven for a PRO referrer
K08 🟢 PRO Bonus Bank — live 30 -> 0
K09 🟢 Billing cycle never modified — no billing write; webhook test asserts no
       commission/payout/rate/tier call from the reward lane
K10 🟡 Bank persists across renewals — settle fn present, no live renewal
K11 🟡 Activates when paid PRO would end — proven for "no paid PRO"; not at expiry
K12 🟢 No duplicate — duplicate_invoice AND first_purchase_already_rewarded (live)
K13 🟢 Failed payment -> no reward — unpaid + zero-value never reach the recorder
K14 🟢 Refund/void reverses — live reversal, bank 30 -> 0; dispute path tested
K15 🟢 Self-referral refused (live)          K16 🟢 Status visible (reversed shown struck)
K17 🟢 Earned days visible                   K18 🟢 Remaining bank visible
K19 🔴 Monthly HOME served proof             K20 🔴 Monthly PRO served proof
K21 🔴 Annual HOME served proof              K22 🔴 Annual PRO served proof
       BLOCKED: no Stripe CLI, no signing secret, and I must not enter card numbers

SECURITY / PRIVACY                                                           9/10
L01 🟢 Public page exposes no private data
L02 🟢 Own dashboard only — 0 victim rows visible as another authenticated user
L03 🟢 Cannot mutate commissions — RLS enabled, only a SELECT policy exists
L04 🟢 Cannot set own tier — partners UPDATE affects 0 rows
L05 🟢 Cannot set own rate — no INSERT/UPDATE policy on partner_rate_profiles
L06 🟢 Elite rate admin-only — authenticated cannot even SELECT the table
L07 🟢 Cannot mint rewards — table AND recorder function both permission-denied
L08 🟢 Cannot modify own bank — entitlements INSERT violates RLS; UPDATE 0 rows
L09 🟢 RLS proven by 15 negative attempts, every one refused
L10 🟡 Anonymous limited — anon blocked on referral tables; BUT anon still holds
       table-level INSERT/UPDATE/DELETE/TRUNCATE grants on commission_entries.
       RLS is currently the only barrier. Recorded as a defence-in-depth gap.

REGRESSION / EXISTING PRODUCT                                                 2/9
M01 ⚪ HOME  M02 ⚪ PRO  M03 ⚪ Shop  M04 🟡 Work With Us route (test, needs served)
M05 ⚪ Franchise  M06 ⚪ Global header  M07 ⚪ Partner data  M08 ⚪ Commission history
M09 🟢 No Production/main change — every DB op and the deploy targeted staging only

FINAL QA / DELIVERY                                                          7/25
N01 🟢 Focused tests            N02 🟢 Typecheck exit 0     N03 🟢 Lint exit 0
N04 🟢 Owner-locked exit 0      N05 🟢 Protected-paths 0    N06 🟢 Build exit 0
N07 🟢 Full suite — 11 361 passed, 0 test failures (4 files fail to LOAD from a
       node_modules symlink + sandbox font denial; none are mine)
N08 ⚪ PR CI  N09 ⚪ Normal merge  N10 ⚪ No --admin  N11 ⚪ No force
N12 ⚪ Staging alias = merge deployment      N13 ⚪ meta.githubCommitSha == merge SHA
N14 🟡 /affiliate 1440 (local)  N15 🟡 /affiliate 390 (local)
N16 🔴 Application->approval->link->paid served    N17 🔴 Recurring renewal proof
N18 🟢 Calculator proof — real DOM, real keystrokes
N19 🔴 Referral monthly served  N20 🔴 Referral annual served
N21 ⚪ Dashboard served  N22 ⚪ Admin served
N23 ⚪ No known unfinished item  N24 ⚪ OWNER QA package  N25 ⚪ STOP
```

## Webhook v24 — deployment record

| | |
|---|---|
| Project ref | `tunabqqrwabacxjcxxkz` (pinguino-staging) |
| Function | `stripe-webhook` **version 24**, ACTIVE |
| `verify_jwt` | **false** (preserved from v23 — a webhook authenticates by signature) |
| Source authority | working tree @ `211dee25`; `supabase/functions/**` identical to `origin/staging` |
| Byte check | all 5 deployed files SHA-256 match the tested tree |
| Boot probe | unsigned POST -> `HTTP 400 {"error":"missing_signature"}` |

v24 also shipped shop settlement + `checkout_session_expired`, merged on staging
(`80f73dc5`) but never deployed. Supabase deploys whole functions, so this could
not be separated from the referral change.
