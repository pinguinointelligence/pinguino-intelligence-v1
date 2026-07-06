# PI Calculated — Owner Review Pack

_2026-07-06 · a decision document for whether to activate the 4 class-derived **PI Calculated**
candidates the ProductIntelligenceResolver produced. **This is a review pack, not an action.**
Nothing here writes to Supabase, `mapper_basement`, product PAC/POD, or product status; no live
Studio wiring is proposed for execution — only for your approval._

**How these numbers were produced:** the pure `productIntelligenceResolver` (class-anchored
derivation) run over the live 69 products via `productIntelligenceSimulation`, viewable at
`/dev/product-intelligence-preview`. The engine values below are **ephemeral** — computed at
preview time, held only in memory, never persisted. Reproduce them any time from the DEV page.

**Simulation summary (unchanged):** 23 reference_linked · **4 pi_calculated** · 3 pi_generated
(label-staged) · 39 blocked · 27 engine-ready total. Live DB is untouched: product PAC/POD **0/69**.

---

## 1. The 4 PI Calculated candidates — your decision

All four are currently `null` mapper_status / `draft` lifecycle. The resolver would (if activated)
class-derive engine values from **calibrated same-class anchors** — never from the product's own
sugar line, never copied onto the product.

| PR-ING | Product | Rule | Confidence | Basis reference(s) | Ephemeral PAC | Ephemeral POD | Key warning | Why the resolver thinks it is safe | Why your approval is still needed | Recommended action |
|---|---|---|---|---|---|---|---|---|---|---|
| **000004** | Leche desnatada Hacendado brick 1L | `milk_fat_series_v1` | **low** | 5 liquid-milk anchors: `PI-ING-000200` Fresh Milk 2%, `000201` Fresh Milk 3,2%, `000234` Milk 1.5%, `000235` Milk 3,2%, `000236` Milk 3,5% | **5.19** | **0.71** | Label fat 0.3 % is **outside** the anchor fat range 1.6–3.5 % → **extrapolated** (within the 1.5 pp margin); confidence reduced | Skim milk is the same chemistry class as the calibrated liquid-milk series (only fat differs); nearest anchor sits 0.34 pp away in composition | The value is **extrapolated below** the calibrated range, so it is an estimate, not a measurement; a dedicated skim-milk reference (proposal `skim_milk`) would be exact | **Approve as low-confidence PI Calculated, OR keep the `skim_milk` calibration proposal** (owner call) |
| **000014** | Yogur natural Hacendado pack 6 | `plain_yogurt_class_anchor_v1` | **medium** | `PI-ING-000297` Yogurt 5% — Standard | **6.17** | **0.80** | Ephemeral · never PI Verified without independent provenance | Same-class yogurt anchor at 0.64 pp mean composition distance; milks / condensed milk are never yogurt anchors (class-gated) | Adopts a 5 %-fat anchor's values for a 3 %-fat product; sound within the fermented-dairy class but still an adoption, not a measurement | **Approve as medium-confidence PI Calculated** (strongest of the four); calibration proposal optional |
| **000022** | Kéfir natural sabor suave Hacendado bote | `kefir_fermented_dairy_v1` | **low** | `PI-ING-000240` Natural Yogurt 3.5%, Greek Type Suprima | **3.285** | **0.432** | **FERMENTATION WARNING**: kefir grains ≠ yogurt cultures — the residual-sugar split differs; team confirmation still wanted | Closest fermented-dairy anchor at 0.34 pp (≤ the stricter 0.75 pp kefir gate); the low-residual-sugar anchor matches kefir's fermented sugar profile well | Kefir is a **different fermentation** than yogurt; the anchor is a strained greek-type yogurt, so the culture/sugar split is an approximation | **Approve as low-confidence PI Calculated with the fermentation caveat, OR keep the `kefir` proposal** |
| **000023** | Kéfir bebible Hacendado | `kefir_fermented_dairy_v1` | **low** | `PI-ING-000240` Natural Yogurt 3.5%, Greek Type Suprima | **3.285** | **0.432** | same as 000022 (identical composition) | same as 000022 | same as 000022 | same as 000022 |

