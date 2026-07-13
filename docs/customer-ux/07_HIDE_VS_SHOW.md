# 07 — Hide vs Show (technical redaction contract)

Two independent axes — keep them separate:

- **Axis 1 — Jargon/internals (everyone):** raw engine internals are hidden from
  ALL customers (Demo, Free, Home, Pro). They live only in dev/expert surfaces.
  Some professional-but-readable values are available under a collapsed
  **"Dane techniczne"** section.
- **Axis 2 — Exact grams (capability):** gated on **`canViewExactGrams`**
  (Demo/Free = hidden `🔒`; Home/Pro = shown). Grams are redacted **at the data
  layer**, not via CSS.

Never conflate them: a Pro user still does not see NPAC/POD/IF9 in the customer UI;
a Demo user still sees ingredient **names** and structure.

---

## A. NEVER shown to any customer (dev/expert-only)

These are internal engine/pipeline artifacts. They must not appear in customer
render, tooltips, `aria-*`, clipboard, print, CSV, downloads, or client-visible
service responses. They remain in `/studio` (expert), `/dev/*`, and logs.

| Internal artifact | Where it exists today | Customer treatment |
|-------------------|-----------------------|--------------------|
| **PAC** (anti-freezing power) | engine / PI panel | never shown |
| **POD** (sweetness power) | `en.ts studio.pi.indicators.pod` | never shown; translate to "słodycz" only as coarse plain language if needed |
| **NPAC** (net anti-freezing) | `studio.pi.indicators.npac` | never shown |
| **Ice fraction / structure** raw | `studio.pi.indicators.ice_fraction` | never shown as a number/metric |
| **TARGET_BANDS** / calibration bands | engine config | never shown |
| **IF9 / IF10** branch workflows | `StudioPage` `BranchWorkflowPreviews` | never shown |
| **Dispatcher / spine routing** | `src/spine/*` (batchRescueRouter, flow routers) | never shown |
| **Verification trace** | mapper-verification, optimization dev trace | never shown |
| **Route names / flow ids** | spine flow routers | never shown |
| **Raw violation / warning codes** | `studio.warnings.*`, solver violations | translated to plain PL (see `03` taxonomy), code never shown |
| **Regulator-shadow / optimization preview internals** | `StudioPage` optimization block | never shown |
| **Aerating protein / protein-in-solids / lactose sandiness risk** | `studio.pi.indicators.*` | never shown as indicators |
| **CONFIG_VERSION / engine ids** | engine config, `engines.ts` | never shown ("−11°C" allowed only as a plain secondary temp hint, not "−11°C Engine" as a customer headline) |
| **Correction confidence enums / affected_metrics** | `demoHints`, corrections | not shown; may drive a plain "wymaga drobnej korekty" status only |

**Rule:** if a value's meaning requires food-science literacy to interpret, it is
Axis-1 hidden. The customer gets an outcome ("Zbilansowane — gotowe do produkcji"),
not the instrument reading.

---

## B. Shown to every customer (Demo included), always

Structure and identity are not secret — only exact grams are a capability.

