# GELLATTI — MILES MACHINE SPEC RECONCILIATION (§24, §25)

**Workstream:** WORK WITH US · rows `L-PRICE-01`, `L-SPEC-01`, `L-SPEC-02`, `L-SPEC-03`, `N-V4B-FIT`
**Date:** 2026-08-31 · **Base:** `origin/staging` @ `c004d659`

## Sources of record

| Ref | Document | Nature | Extractable? |
| --- | --- | --- | --- |
| **Q** | `Miles ice cream machine price list.pdf` — QUOTATION, Hangzhou Gelato Tech Co., Ltd (milestac.com), 12 line items, **EXW China** | Commercial quotation to the owner | ✅ text |
| **B** | `Miles international catalog.pdf` — *Miles Galaxy Pro* international catalogue, per-model "DETAILED INFO" pages | Manufacturer marketing brochure | ⚠️ image-only; read by rendering |
| **M** | `MILES MilanoV1&2.pdf` | Milano-series brochure — **carries full spec pages for Milano V1 (p.2) and Milano V2 (p.4)** | ⚠️ image-only; read by rendering |
| **E** | `THE GELATO EV.pdf` | DC Gelato Cart brochure + real deployment photography | ⚠️ image-only; read by rendering |
| **D** | Owner trailer drawing (3.5 × 2.1 m layout) | Owner-supplied technical drawing | image |

Brand: **Miles®** ("REDEFINE THE BEST"), series **GALAXY PRO**. Manufacturer of record is
Hangzhou Gelato Tech Co., Ltd, with stated factories in China, Italy and the USA. Certifications
shown on every model page: CE · RoHS · MOCA · ETL · NSF · KC · PSE. Core component suppliers named
in the catalogue: Secop (compressor, Germany), ebm-papst, SKF, Honeywell, Danfoss, DuPont, Castel,
Celanese, Carel, Motovario, Mean Well.

---

## 1. Price authority — VERIFIED ✅ (`L-PRICE-01`)

Owner rule: Gellatti working sell price = supplier purchase price × 2. **All 11 owner prices
reproduce the quotation exactly.** UFO Ice-cream Sandwich Press (Q line 12, €380) is correctly
excluded per owner instruction.

| Model | Q EXW price | ×2 | Owner's stated Gellatti price | Verdict |
| --- | --- | --- | --- | --- |
| PRO V1 Café Specialty | €3,000 | €6,000 | €6,000 | ✅ |
| PRO V1 Milano | €1,895 | €3,790 | €3,790 | ✅ |
| PRO V2 Milano | €3,750 | €7,500 | €7,500 | ✅ |
| PRO V2 | €3,985 | €7,970 | €7,970 | ✅ |
| PRO V4 | €7,700 | €15,400 | €15,400 | ✅ |
| PRO V4B | €7,700 | €15,400 | €15,400 | ✅ |
| PRO V6 | €12,000 | €24,000 | €24,000 | ✅ |
| PRO V8 | €16,500 | €33,000 | €33,000 | ✅ |
| PRO V2C | €4,500 | €9,000 | €9,000 | ✅ |
| PRO V4C | €9,250 | €18,500 | €18,500 | ✅ |
| DC Battery Cart | €6,450 | €12,900 | €12,900 | ✅ |

**Commercial caveat for public copy (`L-PRICE-02`):** the quotation is **EXW China**. These are
equipment base prices only — freight, import duty, destination VAT and installation are *not*
included. Public wording must say transport and destination tax are settled in the final quote.
Do not publish a delivered price.

---

## 2. Model-by-model reconciliation

Legend — **Authority**: `Q+B` both agree · `BLOCKED` sources conflict · `Q only` / `B only` single source.

### 2.1 The systematic finding

Across every Galaxy Pro model that appears in both sources, the conflicts are **not random**. The
DC Battery Cart (a different series, documented in a different brochure) is the control case:

