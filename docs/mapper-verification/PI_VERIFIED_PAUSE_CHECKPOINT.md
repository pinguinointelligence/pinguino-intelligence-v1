# PI Verified & Mapper Review — File-First Safe-Pause Checkpoint

File-first safe pause for the professional verification workflow (intake → evidence →
review queue → field resolution → reviewer decision → PI Verified sign-off → immutable
snapshots + audit). Nothing here claims a live-database pass.

> **Reuse, not rebuild.** This layer COMPOSES the existing product architecture — it never
> duplicates identity/dedup/matcher/red-flag/status/snapshot logic. Reused directly:
> `decideProductStatus` (policy), `detectRedFlags`/`blocksAutoVerify`, `resolveProductEngineValues`,
> `productStatusWrite.setProductLifecycleStatus` + `assertVerifiedReview` (the guarded PI
> Verified persistence), `product_snapshots`, and Account Access roles. `mapper_basement`
> stays immutable.

## Exact current commit
`main` @ **42b261d** (origin/main = d15e168 before this slice; commits `4d3ed81 → 42b261d`).

## Status policy (versioned)
Product-level status vocabulary is unchanged: `draft / pi_calculated / pi_generated /
manual_adjusted / pi_verified / rejected` (customer labels PI Calculated / PI Generated /
Manual Adjusted / PI Verified). The **workflow** adds a versioned queue state machine
(`draft → pending_review → assigned → in_review → needs_more_evidence | blocked →
ready_for_signoff → verified | rejected`, plus `reopened`). **PI Verified is granted only**
when the reused `decideProductStatus` (with the reviewer approval) returns `pi_verified` AND
the workflow gate passes; it is never auto-granted by OCR / CSV / match / confidence / save.

## Verification domain (pure, tested)
`src/features/mapper-verification/`: contracts, `reviewRoles` (reviewer/senior_reviewer/
review_admin, consuming Account Access `canAdmin`; admin ≠ partner), `requiredFields`
(versioned, category-aware; PAC/POD never required), `flagSeverity` (blocking/warning/info
taxonomy over the reused detector; the six codes stay blocking), `caseWorkflow` (queue
transitions + the sign-off gate that reuses `decideProductStatus` and mirrors the four
attestations of `assertVerifiedReview`), `queue`.

## Field candidates & provenance
Multi-source `FieldCandidate` (label/OCR/manual/CSV/supplier/manufacturer/barcode/mapper
reference/PI Calculated/PI Generated/previous snapshot/reviewer correction) with full
provenance. Source evidence is append-only; a correction appends a NEW candidate (the source
is never overwritten); rejected candidates stay visible; `absent` candidates carry no value
(unknown is never a fabricated 0).

## Red flags & blockers
Reuses `detectRedFlags`. All six codes are **blocking** and prevent PI Verified; a blocking
flag can only be cleared by resolution or an authorized, reasoned waiver — and even a waived
red-flag product **stays PI Generated, never PI Verified** (R4), because `decideProductStatus`
still caps it.

## Roles
`reviewer` (resolve fields, propose sign-off), `senior_reviewer` (sign-off, waive, reopen),
`review_admin`/Account-Access admin (assign, policy). Authorization by internal user id, never
email; client route visibility is never authorization.

## Migrations & RLS
`supabase/migrations/0026_product_verification.sql` (additive, **file-first, NOT applied**):
`review_roles`, `verification_policy_versions`, `verification_cases`,
`verification_field_candidates`, `verification_field_decisions`, `warning_waivers`,
`review_notes`, `verification_case_events`, `verification_signoffs`. Owner-scoped RLS by
`auth.uid()`; **PI Verified not client-writable** (sign-offs = service-role insert only);
immutable sign-offs (`unique(case_id, revision)` + the four-attestation CHECK); append-only
history; reviewer role not self-grantable; never references `mapper_basement`. Guard test:
`productVerification.migration.test.ts`.

## Services / adapters
`src/services/mapperVerification/inMemoryVerification.ts` — the deterministic reference
adapter (create/submit/assign/add candidate/decide field/waive/propose/verify/reopen; audit;
immutable revisions). PI Verified persistence is **delegated** to the existing guarded
`setProductLifecycleStatus`. **Production Supabase adapter = PARTIAL / launch-gated** (schema
+ domain + in-memory done; concrete Supabase reads/writes + Edge Functions for the
service-role sign-off insert are the next step).

## Test totals (@ 42b261d)
`tsc` 0 · `lint` 0 · `vitest` **3447/3447** (build OK). Verification adds 46 tests (pure 23
+ migration guard 9 + adapter e2e 11 + boundary 3).

## Browser evidence (local / file-first, NOT live)
`/dev/product-verification`: clean case → BLOCKED (unresolved) → resolve → gate READY → PI
Verified sign-off → verified (immutable rev 1 + audit); red-flagged case → BLOCKED by the
reused policy (`got pi_generated`), sign-off refused, stays in_review.

## Unresolved policy decisions (owner)
Required-field policy per category (v1 is a conservative default — confirm before launch);
which categories permit which unknowns; reviewer-role grant governance.

## Reference-gap proposals
Reuse the existing `referenceProposals.ts` + `/dev/reference-proposals` (read-only, insert
always blocked). A structured draft→review→approve→export proposal workflow is a **PARTIAL /
next-step** item; `mapper_basement` is never auto-written.

## Launch-gated (BLOCKED EXTERNAL — PI VERIFIED LAUNCH GATE)
Paid staging; apply 0026; grant reviewer roles; deploy the Edge Function that writes the
service-role sign-off + the guarded `pi_verified` product status; authenticated live E2E
(submit → assign → review → resolve → request evidence → sign off → verify → reopen); verify
RLS + immutable snapshots + audit. See `RESUME_PI_VERIFIED_ON_STAGING_PROMPT.md`.

## Preserved unchanged
Billing (0014–0021), OCR (0022–0024), Account Access (0025), `src/billing/**`,
`src/data/products/**` policy/detector (reused read-only), `mapper_basement`.
