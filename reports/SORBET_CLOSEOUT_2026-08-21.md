# Sorbet closeout — supported product status + freezing authority (2026-08-21)

Branch: `claude/sorbet-closeout` (fresh worktree from `origin/staging` 045175b)
Commits (all on `origin/staging`, in order):
- `f09a51e788728fac5eaa4446cd8dd524f6a41f58` — `fix(sorbet): close supported product status and freezing authority` (closeout)
- `09f5a9d91a2a7b8e18657a45546978ac0c6826cc` — `docs(sorbet): record closeout evidence and pending served QA`
- `db488a8661faaeace34c62bc80c1e557adda1efb` — `fix(apply): reproduce ECO cost-swept previews at the Apply door` (served QA regression #1)
- `f670e8d47ba28b67069ca9db70e6fc091de9a237` — `fix(apply): accept the byte-exact Main group on Sorbet exact-Direction previews` (served QA regression #2)

Staging: `origin/staging` 045175b → f09a51e → 09f5a9d → db488a8 → **f670e8d**; Vercel `pinguino-staging`
`dpl_D1JgFK4pLDznrrWjqZ6Uj6wLxKyG` READY (alias https://staging.pinguinoai.com), served bundle
`assets/index-DEojfDXG.js` (sha256 `04aadca02d193913f4fb117b0b40050e3382184e8a5a0c1dd41f824bd2c83d04`,
contains `mainHeldByExactDirection` and `sorbet_freezing_authority_unavailable`). Earlier staging deploys of this
closeout: `dpl_28rc8gdGj1Q3vg7vA9ZmonkyFYyR` (f09a51e), `dpl_A2dL3opqfkZX9ZfKzgRqJrMoSNdi` (09f5a9d),
`dpl_5MruzKp7uZ4JxTkWpDMtRtTvvg8D` (db488a8).
Production: untouched — `main` 4dfb097, www.pinguinoai.com still serves `assets/index-BTR3SdkC.js` (re-checked 2026-08-22).
Account used for served QA: the dedicated **TEST PRO** account on staging (signed in by the owner in the
browser pane; credentials never typed, stored or logged by the agent).

## X1 — root cause and fix

`src/features/recipe-constraints/freezingStabilityStatus.ts` required a seeded `ICE_ANCHOR_ROWS`
row for the recipe category before certifying GOOD. Sorbet intentionally has no anchor rows
(its ice authority is the composition-sensitive solver), so every Sorbet Monitor row was
`UNAVAILABLE` → "Brak danych" even with an authoritative solver result.

Fix: Sorbet is certified only by its own composition freezing authority —
calculation CURRENT, `ice_fraction_percent` finite, no `sorbet_freezing_*` unavailable warning
(read through the engine's canonical `sorbetFreezingUnavailableReasonFromWarnings` contract),
supported temperature (−13…−11 °C), and the unified constraint authority valid.
Resulting states: valid supported Sorbet → GOOD (Dobra); BASE changed → STALE (Oczekuje na
przeliczenie); unsupported composition / solver unavailable → UNAVAILABLE (Brak danych, new reason
`sorbet_freezing_authority_unavailable`); authoritative result with a real violation → ATTENTION
(Wymaga uwagi). Gelato/Protein keep the own-category seeded-row rule; Vegan unchanged.

## Milk-anchor independence

- `hasSeededIceAnchorAtTemperature('sorbet', t)` no longer falls back to milk_gelato rows (false).
- New engine `hasDirectIceAuthorityAtTemperature`: Sorbet → `isSorbetFreezingTemperatureSupported`
  (−13…−11), other categories → unchanged seeded-anchor rule. `isMonitorTuningApproved` uses it.
- No Sorbet `ICE_ANCHOR_ROWS` were added. Independence probe test: with **zero** anchor rows
  Sorbet stays GOOD at −11/−12/−13 while Gelato fails closed.

## Obsolete Sorbet gating removed

- `WorkbenchSettingsLine.tsx`: Sorbet `ReadinessBadge state="W PRZYGOTOWANIU"` ("Sorbet nie
  blokuje istniejącego nabiału…") deleted. Sorbet is a normal option of `VISIBLE_PRODUCT_TYPES`.
- Repo-wide audit: no other Sorbet-conditioned readiness badge / coming-soon / disabled gate
  (remaining markers are unrelated: machine capacity, allergens, production substitutes, soft serve).
  Guard test `src/features/studio/sorbetSupportedProductType.test.ts` scans `src/` for any
  `'sorbet'` condition whose own element renders such a marker.
- Product-type switching unchanged and truthful: a dairy BASE re-labelled Sorbet fails closed
  (lactose is outside the solver domain) → "Brak danych", never "Dobra" (pinned by test).

## Ice semantics wording

Sorbet Monitor tooltip: "Udział masy lodu w całej mieszance (masa lodu / masa całej mieszanki) w
temperaturze serwowania…". Gelato tooltip byte-identical. `iceFraction.ts`/`iceAnchors.ts`/
Track G doc comments corrected. No numerical change; hard bands (−11 51–59, −12 51–59, −13 50–58)
and Direction centers untouched.

## Matrix and science regression

`sorbetDirectionTargetMatrix.test.ts`: 150 cells, **94 LEGAL / 56 NEAREST_ACHIEVABLE / 0 blocked**
(−11 38/12, −12 32/18, −13 24/26) — unchanged; now pinned in the test.
`sorbetFreezingPhysics.test.ts` (pure/binary/ternary, real-juice rows, lemon DSC holdout,
S01/S02/S03, fail-closed, mass conservation, −11/−12/−13) + `sorbetIceCalibration.test.ts` PASS.

## Gates (final tree)

| Command | Result |
|---|---|
| focused Sorbet/freezing/Monitor/settings files | PASS |
| `npm test` | 552 files / 6928 tests PASS (known non-fatal `ita.special-words` stderr) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (2 pre-existing Fast Refresh warnings) |
| `npm run build` | PASS (existing chunk-size advisory) |
| `npm run products:audit` | PASS, Mapper SHA `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` |
| `npm run mapper:runtime-audit` | PASS (JSON; the report artifacts it rewrites without `--authority-json` were restored to HEAD and NOT shipped) |
| `npm run process:validate` | PASS, 2088 rows, 0 alignment differences |
| `npm run catalog:mapper-only:validate` | PASS |
| `npm run production-rescue:bundle-check` | PASS, bundle `2453b1b10ae8beef296ef1355289c37468d8fbcb8d916acc0ffa71c84be0bd42` |
| `git diff --check` | PASS |

Mapper Base unchanged: 2088 rows, fingerprint `b13f5db4…`.

## Served evidence

- Served `assets/index-KF667_1H.js` (f09a51e, sha256 `32b8cb7476919d980a329750886f9deb0b4c7f2286281af229df69d156845209`):
  contains the Sorbet ice tooltip and `sorbet_freezing_authority_unavailable`, does NOT contain "Sorbet nie
  blokuje"; Gelato tooltip still present. Unauthenticated: landing 0 console errors; `/pro/recipe` without a
  session shows the Pro gate.

### Authenticated served QA (TEST PRO, staging, 2026-08-22, bundles `index-0dgRr-xd.js` → `index-DEojfDXG.js`)

| # | Item | Served result |
|---|---|---|
| 1 | Sorbet selector | normal option, no "W PRZYGOTOWANIU"/coming-soon badge anywhere |
| 2 | Settings confirm | "Potwierdź ustawienia" → "✓ Ustawienia sprawdzone"; Gelato→Sorbet switch shows the truthful "Zmiana ustawień wymaga przebudowy składników" dialog (Anuluj/Przebuduj) |
| 3 | −11 °C valid Sorbet | strawberries 400 g (ratio weight 2) + lime 200 g → Przelicz → Apply → Monitor **Dobra** (GOOD); later strawberries 300 + lime 300 (1:1) → Apply → **Dobra**; Direction softness −1 nearest-achievable → Apply → **Dobra** (PAC 27.48 / NPAC 38.63) |
| 4 | −12 °C valid Sorbet | canonical scaffold + strawberries 600 g → priced ECO sweep 188/121/87/0/4 (+600) → Apply → **Dobra**; after tara edit → recalc (189/141/66/4) → **Dobra** |
| 5 | −13 °C valid Sorbet | canonical scaffold + strawberries 600 g → 172/104/120/0/4 → Apply → **Dobra** (PAC 37.45 / NPAC 52.3) |
| 6 | BASE edit | any grams edit (tara 4→5, direction click) → Monitor "**Oczekuje na przeliczenie**" (STALE), awaitingRecalculation=true |
| 7–8 | Recalc/Preview/Apply restores | Przelicz → Preview → Zastosuj zmiany → "Dobra", awaiting=false, sum 1000 g, history advanced; Direction reset → Przelicz → Apply → Dobra |
| 9 | Unsupported composition | dairy is refused at the selection boundary for Sorbet ("Dokładny produkt … Mapper PI-ING-000201 · moduł BASE_RECIPE nie jest zgodny z bieżącym profilem"); MANGO CHATO puree (salt 0.15 % declared) → ice authority fails closed → Monitor "**Brak danych**" (UNAVAILABLE, `unsupported_freeze_active_solute`), never "Dobra" |
| 10 | Risk / ATTENTION | served flows cannot apply an invalid BASE (Apply is the only path to CURRENT); a risky edit stays STALE ("Oczekuje na przeliczenie") and Save is gated; ATTENTION ("Wymaga uwagi") remains pinned by `freezingStabilityStatus.test.ts` (canonical violation / alcohol on a CURRENT recipe) |
| 11 | Neutral scaffold | no Main: Monitor stale + PI refuses ("Brakuje składnika w roli: owoc") — truthful |
| 12 | Direction −2…+2 | sweetness +2 / +1 on locked-Main drafts → honest refusal "Solver nie znalazł korekty możliwej przy obecnych blokadach" (no_proposal, directionTargetUnreached) and Monitor STALE until reset; softness −1 on the canonical scaffold → "Nie mogę osiągnąć dokładnie wybranego celu · Najbliższy poprawny wynik 8/10 · Przelicz najlepiej możliwie" → Preview (Main 600 g byte-exact, only water/sucrose/dextrose moved) → **Apply ok → Dobra** (after f670e8d; blocked before, see regression #2) |
| 13–14 | Strawberry / lemon-lime / mango / neutral | strawberry (−11/−12/−13 Dobra), lime (−11 Multi-Main Dobra), neutral (stale + refusal), mango: MANGO CHATO 600 g −12 applies but "Brak danych" (declared salt), MANGO ALPHONSO ORIENT TASTE has no taxonomy subfamily → not Main-eligible (button disabled), other mango rows/combos (300+300, 400+200, 600) are PI-infeasible under the approved bands (identical result on pre-closeout 045175b) — truthful, never a false "Dobra" |
| 15 | Multi-Main 1:1 | lime 300 g + strawberries 300 g in 1000 g (default weights) → Apply → Mains kept 300/300, sum 1000, **Dobra** |
| 16 | Multi-Main 2:1 | strawberries 400 g (weight 2) + lime 200 g → Apply → Mains kept 400/200, sum 1000, **Dobra** (−11; note: grams alone do not set the ratio — "Waga proporcji" must be 2) |
| 17 | Topping isolation | OREO ORIGINAL COOKIE topping 0 → 21 → 20 g → removed: BASE stays 1000 g, "TOPPINGI PO PRODUKCJI +20 g", "PRODUKT FINALNY 1020 g", Monitor unchanged (PAC/NPAC identical, Dobra), awaiting unchanged; remove → +0 g / 1000 g |
| 18–20 | Preview / Apply / Save | Preview lists exact Engine grams, Apply changes only the draft; ZAPISZ "QA Sorbet truskawka -11" → recipe `f5e53371-53dc-4fa5-bfd3-e7cfe75f3a11` version 1 (`3a9ab2e4-0a30-4bd4-bb5b-c128c7cf6631`), dirty=false |
| 21 | Leave / reopen | `/pro/versions` lists "RECEPTURA: QA Sorbet truskawka -11 · 22.08.2026 · v1"; back on `/pro/recipe` the recipe reloads byte-identical (171/117/53/55/4/600, −11, Direction −1 kept), version still 1 (no duplicate save), Monitor **Dobra** (authority intact) |
| 22 | Production smoke | before save: "WYMAGA RECEPTURY WYKONAWCZEJ · Zapisz wersję wykonawczą"; after save: "RECEPTURA WYKONAWCZA GOTOWA · QA Sorbet truskawka -11 · Wersja 1 · 1000 g · Składniki bazy 6 · Źródło Zapisana wersja · Rozpocznij partię" (readiness only — no batch started) |
| 23–24 | Readiness / fingerprint | no regression (production readiness state machine unchanged; mapper fingerprint `b13f5db4…`) |
| 25 | Console | 0 errors on every page load and after every flow (read_console_messages onlyErrors: none) |
| 26 | Network | only 200/304 document/asset requests; no failed request loop |
| 27 | Duplicate save | one save → one version; reopen keeps version 1 |
| 28 | Stale UI | every Apply updates rows, footer and Monitor immediately; stale state only where truthful (STALE label) |
| 29–30 | Production untouched / Mapper Base | www still `index-BTR3SdkC.js`; `mapper_basement.csv` fingerprint unchanged |

### Served QA regression #1 — priced ECO sweep Apply door (`db488a8`, deploy `dpl_5MruzKp7uZ4JxTkWpDMtRtTvvg8D`)

Served symptom: hard-valid Multi-Main Sorbet (ECO, owner "Moja" prices) staged an honest Preview, Apply
refused with `main_identity_violated` ("nie udało się ponownie potwierdzić dowodu maksymalizacji…" then
"propozycja nie odtwarza dokładnie…"). Root cause: the ECO "current draft owns search" branch built the
cost-swept preview without the Main frontier proof it had just computed, and the door rebuilt the frontier
without the owner price index / unavailable-Main declarations / practical gate. Fix: attach the proof to the
swept preview; `VerifiedApply.commit` receives the build-only rebuild options from the store. Test:
`ecoPricedApplyDoor.test.ts`. Reproduced offline on 045175b too (pre-existing, surfaced by served QA).

### Served QA regression #2 — Sorbet exact-Direction Apply door (`f670e8d`, deploy `dpl_D1JgFK4pLDznrrWjqZ6Uj6wLxKyG`)

Served symptom: Direction softness −1 → "Przelicz najlepiej możliwie" → Preview → Apply refused with
`main_identity_violated`. Root cause: the Sorbet exact five-step fast path
(`projectSorbetExactDirectionCandidate`, 045175b) keeps Main/Inulin/stabilizer byte-exact and carried no Main
proof; the Main maximisation frontier treats an unreached exact Direction target as a hard gate
(`limitingTechnicalRules: direction:npac, direction:pod`), so no honest nearest-achievable Preview could ever
carry a valid proof. Fix: the fast-path preview is flagged `mainHeldByExactDirection`; the door accepts it only
when every Main line is byte-identical to the trusted draft AND the same exact candidate reproduces
deterministically from the current draft (`buildOptimizePreview` fingerprint match); every other optimize
Preview keeps the full proof contract. Test: `sorbetDirectionApplyDoor.test.ts` (served −12 °C strawberries
600 g softness −1 → accept → Apply ok → Dobra; forged held flag / forged vector refused; non-Direction ECO
path unchanged). Reproduced offline on db488a8 and on pre-closeout 045175b (pre-existing).

### Gates for the served-QA fixes (tree at `f670e8d`)

| Command | Result |
|---|---|
| focused `constraint-studio`/`recipe-direction`/`recipe-constraints`/`pro-core`/`formulation`/`pro-workbench` | 92 files / 1084 tests PASS |
| `npx vitest run` (full) | 6935 tests PASS |
| `npm run typecheck` / `npm run build` | PASS (existing chunk-size advisory) |
| `npm run lint` | PASS (2 pre-existing Fast Refresh warnings) |
| `npm run products:audit` / `process:validate` / `catalog:mapper-only:validate` | PASS (Mapper SHA `b13f5db4…`, 2088 rows, 0 alignment differences) |
| `npm run production-rescue:bundle-check` | PASS, bundle `2453b1b1…` |
| `git diff --check` | PASS |
| Sorbet Direction matrix | still 94 LEGAL / 56 NEAREST_ACHIEVABLE / 0 blocked |

### Pre-existing behaviours observed in served flows (NOT regressions — identical on 045175b; owner notes)

- ECO Apply may leave a 0 g line (inulin/dextrose); the next Przelicz demands ≥1 g or removal
  (`PRODUCT_GRAMS_REQUIRED`, guard from Aug-15/18). Workaround in QA: "Usuń z receptury".
- A user-typed inulin line (user anchor) + priced ECO sweep lands on inulin 1 g → diagnostic-only preview
  (dose 2–8 %, optional zero); removing inulin or leaving it untouched avoids it.
- Starting the −12 solver from a previously optimised vector (210/141/16/29/4 + strawberries 600) is refused
  (heuristic local search), while the canonical scaffold start is accepted.
- Stabilizer system total limit 5 g for Sorbet (tara 9 → clamped to 5 g with "Łączny limit systemu
  stabilizującego Sorbet wynosi 5 g").
- Mango rows: declared salt (CHATO 0.15 %, KERRY 0.1 %, Kier 0.07 %) trips the 0.05 %-of-mix unsupported-solute
  tolerance at 600 g; ORIENT TASTE lacks a taxonomy subfamily (not Main-eligible); salt-free ALPHONSO PL combos
  are PI-infeasible under the bands. A positive mango "Dobra" therefore needs either a Mapper/taxonomy decision
  (owner) or a different composition — the closeout keeps the fail-closed truth.

## Owner decision recorded (not implemented — out of closeout scope)

Home customer flow (`/start` → `buildStarterRecipeFromIntent`) has no Sorbet starter template
(`src/features/studioFlow/intentRecipeDraft.ts` STARTER_TEMPLATES), so a Home Sorbet resolves
to "structure only" (generic "uzupełnij wymagane dane" copy). This is a pre-existing template gap,
not a "W PRZYGOTOWANIU"/coming-soon gate, and wiring a Home Sorbet formulation path is new
formulation work the owner excluded from this task. Pro Sorbet is fully supported.

Also noted: the neutral Sorbet starter (scaffold without a chosen Main) now shows ATTENTION
("Wymaga uwagi": batch below target + native bands) instead of "Brak danych" — truthful and
identical to Gelato semantics for an incomplete batch.
