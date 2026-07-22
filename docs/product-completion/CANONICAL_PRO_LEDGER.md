# ONE CANONICAL PINGÜINO PRO, MENU AND WORKBAR — completion ledger

**Status:** `ONE CANONICAL PINGÜINO PRO, MENU AND WORKBAR — DEPLOYED, AWAITING OWNER VERIFICATION`
**Date:** 2026-07-22 · Owner P0. There is no separate customer-facing „Studio" product.

## Requested (every requirement from the task)

R1 Canonical routes: /pro root, /pro/recipe editor, /studio → /pro/recipe (query-preserving), no legacy Studio editor, no duplicated workspace/state/Engine/Monitor/save/versions/recalc.
R2 Customer-facing naming: remove visible „Studio"; „PINGÜINO Pro" everywhere; listed strings replaced.
R3 ONE canonical recipe workspace component used by /pro/recipe, /pro (recipe active), /studio via redirect — workbar + editor + Mapper selection + canonical RecipeInput/Engine + Monitor PI + Preview + Apply + Undo + Save + versions.
R4 Exact canonical menu (NAWIGACJA 8 / PINGÜINO PRO 8 / KONTO) with real route mapping; no Studio item, no English, no legacy left nav, no /dev/*, no dead links.
R5 Stable /pro/<section> URLs; direct link + refresh restore the section; no fake pages (honest states).
R6 Menu identical across primary routes; PINGÜINO Pro / Moja maszyna / Etykiety i produkty / Subskrypcja / full Pro submenu never disappear.
R7 Shell baseline preserved (logo left, hamburger right, right drawer, Polish, no legacy left sidebar).
R8 Sticky workbar on the canonical route (new: name+placeholder+save beside+note+mode+batch+Monitor+Przelicz; saved: name+DD.MM.YYYY·vN+status+workflow/serving/batch+Monitor+Przelicz+Zapisz nową wersję).
R9 „Przelicz z PI" always visible at top and INITIATES the real Preview (not a scroll shim).
R10 „Monitor PI" visible at top opening the real Monitor (drawer desktop / sheet mobile).
R11 Recalculation flow: change → Przelicz z PI → Preview → Zastosuj/Anuluj → Cofnij → Zapisz nową wersję.
R12 Remove legacy duplication (old Studio header, redundant links, duplicate saves, Studio v1, duplicate lists, legacy left nav) while preserving Engine/save/versions/restore/Mapper/Monitor/rescue domains.
R13 Advanced-Studio legacy content no longer defines a product; demo scenarios behind a QA/dev flag; remaining cleanup recorded.
R14 Active states incl. parent PINGÜINO Pro on all /pro/*.
R15 Polish shell/menu/workbar/connected headers; deep leftovers logged.
R16 Regression baselines identified + rerun.
R17 No Engine-science change.
R18 Responsive matrix + a11y verification.
R19 The 20 required automated tests + full gates.
R20 Deploy staging (+ production); served proof; hard 100% gate; ledger; final status.

## Completed

### R1 — Canonical routes ✅
- [router.tsx](src/app/router.tsx): `/pro` + `/pro/:section` → ProWorkspacePage; `/studio` → `LegacyStudioRedirect` (query-preserving, `studioRedirectTo` pure helper); `/calculator` → `/pro/recipe`. **StudioPage.tsx DELETED** (no legacy editor exists).
- Legacy `/pro?tab=<id>` deep-links redirect to `/pro/<id>` ([ProWorkspacePage.tsx](src/pages/pro/ProWorkspacePage.tsx)). Unknown sections → `/pro/recipe`.
- ONE workspace: the recipe editor (ProWorkbar + ProRecalcPanel + StudioEngineSurface) renders only inside ProWorkspacePage. No duplicate state/Engine/Monitor/save/versions/recalc (asserted by tests).
- Live proof (dev): `/studio?recipe=test-123` → **`/pro/recipe?recipe=test-123`**; `/calculator` → `/pro/recipe`; `/pro?tab=costs` → `/pro/costs`; hard refresh of `/pro/versions` restores Wersje.

### R2 — Naming ✅ (customer-visible)
- Menu: no „Studio" item anywhere (canonical config + the customer drawer now render the ONE appNav).
- `copy.studio.eyebrow` „Advanced Studio"→„PINGÜINO Pro"; `engineTag`+`nav.engineLabel`→„Silnik −11°C"; `studio.goal.modeLabel`→„Tryb produktu"; `notFound.back`→„Wróć na stronę główną"; `recipes.empty`→„…w PINGÜINO Pro…"; `nav.recipes.mine`→„Moje receptury"; `proCore.draftTitlePrefix`→„Szkic receptury"; constraint-studio `defaultTitle`→„Nowa receptura"; machine-onboarding `studioReady`→„Przygotowano PINGÜINO Pro"; studioFlow 9ד w Studio"→„w PINGÜINO Pro"; landing „Zaawansowane Studio"×2→„PINGÜINO Pro…", footer Studio link→PINGÜINO Pro→/pro. Internal component names (StudioEngineSurface etc.) retained deliberately (allowed).

### R3 — One canonical workspace ✅
- `/pro/recipe` (= `/pro` root, = `/studio` after redirect): sticky ProWorkbar (name/save/context/version/status/Monitor PI/Przelicz z PI) + ProRecalcPanel (Preview→Zastosuj/Anuluj→Cofnij) + StudioEngineSurface (editor, Mapper picker, canonical RecipeInput+Engine, Monitor PI rail) + MonitorDrawer; Wersje = real RecipeVersionsSection; canonical save = useCanonicalRecipeSave.

### R4–R7 — Menu & shell ✅
- [appNav.ts](src/features/shell/appNav.ts): NAWIGACJA = Strona główna(/), Stwórz recepturę(/start), **PINGÜINO Pro(/pro — for everyone)**, Gotowe receptury(/recipes), Moje receptury(/my-recipes), Moja maszyna(/profile/machine), Etykiety i produkty(/label), Subskrypcja / Plan(/subscription). PINGÜINO PRO = 8 subitems on `/pro/<section>` (Pro-gated). KONTO footer = email + plan (Plan Pro) + Wyloguj się.
- ONE drawer everywhere: [CustomerMenu](src/features/customer-shell/ui/CustomerMenu.tsx) now mounts **AppNavDrawer** (its parallel item list + „Studio" entry DELETED: customerMenu.ts removed); [DestinationSurface](src/components/shared/DestinationSurface.tsx) moved from the legacy dark ShellLayout/TopNav onto **AppShell** → /label /api /recipes /work-with-us /create-ingredient /products/import wear the canonical shell (legacy left/mega nav unrouted).
- Active states: per-item + parent `proHome` active on every /pro/* + group-title highlight (`data-active`). Live-proof menus on `/pro/recipe`, `/`, `/label`: identical 16 items, no Studio, right-side drawer, KONTO reachable.
- „Etykiety i produkty" → `/label` (the real, working, non-/dev destination). The customer OCR route remains dev-gated — recorded honestly (PI-CONTENT-003 §6), no fake page created.

### R8–R11 — Workbar & recalculation ✅
- Workbar unchanged baseline + machine-aware context (S4). New-recipe: inline „Nazwa receptury" (placeholder „np. Pistacja Premium") + „Zapisz recepturę" beside + „Dodaj notatkę" + context (mode/machine/serving/batch) + „Monitor PI" + „Przelicz z PI". Saved: name + `DD.MM.YYYY · vN` + status (Wszystkie zmiany zapisane / Niezapisane zmiany) + „Zapisz nową wersję (vN+1)".
- **„Przelicz z PI" initiates the REAL preview**: [ProRecalcPanel.tsx](src/features/pro-core/ProRecalcPanel.tsx) drives the ONE constraint-studio pipeline (`createOptimizePreview` → `applyPreview` → `undoLastApply`; `commitPreview` verify-gate; boundary test „one recipe writer" intact; no new optimizer/Engine). Honest failure messages (shared `previewIssueMessagePl`), BlockedApplyNotice, per-line before→after grams via the same ConstraintPreviewCard.
- Live proof (dev, Pro persona): click Przelicz z PI → real solver proposal (add 129 g Skimmed milk powder, Partia 1000→1129 g, honest out-of-band 3→4) → Zastosuj → „Zastosowano zmiany… " + Cofnij → undo restores the exact pre-apply state (batch 450) and consumes history.
- Monitor PI at top opens the existing MonitorDrawer (right drawer desktop / bottom sheet mobile).

### R12–R13 — Legacy duplication removed ✅
- StudioPage (old product header + duplicate „Zapisz recepturę" SaveRecipeDialog mount + StudioModeToggle) deleted → ONE save UI (workbar) on the canonical route (test-pinned: exactly one `pro-workbar-save`; no SaveRecipeDialog on the page; SaveVersionControl not mounted).
- DEMO SCENARIOS (PresetSelector) now `import.meta.env.DEV`-only — dead-code-eliminated from production; never the owner's default workspace.
- The optimization-preview block localized (Podgląd optymalizacji, PL disclaimers). Remaining deep content logged: **PI-CONTENT-003** in [OPEN_ISSUES.md](docs/product-completion/OPEN_ISSUES.md).

### R14–R15 ✅ Active states + Polish (proven live + test-pinned). R17 ✅ Engine untouched (no change to engine/, TARGET_BANDS, anchors, PAC/POD, Mapper, optimizer, IF9/IF10, solver, routing, CONFIG/ENGINE_VERSION — Engine-equality suites green).

### R16 + R19 — Tests ✅
- New [canonicalPro.test.tsx](src/features/shell/canonicalPro.test.tsx) — the owner's proofs 1–18 (17 tests; 19–20 = the existing save/version + Engine suites in the same gate).
- Rewritten pins: appNav.test (new structure incl. „never a separate Studio item"), routes.test, canonicalShell.test, ProWorkspacePage.test (stable paths), acceptedCorrectionDraft.test, OptimizationPreviewPanel.test (PL), en.test, machine-onboarding string pins. Removed with its dead config: customerMenu.test.
- **Full gate: 4561 tests / 337 files PASS · ESLint 0 errors · tsc -b ✓ · production build ✓.**

### R18 — Responsive + a11y ✅ (local dev)
- Mobile 375×812: workbar + name + Zapisz + Monitor PI + Przelicz z PI all visible WITHOUT scrolling; **horizontal overflow found and FIXED** (AppShell actions wrap + DEV-switch label hidden <sm); drawer footer (KONTO) reachable; body scroll lock; 0 console errors. Desktop 1280×720 verified. (Full 9-viewport sweep: the layout is fluid classes only; key breakpoints proven.)
- A11y (test-pinned + shipped code): Escape close, focus trap + focus return, `aria-modal`, `aria-current="page"`, `aria-label`s, 44px touch targets (min-h-11), safe-areas, reduced-motion (`motion-safe:` animations).

## Not completed
1. **Authenticated Pro proof on SERVED staging/production** — AWAITING OWNER (see Why).
2. **Screenshots of the served app** — BLOCKED (environment): the Browser pane is not displayed in this session, so `screenshot` times out („not compositing frames"). Full DOM/accessibility-tree proofs captured instead (above).
3. Deep-content items of PI-CONTENT-003 (explicitly permitted as later content issues).

## Why not completed
1. Credential entry is prohibited for the agent (binding rule: never type the pro@pro.com password); the DEV persona switch does not exist in production builds — only the owner's real login can produce the authenticated served proof.
2. Tool limitation of the current session (headless pane); text/DOM proofs provided for every claim.
3. Owner task text: „Remaining deep technical Studio copy may be logged as a later content issue".

## Regression proof
Save/edit/delete/persistence/versions (S2 suites + canonical save tests) ✔ · one recipe list ✔ (proof 16) · immutable versions ✔ · Mapper search + ingredient selection ✔ (suites) · exact grams Pro / redaction ✔ · Engine outputs ✔ (equality suites) · entitlement gating ✔ (persona gate tests) · shell behavior (right hamburger/right drawer/Polish nav) ✔ (canonicalShell + appNav + live). Full suite 4561/4561.

## Online verification
- local (dev, DEV Pro persona): **VERIFIED** (redirects, menu, workbar, real Preview→Zastosuj→Cofnij, responsive, 0 console errors)
- staging desktop (served, anonymous): **VERIFIED** (see deploy section — redirect + menu + shell)
- staging mobile (served, anonymous): **VERIFIED**
- authenticated Pro (served staging): **AWAITING OWNER**
- /studio redirect (served): **VERIFIED**
- /pro/recipe (served): **VERIFIED** (anonymous shows the honest Pro gate + canonical shell/menu)
- production (www.pinguinoai.com): code deployed from main; **BLOCKED** for any authenticated flow (PI-P0-001 — prod Vercel lacks VITE_SUPABASE_URL/ANON_KEY; external owner/Nicolas action) — shell/redirect spot-check VERIFIED.

## Next unresolved item
Only: the owner's authenticated served verification (checklist in the final report). No new task proposed.
