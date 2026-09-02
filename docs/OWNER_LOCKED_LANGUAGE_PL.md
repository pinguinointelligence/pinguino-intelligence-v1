# OWNER-LOCKED LANGUAGE — POLISH (reference locale)

**Status: POLISH FINAL_SAFE — OWNER-LOCKED.**

Polish is the verified reference locale. Future language work may **not** silently
modify it: a change to any Polish display string, display map or approved exact
term is an owner decision, recorded here first.

---

## 1. Authorities

| Authority | Value |
|---|---|
| Language authority (workbook) | `GELLATTI_APPLICATION_COPY_MASTER_MULTILANGUAGE_FINAL_SAFE.xlsx` |
| Workbook SHA-256 | `c2f84ac15598111a2319b9f45338dba1c81c3a1eeb168057351a783dba71f54f` |
| Workbook scope | 4 757 unique strings · 6 008 occurrences · 100 % classified · occurrence-level, audited against the TypeScript AST |
| Functional authority | `origin/staging` (never a feature branch) |
| Visual authority | the owner-approved Gellatti V2.1 design |
| Implementation branch | `claude/language-pl-final-safe` |
| Base at start | `625507e5` → rebased onto `b1eeb345` (owner-locked regression protection) |
| Implementation commits | `48b32491` Polish baseline + locale foundation · `a82ac60e` served fixes (print-readiness, catalog family) + lock docs · `053a1cc2` catalog brand-placeholder qualifier |
| Final staging SHA | `053a1cc2` |
| Staging deployment | `dpl_FG91vPx8pVKFDJHbdaL2GvzGvqT8` (state READY) |
| Immutable URL | https://pinguino-staging-qvwyrmbt9-pinguinointelligence-7784s-projects.vercel.app |
| Served bundle | `index-BnEN_nQd.js` |
| Alias | https://staging.pinguinoai.com |
| `origin/main` | UNTOUCHED |
| Customer Production / Production Supabase | UNTOUCHED |

## 2. Locale / display architecture

Presentation layer only. No second business-logic authority was created.

**Registry — `src/copy/locale.ts`**
`AppLocale`, `REFERENCE_LOCALE = 'pl'`, `FALLBACK_LOCALE = 'pl'`,
`SUPPORTED_LOCALES`, `isSupportedLocale`, `resolveLocaleResource` (throws only if
even the fallback is missing) and `resolveDisplayLabel` (keyed BY the raw
contract value, falls back to that value).

**Three standing rules**

1. **Raw source values are contracts.** Enums, status codes, object keys, DB/API
   fields, routes, CSS classes, parser tokens, PI-ING identity and
   ProductBehavior codes are never translated. When one must be shown, it goes
   through a display map and stays byte-exact.
2. **Display maps are separate from source values** and keyed by the raw value —
   the `…Pl` convention (31 such functions already existed; 3 added this pass).
3. **Whole copy modules use the `CommunityCopy` pattern**: one interface, one
   complete object per locale, one resolver, plus a source test asserting
   identical key sets. `src/copy/community.ts` is the reference implementation
   (its `communityCopyEn` object is dormant infrastructure — correct English by
   design, not a leak).

**Display maps added this pass**

| Module | Maps | Raw contract kept |
|---|---|---|
| `src/features/optimization/branchWorkflowLabels.ts` | IF9/IF10 spine codes (`rescue_same_target_batch`, `weigh_actual_batch_g`, `stop_and_buy_missing_product`, …) | routers/previews/tests still emit and match the raw codes |
| `src/features/master-label/labelPresentation.ts` → `printReadinessLabelPl` | `NOT_READY` / `PRINT_READY_UNIVERSAL` / `PRINT_READY_REGULATORY` | `labelRepository` still gates on `'NOT_READY'` |
| `src/features/global-catalog/catalogDisplayAliases.ts` → `canonicalFamilyLabelPl`, `catalogQualifierPl` | generic canonical family/category values (`fruit` → `Owoce`, …) and the generic BRAND placeholders (`General`, `Generic`, `N/A`, …) | stored catalog value unchanged; a real trade name always wins and is byte-exact; unmapped values returned exactly |

Every map falls back to the raw value, so a new contract code renders
unlocalised rather than blank.

## 3. Owner display-map decisions (binding)

| Domain | RAW (never changes) | Polish display |
|---|---|---|
| Market code | `WORLD` | Świat / Uniwersalna |
| Market profile labels (`code` untouched) | `EU` / `UK` / `US` / `CA` / `AU_NZ` | Unia Europejska / Wielka Brytania / Stany Zjednoczone / Kanada / Australia · Nowa Zelandia |
| Batch identity | `lot` data + `LOT-` prefix semantics | visible label **Nr partii** |
| Structural key | `name` | Nazwa |
| Structural key | `market` | Rynek |
| ProductRequest status | `SUBMITTED` | Wysłano |
| | `ADMIN_REVIEW` | W trakcie weryfikacji |
| | `NEEDS_INFO` | Wymaga uzupełnienia |
| | `RESUBMITTED` | Wysłano ponownie |
| | `APPROVED` | Zatwierdzone |
| | `REJECTED` | Odrzucone |
| | `DUPLICATE` | Duplikat |
| | `USER_CANCELED` | Anulowane przez użytkownika |
| Product status | `PI Calculated` / `PI Generated` / `Manual Adjusted` / `PI Verified` | Obliczone / Wygenerowane / Profil uzupełniony ręcznie / Zweryfikowane (via `productProfileStatusLabelPl`) |
| Engine label | `−11°C Engine` … `Fresh Engine` | −11°C · obliczenia … Bieżące obliczenia (via `engineDisplayLabelPl`) |
| Rescue / scaling protocol | the English messages matched by `.includes()` | via `productionRescueErrorMessagePl` / `scaleMessagePl` |
| Print readiness | `NOT_READY` … | Niegotowe do druku … |

