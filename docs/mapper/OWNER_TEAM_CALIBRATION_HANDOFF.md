# Owner / Team Calibration Handoff — PINGÜINO Mapper

_2026-07-05 · repo HEAD `66318e7` · everything Claude-solvable in the current queue is done; the
items below need **human** input. Nothing here writes to `mapper_basement`; no PAC/POD is ever
guessed; product PAC/POD columns stay NULL (engine values flow reference-linked at calc time)._

**Where to work:** `/dev/reference-proposals` (DEV build). Each proposal shows a required-fields
checklist, a **local** PAC/POD draft form (values you type stay in the browser — nothing is
persisted), and a collapsible **Team calibration pack export** (JSON + CSV) to hand around.
Typing PAC/POD flips that proposal to `ready_local_draft` so you can validate completeness before
sending values back.

**Current DB state:** 69 products · 23 matched (Studio-eligible) · 3 rejected · 43 unmapped ·
`mapper_basement` 542 (untouched) · product PAC/POD 0/69 · PI Verified 0.

> **Update 2026-07-06 — ProductIntelligenceResolver preview reduces (does not remove) this ask.**
> A new class-anchored resolver (pure, preview-only at `/dev/product-intelligence-preview`; writes
> nothing) can now derive *ephemeral, low/medium-confidence* engine values for a few same-class
> dairy products without waiting for calibration. **A calibrated reference is still the
> higher-quality, production path** — the resolver only unblocks preview/optional use. Effect on
> the 12 proposals below:
> - **Optional now (resolver PI-Calculates at low/medium confidence):** `skim_milk` (000004),
>   `plain_yogurt_whole` (000014), `kefir` (000022/000023). Calibrating these still upgrades them
>   from a class-derived estimate to a measured reference.
> - **Still REQUIRED (resolver cannot help):** `almond` (label staged but pac/pod still owner-only) ·
>   `greek_yogurt_full_fat` (resolver blocks — the 7.5 % greek anchor is 1.06 pp from the 10.8 %
>   product) · `lactose_free_milk` · `cocoa_powder` · `erythritol` · `maltitol_polyols` ·
>   `steviol_stevia` · `sucralose` · `saccharin` (all hard-blocked chemistry classes).
> Net: the 4 owner-pick decisions are unchanged; the calibration priority shifts toward the
> **almond + greek + sweetener/lactose-free/cocoa** families, which no rule can safely derive.

---

## 1. Reference proposals — the team fills PAC/POD (12 proposals → unlock 17 products)

Every proposal already carries a cited label/public composition. **The ONLY universally missing
values are the engine `pac_value` + `pod_value` — they are PINGÜINO-calibrated numbers that exist
nowhere publicly and must come from the team's process** (same one used for the existing 542 refs).
"Source required" = attach the provenance you calibrate from.

