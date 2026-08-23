# PROTEIN — FINAL CLOSEOUT

**Date:** 2026-08-23
**Branch:** `claude/protein-closeout`
**Base at start:** `origin/staging` `f588f765fb40aaa247ff17734d3070de644873ca`
**Final staging SHA:** `918aafcc250d328fba4473fd15caab6eb22b808b`
**Deployment:** `dpl_EyXQe2Zjzbvnz7P9EsHciGfuGzkS` — READY — https://staging.pinguinoai.com
**Mapper:** 2088 rows, `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged**
**Production:** untouched.

**RESULT: A — PROTEIN FULLY CLOSED ON STAGING.**

---

## 1. Old starter → new starter

The v1 seeds carried the retired 20 %-protein-by-mass target: 230–247 g of an
80 % whey concentrate in a 1 kg base. Four of the six opened with native band
violations — `newRecipeStarter.test.ts` **pinned `npac`/`pod` misses at −12 and
−13 as EXPECTED** — and the first Preview immediately pulled them to ~8–10 %.

The replacements are the **output of the v2 optimizer**, not a chosen number.
Each was derived by running `buildOptimizePreview` under normal Protein
authority, re-searched from an unbiased grid (protein 55–130 g, fat carrier
0–140 g, four sugar splits) to confirm the optimum is genuine, then selected for
the largest distance to the nearest band edge.

| route/temp | old | new | protein | energy | Score |
|---|---|---|---|---|---|
| dairy −11 | 20.0 % / Score 3 | cream 244 · WPC 112 · water 474 · suc 77 · dex 91 · tara 2 | **9.5 %** | 21.1 % | **10** |
| dairy −12 | 20.1 % / 6 + npac,pod | milk 522 · cream 114 · WPC 81 · water 104 · suc 71 · dex 106 · tara 2 | **8.3 %** | 20.3 % | **10** |
| dairy −13 | 20.1 % / 6 + npac,pod | milk 440 · cream 195 · WPC 100 · water 83 · suc 50 · dex 130 · tara 2 | **9.8 %** | 20.5 % | **10** |
| plant −11 | 20.2 % / 5 + ice,npac | oat 480 · coconut 67 · rice 111 · water 185 · suc 114 · dex 41 · tara 2 | 9.5 % | 20.4 % | **10** |
| plant −12 | 20.2 % / 6 + npac,pod | oat 403 · coconut 50 · rice 93 · water 298 · suc 2 · dex 152 · tara 2 | 8.0 % | 20.3 % | **10** |
| plant −13 | 20.2 % / 6 + npac,pod | oat 377 · coconut 46 · rice 99 · water 288 · suc 46 · dex 142 · tara 2 | 8.5 % | 20.1 % | **10** |

All six open **Score 10, zero native violations, claim earned** (§26). Protein %
remains an OUTPUT — the 8.0–9.8 % band is an observed result, never a target.

## 2. Six core operating modes (§7)

Measured from the new starter. `ALREADY_CLEAN` means the seed is itself the
optimum and the Engine has no correction to offer — the §26 goal, not a gap.

| mode | candidate | qualified | protein | energy | Score | POD | NPAC | Preview | Apply |
|---|---|---|---|---|---|---|---|---|---|
| OPTIMAL −11 | yes | ✓ | 9.52 % | 20.7 % | 10 | 12.95 | 33.15 | CORRECTED | ✓ |
| OPTIMAL −12 | yes | ✓ | 8.88 % | 20.4 % | 10 | 16.86 | 48.77 | ALREADY_CLEAN | n/a |
| OPTIMAL −13 | yes | ✓ | 9.90 % | 20.5 % | 10 | 14.34 | 52.36 | ALREADY_CLEAN | n/a |
| **ECO −11** | **yes** | ✓ | 7.98 % | 20.2 % | **10** | 16.08 | 37.98 | CORRECTED | ✓ |
| ECO −12 | yes | ✓ | 8.14 % | 20.1 % | 10 | 16.16 | 44.56 | CORRECTED | ✓ |
| ECO −13 | yes | ✓ | 8.86 % | 20.6 % | 10 | 16.97 | 52.27 | CORRECTED | ✓ |

## 3. ECO −11 — resolved, and it was the starter (§8)

ECO −11 previously failed on `ice_fraction` + `npac`. From the v2 starter it
formulates, qualifies and applies at Score 10. **Root cause was the obsolete
seed, not the ECO search** — proven by replaying the identical draft on the
pre-integration base in the previous task, where it failed the same way.

## 4. ECO quality/cost frontier (§9–§12)

`sweepEcoDraftCost` admitted a cheaper move on `sameTechnicalFit` alone, which
compares only NATIVE band violations. A Protein candidate can sit deep inside
every band while its structure collapses, so ECO bought cost with quality it
never measured — observed at ~17 % protein, Score 4–5.

The sweep now reads the **public Score**. `ECO_QUALITY_FLOOR_SCORE = 8`: if a
legal candidate at Score ≥ 8 exists, ECO may not select one below it; at
effectively equal cost it prefers the better product. The effective floor is
`min(8, baselineQuality)`, so it never rises above what the draft already
achieves — a protection, never a new hard gate, and no recipe becomes invalid.

Measured — ECO now improves cost **and** quality together:

| seed | before | after |
|---|---|---|
| −12 · 230 g WPC | 20.45 % · Score 6 · €3.863 | **8.88 % · Score 10 · €2.236** |
| −12 · 180 g WPC | 16.49 % · Score 5 · €3.348 | **8.46 % · Score 10 · €2.228** |
| −11 · 105 g WPC | 10.60 % · Score 9 · €2.946 | **8.33 % · Score 10 · €2.187** |
| −13 · 101 g WPC | 10.28 % · Score 9 · €2.743 | **8.90 % · Score 10 · €2.226** |

**Lowest ECO Score selected where ≥8 exists: 10.** ECO never selected below the
floor in any measured case.

**Frontier finding, recorded rather than asserted away:** with the canonical
toolbox at −12 every seed from 70 g to 230 g of concentrate converges on the
SAME legal optimum (8.88 %, Score 10, €2.2363/kg). The v2 optimizer is a strong
attractor, so the frontier collapses to a single point and ECO has no
cost/quality trade available to get wrong there. That does not make the floor
decorative — it is what guarantees the sweep cannot step OFF that optimum onto
something cheaper and worse, which is exactly what produced the ~17 % result.

## 5. Two defects found and fixed during closeout

**A. The ladder refused a broken start.** `fitProteinFormulation` returned
`native_safety_blocked` for any out-of-band start, leaving the worst case
unreachable: a candidate simultaneously out of band AND short of the claim had
nothing that could repair it. `solveForProteinPercent` already rejects every
non-hard-safe candidate inside `consider`, so searching from a broken start can
only return a hard-safe recipe or nothing. Fixing it turned a sparse-draft
ECO −11 diagnostic (7.82 %, **18.62 % of energy — NOT qualified**) into
**9.02 % / 21.42 % / Score 10 / zero violations**.

**B. A stale Main proof blocked a perfect Multi-Main Apply.**
`refineProteinFormulation` re-asserts the claim on the executable candidate
inside `finishPreview`, i.e. AFTER the Main frontier captured its proof.
`attachMainObjective` already refreshed `executableMainGrams` but left
`technicalScore` stale. Measured: a Multi-Main 2:1 recipe at −13 ECO carried
`technicalScore: 7` against a candidate that had become a **10** — Mains intact
at 120/60, ratio exactly 2.0, protein 8.97 %, qualified, zero violations — and
the Apply door correctly refused it as unverifiable (`main_identity_violated`).
The proof now refreshes from the candidate it describes; the door stays
trustless and still refuses any genuine mismatch.

## 6. Composition-resolution mismatch (found by served QA, worked around)

Served QA on `dd45931` showed the new −11 starter at **Score 6**, not the 10 the
repo tests predicted: NPAC 32.72 against [33,42].

**Root cause, pre-existing:** the repo's starter path resolves the static
toolbox payloads; the served app rehydrates canonical Mapper rows. CREAM 30 %
Mlekovita carries 64.42 % water / 3.2 % lactose where the toolbox payload
carries 63.4 % / 3.3 %, and the stabiliser differs too — identical grams land
~1.3 NPAC points apart.

The first cut was derived on the toolbox set and put −11 at NPAC 33.15, only
0.15 above the floor, so the real products tipped it out. All three dairy seeds
were re-derived against **both** sets and now hold on each:

| temp | NPAC served | NPAC repo | band | Score both |
|---|---|---|---|---|
| −11 | 39.00 | 39.45 | 33–42 | 10 |
| −12 | 44.80 | 46.01 | 42–50 | 10 |
| −13 | 51.00 | 52.36 | 48–55 | 10 |

Plant needed no re-derivation — those rows are `PI-ING-*` ids whose composition
is identical in every path. **The underlying mismatch itself is reported, not
fixed:** unifying the two resolution paths is shared infrastructure well outside
Protein authority and would touch every profile.

## 7. Direction and Rescue — measured, pinned, NOT changed (§18/§19)

Protein's Direction axes are deliberately not operational:

- **sweetness → `blocked_runtime`** — no verified safe Preview/Apply path is
  recorded for the complete −2..+2 matrix on this profile;
- **softness → `blocked_science`** — *"PI does not use a substitute milk curve"*,
  which is exactly the unvalidated `protein_gelato` ice anchors the Science
  Audit documented as copies of the milk_gelato rows.

Enabling either would relabel that limitation as validated high-protein physics,
which §12/§27 explicitly forbid. The user still gets both controls and the
optimizer still honours POD [12,17] and NPAC — what is withheld is the *claim*
that a requested axis target was evaluated and met. `supportedAxisCount === 0`
therefore never yields a false "target reached".

**Rescue is a Direction advisor**, so with no supported axis it is correctly
silent for Protein — with a real **13-candidate family**, not for lack of stock.
Both facts are now pinned by test rather than left ambiguous.

## 8. Torture matrix (§16/§17) — 12 realistic cases

| # | case | temp/strategy | outcome | protein | Score |
|---|---|---|---|---|---|
| A | canonical starter | −12 OPT | ALREADY_CLEAN | 8.88 % | 10 |
| B | WPC-heavy | −11 ECO | QUALIFIED | 8.98 % | 10 |
| C | milk-powder-heavy | −12 OPT | QUALIFIED | 9.45 % | 10 |
| D | low-fat high-protein | −13 OPT | DIAGNOSTIC (`fat`), **Apply refused** | 21.87 % | 7 |
| E | higher-fat | −12 ECO | QUALIFIED | 8.88 % | 10 |
| F | high-lactose (WPC 60) | −13 ECO | QUALIFIED | 10.48 % | 9 |
| G | near qualification floor | −11 OPT | QUALIFIED | 8.46 % | 10 |
| H | excessive ~19 % protein | −12 OPT | QUALIFIED | 9.49 % | 10 |
| I | manually broken draft | −11 OPT | QUALIFIED | 8.98 % | 10 |
| J | Main fixed | −12 OPT | ALREADY_CLEAN | 8.99 % | 10 |
| K | Multi-Main 2:1 | −13 ECO | QUALIFIED, ratio exactly 2.0 | 8.97 % | 10 |
| L | unknown class fallback | −12 OPT | QUALIFIED | 10.53 % | 9 |

Case D has no fat carrier at all, so the optimizer cannot reach the 5 % fat floor
by moving grams between existing lines — it returns an honest diagnostic and the
Apply door refuses it. Zero executable 0 g rows in every applied case.

## 9. Excess protein still is not rewarded (§25)

`8.84 % → structure 10 · 11.14 % → 8 · 14.21 % → 6 · 18.05 % → 5 · 21.11 % → 3`

## 10. Qualification boundary (§13)

Synthetic fixtures hit the boundary exactly: **19.99 % → not qualified · 20.00 %
→ qualified · 20.01 % → qualified**, and 19.996 % (which *displays* as "20 %")
→ **not qualified** — the raw share is evaluated, never a rounded one. The
executable whole-gram candidate is re-checked after practicalization.

## 11. Validation

| Command | Result |
|---|---|
| `npm test` | **591 files, 7465 tests, all passing** |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (2 pre-existing warnings, untouched files) |
| `npm run build` | built |
| `products:audit` / `mapper:runtime-audit` / `process:validate` / `catalog:mapper-only:validate` | green, 2088 rows |
| `production-rescue:bundle-check` | **`3716be4d817cdcc3a2a35c20cbda739f43e02451b021022a6bb827652b934b69`** |
| `git diff --check` | clean |

## 12. Served QA — https://staging.pinguinoai.com (authenticated Pro)

| # | Check | Result |
|---|---|---|
| A | Protein creates the NEW v2 starter | cream 244 · **WPC 112** · water 474 … (was 246.8 g WPC) |
| B | no obsolete ~20 %-mass starter | confirmed at all three temperatures |
| C | starter Score / Protein % | **−11 10 / 9,5 % · −12 10 / 8,3 % · −13 10 / 9,8 %** |
| D–F | OPTIMAL −11/−12/−13 | NPAC 39.00 / 44.80 / 51.00 — all mid-band, Score 10 |
| G–I | ECO −11/−12/−13 | formulate, qualify, apply; ECO −12 verified end-to-end served |
| J | ECO Score ≥ 8 when ≥8 exists | selected **10** |
| K | Protein % output only | read-only text, no control |
| L | no Protein target control | **0** range inputs / target testids; `target_protein_percent` absent from the store |
| M | live edit | WPC 81→141 moved **8,3 % → 12,9 %** and Score **10 → 7** instantly |
| N | Preview before/after | `BIAŁKO PO ZMIANIE 8.2 % · WYSOKA ZAWARTOŚĆ BIAŁKA 20 % energii` |
| O | Apply | WPC 141→80, protein 12,9 % → **8,2 % at Score 10** |
| P | Save / reopen | `c5e8fdef-0eba-4422-8143-0a46f56e6bea` v1; reopened at **10 / Białko 8,2 %**, no persisted target |
| Q | Direction | Sweetness/Hardness present; axes honestly blocked with reasons |
| R | Rescue | correctly silent (no supported axis), 13-candidate family |
| S | Main | preserved; Multi-Main ratio exactly 2.0 |
| T | zero-gram | 0 executable 0 g rows after Apply and after reopen |
| U | Production smoke | **RECEPTURA WYKONAWCZA GOTOWA**, Version 1, 7 base ingredients |
| V | console / network | all app assets 200/304; one 403 left over from the earlier Vercel Security Checkpoint, no application error |

## 13. Rescue Edge (§29)

Local bundle **`3716be4d…4b69`**, 57 source files, verified.

**Not deployed** — the Vegan closeout recorded a standing owner decision that
`production-rescue-authorize` is NOT redeployed while other staging work-streams
are active (STALE / PENDING FINAL SYNC). Staging still runs version 6 from
2026-08-19. That decision is respected here; no Edge function was deployed to
staging or production.

## 14. Known limitations, stated plainly

1. **Composition-resolution mismatch** between the repo's toolbox payloads and
   the served Mapper rows (§6). Worked around by dual-set calibration; the
   underlying unification is shared infrastructure outside Protein authority.
2. **Protein Direction axes remain blocked** (§7) — correct while the
   `protein_gelato` ice anchors stay unvalidated copies of the milk rows. This
   is the same open item the Science Audit recorded.
3. **Rescue cannot fire for Protein** while (2) holds, since it is a Direction
   advisor.
4. A QA recipe **"QA Protein CLOSEOUT -12 ECO"** (`c5e8fdef…`) is saved on the
   staging account as evidence and can be deleted.
