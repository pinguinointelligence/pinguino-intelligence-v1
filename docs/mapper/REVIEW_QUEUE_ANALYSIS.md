# Review Queue Analysis — the unmapped products

_Recomputed 2026-06-30. All originally-55 `null` products are composition-complete (≥4 measured
fields + an EAN) — the blocker is candidate ambiguity / red flags / missing references, never
missing data._

## Post-tiebreaker re-audit (2026-06-30) — simulated on LIVE composition data
After wiring `productNameTiebreak` into the matcher, the live composition pools were re-simulated
(SQL replicating `byComposition` + the deterministic concept scorer). Effect on the broad-ambiguous set:
- **Unique narrow (concept_hits = 1 → matcher narrows the pool to one suggestion):** Chocolate blanco
  ×2 (→ the lone white-chocolate ref), Fresas (strawberry, **pool 38 → 1**), Arándanos (blueberry, **41 → 1**).
- **Shortlist ranked (concept_hits > 1 → the right sub-class floats to the top, stays ambiguous for a
  human pick):** Yogur griego ×4 (greek refs), Chocolate con leche ×2 (milk-choc refs), Chocolate negro
  72% (7 dark refs ranked above the rest), Pistacho (2 pistachio refs over 2 peanut).
- **Correctly NOT narrowed (concept_hits = 0 → no name evidence):** almonds ×3 (no almond ref → never
  false-narrow to peanut ✓), plain milks (composition-dominant; "entera/semi" is fat level, not a concept),
  sweeteners (no erythritol/stevia/saccharin ref), protein drinks, composites.

### Decisions executed this block (2 confirmations — DB write)
Both are genuinely unambiguous (the basement holds exactly ONE strawberry ref and ONE blueberry ref;
composition + name agree; nothing else of that fruit exists):
- **PR-ING-000046 Fresas enteras → PI-ING-000406 (Wild Strawberry)** — `matched` / `manual_mapping` / `high` / `pi_generated`.
- **PR-ING-000047 Arándanos → PI-ING-000347 (Blueberry)** — same. Reference-linked; **product pac/pod stay null**.
### Decisions executed (2026-06-30, ranked-shortlist pass) — 2 more confirmations
- **PR-ING-000024 & 000025 Chocolate blanco → PI-ING-000142 (White Chocolate 30%)** — `matched`/`manual_mapping`/`high`/`pi_generated`. The unique white-chocolate within the 7-candidate composition pool; product 35/55/55/6.5/0.2 vs ref 36.1/55/54.6/6/0.21 (Δ0.4-0.6). Reference-linked; **pac/pod null**.
- **Parked with reasons:** Greek yogurts 000016/017 → the only greek ref ("Greek Yogurt — Standard") is **7.5% fat vs the product's 10.8%**; since the engine handoff borrows the *reference's* composition, that would understate fat by 3.3pp → wait for a full-fat greek ref (a new reference gap). 000018/019 (light greek 2%) — no close greek ref either. Milk choc 000026/027 (4-6 equivalent refs), dark choc 000028 (7 dark refs, % matters), pistachio 000035 (raw nut vs 2 paste refs) — all left for human review (the workstation surfaces the ranked sub-class).

Now: **51 null · 15 matched · 15 Studio-eligible.** New reference gap noted: **full-fat (≈10%) greek yogurt**.

### Decisions executed (2026-06-30, milk/dark/pistachio pass) — 1 more confirmation
- **PR-ING-000027 Chocolate con leche fundir → PI-ING-000122 (Milk Chocolate Couverture)** — the clearest milk-chocolate in the pool (Δ0.69; next milk-choc Δ1.70, a 2.5× gap) and semantically apt ("fundir"=for-melting=couverture). Reference-linked; **pac/pod null**.
- **Parked:** 000026 milk choc (3-way tie at Δ1.28); 000028 dark choc (**percent-level ambiguous** — 7 dark refs at 70.5/72/74%); 000035 pistachio (2 close paste/pulp refs vs a raw nut). → **50 null · 16 matched · 16 Studio-eligible.**

### Coffee — RESOLVED (2026-07-05): scoped special-case pool + 4 confirmations
The category-mapping limitation (coffee refs in `coffee_tea` → approx→`flavor` → excluded from exact
pooling) is **fixed** by a narrow matcher special-case: an exact-`flavor` product whose NAME carries the
coffee concept ALSO pools `coffee_tea` references whose name carries the coffee concept — tea refs and
generic flavor products stay excluded; no other approximate category is affected (`3fcc432`).
- **False friend discovered:** `PI-ING-000168 "Grain Coffee — Standard"` (fat 0.2 / carb **79** / sugars 12)
  is a roasted-CEREAL coffee **substitute**, not coffee beans — so "café en grano" (beans) must never map
  to it. The tiebreaker deliberately has **no grano/grain concept**; a coffee-gated `ground_form`
  (molido→ground) distinguishes the real ground-roast ref.
