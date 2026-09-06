# SCANNER — KITCHEN-TO-RECIPE · CANONICAL LEDGER

**This file is the only source of status for the `claude/scanner-complete` workstream (PR #186).**
A later session must be able to rebuild the whole state from the branch, its commits and this file,
without reading any conversation.

## Position

| | |
| --- | --- |
| Branch | `claude/scanner-complete` |
| PR | [#186](https://github.com/pinguinointelligence/pinguino-intelligence-v1/pull/186) — base `staging`, **DO NOT MERGE** until the owner accepts |
| HEAD at last update | `b52df37c` |
| `origin/staging` at last update | `f03038d0` — merged into this branch, 0 commits behind |
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

## Tests

- `npm run build` (`tsc -b && vite build`) green.
- Full suite 2026-09-06: **12 969 tests passed, 0 failed**, 149 skipped.
  Four test FILES did not start: `LabelWorkspace.runtime`, `proProfilePreflightUx`,
  `proRecipeStateRegression`, `ProWorkspacePage.libraryHandoff`. All four fail on the same line —
  Vite denies loading `@fontsource/.../*.woff?url` because this worktree's `node_modules` is a
  symlink into `pinguino-scan-core-phase-0`, outside the project root. None of the four files, and
  nothing they import, is touched by this branch (`git diff origin/staging...HEAD` is empty for
  each). It is an environment artefact of the shared `node_modules`, not a code failure; CI
  installs its own dependencies and is the authority.
- After merging `origin/staging`: home-creator / product-intelligence / product-scanner / scan-flow
  / scan-import-v2 / owner-locked contracts — 1 975 passed, 0 failed.

## Open

- Owner QA of the whole phone flow on the preview alias.
- `staging.pinguinoai.com` shows the old client until #186 merges.