| Field | Behaviour across all 11 reconciled models | Publish? |
| --- | --- | --- |
| Dimensions (W×D×H) | **Q and B agree exactly, every model** | ✅ YES |
| Production capacity (cups/80 g/h) | **Q and B agree exactly, every model** | ✅ YES |
| Initial batching time | 12–18 min in both, every model | ✅ YES |
| Cooling type / refrigerant | Air cooling / R290 in both, every model | ✅ YES |
| Capacity per batch | Q gives max only; B gives max **and** minimum — compatible, B is richer | ✅ YES (use B) |
| **Weight** | Disagrees on the 7 Galaxy Pro floor/cart units (+7 to +51 kg) and the DC Cart. **Agrees exactly on Café Specialty (69), Milano V1 (54), Milano V2 (79)** | ❌ OMIT for the 8 · ✅ publish for the 3 countertop units |
| **Peak power** | Disagrees on the 7 Galaxy Pro floor/cart units (+500 to +2000 W) and Milano V2 (950 vs 1200). **Agrees on Café Specialty (950), Milano V1 (950), DC Cart (1300)** | ❌ OMIT for the 8 · ✅ publish for the 3 |
| **Power supply** | Agrees on every model **except V6 and V8** | ⚠️ per-model |

With all 11 models reconciled the pattern is sharper than it first appeared, and it splits by
product line rather than by field:

- **The three small countertop units — Café Specialty, Milano V1, Milano V2 — agree with the
  quotation on weight**, and two of them agree on peak power too. Café Specialty agrees on
  *every single field*.
- **The seven Galaxy Pro floor and canopy units disagree on both weight and peak power**, always
  with the brochure higher.
- The DC Cart sits between: peak power agrees, weight does not.

So this is not one uniform documentation difference. It is most consistent with the Galaxy Pro line
using a different weight and power convention in the two documents (plausibly nett vs. gross, and
rated vs. absolute peak draw), **plus** a handful of outright copy errors in the quotation for the
small models — §2.4 demonstrates one transposition and one duplicated value.

§25 forbids silently choosing, so the disputed fields stay withheld for the eight affected models.
Where both sources agree the field is published. Overall the **brochure is the better authority for
spec fields and the quotation is authoritative for price**.

### 2.2 Evidence table

#### PRO V2 — *Galaxy Pro V2* (B p.20)

| Field | Q (quotation) | B (brochure) | Selected public authority | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 720 × 600 × 885 mm | 720 × 600 × 885 mm | **720 × 600 × 885 mm** (Q+B) | High | — |
| Power supply | 16 A 1-ph 220 V 50/60 Hz | 16 A 1-ph 220 V 50/60 Hz | **16 A / 230 V single phase** (Q+B) | High | — |
| Capacity per batch | max 3 L | max 3.0 L / min 1.5 L | **3.0 L max, 1.5 L min** (B) | High | — |
| Batching time | 12–18 min | 12–18 min | **12–18 min** (Q+B) | High | — |
| Production | 250 cups/80 g/h | 250 cups/80 g/h | **250 cups/h** (Q+B) | High | — |
| Weight | 133 kg | 150 KG | **WITHHELD** | — | ⚠️ 17 kg |
| Peak power | 1400 W | 1900 W | **WITHHELD** | — | ⚠️ 500 W |

#### PRO V4 — *Galaxy Pro V4-A* (B p.21)

| Field | Q | B | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 1000 × 800 × 910 mm | 1000 × 800 × 910 mm | **1000 × 800 × 910 mm** | High | — |
| Power supply | 16 A 1-ph 220 V | 16 A 1-ph 220 V | **16 A single phase** | High | — |
| Capacity per batch | max 3 L | max 3.0 L / min 1.5 L | **3.0 / 1.5 L** | High | — |
| Production | 500 cups/80 g/h | 500 cups/80 g/h | **500 cups/h** | High | — |
| Weight | 233 kg | 240 KG | **WITHHELD** | — | ⚠️ 7 kg |
| Peak power | 2800 W | 3800 W | **WITHHELD** | — | ⚠️ 1000 W |

#### PRO V4B — *Galaxy Pro V4-B* (B p.22) — **feeds `N-V4B-FIT`**

