# Final Production, Monitor, Label, Printing and Community Audit

Audit date: 2026-08-25  
Integration branch: `codex/v16-final-staging`  
Base: `origin/staging` (`b6afd97`)  
Release status at report creation: **PARTIAL / FAIL-CLOSED — not accepted as complete**

## Executive decision

Production recovery, top-up semantics, Monitor PAC truth and the Community completion continuation are implemented and covered by focused tests. EU, UK and Australia/New Zealand label profiles are selectable; USA, Canada and Custom are unavailable before the user begins because their retail output cannot yet meet the requested release standard. Canada additionally needs the official Health Canada ready-to-use FOP asset package. The project does not synthesize an imitation.

This report deliberately does not claim that every requested market is print-ready, that direct PDF download exists, that hardware printing was verified, or that served-staging QA is complete until those facts are proven.

## Monitor

| Requirement                                | Result | Evidence                                                                     |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------------- |
| PAC visible immediately                    | PASS   | `ProfessionalMonitorModules.summaryFor` promotes PAC to the headline metric. |
| Ice fraction remains separate and truthful | PASS   | Secondary metric is labelled `Frakcja lodu` with `%`; it is not called PAC.  |
| No expanded duplicate PAC card             | PASS   | PAC is excluded from duplicate expanded metric rendering.                    |
| Semantic regression                        | PASS   | Professional Monitor module/runtime/accessibility focused suites.            |

## Production owner fixture and root cause

Exact immutable mapper-backed recipe:

| Line                | Canonical ID     | Planned g | Confirmed g |
| ------------------- | ---------------- | --------: | ----------: |
| Milk                | `PI-ING-000236`  |       584 |         584 |
| Cream               | mapper canonical |        98 |          98 |
| Skimmed milk powder | `PI-ING-000270`  |        56 |        58.5 |
| Sucrose             | mapper canonical |        59 |           — |
| Dextrose            | mapper canonical |        64 |           — |
| Tara                | mapper canonical |         3 |           — |
| Fructose            | mapper canonical |         5 |           — |
| Banana              | mapper canonical |       131 |           — |

Machine/serving: Gelato Eco, −11°C, 1000 g target. Physical vessel mass after the three confirmations is 740.5 g; five planned lines remain. The completed forecast is 1002.5 g and correctly retains the hard `protein_in_solids_high` and `lactose_high` diagnoses. The previous dead end was not a scale bug: the UI exposed only the original-batch/leave path even when the Engine could authorize a safe add-only expansion.

## Recovery strategy authority

The new strategy objectives live in `src/engine/corrections/recovery.ts` and are exported by the existing Engine. Production only requests and persists Engine-authorized actions. No UI solver and no second Production solver were created.

| Strategy                                                                   | Exact +2.5 g result                                                    | Outcome                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `minimum_safe`                                                             | Final 1007.0 g; sucrose +4.5 g (59.0 → 63.5)                           | 10/10, add-only, recommended                    |
| `restore_original_profile` / stable persisted ID `restore_original_recipe` | Final 1045.0 g; milk +26.0 g, cream +4.0 g, skimmed milk powder +0.5 g | 10/10, add-only                                 |
| `leave_as_is`                                                              | Final 1002.5 g                                                         | 1/10 diagnostic only for the failing owner case |

Neighbourhood regressions at +1, +2.5, +5 and +10 g prove liveness and preserve the exact Engine trace. The working Dextrose control remains unchanged at 8/10 and keeps its existing recommended path. A perfect safe 10/10 ECO cream-overage fixture shows only `leave_as_is` in the UI even though strategy feasibility remains auditable in trace.

## Production top-up UX and persistence

- Active authorized top-up rows show the delta in the central scale field as `Dodaj teraz +X g`.
- Cumulative target remains secondary.
- Persistent idle `Dodaj brakujące` / `Dodaj kolejną ilość` clutter was removed; final confirmation stays a separate action.
- A confirmed product may receive the next authorized top-up.
- 0.1 g scale precision is accepted end-to-end by the Edge authorization boundary.
- Stable intent `restore_original_recipe` is carried through contracts, session, hook, database and Edge bundle.
- Forward migration: `20260825153000_production_restore_original_recipe.sql`.
- Generated Edge bundle was rebuilt; hash at integration time: `6b45dce312b321ea279b0d8bd402886dfba654b2499426d86f77a57c92781196` (323458 bytes, 60 sources).

## Community completion flow

- Completion invitation remains below label/new-batch actions, dismissible and non-blocking.
- Warm completion heading/body: `Pokaż swój wynik w Community` and `Świetna partia? Udostępnij recepturę i pokaż ją innym.`
- Privacy/version mechanics are secondary copy, not the lead.
- `DialogShell` supplies responsive placement, focus trap/restore, Escape and scroll lock.
- Missing Creator profile is an inline continuation: invite → create profile → return to the preserved publication title/version. It does not send the user to a generic dead end.
- Creator and Partner remain separate; no Partner onboarding was added.

## Label data and immutability

- Master Label derives from the final Production ACTUAL snapshot, including toppings and recovery top-ups.
- Legal ingredient order uses final ACTUAL mass; duplicate canonical Base/Topping lines aggregate.
- Frozen canonical allergen authority is mandatory. Missing evidence fails closed.
- Nutrition uses the established label/Engine output; market-only required nutrients are explicit source-data inputs and missing values are never converted to zero.
- Saved run label snapshots freeze exact content, market/profile version, translation values, ACTUAL ingredients, nutrition, allergen rendering, dimensions and printer selection.
- Best-before/use-by is never invented. LOT is stable and automatically linked to the completed run.

