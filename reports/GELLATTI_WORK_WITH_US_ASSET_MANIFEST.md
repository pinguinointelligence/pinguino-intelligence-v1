# GELLATTI — WORK WITH US · ASSET MANIFEST

**Workstream:** WORK WITH US · checklist rows `Q-ASSET-*`
**Authority:** Owner correction 2026-08-31 §§15–18, **and the owner's own render list of 2026-08-31**
(23 assets, A/M/MB/T/F/W numbering). **The owner's IDs and prompts are the authority.** Claude's
role here is to attach the right reference file to each render, guard the geometry rules, and flag
layout gaps — which §7 does.
**Canonical checklist:** `reports/GELLATTI_WORK_WITH_US_MASTER_CHECKLIST.md`
**Spec authority for every dimension quoted:** `reports/GELLATTI_MACHINE_SPEC_RECONCILIATION.md`

---

## 1. REFERENCE PACK — attach these files, don't describe the machines

The owner's instruction is exact: *"wszystkie maszyny renderujemy na podstawie konkretnych zdjęć
z Twoich PDF-ów, nie «z opisu»"*. Every machine reference has therefore been extracted from the
supplied PDFs into one folder, one file per model:

```
~/Desktop/PI/machines/REFERENCE-FOR-RENDERS/
```

| File | Model | Source | What it contains |
| --- | --- | --- | --- |
| `V2.png` | **V2** | catalogue p.23 | Studio render + dimensioned drawing, 2 pozzetti |
| `V4.png` | **V4** | catalogue p.24 | Studio render + drawing, 4 pozzetti square format |
| `V4B.png` | **V4B** | catalogue p.25 | Studio render + drawing, 4 pozzetti in a row, 1370 mm |
| `V6.png` | **V6** | catalogue p.26 | Studio render + drawing, 6 pozzetti |
| `V8.png` | **V8** | catalogue p.27 | Studio render + drawing, 8 pozzetti |
| `V2C.png` | **V2C** | catalogue p.28 | Canopy cart, 2 pozzetti, 2 poles |
| `V4C.png` | **V4C** | catalogue p.29 | Canopy cart, 4 pozzetti, decorative wheel |
| `BATTERY-CART.png` | **Battery Cart** | EV brochure p.14 | Studio render + drawing, 2 pozzetti |
| `MILANO-V1.png` | **Milano V1** | Milano brochure **p.2** | **Full spec page** — studio render + dimensioned drawing, 1 pozzetto |
| `MILANO-V2.png` | **Milano V2** | Milano brochure **p.4** | **Full spec page** — studio render + dimensioned drawing, 2 pozzetti |
| `CAFE-SPECIALITY.png` | **Café Specialty** | catalogue **p.22** | **Full spec page** — studio render + drawing, 1 pozzetto |
| `MILANO-V1-and-V2-in-cafe.png` | Milano V1 + V2 | Milano brochure p.5 | Both models in a real café — scene mood, and the clearest V1-vs-V2 size comparison |
| `CONTEXT-gelateria-references.png` | — | catalogue p.30 | Six real gelateria installations — use for *scene* mood only |
| `CONTEXT-battery-cart-in-use.png` | — | EV brochure p.3 | Cart in catering / hotel / restaurant / café — scene mood |

**Attach the matching file to every machine render.** A prompt that only *describes* a machine will
produce something that merely resembles it, which is exactly the failure mode the owner named.

**All 11 public models now have a real manufacturer spec page in the pack.** An earlier pass
recorded Milano V2 and Café Specialty as unavailable; that was wrong — it had sampled pages rather
than reading all of them. Both exist and are extracted.

**One reference still to supply (owner):** `TRL-A` / `TRL-B`, the two trailer renders, were pasted
into chat but are not on disk. Please save them to `~/Desktop/PI/machines/trailer/`. T01–T04 and the
W03 card use them.

---

## 2. Standing rules — binding on every asset

Not repeated in each prompt.

**2.1 Manufacturer naming (owner §5, §14).** The manufacturer name never appears in a public
asset — not on the machine, not in the filename, not in alt text. Public model names only:
**V2 · V4 · V4B · V6 · V8 · V2C · V4C · Battery Cart · Milano · Café Specialty**. Never imply
Gellatti manufactures the equipment. *(The prompts below say "remove Miles branding" because they
are internal working instructions to the image tool — that text is never published.)*

**2.2 Machine branding (owner §6).** Remove the manufacturer wordmark; leave the machine **clean
and unbranded**. Do **not** put a Gellatti logo on the machine. Gellatti branding belongs to the
environment: signage, wall, trailer skin, franchise interior, POS.

