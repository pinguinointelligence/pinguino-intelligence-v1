# GLOBAL MAIN AUTHORITY — Mapper/Product-Intelligence driven, no SKU whitelist

**Date** 2026-08-23 · **Branch** `claude/global-main-authority` · **Landed** `origin/staging` `27dae2f`

---

## 1. Starting and final SHAs

| | |
|---|---|
| Starting staging SHA (branch point) | `e03beca` |
| Staging SHA at land time (rebase target) | `1b19c55` |
| **Final staging SHA** | **`27dae2f`** |
| Production `main` SHA | `4dfb097` (2026-07-23) — **untouched** |
| Mapper dataset hash | `b13f5db4affd…` (unchanged; `mapper_basement` never written) |

Staging moved 13 commits under this work (the Community v1 feature landed
in parallel). The branch was rebased onto each new tip; the only conflicts
were the generated Rescue Edge artefacts, which were resolved by
**regenerating** rather than hand-merging.

---

## 2. The defect, stated exactly

Main eligibility answered ONE question —

> is there an approved Main envelope for this exact product and profile?

— and used the answer for TWO decisions:

1. may this product define the recipe at all, and
2. how much of it may PINGÜINO choose by itself.

Reproduced on staging **before** the change, through the real resolver:

```
resolve_product_behavior_v1('mapper','PI-ING-000345', {productProfile:'sorbet', requestedRole:'MAIN', module:'MAIN'})
  → moduleEligibility.MAIN = "blocked"
  → mainPolicy = NULL
  → blockReasons = ["main_policy_not_approved:…:PI-ING-000345:…:MAIN:use_standard_or_approved_main"]
```

Same call for STRAWBERRIES `PI-ING-001553` → `eligible`, policy
`main-sorbet-exact-fruit-60-v1`. The only difference between the two fruits was
the presence of a hand-authored SQL row.

---

## 3. Every exact-ID Main whitelist found, and what happened to it

| # | Location | What it did | Action |
|---|---|---|---|
| 1 | `mapper_behavior_subfamily_v2` — `CASE p_ingredient_id = 'PI-ING-001553' … 000345 … 000366 … 001589 … 000369 … 000340` | Six exact identities were the ONLY way a fruit got a subfamily, which is what selects a calibrated envelope | **REMOVED.** Replaced by `mapper_behavior_subfamily_v3`: whole-token matching against the published `product_taxonomy_aliases`, with the structured subcategory rules retained as a fallback. A migration assertion fails the deploy unless all six reproduce their previous subfamily. |
| 2 | `20260813110200` — three `update … where mapper_ingredient_id='PI-ING-…'` promoting strawberry/banana/kiwi to `MAIN_PROFILE_SPECIFIC` | Historical seed; superseded by the v2 classifier | Left as history. No longer load-bearing: the v2 classifier recomputes every binding. |
| 3 | `product_behavior_policy_versions.exact_mapper_ingredient_id` — 15 published rows (Sorbet ×3, Vegan ×4, Protein ×5, Fortefrutto ×2 + prontociocc, whisky, pistachio) | Exact calibrated envelopes | **KEPT, REFRAMED (§25).** They are now *calibration* authority only. They no longer decide whether a product may be Main. |
| 4 | Client `mainBehaviorBlockReason` requiring `mainPolicyId`/floor/ceiling/factor | Coupled eligibility to calibration | **REMOVED.** Delegates to `resolveMainCapability`. |
| 5 | `recipeConstraintAuthority` `profileEligibility` Main gate | `profileEligibility` is derived from published Main POLICIES, i.e. a calibration list — it blocked Banana-in-Sorbet a second time | **SCOPED.** Skipped for user-held Mains; unchanged for calibrated ones. |
| 6 | `approved_liquid_dairy_carrier` — 5 exact ids | Carrier identities, not Main eligibility | Untouched (out of scope, correctly exact). |

**No client source file in the Main authority contains a `PI-ING-` literal**, and
a test asserts it (`mainCapabilityAuthority.test.ts` → *architecture guard*).
The same test asserts `main_capability_v1` in the migration contains none.

---

## 4. The architecture