- **Confirmed (4):** 000064 & 000065 (grano) + 000066 & 000067 (molido) → **PI-ING-000166 Coffee Bean
  Roasted Ground** — the only REAL roasted-coffee reference (whole-vs-ground form doesn't change the
  per-100g profile; instant + cereal substitute excluded by class). Reference-linked; pac/pod null.
- **Parked:** 000068 "Café molido mezcla Espresso" — *mezcla* = natural+**torrefacto** blend (sugar-glazed
  roast); its real composition differs from the pure-roast ref and can't be quantified from the label.
Vanilla 000069 stays parked separately: a zero-composition **aroma** vs vanilla **paste** refs (form mismatch).

→ After this block: **46 null · 20 matched · 20 Studio-eligible.**

### Milk fat-band — RESOLVED for 3 products (2026-07-05)
A deterministic **fat-band** helper (`productMilkFatBand`, wired into `matchProduct`) maps a declared
milk type to a band (whole 3.0–3.8 · semi 1.0–1.8 · skim 0–0.5) checked against the refs' STORED fat;
narrowing happens only when exactly one milk-named ref is in-band; lactose-free/fortified never band.
- **Confirmed (3):** 000003 semidesnatada (1.55) → **PI-ING-000234 Milk 1.5%** (the ONLY semi-band ref;
  the 2% ref is out of band); 000002 + 000005 entera (3.6) → **PI-ING-000236 Milk 3,5%** (fat-closest
  whole ref, Δ0.046 vs 0.106; all three whole-band refs carry **identical engine values** pac 5.285 /
  pod 0.752, so the pick cannot alter recipe math). Reference-linked; pac/pod null.
- **Parked with reference gaps:** 000004 desnatada — **no liquid skimmed-milk ref exists** (everything
  under 1.6 fat is powder/concentrate) → proposal `skim_milk`; 000007/000008 sin lactosa — hydrolysed
  lactose (glucose+galactose) has different freezing/sweetness behaviour, so a regular-milk ref must
  not represent them → proposal `lactose_free_milk`; 000009 +Proteínas — red-flag (fortified).

→ After this block: **43 null · 23 matched · 23 Studio-eligible.**

### Human-pick review pass (2026-07-05) — ZERO safe confirms; 3 new gaps staged
Full side-by-side review of every remaining shortlist found **no candidate meeting the clear-evidence
bar** — each has a hard blocker, three of them newly-confirmed missing references (now staged):
- **000014 Yogur natural** — the class-correct "Natural Yogurt — Standard" (2/5.4/3.6/4.7) mismatches
  the product (3/4.5/4.5/3.5) on fat/protein/sugars (Δ0.81); the closer Greek-Type (Δ0.58) is a
  strained profile (sugars 2.7 vs 4.5 — PAC/POD-relevant) → **gap `plain_yogurt_whole`**.
- **000022/000023 Kéfir** — closest ref is a *yogurt* (Δ0.34) — wrong fermented class; no kefir ref →
  **gap `kefir`**.
- **000033 Cacao puro** — **no pure cocoa-powder reference exists** (only couvertures/compounds/cocoa
  butter; zero candidates within tolerance) → **gap `cocoa_powder`**; 000034 a-la-taza is a sweetened
  drinking mix (composite) → parked.
- **Percent helper deliberately SKIPPED**: its only use-case (000028, "72%") has TWO exact-72% refs
  (Barima + Vanini) → the helper cannot uniquely narrow its only target; documented instead of coded.
- 000026 (3-way tie), 000035 (raw vs roasted paste, two near-equidistant refs), 000021 (lactose-free)
  → parked unchanged.

### Tie re-check (2026-07-05, engine-value evidence) — the parked ties are CONSEQUENTIAL
The whole-milk precedent (confirmed because all in-band refs carried IDENTICAL pac/pod — a
consequence-free pick) was tested against the two parked ties. It FAILS for both:
- **000026 milk-choc trio**: near-identical compositions but **POD 44.04 / 48.24 / 48.41**
  (pac 56.9–57.3) — the pick shifts recipe sweetness by ≈4.4 POD points. → Owner decision:
  which supplier couverture profile (Pi-Nuts 558 · Sicao 86A · Sicao 575) represents Hacendado
  milk chocolate.