**2.3 Geometry is sacred (owner §6, §16).** Preserve proportions · pozzetti count and placement ·
doors · vents · screens · service openings · wheels · controls · module count and placement ·
material and finish. **Never redesign, restyle, modernise or "improve" the equipment.**

**2.4 Social platform logos (owner §17).** Never bake Instagram / TikTok / YouTube / Facebook / X /
Reddit / Pinterest logos into a photo. Real vector icons are overlaid by the UI — leave clean
composition space for that row.

**2.5 Gellatti logo (owner §18).** Composite the real asset —
`public/brand/gellatti-wordmark-graphite.svg` or `public/logo/gellattiLOGO.png`. Never ask the
generator to invent or re-letter the wordmark. Leave a clean sign surface for overlay where
compositing isn't possible.

**2.6 Palette.** Ivory / white / warm greige · graphite typography · **one small controlled orange
accent** (the owner's own wording — it is Gellatti's accent, used sparingly). No random blue, no
neon, no SaaS gloss.

**2.7 Status vocabulary.** `⚪ BRIEF READY` · `🟡 IN GENERATION` · `🟢 SUPPLIED` · `⏳ WAITING FOR OWNER ASSET` · `🔴 BLOCKED`.
**⏳ never blocks backend work** — only the affected page's freeze.
OWNER QA: `⬜ WAITING` · `✅ APPROVED` · `❌ REJECTED`.

---

## 3. PRIORITY A — heroes (owner's list)

### A01 — Work With Us / Partner hero
| | |
| --- | --- |
| **Route · section** | `/work-with-us` hero **and** `/partner-program` hero (dual use) |
| **Purpose** | One-second self-recognition for a creator with an audience |
| **Attach** | — (original scene, no product) |
| **Ratio** | 16:9, crop-safe to 4:5 mobile |
| **Branding** | None visible. **No platform logos** — leave the left negative space for the UI icon row |
| **Status · QA** | ⚪ · ⬜ |
| **Filename** | `public/images/partner/a01-partner-hero.webp` |

```
Premium editorial photograph for Gellatti Partner Program. A confident food-content creator in
their early 30s working naturally at a clean warm-white studio table, smartphone on a compact
tripod recording fresh gelato, laptop open beside them, subtle professional creator equipment,
contemporary European interior, lots of white and warm neutral surfaces, elegant natural daylight,
realistic premium food photography, no visible social-media logos, no readable text, leave clean
negative space on the left for website headline and CTA, Gellatti visual language: refined,
minimal, credible, not corporate SaaS, not influencer cliché, no neon, no excessive props. 16:9
composition with center-safe mobile crop.
```

### A02 — Facebook / community admin
| | |
| --- | --- |
| **Route · section** | `/partner-program` — "who this is for" card |
| **Attach** | — (original scene) · **Ratio** 4:3, mobile-safe centre crop |
| **Branding** | None. No platform logos; leave overlay space |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/partner/a02-community-admin.webp` |

```
Premium documentary-style photograph of an experienced food-community administrator working at a
laptop while moderating a large online gelato/ice-cream community, elegant home office or small
professional studio, smartphone nearby, notebook with content planning, subtle bowl of fresh gelato
in foreground, mature credible person rather than stereotypical influencer, soft European daylight,
white and warm greige environment, no readable interface, no platform logos embedded in image,
clean negative space for UI overlay, photorealistic, premium Gellatti editorial style, 4:3 landscape
with mobile-safe center crop.
```

### A03 — Video creator / TikTok / YouTube
| | |
| --- | --- |
| **Route · section** | `/partner-program` — "who this is for" card |
| **Attach** | — (original scene) · **Ratio** 4:3 |
| **Branding** | None. Leave room for UI platform icons |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/partner/a03-video-creator.webp` |

```
Photorealistic premium food creator filming a short vertical video of fresh gelato being served,
smartphone mounted vertically, compact light, modern clean kitchen or gelato studio, creator visible
but gelato remains the hero, white and warm-neutral palette, natural soft daylight, sophisticated
not playful, no fake platform logos, no readable text, leave room for UI platform icons to be
overlaid separately, Gellatti premium editorial photography, 4:3.
```

