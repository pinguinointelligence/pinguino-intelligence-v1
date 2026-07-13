# 01 — Customer Journey (canonical conversational flow)

Persona: **a working gelato maker on their phone in the shop.** Not a food
scientist. Wants: "tell it what I want, get a recipe I can trust and make today."
Language: **Polish.** Tone: calm, professional, conversational — one question at a
time. Apple-like: progressive disclosure, technical detail hidden by default.

Canonical rule threaded through every step:
**NEVER ask twice for anything already recognized reliably.**

Gram visibility is gated ONLY on the canonical capability **`canViewExactGrams`**
(Home + Pro true; Demo/Free false) — never a raw `isPro`.

---

## Journey map (happy path + honest branches)

```
        ┌─────────────────────────────────────────────────────────────┐
        │  S0  START  "Co dzisiaj robimy?"                             │
        │      big text field + big mic button                        │
        └───────────────┬─────────────────────────────────────────────┘
                        │ voice OR text: "Zrób 5 kg wanilii i bazylii"
                        ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  S1  INTENT CHIPS  (editable, removable, correctable)        │
        │      [Wanilia ✕] [Bazylia ✕]  + "Dodaj smak"                │
        │      recognized: batch=5 kg  → will NOT be asked again       │
        └───────────────┬─────────────────────────────────────────────┘
                        │ confirm chips
                        ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  S2  PRODUCT TYPE  (customer types ONLY)                     │
        │      Gelato · Sorbet · Vegan · Protein                       │
        │      (Chocolate is NEVER shown — internal routing)           │
        └───────┬──────────────────────────────────┬──────────────────┘
                │ Gelato/Sorbet/Vegan              │ Protein
                │                                  ▼
                │                    ┌──────────────────────────────┐
                │                    │ S2b UNSUPPORTED (honest)     │
                │                    │ "Protein — jeszcze nie mamy  │
                │                    │  dedykowanego profilu."      │
                │                    │ Capture intent, save note,   │
                │                    │ offer nearest OR notify-me.  │
                │                    │ NEVER fabricate a recipe.    │
                │                    └──────────────────────────────┘
                ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  S3  EQUIPMENT / SERVING MODE  (large cards)                 │
        │      Ninja · Ninja Swirl · Witryna (świeże gelato) ·         │
        │      −11°C · −12°C · −13°C · −18°C · Własne ustawienie       │
        │      label first, temp secondary: "Miękkie · około −11°C"    │
        │      • verified capacity preset → auto-set batch, SKIP S4    │
        │      • unverified capacity → ask once ("awaiting confirm")   │
        └───────────────┬─────────────────────────────────────────────┘
                        │ batch already known (5 kg) OR device set it
                        ▼  (else S4)
        ┌─────────────────────────────────────────────────────────────┐
        │  S4  BATCH  (only if NOT already supplied)                   │
        │      1 kg · 5 kg · 10 kg · Własna ilość                      │
        │      "Zrób 5 kg wanilii" already set 5 kg → S4 is SKIPPED    │
        └───────────────┬─────────────────────────────────────────────┘
                        ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  S5  FORK  (two EQUAL paths — not a modal)                   │
        │   ┌───────────────────────┐   ┌───────────────────────────┐ │
        │   │ Stwórz nową recepturę │   │ Pokaż pasujące gotowe     │ │
        │   │                       │   │ receptury                 │ │
        │   └──────────┬────────────┘   └────────────┬──────────────┘ │
        └──────────────┼──────────────────────────────┼───────────────┘
                       ▼                               ▼
        ┌──────────────────────────┐    ┌────────────────────────────────┐
        │ S6  RESULT RECIPE CARD   │    │ S5b  READY RECIPES (5–6 cards)  │
        │  photo, title, device,   │    │  photo · name · desc · type ·   │
        │  batch, full ingredient  │    │  tags · honest compat note      │
        │  list, prep guidance,    │    │  "Najbliższa Twojemu pomysłowi" │
        │  customer balance status │    │  [Zobacz recepturę]             │
        │  [Dane techniczne ▸]     │    │  [Użyj jako punkt wyjścia]      │
        └──────────┬───────────────┘    └────────────┬───────────────────┘
                   │                                  │ pick a card
                   │                                  ▼
                   │                       (loads into S6 as start point)
                   ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  S6-Demo  UPGRADE  (only for Demo/Free — grams are 🔒)       │
        │  one clean sticky-but-non-covering card at the card bottom:  │
        │  "Odblokuj dokładne ilości"                                  │
        │  [Wybierz Home]   [Zobacz Pro]                              │
        └─────────────────────────────────────────────────────────────┘
```

---

## Step-by-step narrative

### S0 · Start — "Co dzisiaj robimy?"
- One goal: capture intent. Big centered question (H1), one large text field,
  one large mic button of equal visual weight.
- **Voice** uses the browser Web Speech API **only if available and permitted**;
  otherwise the mic is disabled with an honest label and text is the fallback.
  (Today there is NO working mic — see GAPS / `03_INTERACTION_STATES.md §Mic`.)
- No engine vocabulary. No "PI Preview". No "−11°C Engine".

### S1 · Intent chips
- Parse the utterance into **editable chips**: flavors (Wanilia, Bazylia, Mięta),
  and any **recognized** quantity/type. Each chip is removable (✕) and correctable.
- **Recognized facts are banked and never re-asked.** "Zrób 5 kg wanilii" →
  batch chip `5 kg` shown here; S4 is skipped later.
