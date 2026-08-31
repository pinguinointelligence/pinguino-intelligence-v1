# GELLATTI — MILES MACHINE SPEC RECONCILIATION (§24, §25)

**Workstream:** WORK WITH US · rows `L-PRICE-01`, `L-SPEC-01`, `L-SPEC-02`, `L-SPEC-03`, `N-V4B-FIT`
**Date:** 2026-08-31 · **Base:** `origin/staging` @ `c004d659`

## Sources of record

| Ref | Document | Nature | Extractable? |
| --- | --- | --- | --- |
| **Q** | `Miles ice cream machine price list.pdf` — QUOTATION, Hangzhou Gelato Tech Co., Ltd (milestac.com), 12 line items, **EXW China** | Commercial quotation to the owner | ✅ text |
| **B** | `Miles international catalog.pdf` — *Miles Galaxy Pro* international catalogue, per-model "DETAILED INFO" pages | Manufacturer marketing brochure | ⚠️ image-only; read by rendering |
| **M** | `MILES MilanoV1&2.pdf` | Milano-series lifestyle brochure | ⚠️ image-only; **contains no spec table** |
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

| Field | Behaviour across the 8 reconciled models | Publish? |
| --- | --- | --- |
| Dimensions (W×D×H) | **Q and B agree exactly, every model** | ✅ YES |
| Production capacity (cups/80 g/h) | **Q and B agree exactly, every model** | ✅ YES |
| Initial batching time | 12–18 min in both, every model | ✅ YES |
| Cooling type / refrigerant | Air cooling / R290 in both, every model | ✅ YES |
| Capacity per batch | Q gives max only; B gives max **and** minimum — compatible, B is richer | ✅ YES (use B) |
| **Weight** | **B is higher than Q on every single model** (+7 to +51 kg), DC Cart included | ❌ **OMIT** |
| **Peak power** | **B is higher than Q on every Galaxy Pro model** (+500 to +2000 W); the DC Battery Cart AGREES (1300 W both) | ❌ **OMIT** for Galaxy Pro · ✅ publishable for DC Cart |
| **Power supply** | Agrees on V2/V4-A/V4-B/V2C; **conflicts on V6 and V8** | ⚠️ per-model |

Weight differs on *every* model in a consistent direction, and peak power differs on every
*Galaxy Pro* model while agreeing exactly on the DC Cart. Consistent direction plus a clean control
case means this is a systematic documentation difference (plausibly nett vs. gross weight, and
rated vs. absolute peak draw), **not** a transcription error that can be resolved by picking the
nicer number. §25 forbids silently choosing. Both fields are withheld from public specs until the
manufacturer confirms — except DC Cart peak power, which two sources agree on.

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

#### Models with no brochure page located

| Model | Status | Note |
| --- | --- | --- |
| PRO V1 Café Specialty | 🔴 no spec source besides Q | Q: 580 × 550 × 420 mm, 69 kg, 10 A, 950 W, max 3 L, 165 cups/h |
| PRO V1 Milano | 🔴 Milano brochure has **no spec table** | Q: 410 × 540 × 374 mm, 54 kg, 10 A, 950 W, max 2 L, **200 cups/h** |
| PRO V2 Milano | 🔴 Milano brochure has **no spec table** | Q: 680 × 540 × 374 mm, 79 kg, 12 A, 950 W, max 2 L, **100 cups/h** |
| PRO V1 Café Specialty | 🔴 no spec source besides Q | Q: 580 × 550 × 420 mm, 69 kg, 10 A, 950 W, max 3 L, 165 cups/h |
| PRO V1 Milano | 🔴 Milano brochure has **no spec table** | Q: 410 × 540 × 374 mm, 54 kg, 10 A, 950 W, max 2 L, **200 cups/h** |
| PRO V2 Milano | 🔴 Milano brochure has **no spec table** | Q: 680 × 540 × 374 mm, 79 kg, 12 A, 950 W, max 2 L, **100 cups/h** |

### 2.3 Open anomaly — Milano production capacity (`L-SPEC-03`)

The quotation states **PRO V1 Milano = 200 cups/80 g/h** and **PRO V2 Milano = 100 cups/80 g/h**.
PRO V2 Milano is the larger, heavier, higher-amperage and roughly **twice as expensive** machine,
yet is quoted at **half** the hourly output of PRO V1 Milano. Every other model in the range scales
output upward with size and price.

This is internally inconsistent and there is no second source: the Milano brochure contains
photography only, no specification table. **Production capacity for both Milano models is
BLOCKED** and must not appear publicly until the manufacturer confirms. It is more likely a
transposition in the quotation than a real characteristic, but §25 forbids guessing.

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

For **PRO V2, V4, V4B, V2C** — dimensions · power supply · capacity per batch (max + min) ·
initial batching time · cooling type · refrigerant · production capacity · Gellatti price.

For **PRO V6, V8** — the same **except power supply**, which is blocked.

For **V4C, DC Battery Cart, V1 Café, V1 Milano, V2 Milano** — dimensions · power supply ·
capacity · batching time · price only, and **not** production capacity for the two Milano models.

**Never publish, for any model, until the manufacturer confirms:** weight · peak power.

---

## 5. Questions for the manufacturer (owner to forward)

1. **Weight** — brochure figures exceed quotation figures on every model. Which is nett machine
   weight and which is gross/shipping weight?
2. **Peak power (Galaxy Pro series only)** — same systematic gap on V2/V4/V4B/V6/V8/V2C/V4C, but
   the DC Cart agrees at 1300 W in both documents. Which figure is the electrical design load an
   installer should size for?
3. **V6 / V8 power supply** — the quotation says single-phase 220 V; the catalogue says three-phase
   380 V. Which is supplied to the EU, and is the other a regional variant?
4. **Milano output** — is PRO V2 Milano really 100 cups/80 g/h when PRO V1 Milano is 200?
5. **DC Battery Cart** — confirm the 8-hour battery runtime and what duty cycle it assumes.
6. ~~Private-label rights~~ — **RESOLVED by owner override 2026-08-31 §5/§14**: the manufacturer
   name is internal-only. Public pages name the model (V2, V4B, Battery Cart, Milano) with no
   manufacturer attribution, and never imply Gellatti manufactures the equipment. Nothing to ask.
7. **DC Cart 12-hour battery** — the EV brochure lists an 8 h and a 12 h battery option; the
   quotation prices only the 8 h. Is the 12 h a priced option, and at what uplift?

---

## 6. Change log

| Date | What |
| --- | --- |
| 2026-08-31 | Created. Quotation extracted in full; catalogue rendered and 6 Galaxy Pro model pages read; price authority verified 11/11; systematic weight/peak-power discrepancy identified; V6/V8 power-supply conflict identified; Milano output anomaly identified; **N-V4B-FIT confirmed as a real 30 mm conflict corroborated by two independent Miles sources** |