### A04 — Machines hero
| | |
| --- | --- |
| **Route · section** | `/machines` hero · also crops to `W01` |
| **Attach** | **`V4B.png`** (recommended — the wide 4-pozzetti counter reads best as "live production"). `V2.png` if a compact scene is preferred |
| **Ratio** | 16:9, mobile-safe crop |
| **Must not change** | 1370 × 600 × 910 proportion · **exactly 4 pozzetti in one row** · domed lids · lower ventilation grille · two control screens · castors |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/machines/a04-machines-hero.webp` |

```
Premium commercial photograph of fresh gelato being produced live in front of a customer using the
exact machine geometry from the supplied reference image. Use the supplied machine reference as
strict physical geometry authority. Remove visible Miles branding from the marketing visual, but do
not change the machine housing, pozzetti, control panels, vents, proportions or mechanical layout.
Do not add a Gellatti logo to the machine itself. Place the machine in a refined modern gelato/café
environment with white, brushed stainless steel and warm natural surfaces, fresh gelato visible,
customer experience in background, clean daylight, realistic scale, premium architectural food
photography, 16:9 with mobile-safe crop.
```

### A05 — Mobile Battery Cart
| | |
| --- | --- |
| **Route · section** | `/mobile` hero · also crops to `W02` |
| **Attach** | **`BATTERY-CART.png`** + `CONTEXT-battery-cart-in-use.png` for scene mood |
| **Ratio** | 16:9, mobile-safe centre crop |
| **Must not change** | 520 × 760 × 890 proportion · **exactly 2 pozzetti** · push handle · four castors · side ventilation grille · front control screen |
| **Claude's guard** | **No power cable, extension lead or wall socket anywhere in frame** — the 8-hour battery is the entire claim, and a visible cable destroys the asset |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/mobile/a05-battery-cart-event.webp` |

```
Premium event photograph using the supplied DC Battery Cart reference as strict physical geometry
authority. Remove visible Miles branding only; preserve the cart body, dimensions, wheels, pozzetti,
screen, handles, service geometry and equipment layout exactly. Do not add Gellatti branding to the
machine. Show the cart operating at an elegant outdoor food event in Southern Europe, fresh gelato
being served to customers, warm daylight, modern minimal event setting, no carnival aesthetic, no
invented accessories, photorealistic, 16:9, mobile-safe center crop.
ADDITIONAL REQUIREMENT: no power cable, extension lead, generator or wall socket may appear
anywhere in the frame — the cart is battery powered and the image must prove it.
```

---

## 4. PRIORITY B — machines (owner's list)

### M01 — Milano / café
| | |
| --- | --- |
| **Route · section** | `/machines` — "where it fits" |
| **Attach** | **`MILANO-V2.png`** (spec page, 2 pozzetti) — or `MILANO-V1.png` for the 1-pozzetto variant. `MILANO-V1-and-V2-in-cafe.png` for scene mood |
| **Ratio** | 3:2 |
| **Must not change** | **Countertop, never floor-standing** · Milano V2 footprint 680 × 540 mm · **exactly 2 pozzetti** · the distinctive angled painted side panel · single round front knob · louvred base vent · chrome feet |
| **Claude's note** | A proper spec page now exists for both Milano models, so fidelity is as good as the catalogue models. **Decide which variant the café scene shows** — V1 has one pozzetto, V2 has two |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/machines/m01-milano-cafe.webp` |

```
Use the supplied Milano machine reference as strict geometry authority. Create a photorealistic
premium café scene with the exact machine installed beside a professional espresso machine on a
refined counter. Remove visible Miles branding but do not alter machine design, vents, controls,
dimensions or pozzetti. Do not add Gellatti logo to the machine. White/ivory stone counter, warm
wood detail, stainless steel, natural morning light, subtle fresh gelato service, sophisticated
European café, no readable text, 3:2 landscape.
```

### M02 — V2 / restaurant–hotel
| | |
| --- | --- |
| **Attach** | **`V2.png`** · **Ratio** 3:2 · **Route** `/machines` |
| **Must not change** | 720 × 600 × 885 · **exactly 2 pozzetti** · one control screen · front grille · castors |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/machines/m02-v2-restaurant.webp` |

```
Use the supplied V2 reference image as strict machine geometry authority. Exact physical machine,
no redesign. Remove visible Miles logo only. Install it in a premium hotel or restaurant dessert
station where fresh gelato is prepared and served live. Bright clean architecture, ivory and
graphite accents, stainless steel worktop, one chef or trained staff member, realistic workflow and
scale, photorealistic hospitality photography, 3:2.
```

### M03 — V2 / compact gelateria
| | |
| --- | --- |
| **Attach** | **`V2.png`** · **Ratio** 4:3 · **Route** `/machines` |
| **Must not change** | As M02 |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/machines/m03-v2-compact.webp` |

```
Exact V2 machine from supplied reference, strict physical geometry, no redesign, visible
manufacturer branding removed, no new machine logo. Compact modern gelateria with small footprint,
customer-facing fresh gelato concept, white walls, subtle warm greige surfaces, fresh fruit and
gelato used sparingly, premium natural lighting, practical real-world installation, 4:3.
```

