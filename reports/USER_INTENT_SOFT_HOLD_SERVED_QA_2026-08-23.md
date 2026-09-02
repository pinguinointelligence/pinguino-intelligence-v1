# SERVED QA — Polish Lost „Śmietankowe na żółtkach" (staging, 2026-08-23)

Served SHA `aa56e8d` · deploy `dpl_Gr73L9m2aysJfWHvrC3koZj3ZcVv` · bundle
`index-CPx4VHKz.js` · account `pro@pro.com` (Plan Pro) · Gelato · OPTIMAL ·
−11 °C · Direction 0/0 · target batch 1000 g.

The `lost-pl-*` library entry is **gated on staging** („Ta kolekcja przechodzi
jeszcze Mapper…", `status: BLOCKED_EXACT_PRODUCT_DATA`, yolk line unresolved),
so the recipe was built by hand from the canonical source — the owner's own
„user builds the recipe" path. Source state reproduced exactly: 1007 g.

---

## VERDICT

| test | result |
|---|---|
| **A — yolk UNLOCKED** | ❌ **FAILED — 40 g → 1 g still happens on served staging** |
| **B — yolk HARD-LOCKED 40 g** | ✅ PASSED |

---

## TEST A — yolk unlocked

Preview provenance: `Źródło formulacji: milk_base_v1 + kanoniczny solver korekt PI`.

| line | before | after |
|---|---|---|
| MILK 3.5% | 595 g | 538 g |
| CREAM 30% | 180 g | 229 g |
| SKIMMED MILK | 30 g | 48 g |
| SUCROSE | 90 g | 111 g |
| DEXTROSE | 50 g | 51 g |
| TARA GUM | 2 g | 2 g (bez zmian) |
| **EGGS CHICKEN YOLK DRIED** | **40 g** | **1 g** |
| INULIN | 20 g | 20 g (bez zmian) |
| **total** | 1007 g | **1000 g** |

What DID hold:
- canonical identity `PI-ING-001645` preserved — **no fresh-yolk substitution**;
- **Inulin minimum 20 g held**;
- **no executable 0 g rows**; total exactly 1000 g;
- Preview == Apply (byte-identical vector);
- **Undo restored the source exactly** (595/180/30/90/50/2/40/20);
- truthful copy is live: „PI zbilansowało recepturę, zachowując wskazane
  składniki i ograniczenia — proporcje składników uległy zmianie." The old false
  „proporcje pozostają twoje" is gone;
- the §13 consent disclosure **fired correctly**:
  „ZNACZĄCA ZMIANA WSKAZANEGO SKŁADNIKA … EGGS CHICKEN YOLK DRIED · Egg:
  40 g → 1 g." The collapse is no longer SILENT — but it still happens.

Applied Monitor: Score **10**, POD 15.79, NPAC 41.99, PAC 45.01,
water 63.46, fat 8.85, protein 3.89, stability 9. Violations 1 → 0.

## TEST B — yolk hard-locked at 40 g

| line | before | after |
|---|---|---|
| MILK 3.5% | 595 g | 485 g |
| CREAM 30% | 180 g | 267 g |
| SKIMMED MILK | 30 g | 17 g |
| SUCROSE | 90 g | 144 g |
| DEXTROSE | 50 g | 25 g |
| TARA GUM | 2 g | 2 g |
| **EGGS CHICKEN YOLK DRIED** | **40 g** | **40 g — BEZ ZMIAN · ZABLOKOWANE** |
| INULIN | 20 g | 20 g |
| **total** | 1007 g | **1000 g** |

This reproduces the owner's decisive counterexample almost to the gram
(owner reported 486/267/32/110/43; served gives 485/267/17/144/25).

Applied Monitor: Score **10**, POD 16.97, NPAC 38.68, PAC 48.5,
water 60.92, fat 11.98, protein 4.06, stability 6.57. Violations 1 → 0.
No material-deviation disclosure — nothing was collapsed.

Save → **full reload** → reopen: all eight lines persisted exactly
(485/267/17/144/25/2/**40**/20 = 1000 g), gram lock persisted, canonical ids
intact, no 0 g rows. Saved as „QA Lost PL zoltka LOCKED 40g" v1.

## UNLOCKED vs LOCKED

| | unlocked | locked |
|---|---|---|
| Score | 10 | 10 |
| violations | 1 → 0 | 1 → 0 |
| POD | 15.79 | 16.97 |
| NPAC | 41.99 | 38.68 |
| PAC | 45.01 | 48.5 |
| water | 63.46 | 60.92 |
| solids (100 − water) | 36.54 | 39.08 |
| fat | 8.85 | 11.98 |
| protein | 3.89 | 4.06 |
| yolk | **1 g** | 40 g |
| yolk drift (normalized) | **0.951 — catastrophic** | 0 |

**Both reach the same hard-valid target.** The unlocked result is therefore
strictly more destructive with no technical justification — exactly the owner
regression, still live on staging.

---

## WHY THE SHIPPED SOFT HOLD DID NOT CATCH IT

Recorded, **not fixed** (out of scope per owner instruction).

The soft-hold authority governs the CURRENT-DRAFT gram ladder and its sweep
(`sweepDraftCandidateVector`) plus the ECO cost sweep. The served recipe never
reaches either: it routes to **`full_formulation` on template `milk_base_v1`**,
where the yolk is an UNMAPPED line (no `egg` role target in any approved gelato
template), is scaled freely by batch normalization, and is then pinned to
exactly 1 g by the presence clamp `Math.max(1, item.planned_grams)` in
`rescalePreservingMainGroup` (`applyPipeline.ts`).

Routing lands on `full_formulation` because the hard role `sweetener_sucrose`
is never carried: Mapper `PI-ING-000514 SUCROSE SUGAR` has `pac_value = 100`,
and `resolveFunctionalRole` classifies any sugar with `pac >= 1.3` as
`sugar_freezing_control`. **No Mapper sweetener can resolve to
`sweetener_sucrose`**, so every Mapper-sourced milk gelato takes the formulation
path. This is the unit-scale issue already flagged in
`USER_INTENT_SOFT_HOLD_2026-08-23.md` §9.2 — it has its own ticket.

**Two separate gaps for that ticket:**
1. the routing/unit-scale defect above;
2. **the formulation path has no user-intent authority at all** — the drift
   measure, the material-deviation proof and the preserve-first search are not
   consulted by `buildFormulationProposal` or by the presence clamp. The clamp
   still turns a zeroed user line into a 1 g trace row, which is precisely what
   owner §25 forbids.

The §13 disclosure DOES cover the formulation path (it is computed in
`finishPreview`, where every builder converges), which is why the served Preview
named the change instead of hiding it.

---

## OTHER OBSERVATIONS (recorded, not fixed)

- Przelicz refuses until „Potwierdź ustawienia" is pressed after a batch-mass
  change („Najpierw potwierdź ustawienia receptury.") — correct, but the
  settings panel marks itself „Zmiany niepotwierdzone" purely because the base
  mass display changed, which is easy to misread as a user edit.
- Adding `PI-ING-001645` lands the line at 0 g with „Brak zweryfikowanej ilości"
  — correct no-invented-dose behaviour.
- Adding `PI-ING-000456` auto-seeds Inulin at the owner-preferred 40 g (4 %),
  not at the 20 g minimum. Expected, recorded for completeness.