| Field | Q | B | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| **Dimensions** | **1370 × 600 × 910 mm** | **1370 × 600 × 910 mm** | **1370 × 600 × 910 mm** | **High — two independent sources agree** | — |
| Power supply | 16 A 1-ph 220 V | 16 A 1-ph 220 V | **16 A single phase** | High | — |
| Capacity per batch | max 3 L | max 3.0 L / min 1.5 L | **3.0 / 1.5 L** | High | — |
| Production | 500 cups/80 g/h | 500 cups/80 g/h | **500 cups/h** | High | — |
| Weight | 233 kg | 240 KG | **WITHHELD** | — | ⚠️ 7 kg |
| Peak power | 2800 W | 3800 W | **WITHHELD** | — | ⚠️ 1000 W |

#### PRO V6 — *Galaxy Pro V6* (B p.23) — ⚠️ **installation-critical conflict**

| Field | Q | B | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 1500 × 800 × 910 mm | 1500 × 800 × 910 mm | **1500 × 800 × 910 mm** | High | — |
| **Power supply** | **20 A single phase 220 V** | **32 A THREE PHASE 380 V** | **BLOCKED — must not be published** | — | 🔴 **Phase and voltage disagree** |
| Capacity per batch | max 3 L | max 3.0 L / min 1.5 L | **3.0 / 1.5 L** | High | — |
| Production | 750 cups/80 g/h | 750 cups/80 g/h | **750 cups/h** | High | — |
| Weight | 309 kg | 360 KG | **WITHHELD** | — | ⚠️ 51 kg |
| Peak power | 4200 W | 5700 W | **WITHHELD** | — | ⚠️ 1500 W |

#### PRO V8 — *Galaxy Pro V8* (B p.24) — ⚠️ **installation-critical conflict**

| Field | Q | B | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 2000 × 800 × 910 mm | 2000 × 800 × 910 mm | **2000 × 800 × 910 mm** | High | — |
| **Power supply** | **32 A single phase 220 V** | **32 A THREE PHASE 380 V** | **BLOCKED — must not be published** | — | 🔴 **Phase and voltage disagree** (amperage agrees) |
| Capacity per batch | max 3 L | max 3.0 L / min 1.5 L | **3.0 / 1.5 L** | High | — |
| Production | 1000 cups/80 g/h | 1000 cups/80 g/h | **1000 cups/h** | High | — |
| Weight | 409 kg | 460 KG | **WITHHELD** | — | ⚠️ 51 kg |
| Peak power | 5600 W | 7600 W | **WITHHELD** | — | ⚠️ 2000 W |

#### PRO V2C — *Galaxy Pro V2C* (B p.25) — mobile cart

| Field | Q | B | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 720 × 600 × 2400 mm | 720 × 600 × 2400 mm | **720 × 600 × 2400 mm** | High | — |
| Power supply | 16 A 1-ph 220 V | 16 A 1-ph 220 V | **16 A single phase** | High | — |
| Capacity per batch | max 3 L | max 3.0 L / min 1.5 L | **3.0 / 1.5 L** | High | — |
| Production | 250 cups/80 g/h | 250 cups/80 g/h | **250 cups/h** | High | — |
| Counter / canopy | — | counter 885 mm; canopy adjustable 1315–1515 mm; base 720 × 400 mm | **B only** | Medium | — |
| Weight | 178 kg | 195 KG | **WITHHELD** | — | ⚠️ 17 kg |
| Peak power | 1400 W | 1900 W | **WITHHELD** | — | ⚠️ 500 W |

#### PRO V4C — *Galaxy Pro V4C* (B p.26) — mobile cart

| Field | Q | B | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 1500 × 800 × 2400 mm | 1500 × 800 × 2400 mm | **1500 × 800 × 2400 mm** | High | — |
| Power supply | 16 A 1-ph 220 V | 16 A 1-ph 220 V | **16 A single phase** | High | — |
| Capacity per batch | max 3 L | max 3.0 L / min 1.5 L | **3.0 / 1.5 L** | High | — |
| Production | 500 cups/80 g/h | 500 cups/80 g/h | **500 cups/h** | High | — |
| Counter / canopy | — | counter 910 mm; canopy adjustable 1290–1490 mm; base 1500 × 500 mm | **B only** | Medium | — |
| Weight | 326 kg | 360 KG | **WITHHELD** | — | ⚠️ 34 kg |
| Peak power | 2800 W | 3800 W | **WITHHELD** | — | ⚠️ 1000 W |