### M04 — V4B / gelateria
| | |
| --- | --- |
| **Attach** | **`V4B.png`** + `CONTEXT-gelateria-references.png` · **Ratio** 16:9 · **Route** `/machines` |
| **Must not change** | 1370 × 600 × 910 · **exactly 4 pozzetti in one row** · lids · grille · two screens · castors |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/machines/m04-v4b-gelateria.webp` |

```
Exact V4B machine based on supplied manufacturer reference, preserve 1370 mm long / 600 mm deep
overall form and every visible production module, control panel, vent and working surface. Remove
Miles branding only. Place it as the central live-gelato production counter in a premium modern
gelateria, staff producing several flavours, customers visible softly in background, bright white
architecture, minimal warm material accents, photorealistic, 16:9.
```

### M05 — Machine family / selection visual
| | |
| --- | --- |
| **Attach** | **`V2.png` + `MILANO-lifestyle-1.png` + `V4B.png`** — all three, as separate geometry authorities |
| **Ratio** | 16:9 · **Route** `/machines` selector intro |
| **Claude's guard** | The three machines are **radically different heights** — Milano is a 374 mm countertop unit, V2 is 885 mm floor-standing, V4B is 910 mm and 1370 mm long. A lineup on one ground plane will look wrong unless Milano sits on a plinth or counter. **State the relative scale explicitly or the generator will normalise them.** |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/machines/m05-family.webp` |

```
Premium clean studio lineup using the supplied reference images for V2, Milano and V4B as strict
individual geometry authorities. Do not invent or merge machines. Remove visible Miles branding.
Each machine remains physically separate and accurate. Neutral off-white seamless architectural
studio, soft shadows only from real lighting, no text, no fake specifications, sophisticated product
photography, wide 16:9.
SCALE REQUIREMENT: these machines are NOT the same size and must not be normalised. Milano is a
small COUNTERTOP unit about 374mm tall and must be shown raised on a plinth or counter. V2 is a
floor-standing unit about 720mm wide and 885mm tall. V4B is floor-standing, about 1370mm long and
910mm tall — clearly the largest. Preserve their true relative proportions.
```

---

## 5. PRIORITY B — mobile equipment (owner's list)

### MB01 — V2C mobile pop-up
| | |
| --- | --- |
| **Attach** | **`V2C.png`** · **Ratio** 16:9 · **Route** `/mobile` |
| **Must not change** | 720 × 600 × 2400 overall · **exactly 2 pozzetti** · the **curved canopy on exactly two vertical poles** · side extension counter · castors · machine body and grille below the counter |
| **Claude's note** | Mobile crop must be **4:5, not 1:1** — at 2400 mm the canopy is cropped off a square frame, and the canopy is the whole silhouette |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/mobile/mb01-v2c-popup.webp` |

```
Use the supplied V2C reference as strict geometry authority. Preserve exact tall form, lower machine
body, upper canopy/structure, controls and footprint. Remove visible Miles branding only. Show it
operating in a premium temporary pop-up at a Mediterranean outdoor market, fresh gelato being served,
refined modular stall environment, soft afternoon light, realistic people and scale, no extra invented
machine parts, photorealistic, 16:9.
FRAMING: the full height of the cart including the canopy must be inside the frame, and the image
must survive a centred 4:5 vertical crop that still includes the canopy top and the serving counter.
```

### MB02 — V4C event
| | |
| --- | --- |
| **Attach** | **`V4C.png`** · **Ratio** 16:9 · **Route** `/mobile` |
| **Must not change** | 1500 × 800 × 2400 · **exactly 4 pozzetti** · canopy on poles · the **decorative side wheel** · extension counter |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/mobile/mb02-v4c-event.webp` |

```
Exact V4C from supplied reference, strict physical geometry, no redesign, visible Miles branding
removed. Premium corporate/event catering environment, several fresh gelato flavours being served
efficiently, elegant white event architecture, subtle graphite and warm-neutral details, people in
smart casual clothing, realistic lighting, photorealistic, 16:9.
```

### MB03 — Battery Cart close service shot
| | |
| --- | --- |
| **Attach** | **`BATTERY-CART.png`** · **Ratio** 4:3 · **Route** `/mobile` |
| **Must not change** | As A05 |
| **Claude's guard** | Again: **no visible power cable** |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/mobile/mb03-battery-cart-service.webp` |

```
Exact DC Battery Cart from supplied reference, strict geometry, brand removed, close three-quarter
service view showing the operator serving fresh gelato directly from the cart, customers slightly
out of focus, premium outdoor event, soft warm daylight, detailed stainless steel and material
realism, no text, no invented accessories, 4:3.
ADDITIONAL REQUIREMENT: no power cable, extension lead or wall socket anywhere in frame.
```

