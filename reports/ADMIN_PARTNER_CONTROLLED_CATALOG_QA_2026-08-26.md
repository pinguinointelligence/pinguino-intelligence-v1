# Gellatti Admin / Partner / Controlled Catalog — final staging ledger

Date: 2026-08-26  
Environment: STAGING only  
Implementation branch: `codex/admin-partner-controlled-catalog`  
Deployed application source: `6b0e3551`  
Vercel deployment: `dpl_CRFahN6UACpp3LBcwKrikBbpFawX` (`READY`)  
Staging URL: `https://staging.pinguinoai.com`  
Supabase staging project: `tunabqqrwabacxjcxxkz`

This ledger records the implementation, server/RLS proofs, browser QA, database state,
test gate and deployment for the controlled catalog workstream. It does not promote the
branch to `staging`; it leaves that review/merge decision to the owner.

## 1. INTIMPORT checkpoint

- Branch: `codex/final-intimport-recognition-closeout`.
- Pushed handoff SHA: `9bfae5b6a6c2046838b522a948ed641caff1bbab`.
- Handoff: `reports/INTIMPORT_RECOGNITION_HANDOFF_2026-08-26.md` on that branch.
- External blocker: a fresh real staging semantic request returned OpenAI HTTP 429,
  `insufficient_quota / credit_balance_exhausted`. No credential or billing setting was
  modified.
- Preserved external artifacts: `/Users/tomaszboro22/.codex/outputs/intimport_final_closeout_20260826`;
  the handoff contains the exact file list and SHA-256 hashes.
- Recovery: reopen a dedicated worktree from the pushed checkpoint, merge the newest
  `origin/staging`, verify artifact hashes and the clean DB preflight, restore credit in the
  already configured staging project, prove one fresh non-cached semantic response, then
  rerun first 100 before the read-only 820 census. Do not import until those gates pass.
- Poland 820 remains unimported: no active Poland run, no unrolled ledger rows and no
  products created by the historical rolled-back run remain.

## 2. Requested scope and completed modules

The binding user flow is now approved exact catalog match or Product Add Request. A user
cannot turn Scanner/manual evidence into a recipe-usable PM/PR or create Mapper/ProductBehavior
authority. Admin approval is the only path from a request to an official `PR-ING-*`.

Completed connected modules:

1. Home / Pro / Partner / Admin account modes and role-aware switcher.
2. Ten-module Admin workspace: Overview, Product Requests, Catalog & Countries, Users,
   Subscriptions & Revenue, Partners, Community & Content, Operations, Audit Log and Admin
   Settings.
3. Scanner exact-match-or-request finalization without OCR/camera redesign and without an
   OpenAI dependency for raw-evidence submission.
4. Product request submission, evidence, missing-fields conversation, immutable events,
   resubmission, archive/reopen, cancel, reject, duplicate and canonical approval.
5. Market-country preferences separated from country of origin; Favorites remain an
   independent overlay.
6. Durable user/Admin notifications, acknowledgement and test/live finance distinction.
7. Admin-controlled Partner invitation/lifecycle, Partner self-service workspace, public
   profile, three active codes, content links and existing referral/commission/payout views.
8. Separate exact-email one-time Home invitation redemption.
9. Server-confirmed Stripe payment notifications and local WebAudio coin sound with explicit
   unlock, session/event dedupe and visible fallback.

## 3. Architecture inventory and reused authorities

The pre-implementation matrix is in `reports/ADMIN_SYSTEM_INVENTORY.md`.

Reused rather than duplicated:

- Supabase Auth, `profiles`, append-only account state, entitlements and billing state.
- Canonical `products`, immutable `product_versions`, variants/markets, evidence,
  ProductBehavior bindings and `catalog-submit` creation/retirement authority.
- `user_product_relations` for Favorites and `product_variant_markets` for SKU markets.
- Existing Scanner acquisition/analyze flow; only the final persistence seam changed.
- Existing Stripe webhook/event, customer subscription, attribution, commission, adjustment,
  payout and Stripe Connect authorities.
- Existing Community publications/reports/creator attribution; private recipes remain outside
  moderation read models.
- Existing Partner/referral ledgers and one-time invite domain; tracking and Home invite codes
  remain separate concepts.
- Existing append-only audit authority and import cancel/rollback paths.