## Market implementation

Detailed legal/source coverage: [LABEL_MARKET_AUTHORITY_MATRIX.md](./LABEL_MARKET_AUTHORITY_MATRIX.md).

| Market | Selectable | Result                                                                                                           |
| ------ | ---------: | ---------------------------------------------------------------------------------------------------------------- |
| EU     |        YES | Verified implementation; separate EU per-100 g output.                                                           |
| UK     |        YES | Verified implementation; separate context for prepacked, PPDS and loose/non-prepacked.                           |
| AU/NZ  |        YES | Verified implementation; separate FSANZ NIP.                                                                     |
| US     |         NO | Distinct Nutrition Facts QA renderer exists; FDA rounding/format-family gap keeps it `RESEARCH / NOT AVAILABLE`. |
| Canada |         NO | Bilingual NFT and FOP threshold engine exist; official EPS asset and complete release clearance are missing.     |
| Custom |         NO | Requirements unknown; never guessed.                                                                             |

The UI disables unavailable markets at selection time. Existing/saved unsupported profiles remain blocked by the final preflight. This avoids a late surprise at the Print button.

## Print gate and output

The retail gate checks profile status, required languages and translation review, canonical ingredients, allergen review, nutrition authority, market-specific nutrients, quantity, operator/address, date, LOT, storage, physical profile dimensions, printer capabilities, Canada FOP asset where required, QUID/market review and final acknowledgement. Final snapshot saving uses the same full gate.

- Ready state: `✓ Gotowa do druku`.
- Draft: available with `DRAFT / NIE DO SPRZEDAŻY` watermark and an explicit missing-market-data block.
- Calibration: alignment marks, dimensions, printer model, DPI and margin; no recipe/business data.
- On-screen preview uses the selected CSS mm width/height and displays printer, DPI, copy count and profile x-height.
- Output CSS uses the same width/height/margin/copies and market renderer.
- Universal path currently opens the native print dialog; users can choose `Save as PDF`. **A direct one-click PDF file download is not implemented and therefore the user's “PDF always available” acceptance item is not yet fully satisfied.**
- No GTIN/EAN is fabricated. No direct Bluetooth/browser protocol or fake printer detection is claimed.

Printer software/geometry matrix: [PRINTER_PROFILE_MATRIX.csv](./PRINTER_PROFILE_MATRIX.csv). No listed physical device was available; every hardware row is explicitly `physical_hardware_tested=NO`.

## Final local verification before staging integration

Focused label suite:

```text
npx vitest run src/features/master-label src/services/labels --reporter=verbose
7 files, 46 tests passed
```

Focused Community/copy/continuation suite:

```text
npx vitest run src/features/community/ui/PublishToCommunityDialog.test.tsx src/copy/community.test.ts src/features/community/domain/shareContinuation.test.ts --reporter=verbose
3 files, 17 tests passed
```

Combined Label/Community regression run:

```text
npx vitest run src/features/master-label src/services/labels src/features/community/ui/PublishToCommunityDialog.test.tsx src/copy/community.test.ts src/features/community/domain/shareContinuation.test.ts --reporter=verbose
10 files, 63 tests passed
```

Earlier integrated Production/Monitor/Edge/migration suite:

```text
npx vitest run [10 focused Production/Monitor/Edge/migration files]
10 files, 165 tests passed
```

Legacy recovery/export contract reconciliation and affected Engine/Production regression:

```text
npx vitest run src/engine src/features/production-workspace/productionSequentialDeviation.test.ts src/features/production-workspace/useProductionWorkspace.runtime.test.tsx src/features/production-workspace/useProductionWorkspace.test.ts --reporter=dot
26 files, 438 tests passed
```

Full repository suite:

```text
npm test -- --reporter=json --outputFile=/tmp/pinguino-v16-full-tests-final.json
2,763 suites reported; 9,066 passed, 101 skipped, 0 failed (9,167 total)
```

Static and production gates:

```text
npm run typecheck
PASS

npm run lint
PASS with 0 errors and 4 pre-existing Fast Refresh warnings in untouched files

npm run build
PASS; 1,280 modules transformed

npm run production-rescue:bundle-check
PASS; 6b45dce312b321ea279b0d8bd402886dfba654b2499426d86f77a57c92781196

git diff --check
PASS
```

Served-staging results remain pending until the exact tested commit is integrated and deployed; this report does not predeclare them.

## Required external actions and incomplete acceptance items

1. Request the official Health Canada FOP EPS package from `smiu-ugdi@hc-sc.gc.ca` using subject `HPFB BNS Compendium of Nutrition Symbol Formats`; establish permitted product use and provide the approved asset mapping. Do not extract or trace the reference PDF.
2. Complete FDA Nutrition Facts rounding and prescribed format-family selection; add official-structure/raster golden fixtures before enabling USA.
3. Add direct downloadable PDF generation if “Download PDF” must mean a one-click file rather than the native `Save as PDF` path.
4. Add the remaining requested regulatory golden/data cases: EU nut, Canada non-FOP release output, vegan soy/sesame, alcoholic product, long compound ingredient/bilingual/address overflow.
5. Run physical printer tests if hardware-level claims are desired. Current evidence is geometry/software only.
6. Deploy only to staging and complete authenticated served-browser QA across desktop/tablet/mobile. Public production must remain untouched.

## Deployment safety

- Public production deployment: **NOT AUTHORIZED / NOT PERFORMED**.
- Staging deployment: **PENDING at report creation**.
- Secrets, billing configuration, production credentials and environment files: not modified.
- `mapper_basement`: not modified.