- **000035 pistachio pair**: pac 7.02/pod 7.0 (Delipaste) vs pac 7.86/pod 7.8 (Roasted Pulp
  100%) — a real ≈0.8 engine spread PLUS the raw-natural vs roasted-paste form difference.
Neither can be auto-picked or Claude-picked safely; both stay parked as **owner-taste decisions**.

### Consistency-review flag (2026-07-05 audit) — PR-ING-000029
**PR-ING-000029 "Chocolate negro 85% cacao" is CONFIRMED → PI-ING-000089 "Bitter Chocolate Power
80% Callebaut"** — an early-session manual confirmation that predates the stricter dark-chocolate
percent standard which later parked 000028 (72% with 70.5/72/74 options). A 5-point cocoa-% gap was
accepted there that would likely be parked today. **Not unsafe** (reference-linked only; product
pac/pod null; the mapping is auditable in `mapper_notes`) and **not changed** — but it should be
re-examined WITH the owner alongside the 000028 pick so one percent standard applies to both.

## Remaining 43-null grouping (recomputed 2026-07-05)
| group | products | state |
|---|---|---|
| milk variant gaps | 000004 (skim), 000007/000008 (lactose-free) | blocked on `skim_milk` / `lactose_free_milk` proposals |
| greek yogurt gap | 000016/000017 (full-fat), 000018/000019 (2% ligero) | blocked on `greek_yogurt_full_fat` (+ a light variant) |
| cultured dairy | 000014 yogur natural (gap `plain_yogurt_whole`), 000021 sin-lactosa yogurt (lactose-free), 000022/000023 kéfir (gap `kefir`) | blocked on staged proposals — team pac/pod |
| protein red-flags | 000009, 000045, 000051/052/053/055/056 | never auto-verify; parked |
| chocolate percent/tie | 000026 (3-way milk-choc tie), 000028 (7 dark refs 70.5–74%) | human pick |
| cocoa powders + creams | 000033 (gap `cocoa_powder`), 000034 sweetened mix, 000037/038/039 creams | gap staged / composite |
| pistachio | 000035 | raw nut vs 2 paste refs — human pick |
| almonds | 000040/041/042 | blocked on `almond` proposal |
| fruit blends + 0% jams | 000048/049/050, 000057/058/059 | composite / red-flagged |
| sweeteners | 000060/061/062/063 | blocked on polyol/high-intensity proposals + red-flagged |
| coffee remainder | 000068 torrefacto | compositional variant — parked |
| vanilla | 000069 | aroma vs paste form mismatch |

## Buckets (with next action)

## Buckets (with next action)

