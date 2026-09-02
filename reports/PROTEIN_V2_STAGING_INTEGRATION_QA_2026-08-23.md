# PROTEIN v2 — CONTROLLED STAGING INTEGRATION & SERVED QA

**Date:** 2026-08-23
**Integration branch:** `claude/protein-v2-integration`
**Base at start:** `origin/staging` `b9c4b04597fecb219997bdf55297edb0d67fe4f0`
**Final staging SHA:** `8d35b91cdc5705bce4857bb7637f1ecc29005bbd`
**Deployment:** `dpl_Avkz3BWV3UybCZtV3n7hAJwoKr4L` — READY — https://staging.pinguinoai.com
**Mapper base:** 2088 rows, sha256 `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged**
**Production:** untouched.

**RESULT: A — PROTEIN V2 VERIFIED ON STAGING.**

---

## 1. Source commits and how each was treated

| Local commit | Content | Treatment |
|---|---|---|
| `79fca96` | science report, `proteinScienceAuthority`, `proteinBehavior`, coverage audit | **cherry-picked clean** → `8253bb2` |
| `0099bc3` | Engine v2, qualification, target removal, `ProteinContentReadout`, tests | **cherry-picked clean** → `063a31a` |
| `4199fb1` | **STALE** Score UI (pre-`ScoreRing` markup) + `proteinV2Contract.test.tsx` | **NOT cherry-picked.** Test file ported with re-pointed assertions; UI re-implemented on the current architecture |
| `41327e3`, `5f09eaa` | implementation ledgers | superseded by this report |

Staging moved **four** times during the work (`b9c4b04` → `7230114` → … → `d3108e0`); the branch was rebased each time and pushed as a plain fast-forward. No force push.

## 2. Stale UI commit — what was preserved

`4199fb1` was written against the old inline ring markup. Staging has since extracted `ScoreRing.tsx`, added `MonitorScoreHeader`/`monitorLiveScore` and **deleted** `workbenchScoreRing.contract.test.tsx`. Cherry-picking it would have reverted that work.

Instead the Protein semantic was ported into the current seam. **Preserved untouched:** partial ring arc, approved tones, 36 px/2 px geometry, absence of `/10`, live Monitor score, formal footer recalculation state, before/after preview, responsive behaviour.

`monitorLiveScore.ts` gained `proteinPercent` on `MonitorLiveScoreView`, read from the **same** engine result the score is read from — so before/after protein came for free rather than needing a new component.

## 3. Two real defects found and fixed while integrating

Both are boundary bugs that only surface within a hundredth of a point of the HIGH PROTEIN threshold — exactly where the v2 optimizer aims.

1. **The ladder anchored its lowest rung ON the requirement.** The exact solver returns the closest hard-safe candidate, and the requirement itself rises as protein rises. Measured: **8.489 % protein against a requirement of 8.4896 % → energy share 19.9988 %.** The ladder now clears the requirement by half a step.

2. **Whole-gram practicalization rounded a QUALIFIED candidate across the boundary.** Main maximisation and the Direction segment only *preserve* the frontier they are handed, and rounding happens after all of them. `finishPreview` — the one choke point every route converges on — now re-asserts the claim on the **executable** candidate and accepts the repair only when it restores the frontier without costing Main grams, hard safety or Direction.

Before the fixes, **8 of 26 matrix cases** produced natively hard-safe, Direction-clean recipes that were silently not Protein products.

## 4. Old 20 %-by-mass target — removed: **YES**

Verified absent from optimizer, constraints, Preview, Apply, Score, Rescue, persistence, defaults, tests and UI. Pinned by test (`§8 — the retired 20 %-by-mass target has no live authority left`). `RecipeGoals.target_protein_percent` survives only as a `@deprecated` field that **nothing reads**, so historical saved recipes still type-check and are inert.

**Confirmed on the live deployment:** the persisted store carries `hasTargetProtein: false`.

## 5. Qualification formula

`Regulation (EC) No 1924/2006`, Annex — HIGH PROTEIN: **at least 20 % of the food's energy from protein.**
One implementation, `assessProteinQualification`. Minimum protein mass % for a given composition:
`requiredProteinPercent = nonProteinKcalPer100g / 16` (from `4P/(4P+nonProteinKcal) = 0.20`).

## 6. Boundary tests (§17)

Synthetic fixtures hit the boundary exactly (real catalog products cannot land on 19.99/20.00/20.01 % on demand, and rounding a real recipe would test the rounding):

| energy share | qualified |
|---|---|
| 19.99 % | **false** |
| 20.00 % | **true** |
| 20.01 % | **true** |
| 19.996 % (displays as "20 %") | **false** — the raw share is evaluated, never a rounded one |

## 7. Served QA — all verified on https://staging.pinguinoai.com (authenticated Pro)

| # | Check | Result |
|---|---|---|
| A | no Protein target control | **0** range inputs / target testids anywhere |
| B | actual Protein % beside Score | `Białko 9,0%`, `data-testid="workbench-score-protein"` |
| C | ring shows no `/10` | `/10` absent from page text; ring renders bare numeral + partial arc |
| D | qualification by energy, not mass | readout shows `Wysoka zawartość białka · 21% energii` |
| E | an ~8–10 % recipe can score 10 | −11 **8,5%/10**, −12 **9,0%/10**, −13 **8,8%/10** |
| F | excess protein does NOT improve Score | **9,0% → 10** · **12,1% → 8** · **20,0% → 6** |
| G | manual edit updates live Score + Protein % | WPC 91→131 g moved readout 9,0% → **12,1%** and score 10 → 8 instantly |
| H | footer freshness correct | `stale=true` + "Oczekuje na przeliczenie" **while** the live score still displays |
| I | Preview | `BIAŁKO PO ZMIANIE 9.0% · WYSOKA ZAWARTOŚĆ BIAŁKA 21% energii`, params out of range **2 → 0** |
| J | Apply | applied; WPC **230 g → 91 g**, milk +40 g, sugar +65 g |
| K | Save / reopen | saved `1d14a107-9284-4b04-9e7a-1454c6ec9c53` v1; reopened at **10 / Białko 9,0%**, no persisted target |
| L | Rescue | shared advisor intact; protein guard rejects candidates that lose the claim or worsen structure |
| M | no 0 g executable rows | 0 zero-gram lines after Apply and after reopen |
| N | Production smoke | production cockpit reachable, no errors |
| O | console clean | **no console errors at any point** |

Direction shows only **Słodycz** and **Twardość** — no protein axis.
Gelato verified unaffected: ring renders, aria-label carries no `Białko`, no protein testids.

## 8. §31 v1 → v2 proof

The Protein **starter template** still seeds the shape the retired target produced (110 cream / 247 WPC / 505 water). Served, v2 scores it honestly and explains why:

> Białko **20,0%** · score **6** · "Receptura ma 20.0% białka, a do deklaracji „wysoka zawartość białka" wystarcza 6.5%. Nadmiar 13.5 pp nie poprawia produktu — w badaniach obniża napowietrzenie i zwiększa twardość." · "20.0% białka wykracza poza wszystkie kontrolowane badania mrożonych deserów (maksimum 10%)."

Pinned in test at −11 °C:

```
v1 overloaded   20.01 % protein · 43.5 % of energy · structure score 3   (v1 scored this 10/10)
v2 optimum       8.48 % protein · 20.3 % of energy · structure score 10
```

**Replaying the EXACT served recipe against the pre-integration base (`d3108e0`) versus the integrated tree:**

| case | BASE (v1) | INTEGRATED (v2) |
|---|---|---|
| eco −11 | ✗ `unsafe_proposal` [ice_fraction, npac] | ✗ **identical — pre-existing, not a regression** |
| eco −12 | 19.02 %, **diagnosticOnly, Apply BLOCKED** | **8.96 %, qualified, structure 10, Apply allowed** |
| eco −13 | 19.04 %, **diagnosticOnly, BLOCKED** | **9.04 %, qualified, structure 10, allowed** |
| optimal −11 | 19.96 % | **9.01 %, qualified, structure 10** |
| optimal −12 | 19.02 %, **BLOCKED** | **8.96 %, qualified, allowed** |
| optimal −13 | 19.04 %, **BLOCKED** | **9.04 %, qualified, allowed** |

v1 left **4 of 6** cases diagnostic-only with Apply blocked, because it could not hit 20.0 % exactly and refused everything short of it. v2 produces applicable, qualified, structure-10 recipes in all five reachable cases.

## 9. Representative matrix (§19)

12 of 14 cases build and qualify (8.49–9.53 % protein, 20.0–21.1 % energy, structure 10). Two recorded **FIXTURE_UNAVAILABLE** rather than fabricated:

- **C — WPI-like:** no whey protein isolate row exists in the canonical Mapper base.
- **F — casein-rich:** no casein or caseinate row exists in the canonical Mapper base.

`D — MPC-like` uses `PI-ING-000237`, whose name asserts both MPC and WPC; the taxonomy honestly returns `mixed_dairy_protein` rather than guessing.

## 10. Validation

| Command | Result |
|---|---|
| `npm test` | **585 files, 7374 tests, all passing** |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (2 pre-existing `react-refresh` warnings in untouched files) |
| `npm run build` | built |
| `npm run products:audit` | mapperSha256 `b13f5db4…ed38` |
| `npm run mapper:runtime-audit` | active 2088, searchable 2088 |
| `npm run process:validate` | 2088 rows, alignmentDifferences 0 |
| `npm run catalog:mapper-only:validate` | 0 violations |
| `npm run production-rescue:bundle-check` | verified **`b0f31c48bd3465153759f4b2bc29f540126187d1766e1959c5005c3678a0d13c`** |
| `git diff --check` | clean |

Rescue Edge bundle regenerated because the Vegan v2 landing entered the closure through `applyPipeline` and `rescueIngredientAdvisor`. **Staging Edge only — production Edge untouched.**

## 11. Findings for the owner (not blockers)

1. **The Protein starter template still encodes the retired formula.** `protein_dairy_neutral_minus11/12/13_v1` seeds ~20 % protein by mass. The engine corrects it on the first Preview and the UI explains why, but the seed the user starts from is the old artefact. Reseeding the template at ~8.5–9 % would remove one confusing step. Not changed here — it is template data, outside this integration's scope.
2. **ECO at −11 °C cannot formulate from that starter** (`ice_fraction`, `npac`). **Verified identical on the pre-integration base**, so it is pre-existing. OPTIMAL at −11 works. Worth a separate look at the ECO cost-plus-safety search.
3. **ECO trades structure for cost in Protein mode**, landing near 17 % protein on sparse drafts. The quality model charges it correctly (structure 4–5), so the Score is truthful — but the owner may want ECO to weight structure more in Protein.
4. **Switching an existing non-Protein recipe to Protein** leaves it rejected (`recipe_constraint_invalid`) until it can earn the claim. Same class of behaviour as v1's `protein_target_unmet`, now with a scientifically correct threshold, but the message could name the reason.
5. A QA recipe **"QA Protein v2 -12C"** (`1d14a107-9284-4b04-9e7a-1454c6ec9c53`) was saved on the staging account as evidence and can be deleted. The pre-existing draft "mmm" was restored to Gelato and never overwritten.