No parallel product catalog, billing truth, commission ledger, Mapper dataset or private recipe
support view was created.

## 4. Database, migrations, RLS and roles

Applied to staging and present in the remote migration ledger:

- `20260826120000_admin_partner_controlled_catalog.sql`
- `20260826121000_controlled_catalog_read_models.sql`
- `20260826122000_partner_workspace_and_public_links.sql`
- `20260826123000_admin_operational_actions.sql`
- `20260826124000_product_request_missing_field_conflict_fix.sql`
- `20260826125000_admin_catalog_guard_context_fix.sql`
- `20260826126000_partner_content_link_random_fix.sql`
- `20260826127000_admin_product_request_pr_authority.sql`
- `20260826128000_product_request_persisted_role_readiness.sql`
- `20260826129000_admin_catalog_retire_preflight.sql`
- `20260826130000_admin_catalog_retire_preflight_hash_key.sql`
- `20260826131000_referral_click_dedupe_conflict_fix.sql`
- `20260826132000_admin_product_request_filter_projection.sql`
- `20260826133000_admin_product_request_exact_candidate_columns.sql`

Created request/notification/control records include `catalog_market_countries`,
`product_add_requests`, evidence/events/missing-fields/user-state, contributed-product links,
durable notifications/receipts, Admin preferences, Partner invitations/public profiles/content
links, complimentary-grant audit and Partner Admin notes. Existing product, market, billing,
Partner, referral, commission, payout and audit tables remain the authorities.

RLS is enabled on all new private records. Owner-read policies scope requests, evidence,
events, user state, contributions and notifications. Partner owner policies scope profile and
link data. Permission-filtered Admin reads and storage policies cover operational review.
Consequential writes use RPC/Edge server checks. The permission model supports
`SUPER_ADMIN`, `CATALOG_ADMIN`, `SUPPORT_ADMIN`, `PARTNER_ADMIN`, `FINANCE_ADMIN` and
`CONTENT_MODERATOR`.

Staging Edge functions verified ACTIVE after deployment:

- `admin-control` v1, JWT required.
- `redeem-home-invite` v1, JWT required.
- `partner-link-resolve` v1, public resolver with bounded approved destinations.
- `product-scan-finalize` v20, JWT required.
- `catalog-submit` v34.
- `create-checkout-session` v23, JWT required.
- `stripe-webhook` v23.

## 5. Admin proof

- The staging-only seed is idempotent, paginates Auth users and assigns `SUPER_ADMIN` through
  the canonical role table. The requested test account logged in through the normal login;
  its password is not present in client code or this ledger.
- Admin mode and `/admin` opened, and all ten required modules rendered with live staging
  read models.
- Product Requests exposed all required queue views, filters, missing-field controls, event
  history and final approval preview without requiring raw JSON.
- Desktop and mobile layouts, drawer, keyboard-visible controls and mode switching were
  inspected in real staging.
- A normal Pro account received the server/RLS-backed `403` Admin denial. The same denial was
  re-smoked after the final deployment at source `6b0e3551`.
- Transactional rollback proofs showed a normal user cannot invoke Admin RPCs, approve a
  request or forge canonical PR creation.

Screenshots:

- `screenshots/controlled-catalog-admin-overview-desktop.png`
- `screenshots/controlled-catalog-admin-overview-mobile.png`
- `screenshots/controlled-catalog-admin-403-pro.png`
- `screenshots/controlled-catalog-admin-test-payment-sound.png`

## 6. Product request lifecycle proof

- Canonical approval request: `215b7e6e-6e13-453c-8471-d920d71f562d` (display request 20).
- Resulting official product: `PR-ING-007140`, UUID
  `fabeed8f-fdf2-4181-81f5-10ee06a5c13d`.
- Immutable version: `b51bf61d-a047-48b8-b3e0-b960f95bb8c2`.
- Product Accuracy: `94.8`; Engine usable; base eligible; ProductBehavior persisted; no
  runtime PI/Mapper binding or `matched_basement_id` authority.
- The request became APPROVED, contributor/favorite/notification projections were created,
  and the official product was retired afterward through the canonical preflight/retire path.
  Its immutable history remains; it is inactive and not usable.