---

## 6. PRIORITY A/B — trailer (owner's list)

> **The four photographic trailer assets are ⏳ WAITING FOR OWNER ASSET** (`TRL-A` / `TRL-B` to be
> saved to disk). Per the owner's instruction this is **not a blocker** for backend work — all
> non-visual implementation continues regardless.

### T01 — Trailer exterior OPEN · **first render in the owner's order**
| | |
| --- | --- |
| **Attach** | **`TRL-B`** (white trailer, window open) — 🔴 not yet on disk |
| **Ratio** | 16:9 · **Route** `/trailer` hero · also crops to `W03` |
| **Branding** | **Replace PINGÜINO with the real Gellatti logo asset** — composite, never invent lettering (§2.5) |
| **Must not change** | Silhouette and corner radii · serving window aperture and gas-strut hatch · fold-out counter shelves · door and round porthole · wheel and mudguard position · drawbar and jockey wheel · all four stabiliser legs · two roof vents · the split line and proportion between polished upper body and dark lower band |
| **Status · QA** | ⏳ WAITING FOR OWNER ASSET · ⬜ · **Filename** `public/images/trailer/t01-open.webp` |

```
Edit the supplied Pinguino ice-cream trailer reference. Preserve the trailer body, dimensions, wheel
position, axles, doors, hatches, roofline, windows, service openings and all structural geometry
exactly. Remove all PINGUINO branding. Replace only the branding surfaces with the approved Gellatti
visual identity, using the real Gellatti logo as reference/overlay, not invented lettering. Premium
restrained Gellatti exterior: white/ivory base, graphite typography, very small controlled orange
accent, no excessive graphics. Keep the trailer physically identical. Clean daylight commercial
product render, three-quarter exterior view, 16:9.
```

### T02 — Trailer exterior CLOSED
| | |
| --- | --- |
| **Attach** | **`TRL-A`** (silver trailer, closed, 3/4 rear) — 🔴 not yet on disk |
| **Ratio** | 3:2 · **Route** `/trailer` |
| **Must not change** | Closed silhouette · the large rear louvred vent grille and its exact position · **the number and placement of every marker light** · roof vents · drawbar, coupling, jockey wheel · stabiliser legs · wheel position · dark band ratio |
| **Status · QA** | ⏳ WAITING FOR OWNER ASSET · ⬜ · **Filename** `public/images/trailer/t02-closed.webp` |

```
Edit the supplied trailer closed/back/side reference. Preserve exact trailer geometry and all
technical elements. Remove PINGUINO branding and replace branded surfaces with approved Gellatti
identity only. Do not move doors, hatches, wheels, lights or panels. Minimal premium Gellatti livery,
mostly white, graphite branding, tiny orange accent, realistic outdoor neutral setting,
photorealistic, 3:2.
```

### T03 — Trailer live event
| | |
| --- | --- |
| **Attach** | **`TRL-B`** — 🔴 not yet on disk · **Ratio** 16:9 · **Route** `/trailer` |
| **Must not change** | Everything listed for T01 |
| **Status · QA** | ⏳ WAITING FOR OWNER ASSET · ⬜ · **Filename** `public/images/trailer/t03-live-event.webp` |

```
Use the supplied Gellatti trailer exterior geometry as strict authority. Same exact trailer, service
hatch open, operating at an elegant European summer event, customers ordering fresh gelato, staff
inside, subtle queue, realistic tables and event context. Gellatti branding only on trailer/signage,
no unrelated logos, warm golden-hour daylight but accurate product colours, premium
lifestyle-commercial photography, 16:9.
```

### T04 — Trailer interior with V2
| | |
| --- | --- |
| **Attach** | **`TRL-D`** (owner floorplan) + **`V2.png`** · **Ratio** 16:9 · **Route** `/trailer` configurator |
| **Claude's verification** | **V2 genuinely fits.** 720 mm long × 600 mm deep against a ~1340 mm bay at exactly the 600 mm depth limit — ~620 mm of length to spare. This render is honest to publish |
| **Status · QA** | ⏳ WAITING FOR OWNER ASSET · ⬜ · **Filename** `public/images/trailer/t04-interior-v2.webp` |

```
Create a technically plausible photorealistic interior view of the existing 3.5 m × 2.1 m trailer
using the supplied floor plan as strict layout authority. Preserve real door, counters, sink/water
zone, refrigeration/storage and working circulation. Install the exact V2 machine based on its
supplied reference, respecting maximum 600 mm machine depth. Do not redesign the machine. Clean
food-safe stainless steel and white/ivory cabinetry, realistic working clearances, bright neutral
task lighting, wide-angle but not distorted, no text labels, 16:9.
```