### 1. Missing basement reference — BLOCKED until a reference is added (approval-gated)
| products | needs | note |
|---|---|---|
| PR-ING-000040, 000041, 000042 (almendra sin piel / natural / molida) | **almond** reference (`nut` + `almond_*`) | composition researched (USDA FDC 170567); pac/pod team-only |
| PR-ING-000060 (eritritol+sucralosa), 000062 (granulado stevia+eritritol) | **erythritol** + **sucralose**/**stevia** references | also red-flagged |
| PR-ING-000061 (stevia pastillas) | **stevia** reference | also red-flagged |
| PR-ING-000063 (sacarina sobres) | **saccharin** reference (A pure vs B bulked) | also red-flagged |
| PR-ING-000032 (choc 85% edulcorante) | **maltitol/polyol** reference | also red-flagged |
**Action:** add the references (see [BASEMENT_REFERENCE_GAP_PROPOSALS.md](BASEMENT_REFERENCE_GAP_PROPOSALS.md)) — needs the owner + team-calibrated pac/pod. The tiebreaker can't help until the reference exists.

### 2. Red-flag blocked — mapping may proceed but **never auto-verifies** (at most PI Generated)
PR-ING-000009 (+Proteínas milk), 000045 (peanut protein powder), 000051/052 (protein puddings),
000053/055/056 (protein dairy drinks/desserts), 000033 (cacao 0% azúcares), 000057/058/059 (0% jams),
plus the sweeteners in bucket 1. **Action:** leave parked — a protein dessert / sweetener has no clean
single reference and must not reach PI Verified. Surfacing them in the picker would require a mapping
that doesn't yet exist; not safe to force.

### 3. Broad-ambiguous — the **name tiebreaker would help** disambiguate
| group | products | how the tiebreaker helps |
|---|---|---|
| chocolates | 000024/025 (blanco), 000026/027 (con leche), 000028/030 (negro) | `negro`→dark, `blanco`→white, `con leche`→milk-chocolate concepts rank the correct chocolate reference above the others |
| cacao powder | 000034 | `cacao`→cocoa concept |
| coffee | 000064/065/066/067/068 | `cafe`→coffee concept ranks coffee/flavor refs |
| vanilla | 000069 | `vainilla`→vanilla concept |
**Action:** wire `productNameTiebreak` (committed, pure) into the matcher's candidate ranking as a
TIE-BREAK over composition candidates (next block). It only reorders plausible candidates — never
creates a match.

### 4. Broad-ambiguous — **composition-dominant** (tiebreaker limited)
Milks 000002/003/004/005/007/008 (entera/semi/desnatada/sin lactosa) and yogurts/kéfir
000014/016/017/018/019/021/022/023. The tiebreaker maps `leche`→milk / `yogur`→yogurt but does NOT
encode the fat-level (entera vs semi vs desnatada) that actually discriminates — that is composition,
which the matcher already uses. **Action:** rely on the composition matcher; where ≥2 references sit
within tolerance, a brief manual review (fat level) decides. Not safe to auto-confirm.

### 5. Composite / no clean single reference
Cocoa-hazelnut creams 000037/038/039 (nut + cocoa + sugar + oil), fruit blends 000048/049/050
(multi-fruit), pistachio 000035 (pick-which-pistachio). **Action:** manual review or a composite-profile
feature (deferred); a single basement reference cannot represent a blend.

### 6. No source data
**None** — all 55 are composition-complete.

## Enrichment applicability
OFF returns 404 for Hacendado private-label EANs, so online enrichment makes **none** of the 55 newly
decidable. Branded items (Asturiana milk 000005, La Chocolatera cacao 000033) *might* be in OFF, but
they already sit in buckets 2/4 and enrichment wouldn't change their mapping.

## Summary of next actions
1. **Add basement references** (bucket 1) → unlocks ~12 products' mappings (approval + team pac/pod).
2. **Wire the name tiebreaker** (bucket 3) → disambiguates ~8 chocolate/coffee/vanilla products.
3. **Manual fat-level review** (bucket 4) → the milks/yogurts, one quick human pass each.
4. **Leave parked** (buckets 2, 5) → red-flag/composite items with no clean reference.
**No product decisions were executed this block** — none is cleanly + safely decidable yet.

## Product-Intelligence resolver note (2026-07-06 — pure layer landed, UNWIRED)
The PI audit + owner rule amendment produced `data/products/productIntelligenceResolver.ts`
(class-anchored derivation, ephemeral values, never persisted). **If the owner later activates it
in live flows**, the KEY parked rows re-classify as follows — rows not listed fall to
`no_safe_class_rule` / composite blocks (ties 000026/000028/000035, creams/blends 000037–039,
fruit blends 000048–050, jams 000057–059; the light greeks 000018/000019 likely block on anchor
distance) — nothing auto-resolves, and no product decision is changed by the resolver's existence
alone:
- **000004 desnatada** → `pi_calculated` candidate via `milk_fat_series_v1` (extrapolated below
  the 1.6–3.5 anchor range → low confidence, explicit warning; refused beyond a 1.5 pp margin) —
  the `skim_milk` reference proposal remains the higher-quality path.
- **000014 yogur natural** → `pi_calculated` candidate via `plain_yogurt_class_anchor_v1`
  (same-class anchor ≤1.0 pp; milks/condensed milk are never yogurt anchors).
- **000016/000017 greek** → `pi_calculated` candidate via `greek_yogurt_fat_variant_v1`
  (fat-variant warning; owner may still add the dedicated 10% basement variant).
- **000022/000023 kéfir** → `pi_calculated` candidate via `kefir_fermented_dairy_v1`
  (≤0.75 pp anchor + mandatory fermentation warning), else stays parked.
- **000040/041/042 almond** → `pi_generated` label staging (composition only, NOT engine-ready —
  pac/pod still owner-calibrated via the `almond` proposal).
- **STILL HARD-BLOCKED (tested):** 000007/000008 sin lactosa + 000021 sin-lactosa yogurt ·
  000060–000063 sweeteners/polyols · 000009/045/051/052/053/055/056 protein products ·
  000033 cocoa (red-flag name claim — proposal path) · 000034 a la taza (composite) ·
  000068 torrefacto · 000069 vanilla aroma. (000054 is a rejected mapping, not a parked row.)
