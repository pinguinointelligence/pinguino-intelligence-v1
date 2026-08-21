# Sorbet closeout — supported product status + freezing authority (2026-08-21)

Branch: `claude/sorbet-closeout` (fresh worktree from `origin/staging` 045175b)
Commit: `f09a51e788728fac5eaa4446cd8dd524f6a41f58` — `fix(sorbet): close supported product status and freezing authority`
Staging: `origin/staging` 045175b → **f09a51e**; Vercel `pinguino-staging` `dpl_28rc8gdGj1Q3vg7vA9ZmonkyFYyR` READY, alias https://staging.pinguinoai.com, served bundle `assets/index-KF667_1H.js`
Production: untouched — `main` 4dfb097, www.pinguinoai.com still serves `assets/index-BTR3SdkC.js`

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

- Served `assets/index-KF667_1H.js` (sha256 `32b8cb7476919d980a329750886f9deb0b4c7f2286281af229df69d156845209`):
  contains the Sorbet ice tooltip, contains `sorbet_freezing_authority_unavailable`,
  does NOT contain "Sorbet nie blokuje"; Gelato tooltip still present.
- Unauthenticated served checks at `f09a51e`: landing renders the new bundle with 0 console
  errors; `/pro/recipe` without a session shows the Pro gate (workbench requires a Pro sign-in).
- Authenticated Pro browser QA (product type switch, Sorbet cases A–F, Multi-Main ratios,
  unsupported fail-closed, toppings, save/reopen, Production smoke): **PENDING** — requires an
  owner sign-in in the browser session (staging uses email/password or Google sign-in; the
  closeout agent does not enter credentials). To be recorded in this report once executed.

## Owner decision recorded (not implemented — out of closeout scope)

Home customer flow (`/start` → `buildStarterRecipeFromIntent`) has no Sorbet starter template
(`src/features/studioFlow/intentRecipeDraft.ts` STARTER_TEMPLATES), so a Home Sorbet resolves
to "structure only" (generic "uzupełnij wymagane dane" copy). This is a pre-existing template gap,
not a "W PRZYGOTOWANIU"/coming-soon gate, and wiring a Home Sorbet formulation path is new
formulation work the owner excluded from this task. Pro Sorbet is fully supported.

Also noted: the neutral Sorbet starter (scaffold without a chosen Main) now shows ATTENTION
("Wymaga uwagi": batch below target + native bands) instead of "Brak danych" — truthful and
identical to Gelato semantics for an incomplete batch.