### T05 — Technical floor plan, V2
| | |
| --- | --- |
| **Attach** | **`TRL-D`** + `V2.png` · **Route** `/trailer` configurator |
| **Method** | **Vector drawing, not a generated image.** Generators cannot hold dimensional accuracy and §25/§30 forbid publishing a false technical drawing. Author as SVG |
| **Verified inputs** | Envelope 3500 × 2100 · serving window 1940 · side window 1000 · door opening 750 · fridge-with-sink 1550 × 700 × 960 · counter 250 · machine bay ~1340 × 600 × 910 · **V2 = 720 × 600 × 885** |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/trailer/t05-floorplan-v2.svg` |

```
Redraw the supplied 3.5 m × 2.1 m trailer plan as a professional architectural/technical floor plan.
Preserve all verified dimensions and real equipment positions. Fit the exact V2 footprint truthfully,
maximum depth 600 mm. White background, graphite technical lines, restrained warm-gray secondary
dimensions, small orange only for one highlighted equipment zone, no perspective, top-down
orthographic drawing, clear readable dimensions, professional European technical drawing style, no
decorative illustration.
```

### T06 — Technical floor plan, V4B · 🔴 **BLOCKED**
| | |
| --- | --- |
| **Status** | 🔴 **BLOCKED — `N-V4B-FIT`.** Owner agrees: do not generate until 1340 vs 1370 mm is resolved |
| **Evidence** | Owner drawing gives ~**1340 mm**. The supplier quotation **and** the supplier brochure independently state V4B is **1370 mm**. Depth (600) and height (910) match exactly — **length is the problem, and it is 30 mm short before any service clearance** |
| **Unblocked by** | One measurement: the trailer's real clear bay length |
| **Filename** | `public/images/trailer/t06-floorplan-v4b.svg` |

```
[DO NOT GENERATE YET]
Same technical drawing rules as T05, but using exact V4B 1370 × 600 × 910 mm footprint. Do not
generate until verified clear installation length is at least 1370 mm plus required service
clearance. Never compress or distort the machine to fit.
```

---

## 7. PRIORITY B — franchise (owner's list)

### F01 — Franchise hero interior
| | |
| --- | --- |
| **Attach** | **`V4B.png`** (the live-production machine) + `CONTEXT-gelateria-references.png` |
| **Ratio** | 16:9 · **Route** `/franchise` hero · also crops to `W04` |
| **Branding** | **Gellatti branding belongs here** — on signage, composited from the real logo. **Not on the machine** |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/franchise/f01-interior.webp` |

```
Premium traditional Gellatti gelateria interior, combining classic Italian gelato presentation with
modern fresh-gelato production. Long professional display case with real gelato pans and visible
fresh product, plus one live production machine integrated naturally into the counter area. Bright
white architecture, warm ivory/greige materials, graphite Gellatti signage, minimal controlled orange
accent, sophisticated European hospitality design, customers present naturally, no futuristic SaaS
aesthetic, photorealistic architectural photography, wide 16:9.
MACHINE REQUIREMENT: the live production machine must match the supplied V4B reference exactly —
four pozzetti in one row, same housing, vents, screens and proportions. Leave it completely
unbranded. Leave the signage panel clean for the real Gellatti logo to be composited.
```

### F02 — Counter detail
| | |
| --- | --- |
| **Attach** | **`V4B.png`** · **Ratio** 3:2 · **Route** `/franchise` |
| **Claude's guard** | Gelato in a **pozzetto sits roughly level with the counter** — a smooth or gently swirled surface. Piled decorated mountains belong to a different kind of display case and would misrepresent this equipment |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/franchise/f02-counter-detail.webp` |

```
Close premium architectural food photograph inside a Gellatti gelateria: glass gelato display filled
with fresh flavours in professional pans, staff serving a customer, a live fresh-production machine
visible further down the same counter, white/ivory surfaces, stainless steel, graphite details,
natural daylight, realistic high-end food retail environment, no excessive branding, 3:2.
POZZETTI REQUIREMENT: gelato in the round production wells must sit roughly level with the counter
with a smooth or gently swirled surface — do not pile it into tall decorated mountains.
```

### F03 — Franchise storefront
| | |
| --- | --- |
| **Attach** | — (original scene) · **Ratio** 16:9 · **Route** `/franchise` |
| **Branding** | Real Gellatti logo composited onto the fascia — or leave the fascia clean for overlay |
| **Status · QA** | ⚪ · ⬜ · **Filename** `public/images/franchise/f03-storefront.webp` |

