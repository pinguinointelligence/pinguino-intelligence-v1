# INTIMPORT / Product Recognition — suspended workstream handoff

Date: 2026-08-26  
Environment: STAGING only  
Branch: `codex/final-intimport-recognition-closeout`  
Implementation checkpoint before this handoff document: `b0b41a5f7d3b15f8c604c1a3792607623d4e1308`  
Latest `origin/staging` included by that checkpoint: `1c94d67cbafbf2b87d94160403a21c808d0d64a8`

The branch is a strict descendant of the stated `origin/staging` checkpoint. At the
time this document was prepared, `git rev-list --left-right --count
origin/staging...HEAD` returned `0 10`: zero staging commits missing and ten
closeout/merge commits on the handoff branch. The final documentation commit SHA is
recorded by the branch ref and by the parent workstream completion ledger; a commit
cannot truthfully contain its own SHA.

## Why the workstream is suspended

Real staging semantic classification is blocked by the existing OpenAI provider:

```text
HTTP 429
type: insufficient_quota
code: credit_balance_exhausted
model: gpt-5.6-luna
```

`OPENAI_API_KEY` and `OPENAI_PROJECT_ID` are present in staging. This is not a
missing credential, schema-validation failure, or timeout. A fresh, non-cached
staging request reproduced the provider response. No credential, secret, billing
configuration, or OpenAI project was modified.

This suspended work must not be resumed as part of the Admin / Partner / Controlled
Catalog workstream. That new work does not depend on OpenAI.

## Completed work

- One canonical parse → identity → complete enrichment → re-recognition → bounded
  semantic classification → ProductBehavior → safe Mapper completion → materiality
  → Product Accuracy/readiness order.
- Exact-SKU evidence gate and explicit cross-SKU rejection receipts.
- Complete missing-field research planning and exact-barcode Open Food Facts lookup.
- Per-product bounded research; no normal-flow import-wide 14/40 call shortcut.
- Bounded external requests (`15s` OFF, `30s` semantic, `90s` web research).
- Whole-commercial-product recognition for common reusable classes.
- Semantic model/schema/validator shared contract, detailed validation diagnostics,
  bounded representation repair, and persisted provider diagnostics.
- ProductBehavior receives the same canonical semantic assessment used by Mapper.
- Mapper cannot provide trusted completion through unresolved family/form/role.
- Product Accuracy is calculated after final role and provenance; weights,
  threshold `85`, critical cap `84`, Mapper floor `0.85`, and Engine science are
  unchanged.
- General multipack normalization, including `2 × 75 g = 150 g`.
- Verified saturated-fat evidence is preserved as product-owned truth.
- Complete 17-step live trace harness and closeout regression suite.
- First real 100-row web evidence run completed; later cache replay corrected actual
  call telemetry and preserved every semantic request payload.
- Semantic provider failures remain fail-closed and now retain their exact safe
  diagnostic on cache replay.
- Full repository suite after the final INTIMPORT code change: 756 test files
  passed, 3 skipped; 9,370 tests passed, 102 skipped; zero failures.

## Incomplete work

- The final first-100 result is not accepted because 34 unresolved products required
  a real semantic model call and the provider returned `credit_balance_exhausted`.
- The full 820 read-only dry-run is not complete/published. A partial research run
  was stopped safely after a previously unbounded web request exposed the timeout
  seam; its exact-product cache receipts were preserved.
- No isolated naturally READY + TOPPING_ONLY runtime import proof was started.
- No proof recipe or proof PR was created by the final closeout run.
- Poland 820 was not imported.

## First-100 evidence summary

The real source run processed 100/100 products and made 651 web calls. A subsequent
cache replay reported 298 web cache hits and zero new web calls. That replay showed:

```text
semantic model-required products: 34
semantic cache hits: 34
semantic accepted outputs: 0 (provider unavailable)
cross-SKU evidence rejections: 282
Mapper donors accepted: 4
provisional REVIEW: 50
provisional TOPPING_ONLY: 50
```

All seven structural anti-bypass invariants in the trace were zero, but the run must
not be called complete while the 34 real semantic calls are unavailable.

## External artifacts and SHA-256

These generated files deliberately remain outside Git under
`/Users/tomaszboro22/.codex/outputs/intimport_final_closeout_20260826`. They were not
deleted, truncated, or silently regenerated during handoff.

