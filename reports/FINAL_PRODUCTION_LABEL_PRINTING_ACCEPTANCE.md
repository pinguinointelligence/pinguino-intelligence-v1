# Final Production, Label and Printing Acceptance

Validation date: 2026-08-25  
Staging source: `ac17fe7` before the final label-fit repair  
Staging deployment: `dpl_8i3EAA9SEawUfug91hX4EpGxJN8S`  
Decision: **Production accepted; Label/Printing acceptance remains partial and fail-closed.**

## Production

### Exact owner +2.5 g served proof

The actual staging recipe used 584 g milk, 98 g cream, 56 g skimmed milk powder, 59 g sucrose, 64 g dextrose, 3 g tara gum, 131 g banana and 5 g fructose at Gelato/ECO/−11°C/1000 g. After confirming milk and cream, skimmed milk powder was confirmed at 58.5 g. The browser showed 740.5 g physically in the vessel and the exact +2.5 g deviation.

The existing Engine/Rescue authority returned:

- `minimum_safe`: 1007 g, predicted 8/10, sucrose `+4.5 g`;
- `restore_original_profile`: 1044 g, predicted 9/10, banana `+5 g`, cream `+4 g`, dextrose `+3 g`, milk `+26 g`, skimmed milk powder `+0.5 g`, sucrose `+3 g`;
- unchanged was unavailable because protein/lactose hard limits were exceeded.

Minimum-safe was applied and completed at exactly 1007 g with LOT `LOT-20260825-A338921ED6`. A second real run applied restore-original-profile. Confirmed milk, cream and skimmed milk powder reopened only for positive additions and displayed `Dodaj teraz +26 g`, `+4 g` and `+0.5 g`. All additions persisted, weighing reached 8/8 at exactly 1044 g, and the run completed with LOT `LOT-20260825-9A4FC30CDD`.

Two served failures were repaired without changing Engine grams: the database decimal boundary now accepts practical 0.1 g Rescue targets, and pending sibling top-ups preserve already-recorded physical amounts instead of serializing them as null.

### Existing safe 8/10 control

A real strawberry-sorbet run confirmed 600/150/52/50/4 g and Dextrose at 145 g instead of 144 g. The browser showed 1001 g in the vessel, predicted 8/10, and a recommended available `Kontynuuj bez korekty` choice. The operator explicitly selected `Akceptuję wynik i kontynuuję`; the accepted target stayed 1001 g, weighing completed, and LOT `LOT-20260825-407A3EF8CE` was produced.

### Authority call path

`ProductionCockpit` → `useProductionWorkspace` → `ProductionRepository.authorizeRescue` → staging Edge `production-rescue-authorize` → existing Engine `proposeProductionRecoveryOptions` → durable authorization → `production_consume_rescue_authorization_v1` → `production_apply_rescue_v1`.

Every proposed target and top-up gram comes from that Engine/Rescue authority. No UI solver, second Production solver or Engine recalibration was added.

## EU

Implementation and official-authority goldens pass. A real 1044 g completed run linked ACTUAL grams, legal mass order, milk allergen, nutrition, LOT, date, operator, business, address, storage and net quantity into an immutable snapshot. Direct PDF produced two deterministic 100 × 70 mm pages, but render inspection found the mandatory nutrition block clipped below the page. This is a **failed** output, not an acceptance pass.

The scoped repair raises the verified full-content minimum to 102 × 152 mm and blocks smaller EU/UK/AU-NZ retail output before print. Served verification of that repair remains required.

## UK

Implementation and authority goldens pass. The real 1001 g control run was linked to the UK profile at 102 × 152 mm, but the final served date/save/PDF/reopen sequence was not completed. Browser/PDF/system-print acceptance remains **NO**.

## AU/NZ

FSANZ renderer, required NIP structure and regulatory goldens pass. A complete served actual-run matrix was not executed. Browser/PDF/system-print acceptance remains **NO**.

## United States

Status: **DISABLED / FAIL-CLOSED**. Remaining blockers are FDA rounding, prescribed Nutrition Facts format-family selection, required nutrient-display rules, serving-size logic and official-structure golden fixtures. No partial retail printing was enabled.

## Canada

Status: **DISABLED / FAIL-CLOSED**. Selecting Canada exposes `Profil Kanada jest jeszcze w przygotowaniu` before label construction. Retail printing remains blocked because the approved official Health Canada FOP asset/package and release clearance are unavailable. The application does not draw, trace or approximate the mark; only a watermarked draft path is allowed.

## PDF

Direct `Pobierz PDF` is separate from `Drukuj`, uses the immutable snapshot and the same physical print HTML, embeds rasterized browser-rendered typography/allergen emphasis into exact-size PDF pages, and does not require a printer. Deterministic-byte, exact-page-size, copies, metadata, draft-watermark and all-printer-profile geometry tests pass.

The served EU file `gellatti-label-lot-20260825-9a4fc30cdd-eu-100x70mm.pdf` was 2 pages at 283.465 × 198.425 pt (exactly 100 × 70 mm). It is retained as negative evidence for clipping; it is not retail-ready.

## Printer profiles and hardware

All 15 implemented presets pass software geometry, DPI, margin, orientation, calibration HTML and exact PDF-page regression checks. No direct printer protocol was invented. Native system dialogs were not fully exercised, and no physical printer was available. Therefore system-print status is `NOT TESTED` and hardware status is `NO` for every row in `PRINTER_PROFILE_MATRIX.csv`.

## Tests

- Affected Label/Production gate before the fit repair: 12 files, 100/100 passed.
- Persistence regression: 3 files, 57/57 passed.
- Regulatory/PDF gate: 4 files, 29/29 passed.
- Post-rebase repository suite: 2,771 suites; 9,102 passed, 101 skipped, 0 failed (9,203 total).
- Constraint stress timeout audit: the first contended run timed out four unrelated tests; the exact three files then passed 88/88 in isolation, and the clean full rerun passed with zero failures.
- Final Label fit gate: 8 files, 64/64 passed; typecheck passed; `git diff --check` passed.
- Final repository suite after the fit repair: 2,771 suites; 9,105 passed, 101 skipped, 0 failed (9,206 total).
- Lint: 0 errors and four pre-existing Fast Refresh warnings in untouched files.
- Build: passed.
- Rescue bundle: `1983972c0947c8cf931a6c027966a498e326e5320b4b7f78f6f064c219337fb5` verified.

## Deployment

`ac17fe7` was pushed to `origin/staging` and deployed only to the Vercel staging project. Deployment `dpl_8i3EAA9SEawUfug91hX4EpGxJN8S` serves `assets/index-ltqUBxdy.js`, SHA-256 `f2c12e03c7f032845abe024c9d41ee84a74f2d58582fe7a7c2832634c55440e2`, at `https://staging.pinguinoai.com`. The staging Supabase project is `tunabqqrwabacxjcxxkz`.

The final 102 × 152 mm fail-closed fit repair is not included in that identity until its final suite, commit, push and redeploy complete.

Public production was not deployed. Secrets, credentials, billing, environment files and `mapper_basement` were not modified.