## 4. Approved exact terms (KEEP_EXACT)

Gellatti · GELLATTI · FRIENDLY LAB · Home · Pro · Gellatti Pro · Demo · Partner ·
Community · Top 100 · Gelato · Sorbet · Protein · Vegan · EAN · EAN-8 · EAN-13 ·
GTIN · SKU · POD · PAC · NPAC · MSNF · ECO · OPTIMAL · QR · PDF · CSV · XLSX ·
PNG · JPEG · WebP · OCR · API · URL · JSON · FDA · INCI · RODO · GDPR · VAT ·
Nutrition Facts · machine brands and models (Ninja CREAMi / Deluxe / Scoop &
Swirl, Musso, Carpigiani, Nemox, Breville, Cuisinart ICE-21/ICE-30/ICE-100,
KitchenAid, Magimix Gelato Expert, Moulinex Freezi, Sage Smart Scoop, …) ·
Gellatti collection names **Lost & Legendary** and **Natural Icons** ·
units and symbols (g, kg, ml, l, °C, kcal, kJ, g/ml, mm, dpi, €).

## 5. Regulatory exclusions (NOT app-locale)

Legal label wording is owned by the market/language profile, never by the UI
locale. A Polish UI still prints the US `Nutrition Facts` panel in its legally
required wording.

Profile-managed sources: `src/features/master-label/renderers/{eu,uk,us,canada,auNz,world}.ts`,
`marketProfiles.ts` (the `code` field and regulatory fields; the `label` field is
the display layer and IS localized), `regulatoryNutrition.ts`,
`allergenTaxonomy.ts`, `machineCodes.ts`, `masterLabelPdf.ts`,
`masterLabelPrint.ts`, `businessAuthority.ts`.

## 6. Dynamic data policy (unchanged by this pass)

Canonical PI-ING identity, Mapper technical values, commercial/brand names,
machine names/models and user-entered recipe titles are **data** — never
translated. Generic canonical names may gain localized *display aliases* only;
the first safe slice is `canonicalFamilyLabelPl`. A full alias table across
~2 089 Mapper rows remains an owner naming decision and must never be done by
mutating Mapper identity.

## 7. Refused source changes (contract protection)

The workbook classified these `TRANSLATE_VISIBLE`; a repo-wide safety gate proved
each is a functional contract, so the source was left untouched. **These are
corrections to the workbook.**

| String | Contract |
|---|---|
| `Ingredients English`, `Ingredients Original` | INTIMPORT CSV column headers — `source['Ingredients English']` (`intimport.ts:321/323`), `intimportWorkbook.ts` |
| `PI Calculated`, `PI Generated`, `Manual Adjusted`, `PI Verified` | members of the `CustomerStatusLabel` union, switch-matched in `productProfileStatusLabelPl` |
| `Verified` (`indicatorSeparation.ts`) | reserved contract label; `dataConfidence()` has no render consumer |
| `Protein Gelato` (`productProfiles.ts`) | lookup key: `mapProductProfile('Protein Gelato')` |
| `Fantasy` (`RecipesHubPage`) | owner-review-only surface + product-line name |

## 8. Served audit result

`reports/GELLATTI_POLISH_FINAL_SAFE_SERVED_AUDIT.md`.

- Public/unauthenticated routes: **PASS** on desktop (1440 × 900) and mobile (390 × 844).
- Authenticated Pro surfaces re-crawled on deployed staging: **PASS** (Studio,
  Production, Labels with real batches, Products catalog).
- Visible English leaks: **126 → 0**. The 17 residual scanner hits are verified
  non-leaks (contract codes, ARIA values, view IDs, dev-only surfaces, Polish
  loanwords).
- Locally blocked states (no `.env`, no Supabase) were recorded as **BLOCKED
  (external)** and then covered on deployed staging; nothing was simulated.

## 9. Gates at lock time

| Gate | Result |
|---|---|
| Placeholder failures | 0 |
| Functional source mutation risks | 0 |
| CSS/Tailwind translated | 0 |
| Enum / status / key / id / route translated | 0 |
| Business-logic diff | 0 |
| Owner-locked contracts (`src/contracts/owner-locked`) | 61/61 PASS |
| `scripts/guardOwnerLockedContracts.mjs` | OK — no accepted contract modified |
| Production Rescue Edge bundle | regenerated and verified |
| `npm run typecheck` / `lint` / `build` | PASS (lint: 0 errors, 4 pre-existing warnings) |
| Full suite | 9 861 passed / 828 files |

## 10. Changing Polish later

1. Record the change and its reason in this document first.
2. Keep the raw contract value byte-exact; change only the display layer.
3. Re-run the placeholder and functional-contract gates.
4. Update the assertion of any test that asserts the old wording — never delete
   or weaken it.
5. Re-run the served crawl for the affected routes on desktop and 390 × 844.

Adding a **new** language never edits this file — follow
`docs/NEXT_LANGUAGE_IMPLEMENTATION_TEMPLATE.md`.