- If parsing is low-confidence, show the raw text as a single editable chip and let
  the user split/confirm — never silently guess a flavor that wasn't said.
- (Today: no parsing exists — flavor is stored verbatim. This step is NET-NEW.)

### S2 · Product type — customer-facing only
- Exactly four customer choices: **Gelato · Sorbet · Vegan · Protein.**
- **"Chocolate" is NEVER a user type.** "Lody czekoladowe z pomarańczą" stays
  visibly **Gelato**; internally it routes to the chocolate engine profile. The
  customer never sees the word "chocolate profile" or a chocolate category chip.
- Selecting a type sets the internal engine category (Gelato→milk, Sorbet→sorbet,
  Vegan→vegan). Chocolate routing is a hidden mapping from flavor terms, not a chip.

### S2b · Protein (honest unsupported state)
- Protein has **no supported Engine profile** (`productProfiles.ts` pins it to
  `milk_gelato` with a pendingNote). The new UX must **stop and be honest**:
  - acknowledge the request, capture the intent (flavor + "protein"),
  - present a **deterministic** "not yet supported" state,
  - offer honest alternatives: nearest supported type OR "powiadom mnie",
  - **never fabricate** a protein recipe or dose.
- No dead end feeling: the capture is warm and the alternative is one tap.

### S3 · Equipment / serving mode
- Large tappable cards. **Customer-friendly device labels first; temperature
  secondary:** "Miękkie · około −11°C", "Witryna · świeże gelato".
- Options include devices (**Ninja, Ninja Swirl, Witryna**) and temperature modes
  (**−11 / −12 / −13 / −18°C**) plus **Własne ustawienie**.
- **Capacity logic (critical honesty):**
  - A configured device preset with a **VERIFIED** capacity **auto-sets batch and
    skips S4**.
  - **Unverified capacity = "oczekuje potwierdzenia"** → ask **once**, never guess,
    **never hardcode 480 ml**, **never equate ml and grams without density.**
- Only the −11°C engine is connected today; other temps are honest previews
  (still computed on −11°C, with a calm note) — reuse existing `servingProfiles`
  honesty. **Devices (Ninja/Swirl/Witryna) do not exist yet — see GAPS.**

### S4 · Batch (conditional)
- Shown **only if batch is not already known** (not in the utterance, not implied by
  a verified device). Options: **1 kg · 5 kg · 10 kg · Własna ilość.**
- If "Zrób 5 kg wanilii" was said, this step does not appear.

### S5 · Fork — two equal paths
- Two equally weighted actions (NOT an interrupting modal):
  - **"Stwórz nową recepturę"** → S6 result card.
  - **"Pokaż pasujące gotowe receptury"** → S5b.

### S5b · Ready recipes (5–6 cards)
- Real photo, name, short description, product type, flavor tags, an **honest**
  compatibility note ("Najbliższa Twojemu pomysłowi" — **NO fake "94% match"**),
  plus **[Zobacz recepturę]** and **[Użyj jako punkt wyjścia]**.
- Picking "Użyj jako punkt wyjścia" loads that recipe into S6 as the starting point.
- (Today: no catalogue, no photos, no per-recipe pages — see GAPS.)

### S6 · Result recipe card
- The single calm deliverable: **photo, title, device/mode, batch, full ingredient
  list, prep guidance, a customer-friendly balance status** (e.g. "Zbilansowane —
  gotowe do produkcji"), and a collapsed **"Dane techniczne"** section.
- **Demo/Free:** every ingredient **name + structure + type + photo + device/mode +
  description + substitutions + prep** are visible; **only gram amounts show 🔒**.
  Grams are absent at the data layer before render/clipboard/print/CSV/apply
  (see `07_HIDE_VS_SHOW.md`).
- **Home/Pro (`canViewExactGrams`):** exact grams are shown.

### S6-Demo · Upgrade
- For Demo/Free only: **one** clean card pinned at the bottom of the recipe (sticky
  but never covering the recipe): **"Odblokuj dokładne ilości"** with **[Wybierz
  Home]** and **[Zobacz Pro]**. No repeated banners, no aggressive interstitials.

---

## Recognition & "never ask twice" ledger

The conversation keeps a small **known-facts ledger**; a step is skipped whenever
its fact is already known with sufficient confidence.

| Fact | Set by | Skips |
|------|--------|-------|
| flavor(s) | S0 utterance → S1 chips | re-entry of flavor |
| product type | S0 utterance (if explicit) OR S2 | S2 if explicit & unambiguous |
| device/mode | S0 (if named) OR S3 | S3 if named |
| batch | S0 utterance ("5 kg") OR verified device capacity OR S4 | S4 |

Rules:
- Only skip on **high-confidence** recognition; ambiguous → confirm via a chip, do
  not assume.
- The ledger is shown back to the user as chips (S1) so they can correct anything
  before it hardens. Correcting a chip re-opens exactly the affected step, nothing
  else.

---

## Emotional arc

1. **Invited** (S0): "just tell me" — no form, no jargon.
2. **Understood** (S1): "it heard me, and I can fix it".
3. **Guided, not quizzed** (S2–S4): few, large, obvious choices; nothing re-asked.
4. **Trusted** (S5–S6): a real, photographed, balanced recipe — honest about what
   it can and can't do (Protein, unverified capacity, preview temperatures).
5. **Offered, not pushed** (S6-Demo): one calm upgrade, two clear options.