#### DC Battery Cart — *DC Gelato Cart* (E p.14) — **the one model where peak power AGREES**

| Field | Q | E (EV brochure) | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 520 × 760 × 890 mm | 520 × 760 × 890 mm | **520 × 760 × 890 mm** | High | — |
| Power supply | 12 A 1-ph 220 V | 12 A 1-ph 220 V | **12 A single phase** | High | — |
| **Battery** | rechargeable lithium, **8 hours** | **two options: 8 hours OR 12 hours** | **8 h standard; 12 h option** (E is richer) | Medium-High | — (E extends Q, does not contradict it) |
| **Peak power** | **1300 W** | **1300 W** | **1300 W — publishable** | **High** | — |
| Cylinder volume | batch max 2.0 L / min 1.0 L | 5.0 L × 2 cylinders | **2 cylinders** (different measures: cylinder volume ≠ usable batch) | Medium | — |
| Production | 200 cups/80 g/h | 200 cups/80 g/h | **200 cups/h** | High | — |
| Pozzetti | — | **2** | **2** | High | — |
| Weight | 110 kg | 140 KG | **WITHHELD** | — | ⚠️ 30 kg |

**Why this model matters to the pattern:** peak power agrees exactly (1300 W both). The
peak-power discrepancy is therefore specific to the **Galaxy Pro series**, not to Miles
documentation in general. Weight still disagrees here, so the weight discrepancy is the broader
of the two. Question 2 to the manufacturer should be scoped to the Galaxy Pro series.

The EV brochure also shows the cart in real deployments — catering and events, hotels and
resorts, restaurants and bars, café and bakery — with **customer branding applied to the cart's
front panel**. That confirms the front panel is a designed branding surface, which matters for the
trailer/mobile asset briefs.

#### PRO V1 Café Specialty — *Galaxy Pro V1 (Café Speciality)* (B p.19) — **total agreement**

| Field | Q | B | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 580 × 550 × 420 mm | 580 × 550 × 420 mm | **580 × 550 × 420 mm** | High | — |
| Power supply | 10 A 1-ph 220 V | 10 A 1-ph 220 V | **10 A single phase** | High | — |
| **Weight** | **69 kg** | **69 KG** | **69 kg — publishable** | **High** | — |
| **Peak power** | **950 W** | **950 W** | **950 W — publishable** | **High** | — |
| Capacity per batch | max 3 L | max 3.0 L / min 1.5 L | **3.0 / 1.5 L** | High | — |
| Production | 165 cups/80 g/h | 165 cups/80 g/h | **165 cups/h** | High | — |

**Every field agrees.** This is the second control case after the DC Cart, and the stronger one:
weight *and* peak power both match. Branding note for renders: the body carries a "LA GALASSIA"
side graphic in addition to the manufacturer wordmark — **both must be removed**.

#### PRO V1 Milano — *Galaxy Pro Milano V1* (M p.2)

| Field | Q | M (Milano brochure) | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 410 × 540 × **374** mm | 410 × 540 × **365** mm | **410 × 540 mm footprint** (height withheld) | Medium | ⚠️ 9 mm height |
| Power supply | 10 A 1-ph 220 V | 10 A 1-ph 220 V | **10 A single phase** | High | — |
| Weight | 54 kg | 54 KG | **54 kg — publishable** | High | — |
| Peak power | 950 W | 950 W | **950 W — publishable** | High | — |
| Cylinder volume | batch max 2 L | 5.0 L × 1 | **1 cylinder** (different measures) | Medium | — |
| **Production** | **200 cups/h** | **100 cups/h** | **100 cups/h (B)** — see §2.4 | **High after resolution** | ⚠️ resolved |
| Pozzetti | — | **1** | **1** | High | — |

