# NAPRAWA 5 — GLOBAL STARTER PACK OPTIMIZER · AUDIT PACKAGE

Branch `claude/naprawa-5-global-starter-pack-optimizer`, cut from `staging` at `29a1a5c5` — the
merge commit of NAPRAWA 1 (PR #462). NAPRAWA 1 remains a separate, completed foundation: the
current-ingredient / nearest / controlled-relaxation layer. NAPRAWA 5 adds the compatible-ingredient
and constraint layer on top of it and changes none of its decisions.

Every figure below was measured in this environment on the branch head it names. Served
verification is environment-blocked (see **What is not done**).

---

## 1. Requested scope

GELLATTI may tell a customer that a target is genuinely unreachable only after ONE shared CORE has
checked, in order: the current ingredients in normal ranges · the same ingredients under approved
controlled relaxation · the compatible canonical profile toolbox · compatible Starter Pack
candidates · explainable changes to the customer's own constraints · a bounded compatible pair
Rescue. It must work for every Direction level (−2 … +2), every supported axis, HOME and PRO,
domestic and professional machines, and every supported profile, through one shared policy with no
separate HOME/PRO engines.

---

## 2. Rescue architecture

A new module family, `src/features/rescue-toolbox/`, holds the policy. It ranks nothing by itself;
the existing stages call into it.

| module | what it owns |
| --- | --- |
| `rescueToolboxAuthority.ts` | THE candidate registry: profiles, base routes, roles, dosage authorities, hard conditions, identity effects. Delegates vegan admissibility, the inulin band, the stabilizer dose and the ±2 rule to the authorities that already own them. |
| `rescueBaseRoute.ts` | dairy / plant / water / unknown, derived — for Protein from `recipeProteinSourceProfile`, never guessed. |
| `rescueProteinGate.ts` | the REAL Protein authority applied per candidate: route, qualification, hard verdict, structural score, all AFTER vs BEFORE. |
| `rescueDoseSearch.ts` | the two-tier smallest-winning-whole-gram-dose search. |
| `rescueMaterialImprovement.ts` | the ONE material test, composed from the repository's existing evidence rule. |
| `constraintWhatIf.ts` | customer-owned constraint counterfactuals. Pure; returns proposals, never recipes. |
| `rescuePairSearch.ts` | the bounded two-ingredient search, after singles fail. |
| `rescueOutcomeClassification.ts` | the true-infeasible arithmetic. |
| `rescueDiagnostics.ts` | the canonical evidence record. |

**Old overlapping systems reconciled.** `starterPackRescuePalette.starterPackRescueEligibility` is
now an ADAPTER that delegates to the canonical authority and translates its verdict into the legacy
reason vocabulary its callers already understand. It no longer restates any compatibility rule.

**Still to reconcile, recorded rather than claimed:** `rescueIngredientAdvisor.rescueCandidateFamily`
remains its own role-driven list for the operational (Direction-free) path; it does not yet include
Fructose. Its evidence rule *is* now shared — `rescueMaterialImprovement` composes it rather than
forking it — but its candidate list is not. See **What is not done**.

**No duplicated HOME/PRO logic.** Every module above is profile- and door-agnostic; nothing in
`rescue-toolbox/` branches on HOME or PRO.

---

## 3. Compatibility matrix

Profile × base route × candidate, as implemented and as tested
(`rescueToolboxAuthority.test.ts`). ✔ = admissible, ✘ = refused, **D** = refused today only because
the canonical composition is unverified (Q2), ⚠ = admissible but conditional.

| profile | base route | Dextrose | Fructose | Inulin | Stabilizer | SMP | Cream 42 % | Dried egg yolk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| milk / fruit / nut / chocolate / alcohol gelato | dairy | ✔ | ✔ | ✔ | ✔ | **D** | **D** | ⚠ |
| sorbet | water | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ |
| vegan gelato | plant | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ |
| protein gelato — dairy route | dairy | ✔ | ✔ | ✔ | ✔ | **D** | **D** | ✘ |
| protein gelato — plant route | plant | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ |
| custom / unresolved route | unknown | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |

The last row refuses with `base_route_unresolved` — a MISSING AUTHORITY, never a claim that the
candidate is wrong for the product and never a claim of impossibility.

⚠ Dried egg yolk carries `requires_technological_justification`: never a generic first-choice
Direction lever, and it may not outrank a simpler sugar or body lever at an equivalent result. It is
not an automatic Protein candidate on either route, because no existing Protein authority permits it.

**The switch that was removed.** Before this branch, `starterPackRescueEligibility` returned
`blocked_science` for EVERY candidate on any Protein draft, and
`shouldRunStarterPackDirectionRescue` refused the whole stage on `category === 'protein_gelato'`.
Two global switches on a category name. Protein is now asked, per candidate, by
`rescueProteinGate`.

---

## 4. Fructose dosage authority

Owner's final authority of 2026-09-19, implemented in `rescueToolboxAuthority.ts` and pinned by
seven tests.

| | value |
| --- | --- |
| canonical ingredient | `PI-ING-000496 · FRUCTOSE` |
| basis | percentage of TOTAL target batch mass |
| absent | `0 g` |
| normal | `>0 % … 6 %` |
| controlled extension | `>6 % … 8 %`, available only to a ±2 request |
| structural hard maximum | `8 %` — above it, rejected at any level |
| minimum | none fixed; the smallest practical positive whole gram that materially improves |
| scoring | normal: no penalty · controlled: valid, one public point (NAPRAWA 1's cap) · above 8 %: invalid |

**The extension is derived, not written down.** `EXTENDED_RANGE_UPPER_FACTOR` (+50 %, NAPRAWA 1)
gives 6 % × 1.5 = 9 %, and the hard maximum intersects it at 8 % — the Owner's own arithmetic. The
next published window inherits the rule instead of another hand-written constant.

Worked, at two batch sizes: 1000 g → 4 g valid · up to 60 g normal · 61–80 g controlled · 81 g
rejected. 500 g → up to 30 g normal · 31–40 g controlled · 41 g rejected.

**The cap applies to the added canonical pure Fructose line.** Natural fructose inside fruit, honey
or anything else remains ordinary CORE physics — POD, PAC/NPAC, total sugars, ice fraction,
hardness, sweetness and every hard gate. There is deliberately no second, simplistic total-fructose
rejection model.

---

## 5. Before → after evidence

### 5.1 The dose search stopped being a four-point grid

| | before | after |
| --- | --- | --- |
| dose resolution | `1 / 2 / 4 / 8 %` — four fixed points | every whole gram in the permitted window |
| isolated lane duration | 344.54 s | **141.72 s** (2.43× faster) |
| `STARTER_PACK_RESCUE_TOTAL_MS` | 304 282 ms | **100 555 ms** (3.03× faster) |

Strictly more thorough AND three times cheaper, because a cheap one-gram SCREEN
(`calculateRecipe`) replaced four expensive Previews per candidate with at most three finalists.

### 5.2 A reached target is no longer the end of the search

`shouldRunStarterPackDirectionRescue` used to return false the moment the target was reached. It now
stops only for a recipe that needs nothing — reached, 10/10, inside normal ranges. Cost of the
widening, measured on the same lane: 141.72 s → **143.26 s**. The screen is the gate: when the
one-gram scan finds nothing worth proving, no Preview is priced at all.

### 5.3 Bounded pair Rescue

On a lean draft that is short of sugar, solids and PAC at once — the case where no single candidate
solves the target:

| | result |
| --- | --- |
| draft | 5/10, Σ band distance 39.690, five violated metrics |
| bounded pair | Fructose 40 g + Dextrose 40 g → **8/10, distance 10.116** |
| cost | 12 screened vectors, **zero Previews** |

On the over-sweet fixture the same search correctly returns nothing: two more sugars cannot rescue a
recipe whose POD is already too high. Both fixtures are tests.

---

## 6. Constraint Rescue evidence

`simulateConstraintWhatIf` is pure and returns PROPOSALS. Measured on a milk gelato with dextrose
locked at 60 g:

| level | proposal | score | Σ band distance | shadow vectors priced |
| --- | --- | --- | --- | --- |
| sweetness −2 | dextrose 60 g → 48 g | 8 → 9 | 8.953 → 5.600 | 13 |
| sweetness −1 | dextrose 60 g → 48 g | 8 → 9 | 7.953 → 4.600 | 13 |
| sweetness +1 | dextrose 60 g → 48 g | 8 → 9 | 5.953 → 2.600 | 13 |
| sweetness +2 | dextrose 60 g → 48 g | 8 → 9 | 4.953 → 1.600 | 13 |

What a proposal carries: the current rule verbatim, the proposed rule **in the customer's own
vocabulary** (a grams lock stays a grams lock, a percent lock stays a percent lock, a range stays a
range), current and proposed grams, score and distance before and after, target reached before and
after, and the affected axes. It deliberately carries **no recipe** — a shadow vector must never
become live state.

**Only a customer-owned rule is ever offered.** The discriminator is AUTHORITY, not value: a
`structural` range belongs to formulation science, a solver-projected hold is orchestration state
the customer never set, and `main` / `required` / `already_added` lines are not preferences. Main
and Crown are DIAGNOSED (`blockedByMainAuthority`) and recorded, never offered.

---

## 7. True-infeasible evidence

`classifyRescueOutcome` gates the word. Seven verdicts, pinned distinguishable by test:

`improved` · `missing_authority` · `customer_constraint_blocked` · `profile_identity_blocked` ·
`structural_limit_blocked` · `genuinely_infeasible` · `no_material_improvement`.

`genuinely_infeasible` requires that **all six** stages ran and all six came back empty for a reason
about physics. Negative controls in the test suite: one unattempted stage (tested for each of the
six in turn) forbids the claim; a partial chain forbids it; an empty chain forbids it; and a
`missing_authority` on any stage forbids it **even when every other stage ran**.

---

## 8. Performance proof

| contract | budget | measured |
| --- | --- | --- |
| dose screen, per candidate | ≤ 120 whole grams | 60–80 at a 1000 g batch; the cap binds only above ~8 kg |
| dose finalists, per candidate | ≤ 3 | 1–2 in practice |
| constraint what-if, per constrained line | ≤ 13 shadow vectors | 13 |
| pair search | ≤ 12 screened vectors, 0 Previews | 12 |
| pair finalists | ≤ 2 | ≤ 2 |
| isolated Direction rescue lane | its own 15 s in-test wall-clock contract, unchanged | 8/8, 143.26 s total lane |

No network calls, no paid calls, no recursion: the pair stage is enforced to run only after singles
fail, inside the function rather than by caller convention.

---

## 9. Design authority reference

`WAITING_EXTERNAL`. The named authority — the chat/session
`Gellatti Pro mobile scroll stabilization / DESIGN` — is not reachable from this environment
(`ListAgents` reports no peer session; the account's session list contains no session with that
title). The complete copy-ready handoff, covering all sixteen states and every required deliverable,
is at `docs/design/naprawa-5-rescue/DESIGN_REQUEST.md`. **No Rescue UI has been invented or built.**

---

## 10. What is not done

Stated plainly so nothing here reads as more complete than it is.

1. **The customer-facing Rescue UI.** Blocked on the design authority (Q3). CORE, its diagnostics
   and its contracts are complete and tested; no surface consumes them yet.
2. **`rescueIngredientAdvisor.rescueCandidateFamily` is not yet routed through the canonical
   authority.** Its evidence rule is shared; its candidate list is not, so that list still does not
   contain Fructose. This is the remaining half of "one canonical Rescue toolbox authority".
3. **The six-stage chain is not yet assembled end to end in the live pipeline.** Every stage exists,
   is tested and is measured; `classifyRescueOutcome` and `rescueDiagnostics` define the contract
   they report into, but the live `buildStarterPackDirectionRescue` currently populates the
   single-candidate and dose stages only.
4. **Served staging verification.** Egress to `staging.pinguinoai.com`, the Supabase project and
   `*.vercel.app` is closed from this environment, so no figure here is SERVED VERIFIED. All
   evidence is labelled offline-branch-head.

Open questions, with options, impact, affected files and a recommendation for each:
`docs/audit/priority-5/OPEN-QUESTIONS.md`.

---

## 11. Closure ledger

| # | item | state |
| --- | --- | --- |
| 1 | Requested scope | recorded, §1 |
| 2 | Canonical Rescue authority | **done** — 9 modules, 94 tests |
| 3 | Profile × base-route compatibility | **done** — §3, both Protein routes separated |
| 4 | Fructose dosage authority and smallest-dose search | **done** — §4, §5.1 |
| 5 | Constraint what-if | **done** — §6 |
| 6 | Bounded pair Rescue | **done** — §5.3, fits the performance contract |
| 7 | True infeasible | **done** — §7 |
| 8 | Diagnostics / contracts | **done** — `rescueDiagnostics.ts` |
| 9 | Approved Rescue UI | **WAITING_EXTERNAL** — §9 |
| 10 | End-to-end chain assembly in the live pipeline | **not done** — §10.3 |
| 11 | Advisor candidate-list consolidation | **not done** — §10.2 |
| 12 | Served staging verification | **environment-blocked** — §10.4 |