```
Premium street-level exterior of a full Gellatti gelateria in a contemporary European city, inviting
glazed storefront, real approved Gellatti logo signage, warm bright interior visible through glass,
gelato display visible inside, restrained white/graphite/ivory identity with a tiny orange accent,
people naturally approaching, no giant marketing graphics, photorealistic architectural photography,
16:9.
LOGO REQUIREMENT: do not invent or re-letter the Gellatti wordmark. Either composite the supplied
real logo file, or leave the fascia sign board completely blank and evenly lit for later overlay.
```

---

## 8. Gateway cards (owner's list)

| ID | Card | Route | Attach | Ratio | Status |
| --- | --- | --- | --- | --- | --- |
| **W01** | Machines | `/work-with-us` | `V4B.png` or `V2.png` | 4:3 | ⚪ |
| **W02** | Mobile | `/work-with-us` | `BATTERY-CART.png` | 4:3 | ⚪ |
| **W03** | Trailer | `/work-with-us` | `TRL-B` 🔴 | 4:3 | 🔴 |
| **W04** | Franchise | `/work-with-us` | `V4B.png` | 4:3 | ⚪ |

```
W01: Close premium service scene of fresh gelato being produced live on an exact reference machine,
unbranded equipment, white/ivory café environment, one staff member and one customer, clean
composition designed for a 4:3 website card, no text.

W02: Exact unbranded Battery Cart based on supplied reference, operating outdoors at a refined event,
simple strong silhouette, clear mobile use case, 4:3 website-card composition, no text.

W03: Exact Gellatti trailer based on supplied reference, open service hatch, clean three-quarter
view, minimal Gellatti livery, bright daylight, 4:3 website-card composition.

W04: Warm premium Gellatti gelateria interior with classic glass gelato display and live fresh
production visible, clear sophisticated storefront/retail story, 4:3 website-card crop, no text.
```

---

## 9. LAYOUT CHECK — gaps Claude found in the 23-asset list

The owner asked Claude to check the layout and add anything missing. Four real gaps, one of them
significant.

### G1 — 🟠 **Three machines have no visual at all: V4, V6, V8**

The list covers Milano, V2, V4B, V2C, V4C and Battery Cart. It does **not** cover **V4 (€15,400),
V6 (€24,000) and V8 (€33,000)** — the three most expensive products in the range.

Why this matters: checklist row `L-MACH-08` requires **every intended model to be reachable through
the selector with no dead end**. A customer answering "gelateria · 7+ flavours · full counter ·
capacity" should be recommended a V6 or V8 — and would hit a result card with no image.

The fix is cheap: reference renders for all three **already exist** in the pack (`V4.png`, `V6.png`,
`V8.png`) and only need the wordmark removed.

| ID | Model | Attach | Ratio | Status |
| --- | --- | --- | --- | --- |
| **G-P04** | V4 | `V4.png` | 4:3 | ⚪ |
| **G-P06** | V6 | `V6.png` | 4:3 | ⚪ |
| **G-P08** | V8 | `V8.png` | 4:3 | ⚪ |

```
TASK TYPE: IMAGE EDIT of the supplied reference. NOT generation.
Isolated product shot of the exact machine in the supplied reference image. Use the reference as
strict physical geometry authority — reproduce the machine exactly, keeping its proportions, the
number and placement of pozzetti, all lids, doors, vents, service openings, control screens, wheels
and module layout. Remove the manufacturer wordmark and leave that surface clean and unbranded. Do
NOT add Gellatti or any other branding to the machine. Isolate on a clean seamless warm-light-grey
studio background with a soft contact shadow. Even neutral studio lighting, no dramatic rim light.
Remove all catalogue page text, dimension lines, arrows, callouts and certification badges. Keep the
reference's own camera angle. 4:3, minimum 1600x1200, machine fully inside a centred 1:1 crop with
at least 8% margin.
```

### G2 — 🟠 **Isolated product shots for the selector result cards**

Every asset in the list is a *scene*. The `/machines` and `/mobile` selectors end on a
"Recommended for you" card that needs a **clean product image** — a busy café scene doesn't read at
card size, and the customer needs to see the machine itself.

Same cheap fix as G1, same prompt, for the models that already have scene assets:
**`G-P02` V2 · `G-P03` V4B · `G-P2C` V2C · `G-P4C` V4C · `G-PBC` Battery Cart** (attach the matching
reference file).

M05 partly covers this for three models, but a lineup can't be split into per-model cards.

### G3 — 🟡 **No blog / newsletter / education creator**

The list has A02 (community admin) and A03 (video creator), but the original master prompt §33
also required a **writer/newsletter** persona (`PARTNER-04`). Partner's public promise is
explicitly *"Twój kod. Twój link. Dowolny kanał"* — and the gateway's platform strip includes
**blog and newsletter**. Without this asset the "any channel" claim is visually contradicted: every
image shows a camera.