**Reading the confidence:** `medium` = same-class anchor adopted within the safe distance;
`low` = either extrapolated beyond the calibrated range (skim milk) or a cross-culture approximation
(kefir). None is `high` — `high` is reserved for a confirmed reference link or an own lab measurement.

---

## 2. The 3 label-staged almonds — NOT a PI Calculated decision

These reached `pi_generated` (label composition staged) but are **not engine-ready** — the resolver
never invents pac/pod. They are listed here only so it's clear they are **not** part of the
activation decision above.

| PR-ING | Product | Resolver outcome | Why NOT engine-ready | What is still missing | Calibration proposal required? |
|---|---|---|---|---|---|
| **000040** | Almendra natural Hacendado sin piel paquete | `pi_generated` (`nut_species_label_v1`) | pac/pod are never guessed from a label; there is no almond reference to link or derive from | the calibrated **PAC + POD** for almond (team process) | **Yes** — `almond` proposal stays required |
| **000041** | Almendra natural Hacendado paquete | `pi_generated` (`nut_species_label_v1`) | same | same | **Yes** |
| **000042** | Almendra molida Hacendado paquete | `pi_generated` (`nut_species_label_v1`) | same | same | **Yes** |

Label composition is staged (species-exact, never adopted from another nut), but engine-readiness
waits on owner-calibrated PAC/POD via the existing `almond` reference proposal.

---

## 3. Do NOT activate automatically

Activation is an **explicit owner decision per candidate**, not a batch switch. Specifically:

- **Skim milk (000004) requires owner acceptance of an extrapolated estimate** — its fat (0.3 %)
  is below the calibrated anchor range, so the value is interpolated off the low end. Low confidence.
- **Kefir (000022/000023) carries a fermentation warning** — the anchor is a yogurt, not a kefir.
  Accepting it means accepting a cross-culture approximation until the team confirms the profile.
- **Almonds (000040/041/042) are NOT engine-ready** — they must not be treated as PI Calculated;
  they still need owner-calibrated PAC/POD.
- **Lactose-free / sweeteners / polyols / protein / composites / torrefacto remain hard-blocked** —
  no rule may derive them; they stay parked for calibration or owner decision.
- **Product PAC/POD must remain NULL** — even after activation, class-derived values are resolved
  at handoff time and are **never** written onto the product row (0/69 stays 0/69).

---

## 4. What activation would do (the wiring slice — NOT executed here)

If you approve, the follow-up slice (its own gated block) would:

- Add a `class_derived` branch to `productEngineLibrary` / `prepareProductEngineIngredient` so an
  approved PI Calculated product becomes an engine ingredient built from the **basis reference's
  composition** with the **class-derived PAC/POD** at calculation time.
- Show a distinct Studio provenance label: **"PI Calculated · class-derived · not independently
  measured"** (with the confidence and, for kefir, the fermentation caveat).
- Persist `pi_calculated` status **only** through the guarded `setProductLifecycleStatus` service
  (never a broad update; never auto-verify).
- Write the `rule_id` + `basis_reference_ids` into `review_notes` as the provenance audit.
- **Not** copy PAC/POD onto the product (they stay NULL; values resolve at handoff).
- **Not** write `mapper_basement` (the locked reference base is untouched).

Everything else (reference_linked, blocked) behaves exactly as today.

---

## 4a. Live-wiring preview — the gated activation mechanism (built, not executed)

The activation mechanism is now staged as **pure, gated code** so you can see the exact artifacts
before approving. It executes nothing.

- **Planner:** `src/data/products/productActivationPlan.ts` (`planClassDerivedActivations`) builds,
  per class-derived PI Calculated candidate: the `class_derived` EngineIngredient
  (`buildClassDerivedEngineIngredient` — the exact branch that would slot into
  `prepareProductEngineIngredient`: composition borrowed from the nearest-fat same-class anchor,
  PAC/POD overridden with the class-derived values, `is_verified: false`, external source), the
  Studio provenance label, the status-update **plan**, and the `review_notes` string.
- **The approval gate:** `APPROVED_PI_CALCULATED_CODES` — an **empty allowlist by default**. A plan
  is `approved` (i.e. would become live) ONLY if its `PR-ING` code is in that list. Empty ⇒
  nothing activates. Populating it is part of the real activation slice, not this preview.
