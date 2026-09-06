# SCANNER — KITCHEN-TO-RECIPE · CANONICAL LEDGER

**This file is the only source of status for the `claude/scanner-complete` workstream (PR #186).**
A later session must be able to rebuild the whole state from the branch, its commits and this file,
without reading any conversation.

## Position

| | |
| --- | --- |
| Branch | `claude/scanner-complete` |
| PR | [#186](https://github.com/pinguinointelligence/pinguino-intelligence-v1/pull/186) — base `staging`, **DO NOT MERGE** until the owner accepts |
| HEAD at last update | `cbcbc8d4` |
| `origin/staging` at last update | `6f71ac6a` — merged into this branch |
| Supabase (staging) | `tunabqqrwabacxjcxxkz` |
| Vercel project | `pinguino-staging` (`prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE`) |
| Preview alias (SSO) | `pinguino-staging-git-987191-pinguinointelligence-7784s-projects.vercel.app` |
| `staging.pinguinoai.com` | serves the OLD client (branch `staging`) with the NEW backend until #186 merges |
| **OWNER ACCEPTED** | **NO** |

## The goal (owner, 2026-09-06)

The customer scans a product in the kitchen and within seconds can use it in Gellatti.
Known product → recognised at once. Missing product → the system ASKS whether to add it; after the
customer confirms it first fetches everything that can really be found in sources, and only the
fields still missing are completed by the existing estimation/Rescue from the most similar Mapper
products. **Mapper is immutable golden truth. Found data has precedence and is never replaced by an
estimate.** Then: save, reopen, add to a recipe, recalculate, go to production.

## Checklist

Statuses: `TODO` · `IN PROGRESS` · `BLOCKED` · `FIX READY / NOT ON STAGING` · `READY FOR MERGE` ·
`MERGED` · `SERVED VERIFIED` · `OWNER ACCEPTED`.
New findings are appended at the end only; earlier numbers are never renumbered.

| # | Finding | Status | Evidence |
| --- | --- | --- | --- |
| SOL-039 | HOME's "Przelicz i popraw" was silent: the pipeline publishes its verdict in `recalculationTerminal` (the state PRO renders) and the HOME panel read only `preview`/`previewIssue`. The customer waited ~16 s and the screen said nothing. | FIX READY / NOT ON STAGING | `homeRecalculationVerdict.ts` + tests; served repro on the local preview build of this branch |
| SOL-040 | HOME had no production stage at all: "Zróbmy to" set `preparationStarted` and nothing rendered — the journey stopped at the recipe. True on `origin/staging` too. The PRO production workspace exists but is a professional dashboard whose repository this build reports unavailable (PRO's own Production tab shows "coming soon"), and HOME's own preparation copy had never been wired. | FIX READY / NOT ON STAGING | `homePreparationSteps.ts` + `HomePreparationSection.tsx` + tests; served on the preview build: base lines in order, "Na koniec dodaj topping." before the add-ons, every step ticked → "Gotowe!" |
| SOL-042 | The owner had to turn the tin so the digits pointed down before the code was read. Root cause investigated in the decode path: the locator is orientation-independent by construction (structure-tensor double angle), the engine transposes a vertically-read crop, and the lane confirms a real EAN-13 painted at 0°/90°/180°/270°, on a bottle (r≈1.6×) and on a tighter tin (r≈1.2×) — measured, all on the FIRST frame, including every curved+rotated combination. The orientation dependency is therefore NOT in the decoder; it is the image itself (SOL-045). The customer-facing hint after a measured time already exists ("Obróć produkt lub telefon, aby kod leżał poziomo"). | IN PROGRESS | `laneOrientation.test.ts` (9 scenes, all pass); curved+rotated probe run in this session |
| SOL-043 | The customer read `not ready: INGREDIENTS_EVIDENCE_REQUIRED, roleReadiness:REVIEW, recognition:NORMAL_INGREDIENT/BASE_ONLY`. The served client rendered the pipeline's diagnostic `note` directly (`{phase.note}` in `ScanFlow.tsx` on `origin/staging`). | FIX READY / NOT ON STAGING | shared customer-voice filter extended (SCREAMING_SNAKE enums, readiness/recognition field names, a raw `not ready` line); every scan-flow sentence filtered; `customerVoice.contract.test.ts` pins the owner's exact sentence and scans every customer-surface file |
| SOL-044 | The customer was offered "Zgłoś do weryfikacji" — Gellatti does not present its process as manual product verification. | FIX READY / NOT ON STAGING | the action and every "weryfikacja" sentence are gone from the scan flow; the private save is the honest action; the screens name the missing LABEL fields and say Gellatti re-checks the product itself. Lifecycle audit below. |
| SOL-045 | On a desktop the camera sees the code but the image is far too blurry to decode, and the customer is told only to aim the code in the frame. Root cause: the no-candidate branch of the scan policy fed NO sharpness history, so the session median stayed empty and the blur test could never fire; and because sharpness is judged RELATIVE to that median, a camera that is always out of focus is never found blurry at all. | FIX READY / NOT ON STAGING | `policy.ts` no-candidate branch now feeds the sharpness history, reports `sharpRel`, and after the searching grace period names blur, distance or light; `blurWithoutCandidate.test.ts` (5 contracts). Measured image chain exposed as `CameraDiagnostics`. |

## Owner's own test — iPhone / Safari on `staging.pinguinoai.com`, 2026-09-06

**What the canonical staging actually served during that test.** The custom domain is aliased to the
`target: production` deployment built from branch `staging`, NOT from this PR. At the time of the
test that was `dpl_4KxzivMCDzFNhxg8MqwAsaw67p6g` (staging `c66c1d01`), replaced at 10:17 by
`dpl_FXyFo74s2Cx89iVqgKhmxKpwpb26` (staging `f03038d0`); the served bundle today is
`assets/index-BDgr2_cZ.js`. Proof that this bundle does NOT contain #186's client, taken from the
served file itself:

| String | In the served canonical bundle |
| --- | --- |
| `Nie ma czego poprawiać` (SOL-039 fix) | 0 |
| `dodano jako dodatek` (scanned add-on → recipe) | 0 |
| `home-section-preparation` (SOL-040 fix) | 0 |
| `Zgłoś do weryfikacji` (what the owner saw) | 3 |
| `INGREDIENTS_EVIDENCE_REQUIRED` (what the owner saw) | 1 |
| `not ready:` (the raw line) | 1 |

**Therefore the owner's test proves the BACKEND and the pre-#186 client, not this branch.** Every
Edge Function, migration and RPC it exercised is the one deployed from this workstream; the screens
it exposed are the ones #186 replaces. The same cases are repeated on the canonical deployment after
the merge.

### Test 1 — Milka `Choco brownie` — `OWNER OBSERVED PASS`

Found in a fraction of a second, the UI said the product already exists, no duplicate was created.
This is the shared-registry path working as designed: `gellatti_upsert_customer_added_product_v1`
looks for an existing `PR-ING-%` shared commercial product on the same EAN and, when it finds one,
only links the customer to it (`user_product_relations`) instead of creating a second article.

### Test 2 — `Cola Zero` / Hacendado / GTIN `8402001042911` — partial pass, three defects

The code was read, the product was recognised from it, the flow asked for a label photograph, read
the label and saved the article as the customer's own private product, and said so. That whole path
is the intended behaviour. It also exposed SOL-042, SOL-043 and SOL-044 below.

## Root causes found and fixed in this workstream

1. **Found data was traded for an estimate.** `DECLARATION_SOURCES` in the customer profile adapter
   excluded `barcode_registry`/`retailer`/`web_search`, so on the automatic add path a product whose
   whole nutrition table the registry knew was saved with every macro replaced by a Mapper donor's
   value. Staging evidence: `CA-ING-007183` "Jogurt z kiwi" carried 64 g lactose per 100 g.
2. **Per-field trust was collapsed into one number.** One weak source discounted every other
   declaration. Each declared field now carries its own source tier, and the engine-ready floor
   judges the ESTIMATES, not the found values.
3. **A weaker-tier found value could contradict the label.** The resolver now drops the weaker-tier
   values when the declared set is self-contradictory and re-resolves; the strong sources decide.
4. **Every semantic-model answer was refused.** The validator treated a citation of a field the
   evidence does not carry (the absent `dosage`) as invented evidence and rejected the whole answer.
5. **Foreign-language labels were unrecognised.** Lotus Biscoff (French label) classified as UNKNOWN.
   The recogniser gained FR/NL/IT/ES/PT/DE label vocabulary; cache revision `MULTILINGUAL_LABEL_CUES_V4`.
6. **A freshly saved product was unusable for up to 60 s.** The triggers queue the canonical
   reclassification and the cron drains it once a minute; the behaviour gate answered
   `classification_pending`. The customer's own save now drains its own product's queue rows.
7. **A ready add-on was refused as "not usable".** Role readiness (`gellattiReadiness.ready`), not
   base physics (`engineUsable`), decides for a TOPPING_ONLY article — in the refresh rule, the exact
   resolver and the finalize response.
8. **A scanned add-on never reached the recipe.** HOME announced "add it yourself in the toppings
   section". It now takes the "Dodaj topping" picker's own door and lands as a TOPPING line.


## SOL-044 — audit of the private product → Product Registry lifecycle

Read from the deployed authority, not from intention.

| Question | Answer, and where it is decided |
| --- | --- |
| What creates a private record? | `gellatti_upsert_customer_added_product_v1`. A ready product becomes `product_kind='customer_provisional'`, `visibility='internal'`; a not-ready one takes the private not-ready path (migration `20260905132215`). |
| Is a global discovery record created? | Only if the customer explicitly submits one: `gellatti_submit_product_request_v1` writes to `product_add_requests`, an admin queue. Nothing in the scan flow calls it any more (SOL-044). |
| What happens after photos / a complete label? | The same finalize runs again and the refresh branch supersedes the version **only when better** (`20260905234913` + the readiness rules). Identical or weaker facts change nothing. |
| Is there deduplication by exact GTIN? | Yes, twice: the upsert takes an advisory lock on the EAN and first looks for an existing shared `PR-ING-%` commercial product on that EAN — when it finds one it only LINKS the customer (`user_product_relations`). This is exactly what the owner saw with Milka. |
| Is there an automatic publication path into the shared registry? | **No.** No code path sets `visibility='shared'` or `product_kind='commercial_product'` on a customer product. The database agrees: 11 `customer_provisional` all `internal`, 28 `commercial_product` all `shared`, none account-owned. |
| Who may publish? | Only the admin/canonical ingest paths, never the scanner. |
| Can the product stay a private override? | Yes — that is its normal, terminal state. |
| Does a second account reuse safe global evidence? | It resolves the same EAN, is linked in `customer_added_product_accounts`, and its facts may supersede only when better. `resolve_exact_products_by_gtin_v1` admits a `customer_provisional` row only for its creator or a linked account. |
| Can one customer's data become everyone's data? | **No.** Shared-registry rows are a different `product_kind` and a different visibility, and nothing promotes across that line. |

## Migrations (staging registry ↔ repo, byte-equal)

| Version | Name |
| --- | --- |
| 20260905063617 | scan_import_v2_exact_gtin_resolver |
| 20260905132215 | customer_private_not_ready_product |
| 20260905190000 | customer_product_rescue_refresh |
| 20260905190308 | customer_product_rescue_refresh_guard_context |
| 20260905234913 | customer_product_rescue_refresh_supersede_when_better |
| 20260906000358 | customer_product_rescue_refresh_prior_accuracy_path |
| 20260906005305 | exact_gtin_resolver_module_usability |
| 20260906005950 | customer_product_rescue_refresh_prior_usability_binding |
| 20260906010217 | customer_product_rescue_refresh_role_readiness |
| 20260906010242 | exact_gtin_resolver_role_readiness |
| 20260906054555 | customer_product_final_within_save |

## Edge functions deployed to staging from this branch

| Function | Version |
| --- | --- |
| product-scan-analyze | 26 (refresh option) |
| product-scan-finalize | 39 |
| intimport-enrich | 32 |

## The customer journey, served end to end

Measured on the built client of this branch (merged with `origin/staging`), signed in as
`test1@test1.com`, one continuous run:

| Step | Elapsed | What the customer sees |
| --- | --- | --- |
| scan a code | 4.0 s | "Znaleziono produkt." with the name and brand |
| add it | 8.4 s | "Crunchy Sante Naturalne: dodano jako dodatek (topping)." and the line in the recipe |
| recalculate | 12.0 s | "Nie ma czego poprawiać — receptura jest już dobrze ustawiona." |
| make it | 13.2 s | the weighing list, 8 steps, add-ons after "Na koniec dodaj topping." |

A warm known product resolves in 1.2–1.4 s; a product nobody has added yet takes the ask →
research → save path (Lotus Biscoff: asked, added and saved ready in one pass).

## Served evidence

- `reports/scan-import-v2/STAGING_FOUND_DATA.json` — the two damaged products repaired to version 2
  by the normal supersede-when-better rule: `CA-ING-007183` fat 2.5 / protein 3.3 / carbs 15.3 /
  sugars 14.9 all VERIFIED `product_declared`, accuracy 96; `CA-ING-007179` fat 54 / protein 12 /
  carbs 16 / sugars 10 VERIFIED, accuracy 96.8. A second run writes no new version.
- `CA-ING-007184` "Lotus biscoff" (5410126006049): scanned as a fresh code on the preview build,
  asked → added → saved ready as TOPPING_ONLY with accuracy 100 and every macro
  VERIFIED `product_declared`; it landed in the recipe as a TOPPING line in one step.
- `reports/scan-import-v2/STAGING_TIMING_2026-09-05.json` — known product 1.2 s cold / 0.2 s warm;
  new product with a registry record 1.0 s research + 2.1 s finalize.

## Tests and gates (branch, before the merge to staging)

| Gate | Result |
| --- | --- |
| `npm test -- --run` | **exit 0** — 1054 files (1031 passed, 23 skipped), 13 141 tests passed, 149 skipped, **0 failed, 0 files that did not start** |
| `npm run typecheck` (`tsc -b`) | pass |
| `npx eslint .` | 0 errors (7 pre-existing warnings) |
| `npm run build` | pass |
| `npm run guard:owner-locked` | OK — no accepted contract modified |
| `npm run guard:protected-paths` | OK — no protected functional path touched |
| `npm run test:contracts` (owner-locked) | 21 files, 206 tests, pass |
| `git diff --check` | clean |

**The symlinked-dependency defect is fixed.** This worktree reaches its dependencies through a
symlink, so Vite's strict file server refused a `@fontsource` `.woff?url` import and five test FILES
never started — 84 tests silently missing from every run. `vite.config.ts` now ADDS the real path of
the dependency tree to Vite's own workspace root. Before: 1044 files / 12 969 tests with 4 files
dead. After: 1054 files / 13 290 tests with none dead.

## Open

- Owner QA of the whole phone flow on the preview alias.
- `staging.pinguinoai.com` shows the old client until #186 merges.