```text
5ae5037ea5fce115a90de3c6d0cc1de106d04f3d802dc1afbc77be15623fe2be  100/ARTIFACTS.json
d869e51d3fde8db04f76ed7152fd69cb15e423fe0dad7a8403c99e0c42ac5c93  100/POLAND_100_CLOSEOUT_SUMMARY.json
9799d774eb55f4fb4dd44202a447e90d6658578d59d63fc5bee56064e6c39089  100/POLAND_100_FINAL_CLOSEOUT.csv
1bc3c4c4eda0ae879a1662125b200a366ef260209c96f5b0560543754a734514  100/POLAND_100_FULL_17_STEP_TRACE.json
75aa2299a8409462d1206b91c79aadf33aab8b5886d74b48f2531c55ad688e65  100_diagnostics/ARTIFACTS.json
a9233c407e2c09c9c11ba522d5c864c3b62b017242f6407a9992cd909ad41432  100_diagnostics/POLAND_100_CLOSEOUT_SUMMARY.json
3af0db23fc0c198fe9b5a99ace984cf0940f24bcbeefb64310c3174d6190da08  100_diagnostics/POLAND_100_FINAL_CLOSEOUT.csv
c9766e822c930efb1c8276b8abb9ab0166cbf56a4be28e9eaa7ab3b5d486ba3d  100_diagnostics/POLAND_100_FULL_17_STEP_TRACE.json
253dbc3f81b4e4e8997b84aabb697aba66894963ba8c0f0d4f9fecaa1e5ab9fa  CURRENT_STAGING_SAFETY_SNAPSHOT.json
81ae416dabe84d9da79fd9099465d8539f4410ab601a1db7cf16271a49da1c7e  SEMANTIC_PROVIDER_BLOCKER.json
```

## Staging deployment checkpoint

Vercel staging project only:

```text
project: pinguino-staging
deployment: dpl_3YamLAPhbkVFcoJvncP1qoqL2rJX
status: Ready
alias: https://staging.pinguinoai.com
```

Supabase staging project only: `tunabqqrwabacxjcxxkz`

```text
intimport-enrich: version 23, ACTIVE, verify_jwt=true
catalog-submit: version 30, ACTIVE
product-import-run: version 1, ACTIVE, verify_jwt=true
```

No production Vercel, production Supabase, production Stripe, DNS, or production
domain action was performed by this workstream.

## Staging database safety snapshot

Read through the canonical clean preflight plus exact read-only counts:

```text
PI mapper-reference products: 2088
PR products: 0
PR versions: 0
PR ProductBehavior bindings: 0
PR matched_basement relations: 0
historical PM products: 19
Mapper rows: 2088
active import runs: 0
active Poland import runs: 0
```

The only run with the exact Poland fingerprint
`6ae1e545b5ccc00b4865544579de57dbd93bedc3d25fe8d839475962a799eca9`
is the preserved historical audit run:

```text
label: Polska — accidental pre-reset run
total_rows: 820
status: ROLLED_BACK
rolled_back_at: 2026-08-24T18:45:08.139793+00:00
```

Therefore Poland 820 is not imported and no active run exists. Historical PM and
rolled-back audit history must not be destructively deleted.

## Safe resume instructions

1. Do not resume in the Admin/Partner worktree. Create or reopen a dedicated
   INTIMPORT worktree at `origin/codex/final-intimport-recognition-closeout`.
2. Fetch `origin/staging`; merge any newer accepted staging commits normally. Never
   force-push and never discard parallel work.
3. Recompute all artifact hashes before relying on cached traces.
4. Confirm the same clean DB preflight and exact Poland fingerprint state.
5. Restore OpenAI API credit for the already-configured staging project; do not
   rotate credentials merely to bypass billing.
6. Make one fresh non-cached staging semantic request. It must return a real
   structured response, not the deterministic fallback.
7. Existing failed semantic receipts are idempotently cached. Resume via an audited,
   bounded retry policy for transient provider failures or a new controlled staging
   QA identity; never raw-delete usage/audit rows.
8. Rerun the exact first 100 on deployed staging. Require all mandatory structural
   invariants and real semantic acceptance/rejection evidence.
9. Only after first-100 acceptance, resume and finish the 820 read-only dry-run. Do
   not click or call the product import path.
10. Only after the 820 report reconciles exactly to 820 may a naturally READY and a
    naturally TOPPING_ONLY pair enter the isolated canonical runtime proof.
11. Roll that proof back through the normal import rollback and delete any proof
    recipe through the normal UI. Re-run the clean DB snapshot.

## Frozen authorities that must remain unchanged on resume

- Product Accuracy weights: `7/45/25/10/8/2/1/1/1`
- readiness threshold: `85`
- critical cap: `84`
- Mapper whole-profile floor: `0.85`
- Mapper dataset/science
- Engine formulas
- PI/PR/PM product-owned runtime identity
- ProductBehavior authority
- cancel/rollback safety and immutable audit history