```
                    ┌─────────────────────────────────────────┐
  Mapper row ──────►│ classify_mapper_product_behavior_v2     │
  Catalog version   │  category/subcategory → family /        │
  Scanner product   │  subfamily (taxonomy aliases) / form    │
  INTIMPORT product │  → behaviour role                       │
                    └────────────────┬────────────────────────┘
                                     │ semantic role
                    ┌────────────────▼────────────────────────┐
                    │ main_capability_v1(resolved, context)   │  ← THE authority
                    └────────────────┬────────────────────────┘
                                     │
        MAIN_CAPABLE ────────────────┤ policy found  → CALIBRATED
        MAIN_CAPABLE_UNCALIBRATED ───┤ no policy     → USER_HELD
        MAIN_TECHNICAL_BLOCKED ──────┤ structural / topping / protein / base
        MAIN_UNKNOWN ────────────────┘ binding missing or role unrecognised
                                     │
                    ┌────────────────▼────────────────────────┐
                    │ resolve_product_behavior_v1 (wrapper)   │
                    │  projects mainCapability / mainAuthority│
                    │  / mainCalibrationLevel and unblocks    │
                    │  moduleEligibility.MAIN                 │
                    └────────────────┬────────────────────────┘
                                     │ ProductBehaviorSnapshot
                    ┌────────────────▼────────────────────────┐
                    │ resolveMainCapability()  (client, §26)  │
                    └───┬──────┬──────┬──────┬──────┬─────────┘
                    UI toggle │ store │Engine│Rescue│ Apply door
```

The 41 KB `resolve_product_behavior_evidence_gate_v1` was **not rewritten**. Its
policy match, identity, process and permission logic are byte-identical; the
capability layer is a wrapper on top of its result. That is why the calibrated
count did not move by a single row.

### Capability states

| State | Meaning | Toggle | Envelope |
|---|---|---|---|
| `MAIN_CAPABLE` | flavour carrier with an approved envelope | enabled | calibrated |
| `MAIN_CAPABLE_UNCALIBRATED` | flavour carrier, no approved envelope | **enabled** | none — user-held |
| `MAIN_TECHNICAL_BLOCKED` | structural / post-process / protein / base product | disabled + real reason | n/a |
| `MAIN_UNKNOWN` | binding missing or role unrecognised | disabled (fail closed) | n/a |

### Calibration hierarchy (§8)

1. `EXACT_PRODUCT` — a published policy bound to this exact Mapper identity.
2. `FAMILY` — a family/subfamily/form policy.
3. `NONE` — user-held Main.
4. technical → blocked.
5. unknown → blocked, fail closed.

More specific always wins; a policy with `subfamily_id IS NULL` is a wildcard,
so **adding** a subfamily can only refine an envelope, never remove one.

### User-held Main semantics (§6)

* The owner's grams become an **exact constraint** for the Main frontier search
  and a solver hold, so automatic formulation never resizes them.
* An explicit owner lock / percent / range always wins over the implicit hold.
* A batch change is an explicit owner control, so a user-held Main rescales with
  the batch (§17.4) rather than being pinned to old absolute grams.
* No percentage floor/ceiling is ever invented. `mainEnvelopeSearchCeilingGrams`
  returns `null`; `verifyMainEnvelope` does not apply an envelope contract.
* Positive Main never reaches 0, cannot lose the role, cannot change identity and
  cannot change ratio — the pre-existing `mainIngredientContract` still enforces
  all of that, and it is what the Apply door verifies.
* §21: a group mixing calibrated and uncalibrated Mains is user-held **as a
  whole**. One member's science is never borrowed for another.

### Technical-blocked semantics (§23)

| Role | Owner-facing reason |
|---|---|
| `STRUCTURAL_ONLY` / `NOT_MAIN` | *Składnik techniczny — nie definiuje smaku receptury.* |
| `TOPPING_ONLY` | *Produkt po produkcji (topping) nie może być składnikiem głównym.* |
| `PROTEIN_CONTRIBUTOR_ONLY` | *Składnik białkowy nie jest automatycznie smakiem Main.* |
| `STANDARD_ONLY` | *Składnik bazowy/standardowy — nie definiuje smaku receptury.* |
| stale snapshot | *Historyczny produkt wymaga utworzenia nowej, zweryfikowanej wersji…* |