| id | proposed reference | unlocks | known composition (per 100 g) | still missing (besides PAC/POD) | PAC | POD | source needed | exact team action |
|---|---|---|---|---|---|---|---|---|
| `greek_yogurt_full_fat` | Greek Yogurt, full-fat ≈10% MG (dairy/greek_yogurt) | 000016, 000017 | fat 10 · carb 4 · sugars 4 · protein 4 · salt 0.1 · water≈81/solids≈19 | representative water/solids; protein band (label 3.9 is low for strained greek) | ⛔ | ⛔ | label + team process | Calibrate PAC/POD; decide **new PI-ING vs fat-variant of PI-ING-000204** (7.5% lean greek) |
| `skim_milk` | Skimmed Milk, liquid ≈0.1–0.3% fat (dairy/milk_skimmed) | 000004 | fat 0.3 · carb 4.8 · sugars 4.8 · protein 3.2 · salt 0.13 · water≈91/solids≈9 | representative water/solids | ⛔ | ⛔ | label + team process | Calibrate (standard dairy process — no liquid skim ref exists today) |
| `lactose_free_milk` | Lactose-free Milk, semi/whole (dairy/milk_lactose_free) | 000007, 000008 | fat 1.55 · carb 4.7 · sugars 4.7 · protein 3.2 · salt 0.13 | water/solids; **whole-vs-semi variant split** | ⛔ | ⛔ | label + team process | Calibrate for **hydrolysed glucose+galactose** — never copy regular-milk PAC/POD (higher FPD + sweetness); decide 1 or 2 variants |
| `plain_yogurt_whole` | Plain Yogurt, whole-milk ≈3%, unstrained (dairy/yogurt_plain) | 000014 | fat 3 · carb 4.5 · sugars 4.5 · protein 3.5 · salt 0.1 | water/solids; lactose split | ⛔ | ⛔ | label + team process | Calibrate (existing yogurt refs mismatch: Standard is 2% fat/4.7 protein; Greek-Type is strained, sugars 2.7) |
| `kefir` | Kefir, natural ≈4% fat (dairy/kefir) | 000022, 000023 | fat 4.2 · carb 5.1 · sugars 2.3 · protein 3.9 · salt 0.08 | water/solids; fermentation sugar split | ⛔ | ⛔ | label + team process | Calibrate — note the LOW residual sugars (2.3) from fermentation; no kefir ref exists |
| `cocoa_powder` | Cocoa Powder, pure 10–14% fat (chocolate/cocoa_powder) | 000033 | fat 14 · carb 16 · sugars 2 · protein 21 · salt 0.1 | water/solids; fiber; available-vs-by-difference carbs | ⛔ | ⛔ | label + team process | Calibrate — **no pure cocoa-powder ref exists**; product stays name-flagged (0% azúcares → never auto-verifies) |
| `almond` | Almond 100%, whole/ground/paste (nut/almond) | 000040, 000041, 000042 | fat 49.9 · sat 3.8 · carb 21.55 (≈7–9 EU available) · sugars 4.35 · protein 21.15 · salt 0.003 · water 4.41 · fiber 12.5 · kcal 579 | salt reconcile (USDA 0.003 vs label 0.01); per-SKU whole/ground split | ⛔ | ⛔ | USDA FDC 170567 (already cited) + team process | Calibrate like the existing peanut/hazelnut/pistachio pastes; decide **one ref vs whole/ground variants** |
| `erythritol` | Erythritol E-968 (sugar/polyol) | 000060, 000062 | polyol 100 · solids 100 · everything else 0 | — (composition trivial) | ⛔ | ⛔ | EFSA (cited) + team process | Calibrate **polyol** PAC/POD (strong freezing-point depression, ≈60–70% sweetness — engine treats polyols stored-value-first) |
| `maltitol_polyols` | Maltitol E-965 (+ sorbitol/xylitol/isomalt) (sugar/polyol) | 000032 | polyol 100 · solids 100 | per-polyol sweetness citation | ⛔ | ⛔ | EFSA + team process | Calibrate **per polyol** (maltitol = moderate PAC, unlike erythritol) |
| `steviol_stevia` | Steviol glycosides E-960 (sugar/high_intensity) | 000061, 000062 | trace mass (0/0/0) | pure-additive vs bulked-product profile | ⛔ | ⛔ | EFSA/JECFA + team process | Calibrate + define **non-bulk high-intensity handling** (200–300× sucrose at mg doses) |
| `sucralose` | Sucralose E-955 (sugar/high_intensity) | 000060 | trace mass (0/0/0) | pure vs bulked profile | ⛔ | ⛔ | EFSA + team process | Calibrate (≈600× sucrose at trace dose) |
| `saccharin` | Saccharin E-954 (sugar/high_intensity) | 000063 | trace mass (0/0/0) | **profile A (pure) vs B (bulked sachet, USDA FDC 169072)** | ⛔ | ⛔ | EFSA/USDA + team process | **Resolve A-vs-B first** ("sobres" is usually B — PAC then comes from the dextrose bulking), then calibrate |

Suggested next free codes: `PI-ING-000545`+ (team assigns at insert time — see
[BASEMENT_REFERENCE_INSERT_CANDIDATES.md](BASEMENT_REFERENCE_INSERT_CANDIDATES.md)).

---

## 2. Owner-pick decisions — mapping choices Claude must not make

These four products have candidates, but the choice is a **taste/product-identity call with real
engine consequences** — composition cannot decide it, and the options differ in PAC/POD.