| ID | Purpose | Ratio | Status |
| --- | --- | --- | --- |
| **G-A06** | Writer / newsletter / educator persona | 4:3 | ⚪ |

```
Premium editorial photograph of a food writer or educator working on written content at a calm desk
— annotating printed pages with a pen, a laptop angled away so no screen is readable, a small camera
body resting to one side, one cup, natural daylight. Mature and credible rather than an influencer
stereotype. White and warm greige palette, contemporary European interior, soft natural light. No
readable text on the pages, no platform logos, no visible interface. Leave clean negative space for
UI overlay. Photorealistic, premium Gellatti editorial style, 4:3 landscape with mobile-safe centre
crop.
```

### G4 — ✅ **RESOLVED — the references existed after all**

The owner was right. An earlier pass sampled pages instead of reading all of them and wrongly
recorded these as unavailable. Both exist as **full manufacturer spec pages**:

- **Milano V1** — `MILES MilanoV1&2.pdf` **p.2** (Galaxy Pro Milano V1)
- **Milano V2** — `MILES MilanoV1&2.pdf` **p.4** (Galaxy Pro Milano V2)
- **Café Specialty** — `Miles international catalog.pdf` **p.22** (Galaxy Pro V1 Café Speciality)

All three are extracted into the reference pack. They are rendered as **edits with strict geometry
authority**, exactly like every other model — never from text description.

Finding them also resolved a spec blocker: the Milano production-capacity anomaly is closed, because
the quotation had simply **transposed** the V1 and V2 figures (see reconciliation §2.4). Café
Specialty turned out to agree with the quotation on *every* field.

| ID | Model | Attach | Ratio | Status |
| --- | --- | --- | --- | --- |
| **G-P1M** | Milano V1 | `MILANO-V1.png` | 4:3 | ⚪ |
| **G-P2M** | Milano V2 | `MILANO-V2.png` | 4:3 | ⚪ |
| **G-PCS** | Café Specialty | `CAFE-SPECIALITY.png` | 4:3 | ⚪ |

Use the same edit prompt as G1/G2. **Café Specialty carries a "LA GALASSIA" side graphic in addition
to the manufacturer wordmark — remove both.**

---

## 10. RENDER ORDER

The owner's order, with the reference file to attach and what each unblocks:

| # | Asset | Attach | Unblocks |
| --- | --- | --- | --- |
| 1 | **T01** | `TRL-B` 🔴 **save to disk first** | `/trailer` hero + `W03` gateway card |
| 2 | **A01** | — | `/work-with-us` hero **and** `/partner-program` hero — the dominant #1 message |
| 3 | **A04** | `V4B.png` | `/machines` hero + `W01` |
| 4 | **A05** | `BATTERY-CART.png` | `/mobile` hero + `W02` |
| 5 | **F01** | `V4B.png` | `/franchise` hero + `W04` |
| 6 | **M01** | `MILANO-lifestyle-1.png`, `-2.png` | `/machines` "where it fits" |
| 7 | **M04** | `V4B.png` | `/machines` "where it fits" |
| 8 | **MB01** | `V2C.png` | `/mobile` "where it works" |
| 9 | **T03** | `TRL-B` 🔴 | `/trailer` business story |
| 10 | **F03** | — | `/franchise` aspiration |

After those ten, all five heroes and all four gateway cards exist, so no page hangs on a
placeholder — which was the owner's stated goal.

**Claude's suggested insertion:** slot the G1/G2 product edits (V2, V4B, V4, V6, V8, V2C, V4C,
Battery Cart) in **after #5**. They are edits rather than generations, so they are fast, and they
unblock the selector result cards — which are the only *functional* screens in `/machines` and
`/mobile`. Every other remaining asset is decorative by comparison.

Then: A02, A03, G-A06 (Partner personas) → M02, M03, M05, MB02, MB03, T02, T04, F02 → T05 (vector).
Blocked: T06, and Milano V2 / Café Specialty.

---

## 11. Change log

| Date | What |
| --- | --- |
| 2026-08-31 | Created under owner correction §§15–18 with 33 Claude-authored rows |
| 2026-08-31 | **Rewritten around the owner's own 23-asset list**, which becomes the authority. Reference pack extracted from the PDFs to `~/Desktop/PI/machines/REFERENCE-FOR-RENDERS/` (12 files) so machines are rendered from real images, not descriptions. Per-asset geometry guards and attach-this-file instructions added. Four layout gaps recorded (§9): V4/V6/V8 have no visual, no isolated product shots for selector cards, no writer persona, Milano V2 + Café Specialty unrenderable |