- Needs-info lifecycle request: `54312ee3-39f9-4442-9d68-3a7ca8e2dab7` (display request 21).
  It covered missing barcode/nutrition controls, persistent user notice, archive, reopen and
  resubmission, then ended through canonical user cancel. No product was created.
- Duplicate behavior was proven through the exact-candidate server/RLS path and automated
  regression: it links the existing article/favorite and does not create a PR or contribution.
- A forged normal-user approval/ingest edge request returned HTTP 403.

## 7. Country filters and Favorites

Real Pro browser QA selected ES + PL, persisted the settings, then disabled PL. Normal search
returned to ES while the market scope controls retained all-country expansion. A database
rollback proof verified that a Polish Favorite remains visible through the Favorites overlay
when PL is disabled. Final QA restored the user's prior ES/default state.

The data model keeps market availability on the exact SKU many-to-many relation and country
of origin as product evidence; one is not inferred from the other.

## 8. Partner proof

Dedicated staging Partner browser fixture:

- Auth user UUID: `e01ef757-78fd-42d4-8bd4-32ccfe458981`.
- Invitation UUID: `d4f12140-54d2-44bd-a905-503b28a41940`.
- Partner UUID: `efddf3d6-9d13-47e7-ba95-bcf50302d79e`.
- Approved public slug: `qa-browser-partner`.

Normal login auto-accepted the exact-email invitation, issued free Home + Pro, showed the
activation notice and exposed Home / Pro / Partner modes. All eight Partner modules rendered.
The Partner created three active codes; the fourth was blocked, one was archived with history
preserved, and a replacement became available. Final state is three active and one retired.

The browser-generated approved content link
`/qa-browser-partner/qabrowser-b/l/0f2971a9679059609adc22cd` resolved to `/subscription`,
recorded one click and preserved one pending attribution. The exact route was re-smoked on the
final deployment. No arbitrary external redirect is accepted. Public profile fields validate
HTTPS/social URLs and safe logo constraints.

Existing commission/refund/payout/Connect authority was not replaced. Transactional proofs
covered click dedupe, signup/purchase attribution, unique Stripe events, refund adjustment,
Partner-own visibility, Admin-all visibility and Partner A/B isolation. Connect remained the
payout mechanism and displayed its real pending onboarding state.

Screenshots:

- `screenshots/controlled-catalog-partner-overview-browser.png`
- `screenshots/controlled-catalog-partner-codes-browser.png`
- `screenshots/controlled-catalog-partner-public-destination.png`

## 9. Subscription notification and cash sound

One auditable TEST-mode staging event was intentionally retained:

- Stripe-style event: `evt_gellatti_admin_sound_20260826_1350684b`.
- Invoice: `in_gellatti_admin_sound_20260826_1350684b`.
- Amount: 1,234 EUR cents; `livemode=false`.
- Notification UUID: `1078e8f2-2e4f-4f2a-9151-cc1ac7aeafb0`.
- Recorded audio delivery: `sound_played_at=2026-08-26 10:38:41.303793+00`.

Admin explicitly enabled and unlocked WebAudio. The UI showed TEST and 12.34 EUR; sound played
once. Rollback proofs covered duplicate event/invoice suppression, a second unique paid event,
zero-value and failed payments, and refund notification without a positive sound. Durable
visual notification remains the fallback when audio is blocked/muted.

## 10. Tests and regression gate

Focused regression runs after the two staging browser findings:

- Account-mode/drawer fix: 4 files, 34 tests, 0 failures.
- Admin-authenticated drawer/account fix: 3 files, 26 tests, 0 failures.
- Two unrelated existing constraint tests initially exceeded the five-second CPU timeout;
  each passed in the immediate focused run (39/39). The required final uninterrupted rerun
  below then passed without retry or failure.

Final uninterrupted command:

```text
npm ci && npm test && npm run typecheck && npm run lint && npm run build && npm run catalog:mapper-only:validate && npm run production-rescue:bundle-check && git diff --check
```

Final results after merging the newest accepted `origin/staging`:

- Vitest: 741 files passed, 20 skipped; 9,365 tests passed, 119 skipped; 0 failures.
- TypeScript: PASS.
- ESLint: 0 errors; four known Fast Refresh warnings at `src/app/router.tsx:62`,
  `RecipeVersionsSection.tsx:32`, and `RecipeVersionSelector.tsx:127,139`.