A user-held Main gets an explicit **enabled** tooltip instead:
*"Ustaw jako składnik główny — brak zatwierdzonego zakresu, PI utrzyma Twoją
gramaturę i dobierze resztę receptury."* and, once set,
*"Główny (Twoja decyzja) — PI nie zmienia jego gramatury samo z siebie."*

---

## 5. Full Mapper audit — all 2088 rows

`reports/MAIN_CAPABILITY_MAPPER_AUDIT.csv` · generated by
`node scripts/auditMainCapability.mjs`.

| Capability | Before | After | Δ |
|---|---:|---:|---:|
| `MAIN_CAPABLE` | 110 | **110** | 0 |
| `MAIN_CAPABLE_UNCALIBRATED` | — | **1282** | +1282 |
| `MAIN_TECHNICAL_BLOCKED` | — | **696** | — |
| `MAIN_UNKNOWN` | — | **0** | — |
| **Main-selectable** | **110** | **1392** | **+1282** |

Before, the same 2088 rows were: 110 `MAIN_PROFILE_SPECIFIC`, 1286
`MAIN_BLOCKED_POLICY`, 455 `STANDARD_ONLY`, 119 `NOT_MAIN`, 112 `TOPPING_ONLY`,
6 `PROTEIN_CONTRIBUTOR_ONLY`.

**The CSV is proved identical to the server.** The script's checksum over the
normalised verdict lines and the server's `md5(...)` over
`public.mapper_main_capability_audit_v1` both equal

```
4c0a9ebd92ac067fb3f843a48e683cc2
```

so the offline artefact is not a second opinion — it is the same answer,
reproducible without database access.

### Regression proof against the pre-migration baseline

A baseline snapshot (`public._main_authority_baseline_20260823`) was taken
before the migration:

```
subfamily_changed : 84      family_changed : 0     form_changed : 0
behavior_role changed : 0   lost_coverage  : 0     gained_coverage : 0
```

**No row lost calibration coverage.** Of the 84 subfamily changes, only 17
change which envelope applies — all in `milk_gelato`, all real berries moving
from the generic fruit envelope to the approved berry envelope (floor 20 → 25 %,
ceiling/hard unchanged at 35/45 %), which is the §8 hierarchy working:

`PI-ING-000346, 000347, 000352, 000361, 000394, 000395, 000396, 000397, 000406,
001435, 001532, 001541, 001543, 001544, 001545, 001556, 001590`