| product | candidates (basement options) | engine consequence | why Claude can't decide | exact owner decision |
|---|---|---|---|---|
| **PR-ING-000026** Chocolate con leche Classic (32/54/54/7/0.2) | PI-ING-000118 Milk Chocolate 33% Pi-Nuts (POD **48.41**) · PI-ING-000121 Sicao 86A (POD **44.04**) · PI-ING-000123 Sicao 575 (POD **48.24**) — compositions near-identical (Δ1.28–1.29) | the pick swings recipe sweetness by **≈4.4 POD points** (PAC ≈57 all) | composition ties; only supplier-profile knowledge distinguishes them | Pick which couverture profile represents Hacendado milk chocolate — or request a dedicated ref |
| **PR-ING-000028** Chocolate negro 72% (42/32/25/10/0.02) | Irca Reno Fondente (**closest**, Δ0.756, % unstated) · Barima Dessert **72%** (Δ1.263) · Vanini **72** ICAM (Δ1.426) · Callebaut 70.5 (Δ1.16) · Schokinag 74 (Δ1.162) | dark-choc refs differ in sugars/PAC by percent point | composition-closest ≠ exact-percent match, and TWO refs sit at exactly 72% | Choose the mapping rule for this product: closest-composition (Fondente) vs exact-% (which 72?) — or a dedicated ref |
| **PR-ING-000035** Pistacho natural pelado (50/18/7/22/0.01) | PI-ING-000413 Delipaste Pure Pistachio (Δ1.20, pac 7.02/pod 7.0) · PI-ING-000444 Roasted Pistachio Pulp 100% (Δ1.36, pac 7.86/pod 7.8) | ≈0.8 pac/pod spread | product is a **raw natural kernel**; both refs are roasted/paste forms — a process difference Claude can't wave away | Accept a roasted/paste proxy (pick one) — or request a raw-pistachio reference |
| **PR-ING-000034** Cacao en polvo a la taza (8/70/65/7/0.1) | none within tolerance (it is ≈65% sugar + cocoa + thickener) | n/a | it's a **multi-ingredient composite**, not a single reference ingredient | Decide: exclude/reject as not-an-ingredient, or commission a dedicated composite reference |

> **Consistency review (add to the 000028 discussion):** the already-confirmed
> **PR-ING-000029 Chocolate negro 85% → Bitter Chocolate Power 80% Callebaut** predates the
> stricter percent standard that parked 000028 — a 5-point cocoa-% gap was accepted there. It is
> not unsafe (reference-linked, product PAC/POD null), but please re-confirm or re-map it while
> deciding 000028 so one dark-chocolate percent rule applies to both.

---

## 3. What happens after the team fills this

1. Team types PAC/POD (+ notes) into `/dev/reference-proposals` **or** returns the filled JSON/CSV pack.
2. Claude generates a **reviewed seed-migration preview** (non-applied SQL file, per-row provenance).
3. **Owner approves** the preview explicitly.
4. A human applies the `mapper_basement` insert — **only after that approval** (this is the one
   hard-stop gate; nothing automated touches the locked base).
5. Claude reruns the matcher over the unlocked products — the fat-band/name-tiebreak logic will
   pre-narrow most of the ~17 to single suggestions.
6. Newly clear products are confirmed (`matched` / `manual_mapping` / `high` / `pi_generated`) with
   full audit notes.
7. Verification: product PAC/POD columns are re-checked to still be **0/69** — engine values stay
   reference-linked at calculation time, never copied.

## 4. Do not do

- **Do not guess PAC/POD** — they are team-calibrated engine values; no public source has them.
- **Do not derive PAC from `total_sugars`** (or any single label field) — hard-stop rule.
- **Do not write to `mapper_basement` without explicit owner approval** of a reviewed seed migration.
- **Do not PI Verify any product without independent provenance** (lab / technical sheet / producer
  data) — reference-linked values alone can never reach PI Verified, and red-flagged products
  (sweeteners, polyols, +Proteínas, composites) never auto-verify regardless.

_Backing detail: [REVIEW_QUEUE_ANALYSIS.md](REVIEW_QUEUE_ANALYSIS.md) (per-product evidence),
[BASEMENT_REFERENCE_GAP_PROPOSALS.md](BASEMENT_REFERENCE_GAP_PROPOSALS.md) +
[BASEMENT_REFERENCE_INSERT_CANDIDATES.md](BASEMENT_REFERENCE_INSERT_CANDIDATES.md) (sources, codes,
checklists), [MAPPER_IMPLEMENTATION_STATUS.md](MAPPER_IMPLEMENTATION_STATUS.md) (system status)._