- **DEV preview:** `/dev/product-intelligence-preview` (resolver outcomes) and
  **`/dev/pi-calculated-activation-preview`** (the per-candidate activation plan + "APPROVED /
  NOT APPROVED" badge). Both read-only; neither writes.
- **Live `productEngineLibrary` / `prepareProductEngineIngredient` are UNCHANGED** — Studio behaves
  exactly as today; the branch is designed + tested + previewed, ready to drop in on approval.

### review_notes format (written to `products.review_notes` only, by the real slice)

```
PI Calculated (class-derived) · rule=<rule_id> · confidence=<low|medium> ·
composition_basis=<PI-ING-…> · pacpod_basis=<PI-ING-…/…> ·
pac=<n> pod=<n> (ephemeral — not written to product) · warnings: <…>
```

Worked example (000004 skim milk): `PI Calculated (class-derived) · rule=milk_fat_series_v1 ·
confidence=low · composition_basis=PI-ING-000234 · pacpod_basis=PI-ING-000200/000201/000234/000235/000236
· pac=5.19 pod=0.71 (ephemeral — not written to product) · warnings: Label fat 0.3 lies OUTSIDE the
anchor fat range 1.6–3.5 …`

### Verification plan — proof product PAC/POD stays NULL

The activation slice must prove, at every layer, that no product engine value is ever persisted:
1. **Before:** read-only DB check — `count(*) where pac_value is not null or pod_value is not null`
   = **0/69** (recorded here 2026-07-06).
2. **Plan layer:** every `ClassDerivedActivationPlan` carries `product_pac_after: null` /
   `product_pod_after: null` **by construction** — asserted in `productActivationPlan.test.ts`.
   The derived PAC/POD live ONLY on the ephemeral `EngineIngredient`, never on a product patch.
3. **Write layer:** the ONLY write the slice performs is `setProductLifecycleStatus`, which updates
   **only** `status` + `reviewed_by/at/review_notes` (proven by `productStatusWrite` + its tests) —
   it cannot touch pac/pod. The generic `updateProduct` path additionally **type-excludes and
   runtime-strips** `pac_value`/`pod_value` (`STRIPPED_ENGINE_FIELDS`), so no code path can set them.
4. **After:** re-run the same read-only check → must still be **0/69**. If it is not, the activation
   is rejected and rolled back.
5. **`mapper_basement`:** untouched — no insert/update; count stays 542.

---

## 5. Approval checklist

Tick each to authorize the wiring slice. Any unticked item stays as-is (candidate remains
preview-only / on the calibration path).

- [ ] Owner accepts the **skim milk** low-confidence fat-series **interpolation** (000004) — or prefers the `skim_milk` calibration proposal instead.
- [ ] Owner accepts the **plain yogurt** medium-confidence anchor adoption (000014, from Yogurt 5%).
- [ ] Owner accepts the **kefir** fermented-dairy derivation **with its fermentation warning** (000022/000023).
- [ ] Owner accepts the **confidence levels** as presented (medium ×1, low ×3) being shown in Studio.
- [ ] Owner accepts the **Studio label wording**: "PI Calculated · class-derived · not independently measured".
- [ ] Owner accepts that **no product PAC/POD is persisted** (values stay ephemeral / resolved at handoff; product columns stay NULL).
- [ ] Owner confirms **almonds stay on the calibration proposal** (not activated as PI Calculated).

**Decision routing:** approve all → the wiring slice proceeds for all four. Approve a subset →
only the ticked candidates are wired; the rest stay preview-only. Approve none → nothing changes;
the `skim_milk` / `plain_yogurt_whole` / `kefir` proposals stay as the calibration path.

---

_Backing detail: [MAPPER_IMPLEMENTATION_STATUS.md](MAPPER_IMPLEMENTATION_STATUS.md) (preview note),
[PACPOD_ENGINE_HANDOFF_PLAN.md](PACPOD_ENGINE_HANDOFF_PLAN.md) (amendment + handoff answers),
[REVIEW_QUEUE_ANALYSIS.md](REVIEW_QUEUE_ANALYSIS.md) (confirmed outcomes),
[OWNER_TEAM_CALIBRATION_HANDOFF.md](OWNER_TEAM_CALIBRATION_HANDOFF.md) (proposal impact)._