One judgement call worth the owner's eye: `PI-ING-000395 RASPBERRY TOMATO ·
Fresh Fruit` matches the token `raspberry` and is now `berry`. It is a fruit and
the berry envelope is the stricter one, so the direction is safe, but the owner
may prefer it back on the generic fruit policy.

### Suspicious-classification review

* **Zero** rows in a technical Mapper category (`sweetener`, `stabilizer`,
  `fiber`, `emulsifier`, `starch`, `acid`, `colorant`, `functional_additive`,
  `additive`, `protein`) are Main-capable. Asserted by test.
* All five `subcategory = water` products (`WATER · Liquid`, ACQUA MORELLI
  still/sparkling, SMARTWATER, AQUAFINA) are `MAIN_TECHNICAL_BLOCKED`.
* **Open for owner decision — flagged, not silently changed:**
  * `beverage / mixer_soft_drink` tonic and soda waters (GOLDBERG SODA WATER,
    SCHWEPPES / KINLEY / CANADA DRY TONIC WATER) are `MAIN_CAPABLE_UNCALIBRATED`
    because their subcategory is not exactly `water`. Defensible (a tonic
    carries flavour) but the owner may want soda water treated as water.
  * 216 `base_mix` rows (e.g. *SALTED CARAMEL · PreGel Base Mix*) stay
    `MAIN_TECHNICAL_BLOCKED` as `STANDARD_ONLY`. They arguably define flavour;
    this is unchanged pre-existing behaviour and was not widened unilaterally.
  * 193 `beverage` rows (Red Bull, Coca-Cola, Fanta…) are now user-held
    Main-capable. That is the literal reading of §1 ("the user decides"), but it
    is a visible surface change.

### Required spot checks (§13)

| Product | Capability | Calibration | Taxonomy |
|---|---|---|---|
| `PI-ING-001553` STRAWBERRIES · Fresh | `MAIN_CAPABLE` | `EXACT_PRODUCT` | fruit/berry/fresh |
| `PI-ING-000345` BANANA · Fresh | `MAIN_CAPABLE` | `EXACT_PRODUCT` | fruit/banana/fresh |
| `PI-ING-001589` BANANA · Puree | `MAIN_CAPABLE` | `EXACT_PRODUCT` | fruit/banana/puree |
| `PI-ING-000340` MANGO CHATO · Puree | `MAIN_CAPABLE` | `EXACT_PRODUCT` | fruit/mango_tropical/puree |
| `PI-ING-000369` LIME · Fresh | `MAIN_CAPABLE` | `EXACT_PRODUCT` | fruit/citrus/fresh |
| `PI-ING-000366` KIWI · Fresh | `MAIN_CAPABLE` | `FAMILY` | fruit/kiwi/fresh |
| `PI-ING-000394` RASPBERRIES · Fresh | `MAIN_CAPABLE` | `FAMILY` | fruit/berry/fresh |
| `PI-ING-000614` PISTACHIO · Paste 100 % | `MAIN_CAPABLE` | `EXACT_PRODUCT` | nut/–/pure_nut_paste |
| `PI-ING-001578` COCOA ALKALIZED 100 % | `MAIN_CAPABLE` | `EXACT_PRODUCT` | chocolate_cocoa/–/cocoa_powder |
| `PI-ING-000166` COFFEE BEAN ROASTED | `MAIN_CAPABLE_UNCALIBRATED` | `NONE` | coffee/–/– |
| `PI-ING-000246` FRENCH VANILLA · Paste | `MAIN_CAPABLE` | `EXACT_PRODUCT` | vanilla/–/flavour_paste |
| `PI-ING-001409` WATER | `MAIN_TECHNICAL_BLOCKED` | — | –/–/liquid |
| `PI-ING-000514` SUCROSE | `MAIN_TECHNICAL_BLOCKED` | — | – |
| `PI-ING-000494` DEXTROSE | `MAIN_TECHNICAL_BLOCKED` | — | – |
| `PI-ING-000496` FRUCTOSE | `MAIN_TECHNICAL_BLOCKED` | — | – |
| `PI-ING-000456` INULIN | `MAIN_TECHNICAL_BLOCKED` | — | – |
| `PI-ING-000492` TARA GUM | `MAIN_TECHNICAL_BLOCKED` | — | – |
| `PI-ING-000472` GUAR GUM | `MAIN_TECHNICAL_BLOCKED` | — | – |
| `PI-ING-000475` LOCUST BEAN GUM | `MAIN_TECHNICAL_BLOCKED` | — | – |
| `PI-ING-000458` SALT | `MAIN_TECHNICAL_BLOCKED` | — | – |

§14 (do not over-block juices) is satisfied: `fruit/citrus/juice` (8 rows),
`fruit/*/juice` (5) and `fruit/berry/frozen` (5) are all
`MAIN_CAPABLE_UNCALIBRATED`, not classified as technical acid.

---

## 6. Live resolver verification on staging (authenticated context)

| Product | Profile | MAIN | Capability | Calibration | Policy |
|---|---|---|---|---|---|
| STRAWBERRIES | sorbet | eligible | `MAIN_CAPABLE` | EXACT_PRODUCT | `main-sorbet-exact-fruit-60-v1` |
| LIME | sorbet | eligible | `MAIN_CAPABLE` | EXACT_PRODUCT | `main-sorbet-exact-fruit-60-v1` |
| MANGO CHATO | sorbet | eligible | `MAIN_CAPABLE` | EXACT_PRODUCT | `main-sorbet-exact-fruit-60-v1` |
| RASPBERRY FORTEFRUTTO | sorbet | eligible | `MAIN_CAPABLE` | EXACT_PRODUCT | `…-0732-sorbet` |
| **BANANA** | **sorbet** | **eligible** | **`MAIN_CAPABLE_UNCALIBRATED`** | NONE | — |
| **BANANA · Puree** | **sorbet** | **eligible** | **`MAIN_CAPABLE_UNCALIBRATED`** | NONE | — |
| **MANGO ALPHONSO** | **sorbet** | **eligible** | **`MAIN_CAPABLE_UNCALIBRATED`** | NONE | — |
| BANANA | milk_gelato | eligible | `MAIN_CAPABLE` | FAMILY | `main-banana-fresh-dairy` |
| PISTACHIO | milk_gelato | eligible | `MAIN_CAPABLE` | EXACT_PRODUCT | `main-pistachio-pure-paste-dairy-0614` |
| **COCOA 100 %** | **milk_gelato** | **eligible** | **`MAIN_CAPABLE_UNCALIBRATED`** | NONE | — |
| **COFFEE BEAN** | **milk_gelato** | **eligible** | **`MAIN_CAPABLE_UNCALIBRATED`** | NONE | — |
| WATER / SUCROSE | sorbet | blocked | `MAIN_TECHNICAL_BLOCKED` | — | — |
| INULIN / SALT / TARA / GUAR / LBG / DEXTROSE / FRUCTOSE | milk_gelato | blocked | `MAIN_TECHNICAL_BLOCKED` | — | — |

Bold rows were **blocked** before this change.

---

## 7. Served QA on staging

Deployment `dpl_FRFW8dE7JHeqHPSz1r8k8KG4SuLM` READY for `27dae2f`.
Served bundle **`index-CwiL-P0N.js`**, sha256
`7217d156c378b7a6f995d8be3e9954ecd94da1a8e0058c0c857af3cba4a03526`, confirmed to
carry `MAIN_CAPABLE_UNCALIBRATED`, `MAIN_TECHNICAL_BLOCKED`,
`mainCalibrationLevel`, `user_held_no_calibration` and both Polish tooltips.

Driven in the browser on the owner's authenticated staging session:

1. **Sorbet starter −11 °C** — WATER, SUCROSE, DEXTROSE, INULIN, TARA GUM: all
   five Main toggles `disabled`. ✅
2. **Owner reproducer — BANANA in Sorbet** — toggle `disabled: false`, tooltip
   *"Ustaw jako składnik główny — brak zatwierdzonego zakresu, PI utrzyma Twoją
   gramaturę i dobierze resztę receptury."* Set as Main → *"Główny (Twoja
   decyzja) — PI nie zmienia jego gramatury samo z siebie."* ✅
3. **Banana Main 600 g, batch 1000 g, Przelicz** → truthful NEAREST consent
   (*"Nie mogę osiągnąć dokładnie wybranego celu. Najbliższy poprawny wynik:
   8/10"*), then Preview:

   ```
   WATER     179 → 262  (+83)
   SUCROSE   103 →  47  (−56)
   DEXTROSE   59 →  32  (−27)
   INULIN     55  BEZ ZMIAN
   TARA GUM    4  BEZ ZMIAN
   BANANA    600  BEZ ZMIAN        ← user-held Main untouched
   Suma 1000 → 1000 · Parametry poza optymalnym zakresem: 5 → 0
   CHRONIONE PRZEZ APPLY — Główne: 1
   ```
   Applied. Executable state 262/47/32/55/4/**600**. ✅ §6, §34
4. **Multi-Main 1:1 — BANANA (user-held) + STRAWBERRIES (calibrated), 300+300**,
   a combination never pre-listed in any SQL group. Preview: *Główne: 2*,
   `BANANA 300 BEZ ZMIAN`, `STRAWBERRIES 300 BEZ ZMIAN`, support 262→218 /
   47→84 / 32→39, *parametry poza zatwierdzonym zakresem 4 → 0*. Applied. ✅
   §19, §20, §21
5. **Multi-Main 2:1 — 400 + 200** → *"PI przeliczyło recepturę, ale nie znalazło
   bezpiecznej korekty w zatwierdzonych zakresach"*, both lines listed as
   *Składnik główny · ustawienie receptury* at 400 g / 200 g, recipe unchanged.
   A truthful technical verdict, not a Main-role refusal. ✅ §22
6. **Gelato + CACAO · Elenka Cocoa** — toggle `disabled: false` with the
   user-held tooltip. Blocked before this change. ✅

**Not verified served, and I am not claiming it was:** Vegan and Protein
profiles, a Scanner/INTIMPORT-created product end to end, ECO cost sweep,
operational Rescue, Save → reopen → version restore, and the Direction sweep.
Their offline coverage is green (full suite below) and their server authority is
the same `main_capability_v1` verified in §6, but no one clicked through them on
staging in this session.

---

## 8. Future products (§9, §10, §11, §27, §39)

The hard acceptance criterion is that a new legitimate Banana Purée must work
**without** editing an id list, adding an exact SKU row, or adding a React
condition.

* **Scanner / INTIMPORT / Catalog / Live Overlay** all resolve through
  `classify_catalog_product_behavior_v2`, which inherits family / subfamily /
  form and the behaviour role from the bound Mapper identity, then through the
  same `main_capability_v1`. A scanned `Banana Purée XYZ` bound to a
  `fruit / fruit_puree` Mapper row inherits `family=fruit`, `form=puree`,
  role `MAIN_ALLOWED` → `MAIN_CAPABLE` (family policy) or
  `MAIN_CAPABLE_UNCALIBRATED`, with no SQL patch.
* Even a product whose form cannot be derived lands on
  `UNKNOWN_REQUIRES_EVIDENCE`, which the capability layer reads as *flavour
  carrier with an unproven form* → `MAIN_CAPABLE_UNCALIBRATED`. A missing
  taxonomy detail therefore delays **calibration**, never **capability**.
* A newly scanned stabiliser lands in a structural category → blocked.
* `mapper_basement` was not mutated for any of this.

Verified structurally (the classification path and the capability function),
**not** by scanning a physical product on staging in this session.

---

## 9. Verification summary

| Gate | Result |
|---|---|
| Focused Main/capability tests | `mainCapabilityAuthority.test.ts` 43 PASS · `userHeldMainAuthority.test.ts` 9 PASS |
| Product-intelligence suite | 26 files / 341 PASS |
| **Full suite** | **639 files / 8058 PASS, 100 skipped, 0 failures** |
| Typecheck (`tsc -b`) | clean |
| Lint (`eslint .`) | 0 errors (4 pre-existing react-refresh warnings) |
| Build (`vite build`) | clean |
| `production-rescue:bundle-check` | verified `76bd852a…`, 58 source files |
| `process:validate` | 2088 rows, 0 alignment differences |
| `toolbox:compositions:check` | 23 identities, mapper `b13f5db4affd…` |
| `catalog:mapper-only:validate` | 0 stale, 0 non-mapper additions |
| `protein:corpus:check` | 20 recipes, mapper `b13f5db4affd…` |
| `recipes:validate` | 0 duplicate hashes (2420 missing images — pre-existing) |
| Mapper audit checksum vs server | **identical** (`4c0a9ebd…`) |

`format:check` is red across 1059 files repo-wide and was already red on
`origin/staging`; Prettier is not an enforced gate here and was not run.

**Staging Edge** `production-rescue-authorize` redeployed to **version 11** with
bundle `76bd852a…` so operational Rescue reads the same Main authority (§32).
No production Edge deploy. No merge to `main`.

---

## 10. What is NOT delivered

Stated plainly rather than implied:

1. **Served QA is partial** — see §7. Vegan, Protein, Scanner, INTIMPORT, ECO,
   Rescue, persistence and the Direction sweep were verified offline and at the
   resolver, not clicked through on staging.
2. **`MAIN_UNKNOWN` has zero occupants** in the current Mapper. The state exists
   and is exercised by tests (missing binding, stale snapshot), but no live row
   reaches it — every active Mapper row classifies.
3. **Owner decisions left open**, listed in §5: tonic/soda waters, `base_mix`
   rows, the 193 `beverage` rows, and `RASPBERRY TOMATO` → berry.
4. **A user-held Main can make a recipe infeasible.** Banana at 300 g in a
   −13 °C Sorbet has no legal solution with the owner's grams held; PINGÜINO
   says so technically and does not move the Main. That is the intended §22
   behaviour, but it means "selectable" is not "always applicable".
5. **`v_has_process` no longer gates MAIN.** Verified process evidence still
   gates PRODUCTION readiness, but it no longer vetoes the Main role — a process
   fact was being reported as a flavour verdict. Deliberate; flagged because it
   loosens one pre-existing condition.

---

## 11. Reproduce

```bash
node scripts/auditMainCapability.mjs          # writes the CSV, prints the checksum
npx vitest run src/features/product-intelligence/mainCapabilityAuthority.test.ts
npx vitest run src/features/constraint-studio/userHeldMainAuthority.test.ts
```