- Recipe **photo**
- Recipe **title / name**
- **Product type** (Gelato / Sorbet / Vegan) — never the internal chocolate routing
- **Device / serving mode** (friendly label + secondary temp)
- **Batch size** (the user's own chosen number — an input, not an engine gram)
- **Full ingredient list by NAME**, in QUID descending-weight order
- Ingredient **roles/structure** (main/hero markers, "baza", "smak wiodący") —
  qualitative, not gram-numeric
- **Substitution actions** ("Zamień składnik")
- **Prep guidance** ("Jak to zrobić" steps)
- **Customer-friendly balance status** (plain language mapping of the engine verdict)
- Honesty notes ("podgląd", "do potwierdzenia", "zdjęcie wkrótce")

> This is the key correction to today's behavior: the current demo hides ingredient
> **names** (shows only directional hints). The new contract **shows names + full
> structure** and hides **only grams**.

---

## C. Exact grams — capability-gated (`canViewExactGrams`)

| Audience | Grams | Export / clipboard / print / CSV / Apply |
|----------|-------|------------------------------------------|
| Demo (`demo`) | `🔒` (absent at data layer) | disabled + locked explanation |
| Free (`free`, signed-in unpaid) | `🔒` (absent) | disabled + locked explanation |
| Home (`home`) | exact grams shown | enabled (grams may flow out) |
| Pro (`pro`) | exact grams shown | enabled |

### Redact-at-source requirement (MUST)
Gram absence must be enforced **before data reaches any rendered text, `aria-*`,
action payloads, clipboard, print, CSV, download, Apply, or any client-visible
service response** — mirroring the existing `PlanGate` "children never mounted while
locked" pattern and the `RedactedCorrectionProposal` "no numeric fields" type.

Concretely, the customer recipe view should be built from a **redacted DTO** whose
gram fields are either omitted or replaced by a `locked` sentinel **on the source
side** for Demo/Free — the client never receives the number. CSS `display:none`,
opacity, or blur are **not acceptable** (the value would still be in the DOM /
clipboard / print). This is the same principle already used for the solver `redact`
flag and `demoHints` (which throws if a result is not redacted).

### What stays visible even when grams are locked
- Ingredient names, order, roles, substitutions, prep, product type, device, photo,
  batch, plain balance status. Only the **numeric quantity** per line is `🔒`.

---

## D. "Dane techniczne" (collapsed, professional but accessible)

Available to all customers as a **collapsed** disclosure on S6. It contains
professional, readable values — never Axis-A internals.

**Shown inside (structure visible to all; exact numbers gated where noted):**

| Item | Demo/Free | Home/Pro |
|------|-----------|----------|
| Nutrition per 100 g (energy, fat, sat, carbs, sugars, protein, salt) | shown (from public composition; if a value needs exact grams it shows "Niedostępne") | shown exact |
| Cost per kg / per serving | `🔒` / "dostępne w Home i Pro" | shown exact (gated on `canViewExactGrams`) |
| Plain stability & texture summary | shown (plain language) | shown (plain language) |
| Allergen reminder | shown (honest: engine holds no allergen data — check labels) | same |

**Never inside "Dane techniczne":** NPAC, POD, PAC, ice-fraction numbers, target
bands, IF9/IF10, dispatcher, routes, verification trace, raw codes. Those are
`/studio` + `/dev` only.

---

## E. Decision table (per data element)

| Data element | Demo | Free | Home | Pro | Axis |
|--------------|:----:|:----:|:----:|:---:|------|
| Ingredient name | ✅ | ✅ | ✅ | ✅ | B |
| Ingredient gram amount | 🔒 | 🔒 | ✅ | ✅ | C (`canViewExactGrams`) |
| Structure / roles (qualitative) | ✅ | ✅ | ✅ | ✅ | B |
| Product type (customer) | ✅ | ✅ | ✅ | ✅ | B |
| Internal chocolate routing | ❌ | ❌ | ❌ | ❌ | A (never surfaced) |
| Device / mode (friendly) | ✅ | ✅ | ✅ | ✅ | B |
| Secondary temp hint ("~ −11°C") | ✅ | ✅ | ✅ | ✅ | B |
| "−11°C Engine" as a headline term | ❌ | ❌ | ❌ | ❌ | A (jargon) |
| Prep guidance | ✅ | ✅ | ✅ | ✅ | B |
| Substitution actions | ✅ | ✅ | ✅ | ✅ | B |
| Balance status (plain) | ✅ | ✅ | ✅ | ✅ | B |
| Nutrition /100 g | ✅* | ✅* | ✅ | ✅ | D (*"Niedostępne" if needs exact grams) |
| Cost /kg | 🔒 | 🔒 | ✅ | ✅ | C/D |
| PAC / POD / NPAC / ice fraction | ❌ | ❌ | ❌ | ❌ | A |
| Target bands / calibration | ❌ | ❌ | ❌ | ❌ | A |
| IF9 / IF10 | ❌ | ❌ | ❌ | ❌ | A |
| Dispatcher / routes / trace | ❌ | ❌ | ❌ | ❌ | A |
| Raw violation codes | ❌ | ❌ | ❌ | ❌ | A (plain PL instead) |
| Export / clipboard / print / CSV | ❌ | ❌ | ✅ | ✅ | C |

✅ shown · 🔒 locked placeholder (data absent) · ❌ never in customer UI

---

## F. Guardrails to preserve (already in the codebase)

- `PlanGate` never mounts locked `children` — extend the same guarantee to the
  gram-redacted recipe DTO.
- `demoHints` throws if a solver result is not redacted — keep an equivalent
  assertion for the customer recipe DTO (fail closed: if grams are present for a
  Demo audience, throw, don't render).
- Gating reads **`canViewExactGrams`** only — never `isPro`, plan name, or price id.
- Honest engine/temperature pinning (`intakeToRecipe` uses the real active engine) —
  do not fake future engines or devices.

## G. Anti-patterns (do NOT do)

- ❌ CSS-hide grams (`display:none` / blur) while leaving them in the DOM, clipboard,
  print, or JSON payload.
- ❌ Show NPAC/POD/IF9 to Pro "because they paid" — that's Axis A, not Axis C.
- ❌ Translate a raw violation code into the UI verbatim.
- ❌ Surface the internal chocolate routing to justify a flavor.
- ❌ Put "−11°C Engine" / "PI Preview" as a customer-facing headline.
