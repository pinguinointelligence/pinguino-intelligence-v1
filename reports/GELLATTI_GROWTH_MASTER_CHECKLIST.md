# GELLATTI GROWTH MASTER CHECKLIST

**Canonical ledger. 199 rows (A12 B9 C16 D7 E17 F16 G12 H22 I14 J8 K22 L10 M9 N25).**
Earlier prints said TOTAL 172 — that denominator was wrong; the row text was always these 199.
Legend: 🟢 done+evidence · 🟡 built, proof pending · ⚪ not started · 🔴 blocked

```
ARCHITECTURE / AUTHORITY
A01 🟢 Fetch current origin/staging and record exact SHA — 843ca841
A02 🟢 Audit existing Partner/Affiliate DB authority before changing anything
A03 🟢 Audit existing rate profiles and prove exact Standard/Gold values — live DB match
A04 🟢 Audit Gold threshold authority — gellatti_gold_threshold_v1() = 100
A05 🟢 Audit Elite/custom-rate authority — partner_rate_profiles, applied
A06 🟢 Audit link/code attribution authority — referral_clicks/attributions + attribution.ts
A07 🟢 Audit recurring renewal commission authority — C4/C5 + dispatch.ts
A08 🟢 Audit application / approval / more-information authority — applied live
A09 🟢 Audit affiliate dashboard authority — gellatti_partner_workspace_v1 + PartnerPage
A10 🟢 Audit payout eligibility authority — domain OK; DB execution layer NOT applied
A11 🟢 Audit current Admin controls — AdminPartnersSection + applications panel
A12 🟢 Produce "reuse / missing / must-build" architecture map

PUBLIC IA / MENU
B01 ⚪ Add canonical hamburger item: Affiliate
B02 ⚪ Add route /affiliate
B03 ⚪ /affiliate uses global header authority
B04 ⚪ HOME|PRO remain visible and neutral on Affiliate
B05 ⚪ Remove Work With Us from primary hamburger navigation
B06 ⚪ Keep old Work With Us route intact
B07 ⚪ Do not mix Machines / Trailer / Franchise into Affiliate
B08 ⚪ Verify desktop navigation
B09 ⚪ Verify mobile navigation

AFFILIATE PAGE — VISUAL / COPY
C01 ⚪ Hero implemented          C02 ⚪ Hero communicates recurring commissions
C03 ⚪ Primary CTA works         C04 ⚪ Approved → "Open Affiliate Panel"
C05 ⚪ Pending honest state      C06 ⚪ Recurring-commission explainer
C07 ⚪ Public Standard rates     C08 ⚪ Public Gold rates
C09 ⚪ Elite shows NO public rate C10 ⚪ Elite "Individual terms / Talk to us"
C11 ⚪ Audience section          C12 ⚪ 3-step flow
C13 ⚪ Application section       C14 ⚪ Page remains concise
C15 ⚪ Desktop visual QA         C16 ⚪ Mobile visual QA

AFFILIATE PUBLIC COPY — FROZEN MEANING
D01 ⚪ No vague "lifetime income"      D02 ⚪ States recurring paid renewals
D03 ⚪ Attribution explained simply    D04 ⚪ Standard vs Gold understandable
D05 ⚪ Gold threshold from canonical authority
D06 ⚪ Elite custom terms, no public numbers
D07 ⚪ No internal SQL/Solver/backend terminology leaks

AFFILIATE CALCULATOR
E01 ⚪ Calculator implemented   E02 ⚪ Standard mode      E03 ⚪ Gold mode
E04 ⚪ HOME monthly input       E05 ⚪ HOME annual input
E06 ⚪ PRO monthly input        E07 ⚪ PRO annual input
E08 ⚪ Uses canonical rate authority, no duplicated magic numbers
E09 ⚪ Monthly commission from monthly plans
E10 ⚪ Annual-renewal commission component
E11 ⚪ Total estimated annual commission
E12 ⚪ Average monthly equivalent
E13 ⚪ Elite has NO calculator rate   E14 ⚪ Elite routes to conversation
E15 ⚪ Zero / large / invalid inputs tested
E16 ⚪ Calculator desktop QA    E17 ⚪ Calculator mobile QA

AFFILIATE APPLICATION
F01 ⚪ Existing authority reused      F02 ⚪ Signed-out flow
F03 ⚪ Signed-in flow                 F04 ⚪ Existing account attributed
F05 ⚪ Required fields → canonical schema   F06 ⚪ Validation
F07 ⚪ Double-submit impossible       F08 ⚪ Success state
F09 ⚪ Error state                    F10 ⚪ No internal error codes leak
F11 ⚪ Pending status persists        F12 ⚪ Admin sees application
F13 ⚪ Admin approve                  F14 ⚪ Admin reject
F15 ⚪ Admin "more information"       F16 ⚪ Applicant sees updated status

AFFILIATE LINK / CODE
G01 ⚪ Unique canonical code     G02 ⚪ Unique canonical link
G03 ⚪ Link opens destination    G04 ⚪ Click recorded
G05 ⚪ Code attribution          G06 ⚪ Link attribution
G07 ⚪ Assignment persists       G08 ⚪ Self-attribution blocked
G09 ⚪ Duplicate/invalid handled G10 ⚪ Dashboard exposes link/code
G11 ⚪ Copy-link works           G12 ⚪ Copy-code works

COMMISSION ENGINE
H01 ⚪ Std HOME monthly   H02 ⚪ Std PRO monthly   H03 ⚪ Std HOME annual
H04 ⚪ Std PRO annual     H05 ⚪ Gold HOME monthly H06 ⚪ Gold PRO monthly
H07 ⚪ Gold HOME annual   H08 ⚪ Gold PRO annual
H09 ⚪ Gold at 100 threshold      H10 ⚪ 99/100/101 tests
H11 ⚪ Elite custom rate internal H12 ⚪ Elite public hidden
H13 ⚪ Initial payment → commission
H14 ⚪ Renewal → ANOTHER commission
H15 ⚪ Failed payment → none      H16 ⚪ Refund/invalid handled
H17 ⚪ Monthly HOME recurring proof   H18 ⚪ Monthly PRO recurring proof
H19 ⚪ Annual HOME renewal proof      H20 ⚪ Annual PRO renewal proof
H21 ⚪ No duplicate per settlement    H22 ⚪ Attribution stays correct

AFFILIATE DASHBOARD
I01 ⚪ Tier visible        I02 ⚪ Personal rate visible
I03 ⚪ Elite personal rate I04 ⚪ Click count
I05 ⚪ Assigned customers  I06 ⚪ Paying customers
I07 ⚪ Pending commission  I08 ⚪ Eligible commission
I09 ⚪ Paid history        I10 ⚪ Link and code visible
I11 ⚪ Gold progress       I12 ⚪ No other affiliate's data
I13 ⚪ Mobile dashboard    I14 ⚪ Desktop dashboard

PAYOUT / SETTLEMENT
J01 ⚪ Minimum payout authority verified   J02 ⚪ Canonical minimum = 25 €
J03 ⚪ Two-full-calendar-month maturity    J04 ⚪ Pending → eligible transition
J05 ⚪ Ineligible cannot be paid           J06 ⚪ Eligible test payout path
J07 ⚪ No live payout occurs               J08 ⚪ Understandable payout status

REFER-A-FRIEND — REGULAR USER
K01 ⚪ "Poleć Gellatti" entry      K02 ⚪ Unique referral link/code
K03 ⚪ Separate from Affiliate     K04 ⚪ Monthly → +7 PRO days
K05 ⚪ Annual → +30 PRO days       K06 ⚪ HOME referrer gets temp PRO
K07 ⚪ PRO referrer keeps value    K08 ⚪ PRO Bonus Bank
K09 ⚪ Stripe cycle NOT modified   K10 ⚪ Bank persists across renewals
K11 ⚪ Days activate when paid PRO would end
K12 ⚪ No duplicate first-purchase reward
K13 ⚪ Failed payment → no reward  K14 ⚪ Refund → no valid reward
K15 ⚪ Self-referral blocked       K16 ⚪ Referral status visible
K17 ⚪ Earned bonus days visible   K18 ⚪ Remaining bank visible
K19 ⚪ Monthly HOME served proof   K20 ⚪ Monthly PRO served proof
K21 ⚪ Annual HOME served proof    K22 ⚪ Annual PRO served proof

SECURITY / PRIVACY
L01 ⚪ Public page exposes no private data   L02 ⚪ Own dashboard only
L03 ⚪ Cannot mutate commissions             L04 ⚪ Cannot set own tier
L05 ⚪ Cannot set own rate                   L06 ⚪ Elite rate admin-only
L07 ⚪ Cannot mint rewards                   L08 ⚪ Cannot modify own bank
L09 ⚪ RLS proven by negative attempts       L10 ⚪ Anonymous limited

REGRESSION / EXISTING PRODUCT
M01 ⚪ HOME  M02 ⚪ PRO  M03 ⚪ Shop  M04 ⚪ Work With Us route
M05 ⚪ Franchise  M06 ⚪ Global header contracts  M07 ⚪ Partner data preserved
M08 ⚪ Commission history preserved  M09 ⚪ No Production/main changes

FINAL QA / DELIVERY
N01 ⚪ Focused tests  N02 ⚪ Typecheck  N03 ⚪ Lint  N04 ⚪ Owner-locked
N05 ⚪ Protected-paths  N06 ⚪ Build  N07 ⚪ Full suite  N08 ⚪ PR CI
N09 ⚪ Normal merge  N10 ⚪ No --admin  N11 ⚪ No force
N12 ⚪ Staging alias = merge deployment  N13 ⚪ meta.githubCommitSha == merge SHA
N14 ⚪ /affiliate desktop 1440  N15 ⚪ /affiliate mobile 390
N16 ⚪ Full application→approval→link→paid flow served
N17 ⚪ Recurring renewal commission proof  N18 ⚪ Calculator served proof
N19 ⚪ Referral monthly proof  N20 ⚪ Referral annual proof
N21 ⚪ Dashboard served proof  N22 ⚪ Admin served proof
N23 ⚪ No known unfinished item  N24 ⚪ OWNER QA package  N25 ⚪ STOP
```
