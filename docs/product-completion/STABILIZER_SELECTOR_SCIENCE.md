# STABILIZER SCIENCE — FORENSIC RECOVERY + MULTI-STABILIZER SELECTOR DESIGN

**Type:** research + design document. **NO src code changes** (docs-only). Engine immutable.
**Date:** 2026-07-25 · **Branch:** `stabilizer-science/selector-design` (from `nightly/integration` = a55f5fc).
**Method:** whole-project forensic sweep (git `-S`/`-G`, all `docs/**`, tests, migrations, template registry, three prior audit ledgers) + staging Mapper read-only (project `tunabqqrwabacxjcxxkz`, `SELECT` only, 2026-07-25) + external literature (Goff & Hartel, EFSA E417, hydrocolloid handbooks, supplier/technical sources). **Nothing invented.** Where evidence is insufficient the item is marked **OWNER-RATIFICATION** or **WYMAGA WERYFIKACJI** — never guessed.

> Reading key: **CANON** = owner-stated in the task/planning history (owner's head), **REPO** = present in code/data on disk, **STAGING** = verified live read-only, **LIT** = external literature, **DERIVED** = arithmetic on the above. A number with no REPO/STAGING tag does **not** exist in the project.

---

# PART 1 — FORENSIC RECOVERY

## 1.0 Headline (the one paragraph that matters)

The owner canon — **PI Stabilizer = 50 % LBG (E410) / 30 % Tara / 20 % Guar**, dosed **standard Gelato 2.3 g/kg · Sorbet 2.8 · Chocolate 2.5 · egg Gelato 1.8**, with an earlier **60/25/15** proposal — **exists nowhere in the repository, git history, or the staging database.** Not one of those numbers, ratios, nor the product identity "PI Stabilizer" is present in any tracked file or any reachable commit. What the project actually contains is **three disconnected dosage systems** that do not agree with the canon or with each other:

1. **Template seeds** dose **pure tara gum** (not the blend) at **5 g/kg** (milk −11, chocolate −11, fruit), **1.9 g/kg** (milk −12/−13, vegan −13), **0.8 g/kg** (sorbet).
2. **The Mapper window** assigns a **uniform 0.2–1 % of mix (= 2–10 g/kg)** to *every* stabilizer row — a boilerplate default, not a per-ingredient value.
3. **The planning-history "working model"** records milk-gelato stabilizer **1.8–2.1 g/kg** (pure tara, from the external-reference calculator).

The engine has **no stabilizer metric or band at all**, so none of these doses is engine-optimized; each is a *rule-attached quantity*. Reconciling the canon against this reality is the substance of Part 1, and is the reason Part 2 treats stabilizer as a **role with distinct, separately-ratified identities** rather than a single number.

## 1.1 The three PI gums as they actually exist (STAGING-verified read-only 2026-07-25)

`mapper_basement`, project `tunabqqrwabacxjcxxkz`. Values identical to `docs/ingredients/validation/mapper_basement.csv` byte-for-byte.

| Gum | Mapper id | subcategory | water | solids | fiber | protein | POD | PAC | stab_activity | dose min–max | verif / source | engine candidate? |
|---|---|---|---:|---:|---:|---:|---:|---:|:--:|:--:|---|---|
| **LBG (carob, E410)** | `PI-ING-000475` | `locust_bean_gum` | 5.85 | 94.15 | 39.8 | 4.62 | 0 | 0 | 1 | **0.2–1** | Verified / General | **NO** (not a candidate) |
| LBG (duplicate) | `PI-ING-001384` | `locust_bean_gum` | 5.85 | 94.15 | 39.8 | 4.62 | 0 | 0 | *null* | *null* | Verified / screenshot | NO |
| **Tara** | `PI-ING-000492` | `tara_gum` | 9.5 | 90.5 | 86.5 | 2 | 0 | 0 | 1 | **0.2–1** | Verified / General | **defined-but-UNREACHABLE** (`tara_gum` candidate exists; in **no** `SELECTION_RULES` entry) |
| **Guar** | `PI-ING-000472` | `guar_gum` | 0 | 100 | 83.1 | 4.29 | 0 | 0 | 1 | **0.2–1** | Verified / General | **NO** (not a candidate) |

Findings:
- **No "PI Stabilizer" blend row exists.** The 50/30/20 product the owner sells is not a Mapper identity. The only stabilizer *blend* rows are commercial (Solmix, Fabbri, Tate & Lyle, MEC3, Danisco, Palsgaard…), none matching the PI composition.
- **LBG is duplicated** (`000475` "General"-verified with activity+dose, and `001384` screenshot-imported with nulls). The two carry identical composition; only `000475` has the window/flag. → **OWNER-RATIFICATION R7** (dedupe / pick canonical LBG id).
- All three pure gums are **POD 0 / PAC 0** — they contribute only water/solids/fiber mass to the engine. They have **no freezing or sweetness effect** the engine can see, and **no stabilizer effect the engine can see** (§1.6).
- `stabilizer_activity = 1` is a **flag, not a potency**: every "General"-sourced stabilizer row (blends *and* pure gums alike) is `1`; every screenshot-imported row is `0`/null. It means "this is a stabilizer", not "this strong".

## 1.2 Every dosage number found in the project (provenance ledger)

| # | Value | Basis | Where (REPO/STAGING) | Family / profile | Fixed / seed / bound | Test evidence | Owner-approval | Notes |
|---|---|---|---|---|---|---|---|---|
| D1 | **5 g** tara | grams @ 1000 g (= 0.5 %) | `templateRegistry.ts:72` `milk_base_v1` | milk_gelato −11 | seed, `adjustable:false` | pinned in formulation suite | "locked starter template" | 0.5 % — **above** LIT tara 0.1–0.3 % (§1.4) |
| D2 | **1.9 g** tara | grams @ 1000 g (= 0.19 %) | `templateRegistry.ts:91,110` `G17`/`G18` | milk_gelato −12/−13 | seed, `adjustable:false` | regulator fixtures | **owner-authorized 2026-07-18** | best-evidenced pure-tara dose |
| D3 | **5 g** tara | grams @ 1000 g (= 0.5 %) | `templateRegistry.ts:129` `chocolate_base_v1` | chocolate_gelato −11 | seed, `adjustable:false` | pinned | "locked starter template" | same 0.5 % outlier as D1 |
| D4 | **0.8 g** tara | grams @ 1000 g (= 0.08 %) | `templateRegistry.ts:150-152` `S01/S02/S03` | sorbet −11/−12/−13 | seed, `adjustable:false` | regulator fixtures | "locked clean sorbet reference" | 0.08 % — **below** the Mapper min 0.2 % |
| D5 | **1.9 g** tara | grams @ 1000 g (= 0.19 %) | `templateRegistry.ts:169` `V02_fixed` | vegan_gelato −13 | seed, `adjustable:false` | regulator fixtures | "locked clean vegan reference" | matches D2 |
| D6 | **5 g** tara | grams @ 1000 g (= 0.5 %) | `templateRegistry.ts:193` `fruit_gelato_ref_v1` | fruit_gelato −11 | seed, `adjustable:false` | — | **`reference_derived`, staging-only, NOT approved** | raspberry-premium QA proportion |
| D7 | **0.2–1 %** | percent of total mix | Mapper `recommended_dosage_percent_min/max` on every "General" stabilizer row (STAGING) | *all* stabilizers (uniform) | min–max window | `stabilizerDosage.test.ts` (as clamp) | data-only; enforcement never wired (OD-4) | **boilerplate** (§1.5); = 2–10 g/kg |
| D8 | **1.8–2.1 g/kg** tara | g/kg (= 0.18–0.21 %) | planning-history "ideal working model" (`memory/pinguino-autofix-evidence.md`; `FULL_FORMULATION_RECOVERY_AUDIT.md §8`) | milk_gelato −11 | working-model band | not in repo tests | out-of-repo source only | overlaps D2 |
| D9 | **1.87 g** tara | grams @ 1000 g (= 0.187 %) | external-reference **Chocolate #123** fixture | chocolate | verified fixture datum | `chocolate-123.ts` | owner-VERIFIED data (calibration only) | ≠ CANON Chocolate 2.5 |
| D10 | **3 g** tara | grams @ 1000 g (= 0.3 %) | external-reference **ultra-fruit raspberry** | fruit (≈43 % fruit) | verified fixture datum | planning history | owner-VERIFIED data | high-fruit case |
| D11 | **0.98 g** tara | grams @ 1000 g (= 0.098 %) | external-reference **raspberry-premium** | fruit | verified fixture datum | `raspberry-premium.ts:46` | owner-VERIFIED data | the reference tool's own low dose |
| D12 | **1.41 g** tara | grams @ 1000 g (= 0.141 %) | MyGelato B2 recipe (`AGENT_B_ENGINE_COMPARISON_LEDGER.md`) | fruit gelato | competitor grams | comparison ledger | external | ≠ PINGÜINO's 5 g |

**CANON values (owner task / head — present in NO repo file):** standard Gelato **2.3**, Sorbet **2.8**, Chocolate **2.5**, egg Gelato **1.8** g/kg; blend **50/30/20**; earlier **60/25/15**; pack **125 g = 62.5/37.5/25**. These are recorded here as CANON only.

## 1.3 Reconciliation A — blend ratio: 50/30/20 vs 60/25/15

| Component | E-number | 50/30/20 (current canon) | of 125 g pack | 60/25/15 (earlier proposal) | of 125 g pack | Δ |
|---|---|---:|---:|---:|---:|---|
| Locust bean gum (LBG) | E410 | 50 % | **62.5 g** | 60 % | 75 g | +10 pp LBG |
| Tara gum | E417 | 30 % | **37.5 g** | 25 % | 31.25 g | −5 pp tara |
| Guar gum | E412 | 20 % | **25 g** | 15 % | 18.75 g | −5 pp guar |
| **Total** | | 100 % | 125 g | 100 % | 125 g | |

- Both are **100 % galactomannan** blends (no carrageenan / CMC / xanthan). Arithmetic on the 125 g pack checks out for both (62.5/37.5/25 and 75/31.25/18.75).
- **Neither appears in the repo.** The choice between them is an **OWNER-RATIFICATION** (R1). Literature does not adjudicate a single "correct" LBG:guar:tara ratio (§1.4, §2.2) — both are plausible LBG-dominant blends; 60/25/15 leans harder on LBG's heat-shock/meltdown structure, 50/30/20 gives more cold-hydrating guar + intermediate tara.

## 1.4 Reconciliation B — dose systems side by side (the core contradiction)

All normalized to **% of total mix** and **g/kg** for one 1000 g batch.

| Profile | CANON blend dose | Template seed (pure tara) | Planning working model | Mapper window | Literature (pure gum / blend) |
|---|---|---|---|---|---|
| Standard/milk gelato | **2.3 g/kg = 0.23 %** (CANON) | **5 g/kg = 0.50 %** (−11, D1) · 1.9 g/kg (−12/−13, D2) | 1.8–2.1 g/kg = 0.18–0.21 % (D8) | 0.2–1 % (D7) | tara 0.1–0.3 %; **blend 0.2–0.5 %** (LIT) |
| Sorbet | **2.8 g/kg = 0.28 %** (CANON) | **0.8 g/kg = 0.08 %** (D4) | — | 0.2–1 % (D7) | 0.1–0.5 %; gelling gums "become useful" in high-water/low-fat (LIT) |
| Chocolate | **2.5 g/kg = 0.25 %** (CANON) | **5 g/kg = 0.50 %** (D3) · 1.87 g/kg external (D9) | — | 0.2–1 % (D7) | 0.1–0.5 % (LIT) |
| Egg gelato | **1.8 g/kg = 0.18 %** (CANON) | *no egg template exists* | ~1.8–2.1 (D8) | 0.2–1 % (D7) | 0.1–0.5 % (LIT) |

**What disagrees, precisely:**
- **CANON standard 2.3 vs template 5.0** (milk −11): the template doses **2.2× the canon**. The template's 5 g is *pure tara*; the canon's 2.3 g is the *blend* — different products, so the mismatch is expected, but it means the shipped recipes do **not** currently reflect the owner's dosing intent.
- **CANON sorbet 2.8 vs template 0.8**: the template doses **3.5× LESS** than the canon. This is the single largest contradiction and points to a real decision: sorbets (high free water, no fat/protein network) are exactly where literature says gelling/water-binding gums matter most — the canon's *higher* sorbet dose is directionally consistent with LIT, the template's 0.8 g is not.
- **CANON chocolate 2.5 vs template 5.0 vs external 1.87**: three different numbers; the owner-VERIFIED external datum (1.87 g) is closest to the canon.
- **Template sorbet 0.08 % sits BELOW the Mapper minimum 0.2 %** — the project's own window and its own seeds contradict each other (already flagged as the "recorded contradiction" in `LIVE_STATE_OPT_STABILIZER_LEDGER.md §3.5`).
- **CANON milk 2.3 sits slightly ABOVE the working-model band 1.8–2.1** and above the Mapper-implied tara sweet spot, but comfortably inside the blend literature range 0.2–0.5 %.

**Convergence:** CANON blend doses (0.18–0.28 %) and LIT blend range (0.2–0.5 %) and the working model (0.18–0.21 %) **agree to within a rounding band**. It is the **template seeds** (0.08 % and 0.50 %) that are the outliers — because they were transcribed from *pure-tara* reference recipes, not chosen as blend doses. This is the reconciliation the owner needs: **the canon is scientifically reasonable as a blend dose; the shipped templates are pure-tara artifacts and should not be read as the PI Stabilizer dose.**

## 1.5 The uniform-window forensic finding (why "0.2–1 % is approved for tara/guar" is misleading)

Prior ledgers (`FULL_FORMULATION_RECOVERY_AUDIT.md §5`) describe tara and guar as having "approved 0.2–1 % in Mapper." Read literally that is true — but the STAGING sweep shows the window is **identical (0.2–1) on all ~34 "General"-sourced stabilizer rows**: pure guar, pure LBG, pure tara, *and* every commercial emulsifier blend (Solmix, Fabbri, Danisco, Tate & Lyle…). Screenshot-imported rows (MEC3, PreGel, agar, xanthan, cassia, pectin, the second LBG) carry **null** dose. That pattern — one constant on a whole vocabulary, null on the rest — is the signature of a **default fill, not per-ingredient research.** Therefore:

- 0.2–1 % is a **safe boilerplate**, not evidence that 0.2–1 % is the *right* window for tara specifically, nor for the PI blend.
- It is nonetheless a *useful* safety envelope: it brackets the literature (tara 0.1–0.3 %, blend 0.2–0.5 %) reasonably and is what `stabilizerDosage.ts` already uses as a **clamp** (not a target). Keep it as a guardrail; do **not** promote it to a dosing recommendation.
- → **OWNER-RATIFICATION R2**: is 0.2–1 % binding or advisory, and per-identity or uniform?

## 1.6 Engine reality — there is no stabilizer metric (immutable)

- `src/engine/config/targets.ts` `TARGET_BANDS`: **no stabilizer band** in any of the 12 category×temperature cells. The "stabilizer ratio" listed as priority 9 in `PINGUINO_MASTERPLAN_V1.md §13` and as a technical-score input in §12.8 is **spec-only, never implemented.**
- `src/engine/corrections/candidates.ts`: `tara_gum` is a defined candidate but appears in **no** `SELECTION_RULES` entry (unreachable); guar and LBG are **not candidates at all**. There is no `stabilizer_low`/`stabilizer_high` rule.
- Forensic sweep (`LIVE_STATE_OPT_STABILIZER_LEDGER.md §3.3`): changing tara from 5.0 → 1.4 g moved POD/PAC/NPAC/ice by **< 0.1**; tara registers only as generic water/solids/fiber mass. **Moving the stabilizer produces no engine-verified gradient.**
- Consequence for design: a stabilizer dose can **never** be "optimized" by the engine. Every identity's dose is a **deterministic rule-attached quantity**; the engine validates the *rest* of the recipe and treats the stabilizer line as inert mass. `stabilizerDosage.ts` already encodes this honestly (clamp + provenance label `seed wzorca`, "dawka nierozstrzygnięta naukowo dla tego profilu").

## 1.7 Part 1 open contradictions (carried into the ratification list §2.8)

1. CANON blend doses vs template pure-tara seeds (§1.4) — the shipped recipes don't reflect owner dosing intent.
2. Template sorbet 0.08 % < Mapper min 0.2 % (self-contradiction).
3. 50/30/20 vs 60/25/15 unresolved (§1.3).
4. No "PI Stabilizer" identity in the data; only pure gums + commercial blends.
5. LBG duplicated (`000475`/`001384`).
6. Uniform 0.2–1 % window is boilerplate, not per-identity science (§1.5).

---

# PART 2 — MULTI-STABILIZER SELECTOR DESIGN

**Binding owner addendum:** stabilizer is a **ROLE** ("system stabilizujący") with distinct candidate **IDENTITIES**. The selector never collapses the role to one number and never auto-expands PI Stabilizer into three gum lines.

## 2.1 (a) Candidate model

A stabilizer candidate is a typed identity. Five identity **types**:

```
StabilizerIdentityType =
  | 'pi_stabilizer'        // the house 50/30/20 blend — ONE product line
  | 'commercial_blend'     // a named Mapper blend row (verified spec) 
  | 'pure_gum'             // a single hydrocolloid, dosed ONLY by a validated solo/combination rule
  | 'custom_user_blend'    // 'Mam własny stabilizator'
  | 'none'                 // 'Nie używam stabilizatora'
```

Canonical candidate record (design shape — not code):

| Field | Meaning | Example (PI Stabilizer) | Example (pure tara) |
|---|---|---|---|
| `identityType` | one of the five above | `pi_stabilizer` | `pure_gum` |
| `canonicalId` | stable id (Mapper id for existing rows; new synthetic id for PI blend — see R3) | `PI-STAB-BLEND-503020` *(does not yet exist — R3)* | `PI-ING-000492` |
| `displayName` | one line shown to user | "PI Stabilizer — 2,3 g" | "Guma tara — 1,9 g" |
| `composition` | components + fractions (shown only under **Szczegóły**) | LBG 50 % / Tara 30 % / Guar 20 % (E410/E417/E412) | tara 100 % |
| `dosageRule` | `{ value, basis, version, source, verification }` | `{2.3, 'g_per_kg_mix', 'canon-v0', 'owner canon', 'OWNER-RATIFICATION'}` | `{1.9, 'g_per_kg_mix', 'G17/G18-v0.1', 'owner-authorized 2026-07-18', 'approved(-12/-13)'}` |
| `compatibility` | family × temperature applicability (§2.2) | Gelato/Chocolate/Sorbet/Vegan | same |
| `processingNotes` | hydration/heat, order of addition | LBG needs ~85 °C to fully hydrate; guar cold; blend added to dry sugars then heated | tara ~ hot hydration |
| `familyKind` | `pure_gum` \| `stabilizer_blend` (Phase 9 non-interchange) | `stabilizer_blend` | `pure_gum` |

**Non-negotiables baked into the model:**
- **PI Stabilizer is ONE product line.** Its composition lives under *Szczegóły*; it is never rendered as three gum lines and the solver never scales its parts independently. (This mirrors the existing `adjustable:false` template contract for the stabilizer role.)
- **Commercial blends** resolve to their *exact* Mapper identity with a *verified* spec, or are shown "Wymaga weryfikacji" — never an inferred composition.
- **Pure gums** are dose-eligible **only** where a validated solo/combination rule exists (§2.3). A blend dose is **never** transferred onto a pure gum (the `approvedStabilizerDosageOfKind` non-interchange rule already enforces this in `stabilizerDosage.ts`).
- **Custom** requires user-supplied composition/basis/family/processing, or an honest refusal naming the missing fields.

## 2.2 (b) Compatibility model — which factors GENUINELY modulate hydrocolloid dose

Family × serving temperature grid (Gelato / Chocolate / Sorbet / Vegan / Protein) × (−11 / −12 / −13). The design question the owner set: *which mix factors actually change the dose?* Answered from literature, **rejecting** unsupported factors explicitly.

### Factors the literature SUPPORTS (qualitative, not a validated coefficient)

| Factor | Direction | Mechanism | Source |
|---|---|---|---|
| **Free / freezable water** (↑ water, ↓ fat, ↓ solids) | ↑ stabilizer importance | Hydrocolloids act by water-holding + microviscosity; more unbound water = more ice-crystal surface to control | Goff & Hartel 2013 (via icecreamscience, dreamscoops); "for low-fat/fat-free or sorbets, gelling stabilizers become useful" |
| **Serving/storage temperature & heat-shock exposure** | ↑ colder / more cycling → ↑ structural demand | Recrystallization during storage is the primary target of the gum network | ScienceDirect recrystallization-inhibition review |
| **Presence of a synergistic helical partner** (κ-carrageenan / xanthan) | changes *which* gum and *how much* | LBG & tara form junction zones with carrageenan/xanthan; guar does not | EFSA E417; galactomannan M/G literature |

**Net rule (honest):** the only defensible *automatic* modulation is by **free water / low-fat-solids**, and even that is **directional, not quantitative** — no source gives "add X % stabilizer per Y % water." So the compatibility model may **flag** sorbet/low-fat profiles as "higher stabilizer demand" and **order** candidates accordingly, but it must **not compute** a dose from a water coefficient. The per-profile dose stays an **owner-ratified constant per identity** (§2.3), not a formula over composition.

### Factors to REJECT as independent dose drivers (explicitly)

| Rejected factor | Why rejected |
|---|---|
| **Fruit content per se** | Acts only *through* the water/solids it adds — not an independent hydrocolloid-dose variable. No source doses gum "per % fruit." (The external ultra-fruit datum D10 used 3 g at 43 % fruit, but that is one recipe, not a coefficient.) |
| **Cocoa content** | No literature relates cocoa % to a stabilizer-dose adjustment. Cocoa adds solids/fiber that *reduce* free water, if anything. |
| **Protein content** | Protein contributes to structure and *interacts* with gums (whey-off risk with LBG), but there is **no validated protein→dose coefficient**. Protein changes *compatibility* (need a carrageenan-type partner), not the gum *quantity*. |
| **`stabilizer_activity` field** | It is a REPO flag (1/0), not a potency scale (§1.1) — must never be used as a dose multiplier. |

### Galactomannan science the model relies on (for identity *selection*, not dose math)

- **M/G ratio: guar ≈ 2, tara ≈ 3, LBG ≈ 4** (galactomannan literature). Tara is genuinely **intermediate** — the owner's "intermediate galactose:mannose behavior" is confirmed.
- **LBG** (fewest galactose branches → smooth mannan regions) hydrates on **heat (~85 °C)**, gives high hot viscosity, best chew/meltdown resistance and heat-shock protection, and **synergizes with κ-carrageenan/xanthan**.
- **Guar** hydrates **cold**, fast initial viscosity, but leaves more liquid meltdown and **does not synergize** with carrageenan (can increase syneresis).
- **Tara** bridges the two; synergizes with carrageenan/xanthan/agar (peak tara:κ-carrageenan gel ≈ 2:8).
- **Critical caveat for the PI blend:** a **galactomannan-only** LBG+guar(+tara) blend has **no helical gelling partner**. One technical source states a plain LBG+guar blend "does not stabilize ice cream even initially" without an additional component (CMC/carrageenan). The PI 50/30/20 will **thicken and bind water** (legitimate, clean-label, carrageenan-free) but does **not** form the anti-whey-off gel network a carrageenan blend does — which matters most in **high-protein dairy** mixes. → **WYMAGA WERYFIKACJI W1** (functional completeness of the pure-galactomannan blend), separate from dosing.

## 2.3 (c) Dosage model per identity type + output contract

Deterministic, per-identity. **No gram amount is reused across identities** unless independently justified.

```
dose_grams(identity, batch_g) =
  switch identity.identityType:
    pi_stabilizer     → canonDose[profile] * batch_g / 1000        // g/kg CANON, OWNER-RATIFICATION
    commercial_blend  → datasheetDose(identity) * batch_g / 100     // manufacturer % of mix; else 'Wymaga weryfikacji'
    pure_gum          → validatedSoloRule(identity, profile)        // ONLY if a rule exists; else refuse
    custom_user_blend → userDose(basis) after composition verified  // else refuse w/ missing fields
    none              → 0
  then CLAMP to the approved window (stabilizerDosage.ts, 0.2–1% of mix) and RECORD if clamped.
```

**Exact output contract (every identity returns all of these):**

| Field | Example |
|---|---|
| `grams` | 2.3 g |
| `percentOfMix` | 0.23 % |
| `basis` | `g_per_kg_mix` |
| `ruleVersion` | `canon-v0` |
| `source` | "owner canon (not yet in data)" |
| `confidence` | `OWNER-RATIFICATION` / `verified` / `needs_verification` |
| `plainPolish` | "PI Stabilizer 2,3 g na 1 kg — dawka firmowa; skład 50/30/20 w Szczegółach; silnik nie ocenia dawki stabilizatora." |

The `plainPolish` string must always disclose that **the engine does not score the stabilizer dose** (§1.6) — so users never read the recipe score as validating the dose.

## 2.4 (d) Recommendation ranking

Order candidates for a given (family, temperature, dietary flags):

1. **PI Stabilizer** — recommended **where appropriate** (any Gelato/Chocolate/Sorbet/Vegan profile once its dose is ratified). Rank #1 by default because it is the house product with a defined composition.
2. **Commercial blends with a verified datasheet dose** — ranked by (verification completeness, then family fit). A blend with only the boilerplate 0.2–1 % window ranks below one with a real datasheet dose and is tagged "Wymaga weryfikacji."
3. **Pure gums with a validated solo/combination rule** for this profile (today: tara at −12/−13 via D2; see §2.7). Others are shown but **not dose-eligible**.
4. **Custom user blend** — always offered, never ranked (user-driven).
5. **None** — always offered last.

Ranking never invents a dose to make a candidate look better; an unratified candidate ranks lower precisely *because* its dose is unverified.

## 2.5 (e) UX flow

```
[ Wybierz stabilizator ]
   │
   ├─ Rekomendowany:  ┌───────────────────────────────┐
   │                  │ PI Stabilizer — 2,3 g          │  ← ONE line
   │                  │ dawka firmowa · 0,23 % masy    │
   │                  │ ▸ Szczegóły: LBG 50 / Tara 30 /│
   │                  │   Guar 20  (E410/E417/E412)    │
   │                  └───────────────────────────────┘
   │   [ Użyj ]  ← one click
   │
   ├─ Zgodne alternatywy (compatible, dose-verified):
   │     • [commercial blend] — 5,0 g (datasheet) / lub „Wymaga weryfikacji"
   │     • [pure tara] — 1,9 g (reguła −12/−13)      ← only if validated for profile
   │
   ├─ [ Mam własny stabilizator ]  → composition/basis/family/processing form
   └─ [ Nie używam stabilizatora ] → recipe without + honest property note
```

- **One-click** apply on the recommended card.
- **"Nie mam tego"** on any identity marks **THAT identity unavailable** and recomputes the **next candidate's OWN dose** (never carries the previous grams over). E.g. decline PI Stabilizer → the next candidate (a commercial blend) shows *its* datasheet dose, not 2.3 g.
- Composition (50/30/20) is reachable only under **Szczegóły** — never expanded into the recipe as three lines.

## 2.6 (f) Missing-data + no-stabilizer behavior

- **Commercial blend, no datasheet dose:** show identity + verified composition, dose field = **"Wymaga weryfikacji — brak dawki producenta"**; offer the boilerplate window only as a *range hint*, clearly labelled non-authoritative.
- **Custom blend, incomplete:** refuse with the **exact** missing fields, e.g. *"Podaj: (1) skład % każdej gumy, (2) bazę dawki (g/kg czy % masy), (3) rodzinę (galaktomannan/karagen/…), (4) obróbkę (hydratacja na zimno/gorąco). Brakuje: baza dawki, obróbka."*
- **None ('Nie używam stabilizatora'):** produce the best recipe without a stabilizer line. **No fake penalty** on any engine metric (the engine has no stabilizer band — §1.6, proven: removing tara barely moves any score). Instead an **explicit honest note**: *"Bez stabilizatora silnik nie zmienia oceny (nie mierzy stabilizatora). Niegwarantowane w praktyce: odporność na szok termiczny, kontrola kryształków lodu podczas przechowywania, opór topnienia."* — properties the engine cannot see, stated as unguaranteed, not scored.

## 2.7 (g) Acceptance examples — ONE identical Gelato, five stabilizer identities

**Fixed base:** milk gelato, −11 °C, 1000 g total mix — `milk_base_v1` lines (milk 3.5 % 670 / cream 30 % 130 / SMP 35 / sucrose 130 / dextrose 30) **held constant**; only the stabilizer identity/line changes. Engine 0.4.0 / config 0.7.0. Because the engine has **no stabilizer gradient**, the non-stabilizer metrics are essentially identical across variants (Δscore < 0.1) — the differences below are in the **dose, its basis, its verification, and real-world properties the engine does not measure**, exactly as the science requires.

| Variant | Identity | Dose (g) | Basis | % of mix | Source / rule | Confidence | Composition (Szczegóły) | Apply verdict |
|---|---|---:|---|---:|---|---|---|---|
| **1. PI Stabilizer** | `pi_stabilizer` 50/30/20 | **2.3** | g/kg mix (CANON) | 0.23 % | owner canon (not in data) | **OWNER-RATIFICATION** | LBG 1.15 / Tara 0.69 / Guar 0.46 g | Apply as ONE template-controlled line; engine validates rest; dose labelled owner-ratified, unscored |
| **2. Commercial blend** | `commercial_blend` e.g. Solmix IC `PI-ING-000490` | **5.0** *(if datasheet = 0.5 %)* | % of mix (manufacturer) | 0.50 % | datasheet **missing in repo** → boilerplate 0.2–1 % only | **needs_verification** | verified blend composition (if present) | Apply blocked from "recommended"; shown "Wymaga weryfikacji" until datasheet dose supplied |
| **3. Pure tara** | `pure_gum` `PI-ING-000492` | **1.9** | g/kg mix | 0.19 % | **validated** via G17/G18 owner-authorized (D2); also within LIT 0.1–0.3 % | **approved (−12/−13); OWNER-RATIFICATION at −11** | tara 100 % | Apply allowed with the 1.9 g rule; **note:** the −11 starter's 5 g (D1) is a pure-tara outlier above LIT — do **not** reuse it as the validated −11 solo dose |
| **4. Pure guar** | `pure_gum` `PI-ING-000472` | **—** | — | — | **no validated solo rule** in repo or LIT for this profile | **refuse (dose)** | guar 100 % | Shown, **not dose-eligible**; refuse with "brak zwalidowanej reguły dawki dla czystego guaru w tym profilu" — never borrow the blend's 2.3 g |
| **5. None** | `none` | **0** | — | 0 % | user choice | n/a | — | Apply allowed; engine score unchanged; honest unguaranteed-properties note (§2.6) |

**Why the grams differ (independently justified, per the no-reuse rule):** 2.3 g is the blend canon; 5.0 g is a *hypothetical* manufacturer datasheet (flagged unverified, not asserted); 1.9 g is the owner-authorized pure-tara reference; guar has **no** number because no rule exists; none is 0. No amount is copied from another row.

## 2.8 (h) The unavoidable owner-ratification list

| # | Ratification needed | Blocks |
|---|---|---|
| **R1** | Confirm the blend ratio: **50/30/20** (current) or **60/25/15** (earlier). Both are 100 % galactomannan; neither is in data. | PI Stabilizer identity |
| **R2** | Per-profile **blend doses**: ratify **standard 2.3 / sorbet 2.8 / chocolate 2.5 / egg 1.8 g/kg** (or revise). These exist only as canon; they agree with LIT blend range 0.2–0.5 % but are unrecorded. Also decide basis: **g/kg of mix** vs % of mix (confirm mix, not per-water). | dosage model per profile |
| **R3** | Create the **"PI Stabilizer" Mapper identity** (composition, E-numbers, one dose window) so the selector has a real row instead of a synthetic id. | candidate model wiring |
| **R4** | Reconcile the **template seeds vs the blend canon** (§1.4): the shipped recipes dose pure tara at 5/1.9/0.8 g — decide whether production recipes should switch to the PI blend dose, and fix the **sorbet 0.08 % < Mapper 0.2 %** self-contradiction. | recipe correctness |
| **R5** | Rule on the **0.2–1 % window**: binding vs advisory, uniform vs per-identity (it is currently boilerplate, §1.5). | clamp semantics |
| **R6** | **Validated solo/combination rules** for pure gums per profile (only tara −12/−13 is defensible today). Without these, pure gums stay dose-ineligible. | pure-gum dosing |
| **R7** | **Dedupe LBG** (`PI-ING-000475` vs `PI-ING-001384`); pick the canonical LBG id + restore its activity/window. | data hygiene |
| **W1** | **Functional completeness** of the pure-galactomannan blend (no carrageenan/CMC partner) — verify anti-whey-off / gel behavior in high-protein dairy, or accept it as a clean-label viscosity/water-binding blend. Composition question, not dosing. | product claim honesty |
| **R8** | **Egg gelato** has no template/profile in the engine at all — decide whether it is a first-class family before wiring its 1.8 g/kg. | egg-gelato support |

---

## Sources

- [Locust Bean Gum in Ice Cream — Ice Cream Science](https://www.icecreamscience.com/blog/locust-bean-gum-in-ice-cream)
- [Why are stabilizers used in ice cream? — Ice Cream Science](https://www.icecreamscience.com/blog/stabilizers-ice-cream)
- [How to use stabilizers in ice cream — Dream Scoops](https://www.dreamscoops.com/ice-cream-science/using-stabilizers-ice-cream/)
- [Mapping structure-function properties of stabilizers in premium ice cream — ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0023643825016561)
- [Assessing ice recrystallization inhibition effect of stabilizer in ice cream systems — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0268005X24010178)
- [Film-forming properties of guar gum, tara gum and locust bean gum — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0268005X18316278)
- [Galactomannan — an overview — ScienceDirect Topics](https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/galactomannan)
- [Re-evaluation of tara gum (E 417) as a food additive — EFSA Journal 2017](https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2017.4863)
- [The effects of the combined use of stabilizers containing locust bean gum — Guven 2003, Int. J. Dairy Technology](https://onlinelibrary.wiley.com/doi/abs/10.1046/j.1471-0307.2003.00108.x)
- [What is Tara Gum (E417) in ice cream — foodadditives.net](https://foodadditives.net/thickeners/tara-gum/)
- [How to Use Guar Gum in Ice Cream — Altrafine](https://www.altrafine.com/blog/how-to-use-guar-gum-in-ice-ream/)

**Internal (REPO/STAGING) evidence:** `src/features/formulation/templateRegistry.ts`, `src/features/formulation/stabilizerDosage.ts`, `src/engine/config/targets.ts`, `src/engine/corrections/candidates.ts`, `docs/ingredients/validation/mapper_basement.csv`, `supabase/migrations/0006_mapper_basement.sql`, `docs/product-completion/LIVE_STATE_OPT_STABILIZER_LEDGER.md`, `docs/engine-validation/AGENT_B_ENGINE_COMPARISON_LEDGER.md`, `docs/product-completion/AGENT3_CONSTRAINT_SOLVER_LEDGER.md`, `docs/engine-validation/FULL_FORMULATION_RECOVERY_AUDIT.md`, staging `mapper_basement` (project `tunabqqrwabacxjcxxkz`, read-only 2026-07-25).