- Vite production build: PASS, 1,497 modules.
- Mapper-only validation: PASS; 2,088 rows; SHA-256
  `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`; 2,075 current
  Base-selectable products.
- Production Rescue bundle check: PASS; SHA-256
  `7f8ddb42c04cc03acc68bec78dd886742a8e42a8c6a55aa77451445dbbc77118`.
- `git diff --check`: PASS.

The full suite retested Product Picker/search, PI/PR behavior, recipe/save/reopen, Engine,
ProductBehavior, Production, labels, Favorites, Community/creator/referral, billing,
commission/refund/payout, Scanner exact match, import cancel/rollback and Mapper immutability.

## 11. Deployment

- Vercel project: `pinguino-staging` only.
- Deployment ID: `dpl_CRFahN6UACpp3LBcwKrikBbpFawX`.
- Deployment URL:
  `https://pinguino-staging-dlv77dq38-pinguinointelligence-7784s-projects.vercel.app`.
- State: `READY`; custom staging alias explicitly assigned.
- `https://staging.pinguinoai.com/?deploy=6b0e3551` returned HTTP 200 and the new asset
  `assets/index-CtfGOOwo.js`.
- Final browser smoke: the tracked Partner content link resolved to `/subscription`; a normal
  Pro user received the explicit `/admin` 403 page.
- Supabase functions and migrations were inspected on project `tunabqqrwabacxjcxxkz` only.

The Vercel CLI calls the deployment target “production” within the isolated
`pinguino-staging` project. No production Vercel project, production Supabase project,
Stripe live event, production DNS or production domain was read or modified by this task.

## 12. Git state

- Branch: `codex/admin-partner-controlled-catalog`.
- Deployed application source: `6b0e3551`.
- Source commit was pushed normally before deployment; no force-push.
- At the deployed source, `origin/staging...HEAD` was `0 7`: zero accepted staging commits
  missing and seven workstream/merge commits ahead.
- Workstream commits include `6db8a2b3`, `4315aadd`, `5b36673b`, `1350684b`, `248c984f` and
  two normal staging merges (`fbcf658d`, `6b0e3551`).
- The final documentation/screenshots commit is intentionally after the deployed application
  source and does not alter runtime code. Its exact SHA/push/clean state belongs in the final
  handoff message because a commit cannot contain its own SHA.

## 13. Final staging database snapshot

```text
products total                         2108
PI total / active                      2088 / 2088
PM historical total / active            19 / 6
PR total / active                         1 / 0
PR versions                               1
PR ProductBehavior bindings               2 historical (1 current version binding)
PR/PM runtime matched relations           0
Mapper total / active                   2088 / 2088
import runs total / active                 8 / 0
active Poland 820 runs                     0
Poland unrolled ledger rows                0
Poland-created products still present      0
product requests total                     2
requests approved / user-canceled          1 / 1
open requests                              0
QA proof PR exists / active             YES / NO
Partners total / active                    2 / 2
browser Partner active / retired codes     3 / 1
browser Partner links / clicks             1 / 1
browser Partner attributions               1
TEST cash notifications / played           1 / 1
```

The retained inactive PR and its immutable evidence/bindings are the canonical retired QA
history, not a usable product. There are no active imports, no runtime Mapper relation and no
Poland 820 product left by the rolled-back audit runs.

## Completion gate

Requested scope: complete connected Admin / controlled catalog request / countries /
Partner / billing-notification system on STAGING.  
Completed work: all modules and proofs listed above.  
Files changed: 67 runtime/migration/test/inventory files versus `origin/staging`, plus this
ledger and nine QA screenshots.  
Tests added/changed: controlled-catalog, Scanner boundary/finalize, account-mode, shell, auth,
catalog/PI migration and destination regressions.  
Previously accepted flows: retested by the zero-failure full suite and focused browser QA.  
Deployment environment: Vercel `pinguino-staging` and Supabase `tunabqqrwabacxjcxxkz`.  
Remaining implementation items: none in this workstream.  
External deferred item: INTIMPORT semantic closeout remains blocked by OpenAI account credit;
it is checkpointed separately and is not a dependency of this system.  
Git diff/commit status: runtime source pushed and deployed; ledger/screenshots are committed and
pushed immediately after this report is written, then final cleanliness is recorded in the
handoff message.