#### PRO V2 Milano — *Galaxy Pro Milano V2* (M p.4)

| Field | Q | M | Selected | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |
| Dimensions | 680 × 540 × **374** mm | 680 × 540 × **365** mm | **680 × 540 mm footprint** (height withheld) | Medium | ⚠️ 9 mm height |
| Power supply | 12 A 1-ph 220 V | 12 A 1-ph 220 V | **12 A single phase** | High | — |
| Weight | 79 kg | 79 KG | **79 kg — publishable** | High | — |
| **Peak power** | **950 W** | **1200 W** | **WITHHELD** | — | ⚠️ 250 W — Q appears to have copied V1's 950 W |
| Cylinder volume | batch max 2 L | 5.0 L × 2 | **2 cylinders** | Medium | — |
| **Production** | **100 cups/h** | **200 cups/h** | **200 cups/h (B)** — see §2.4 | **High after resolution** | ⚠️ resolved |
| Pozzetti | — | **2** | **2** | High | — |

### 2.4 The Milano production anomaly — RESOLVED

The earlier block on Milano output is lifted. With both brochure spec pages in hand:

| Source | Milano V1 | Milano V2 |
| --- | --- | --- |
| Quotation (Q) | 200 cups/h | 100 cups/h |
| Brochure (M) | **100 cups/h** | **200 cups/h** |

**The quotation has the two figures transposed.** The brochure ordering is the coherent one and is
corroborated by the physical hardware: Milano V1 has **one** cylinder and a 10 A supply, Milano V2
has **two** cylinders and a 12 A supply. A machine with twice the cylinders and more current does
not produce half the output.

**Selected authority: the brochure. V1 = 100 cups/h, V2 = 200 cups/h.** This is the one place where
the reconciliation overrides the quotation on a spec field, and it is done on stated evidence rather
than preference. The quotation remains authoritative for **price** (§1), which is unaffected.

The same page also shows the quotation repeating V1's 950 W for V2, where the brochure gives
1200 W — consistent with a copy error in the same block of the quotation. That field stays withheld.
| PRO V1 Café Specialty | 🔴 no spec source besides Q | Q: 580 × 550 × 420 mm, 69 kg, 10 A, 950 W, max 3 L, 165 cups/h |
| PRO V1 Milano | 🔴 Milano brochure has **no spec table** | Q: 410 × 540 × 374 mm, 54 kg, 10 A, 950 W, max 2 L, **200 cups/h** |
| PRO V2 Milano | 🔴 Milano brochure has **no spec table** | Q: 680 × 540 × 374 mm, 79 kg, 12 A, 950 W, max 2 L, **100 cups/h** |

---

## 3. `N-V4B-FIT` — the trailer conflict is REAL, not a quotation typo

| Source | Equipment length | Depth | Height |
| --- | --- | --- | --- |
| Owner trailer drawing (D) — "lodziarka" zone | **1340 mm** | 600 mm | 910 mm |
| Miles quotation (Q) — PRO V4B | **1370 mm** | 600 mm | 910 mm |
| Miles brochure (B p.22) — Galaxy Pro V4-B | **1370 mm** | 600 mm | 910 mm |

**Depth and height match exactly. Length is short by 30 mm, and 1370 mm is confirmed by two
independent Miles sources.** The earlier hope that the quotation might be wrong is now closed: it
is not. The drawing must change, or the adjacent cabinetry must give up 30 mm.

Consequences, per §30:
- The marketing page **may** list V4B as an intended standard trailer option (owner decision).
- The technical floorplan **may not be frozen**, and `Q-ASSET-06` (TRAILER-05 floorplan brief)
  cannot be finalised, until one of the following is proven:
  1. real clear space in the built trailer is ≥ 1370 mm (drawing under-states it), or
  2. adjacent cabinetry can be shortened by ≥ 30 mm without breaking the layout, or
  3. the drawing is truthfully re-issued with a ≥ 30 mm adjustment.

