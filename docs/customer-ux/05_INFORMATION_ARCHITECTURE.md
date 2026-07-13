# 05 — Information Architecture + Desktop Adaptation

The customer product is a **conversation that produces a recipe**, not a dashboard.
IA is organized around that one job. Expert/technical surfaces (Advanced Studio,
dev pages) still exist but are **not** the customer's default path.

---

## 1. Customer-facing IA (what a customer can reach)

```
PINGÜINO (customer)
│
├─ Start  (/)  ─────────────── the conversation
│    S0 prompt → S1 chips → S2 type → S3 equipment → S4 batch → S5 fork
│                                          │
│                                          ├─ S5b Ready recipes → S6
│                                          └─ S6 Result recipe card
│
├─ Moje receptury  (/my-recipes) ── saved recipes as CARDS (not a table)
│
├─ Receptury PINGÜINO  (/recipes) ── curated catalogue (cards, photos)
│    └─ Receptura  (/recipes/:id) ── single recipe read view  [NET-NEW]
│
├─ Subskrypcja  (/subscription) ── Free Preview vs Home vs Pro
│
└─ Konto  (account) ── sign in / identity / sign out
```

**Deferred / honest "coming soon" (grouped, not interleaved):**
Etykiety (/label) · API (/api) · Składniki (/create-ingredient) · Work With Us
(/work-with-us). These remain reachable but are clearly future — they must **not**
sit inside the primary customer path or masquerade as ready features.

**Expert / non-customer (kept, not removed, not primary):**
Advanced Studio (/studio, /demo) · all /dev/* surfaces · product import. These are
the professional/engineering surfaces; the customer conversation never dumps the
user into them unless they explicitly choose the Studio.

---

## 2. Primary navigation model

Today: 8 centered mega-menu items, **hidden below 1280px**, replaced by a flat
hamburger drawer (audit A-18/19). Proposed customer-first model:

**Reduce top-level to what a customer needs:**

| Priority | Item | Route | Notes |
|----------|------|-------|-------|
| 1 | Start | `/` | the conversation (home) |
| 2 | Receptury | `/recipes` | curated catalogue |
| 3 | Moje receptury | `/my-recipes` | signed-in |
| 4 | Subskrypcja | `/subscription` | plans |
| 5 | Konto | account | sign in / out |

Everything else (Etykiety, API, Składniki, Work With Us, Advanced Studio) moves to a
secondary group ("Więcej" / "Dla profesjonalistów") or the footer. The mega-menu's
8-across Tesla pattern is a **desktop marketing** device; the **customer app**
navigation is this short, honest list.

### Mobile / tablet nav (≤1024px)
- A **bottom sheet menu** (grab handle) grouping **live** items, **account**, and a
  muted **"Wkrótce"** group — replacing the flat 8-item dark drawer.
- Inside the conversation, the top-left control is **Back**, not the hamburger, so
  the user always has a one-tap retreat that preserves banked facts.

### Desktop nav (≥1280px)
- The centered nav may keep the premium marketing mega-menus on the **marketing**
  home, but the **conversation** renders in a centered light column regardless of
  width — the conversation IA does not change by breakpoint, only its measure does.

---

## 3. Desktop adaptation (responsive, NOT an admin dashboard)

The desktop version is the **same conversation, wider** — never a control panel.

| Screen | Mobile (390–430) | Tablet (768) | Desktop (1280–1440) |
|--------|------------------|--------------|---------------------|
| S0 Start | full-width column, mic 72px | centered 560px, mic 80px | centered 720px, generous vertical whitespace |
| S1 Chips | stacked | centered column | centered column, chips flow 2–3 per row |
| S2 Type | 1 card/row | 1 card/row | 2 cards/row, same card design |
| S3 Equipment | 2-up grid | 3-up | 4-up |
| S4 Batch | chips wrap | chips inline | chips inline |
| S5 Fork | 2 stacked cards | 2 stacked | 2 side-by-side equal cards |
| S5b Ready | 1 card/row | 2/row | 3/row (max-width 1120px) |
| S6 Result | single column | 2-col (photo+ingredients / prep+technical) | 2-col, wider gutters |

**Hard rules for the desktop adaptation:**
- Max content width **≤1120px** for cards, **≤720px** for the conversation column —
  never a full-bleed dashboard.
- **No sticky lab rail, no nested internal scroll** (kills `StudioPage` right-rail
  pattern for customers).
- Whitespace scales up, information density does **not**. More width = more air, not
  more panels.
- The recipe result stays **one recipe**; the second desktop column is prep +
  "Dane techniczne", not a live PI dashboard.

---

## 4. State & capability IA

Capability gating is centralized and must stay the single source of truth:

- **Gram visibility:** `canViewExactGrams` (from `access/plans.ts` capabilities and
  mirrored in `pro-core/proCoreCapabilities.ts`). Demo/Free = false, Home/Pro = true.
  The UI reads this boolean; it never inspects `isPro`, a plan name, or a price id.
- **Tiers → customer language:**
  - internal `demo` → **"Free Preview"** (never "Demo" in customer copy; already the
    rule in `en.ts status.demo`).
  - internal `home` → **"Home"** (single saved recipe, exact grams).
  - internal `pro` → **"Pro"** (full workspace).
- **Save/versions/production/export** gating stays as defined in
  `proCoreCapabilities.ts` (Home = 1 recipe + versions; Pro = unlimited + Production;
  Demo = none). The customer UX surfaces these as calm capability lines, not code.

---

## 5. Content model needed to support this IA (net-new data)

The IA above assumes data that **does not fully exist yet** (see GAPS):

1. **Recipe catalogue** with: id, name, product type, flavor tags, description,
   **photo**, engine/device compatibility metadata, and a per-recipe read page
   (`/recipes/:id`). Today only decorative `ImagePlaceholder` tiles exist.
2. **Device presets** (Ninja, Ninja Swirl, Witryna) with **verified** capacity +
   density metadata for the ml→g and auto-batch logic. Today only temperature
   `servingProfiles` exist.
3. **Flavor→routing map** (e.g. chocolate terms → chocolate engine profile) so the
   customer type stays Gelato while the engine routes correctly. Today `flavorIdea`
   is verbatim with no parsing.
4. **Intent parser** output shape (flavors[], productTypeGuess?, batch?, device?)
   feeding the S1 chips + "never ask twice" ledger.

---

## 6. Open decision to escalate to the owner

**Light vs dark shell for the customer flow.**
- The brief mandates **white/light premium; no dark technical dashboard.**
- Memory / Phase 6C records a standing **owner decision**: shell `#1a1a1a` black,
  ivory `#efe9dc` — "final".
- These conflict for the **customer conversational surfaces** specifically. This
  spec proposes: **the conversation + recipe result render on the light surface**
  (per the brief), while the **marketing home / mega-menu brand shell** may remain
  dark. This is a product decision, not something to silently override — flagged
  here and in the return summary as a **DECISION NEEDED**, not a resolved change.
  (No code was changed either way.)