**Recommended next action:** measure the actual clear opening in the physical trailer. The drawing
also shows a 250 mm counter (`blat`) and a 1550 × 700 × 960 mm refrigerator-with-sink zone on the
opposite wall; the 30 mm is most cheaply taken from the cabinetry run rather than from the machine.

---

## 4. What may be published now (`L-SPEC-02`)

All 11 public models are now reconciled against a real manufacturer spec page. Nothing in the
public catalogue rests on a single source any more.

| Model | Publish | Withhold |
| --- | --- | --- |
| **Café Specialty** | dimensions · power supply · **weight** · **peak power** · batch capacity · batching time · production · price | — *(nothing — all fields agree)* |
| **Milano V1** | footprint 410 × 540 · power supply · **weight 54 kg** · **peak power 950 W** · cylinders (1) · batching time · **production 100 cups/h** · price | overall height (365 vs 374) |
| **Milano V2** | footprint 680 × 540 · power supply · **weight 79 kg** · cylinders (2) · batching time · **production 200 cups/h** · price | overall height (365 vs 374) · peak power |
| **V2 · V4 · V4B · V2C · V4C** | dimensions · power supply · batch capacity · batching time · production · price | weight · peak power |
| **V6 · V8** | dimensions · batch capacity · batching time · production · price | weight · peak power · **power supply** |
| **Battery Cart** | dimensions · power supply · **peak power 1300 W** · battery (8 h std, 12 h option) · cylinders (2) · batching time · production · price | weight |

**Never publish without manufacturer confirmation:** weight and peak power for the seven Galaxy Pro
floor/canopy units; weight for the Battery Cart; peak power for Milano V2; overall height for both
Milano models; **power supply for V6 and V8**.

---

## 5. Questions for the manufacturer (owner to forward)

Five questions remain. Two earlier ones are closed.

1. **Weight and peak power on the Galaxy Pro line** (V2, V4, V4B, V6, V8, V2C, V4C) — the catalogue
   is consistently higher than the quotation. Which figure is nett machine weight and which is
   gross/shipping? Which peak-power figure should an installer size the supply for?
   *(The countertop models agree in both documents, so this is specific to the Galaxy Pro line.)*
2. **V6 / V8 power supply — the one installation-critical conflict.** The quotation says
   single-phase 220 V (20 A for V6, 32 A for V8); the catalogue says **three-phase 380 V, 32 A** for
   both. Which is supplied to the EU, and is the other a regional variant?
3. **Milano overall height** — the brochure gives 365 mm for both Milano models, the quotation 374 mm.
   Is the difference feet, or lid clearance?
4. **Milano V2 peak power** — brochure 1200 W, quotation 950 W. The quotation appears to have
   repeated Milano V1's figure; please confirm 1200 W.
5. **DC Cart 12-hour battery** — the EV brochure lists an 8 h and a 12 h option; the quotation prices
   only the 8 h. Is the 12 h a priced option, and at what uplift?

**Closed:**
- ~~Private-label rights~~ — resolved by owner override §5/§14: the manufacturer name is
  internal-only, so no permission question arises.
- ~~Milano production capacity~~ — **resolved by evidence** in §2.4: the quotation transposed the
  two figures. No manufacturer confirmation needed, though question 4 touches the same block.

---

## 6. Change log

| Date | What |
| --- | --- |
| 2026-08-31 | **Correction run:** the owner was right that references existed — Café Specialty is catalogue p.22, Milano V1 is brochure p.2 and Milano V2 is brochure p.4. An earlier pass had sampled pages rather than reading all of them and wrongly recorded them as unavailable. **All 11 models are now reconciled.** Café Specialty agrees on every field. The Milano production anomaly is RESOLVED: the quotation transposed V1 and V2. Two new minor conflicts found (Milano height, Milano V2 peak power); manufacturer questions cut from 7 to 5 |
| 2026-08-31 | Created. Quotation extracted in full; catalogue rendered and 6 Galaxy Pro model pages read; price authority verified 11/11; systematic weight/peak-power discrepancy identified; V6/V8 power-supply conflict identified; Milano output anomaly identified; **N-V4B-FIT confirmed as a real 30 mm conflict corroborated by two independent Miles sources** |
