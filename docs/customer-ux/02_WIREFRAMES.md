# 02 — Wireframes (screen-by-screen)

Mobile-first. Primary art is drawn at **390×844** (iPhone 12/13/14). Notes cover
430 (Pro Max), 768 (iPad portrait), 1440 (desktop). ASCII is schematic, not pixel
-exact; the numbers in `[ ]` are spec constraints, not decoration.

**Global visual system (proposed, light/premium — replaces the dark shell for the
customer flow):**

- Surface: **white `#FFFFFF`** page on a warm off-white app background `#FBFAF7`.
- Text: primary **`#191919`** (near-black); muted `#5B5B5B` (always ≥4.5:1).
- One warm neutral accent = existing **ivory `#efe9dc`** for selected fills/cards;
  a single restrained brand ink for primary buttons. No candy colors.
- Type scale (rem @16px root):
  - Question / screen H1: **1.75–2rem (28–32px), weight 400–500, line-height 1.15**
  - Body: **1.0625rem (17px), weight 400**
  - Secondary: **0.9375rem (15px)**
  - Micro label / chip: **0.8125rem (13px) minimum** (never 10px/8.8px)
- Touch targets: **min 48×48px**, 44px absolute floor, ≥12px gap.
- Radius: cards 16–20px, buttons/chips 12px. Shadow: one soft elevation only.
- Motion: 150–220ms ease; no parallax; respect `prefers-reduced-motion`.
- Bottom sheets/cards for choices; **no dense tables**; **no horizontal scroll**.

Layout frame used below:
```
┌───────────────────────────── 390 ─────────────────────────────┐  = viewport edge
│  content                                                       │
└────────────────────────────────────────────────────────────────┘
```
Safe padding: **20px** side gutters on 390/430; 32px on 768; centered max-width
**720px** for the conversation column on desktop.

---

## S0 · START — "Co dzisiaj robimy?"  (Home)

```
┌───────────────────────────── 390 ─────────────────────────────┐
│  ☰                                            PINGÜINO   ○     │  [56px top bar]
│                                                                │
│                                                                │
│                                                                │
│                Co dzisiaj robimy?                              │  [H1 32px/400]
│                                                                │
│   ┌────────────────────────────────────────────────────────┐  │
│   │  Powiedz lub napisz, jakie lody chcesz przygotować…    │  │  [field ≥56px]
│   │                                                        │  │  [body 17px]
│   └────────────────────────────────────────────────────────┘  │
│                                                                │
│                     ┌───────────────┐                         │
│                     │      🎤       │                         │  [mic 72×72px]
│                     └───────────────┘                         │  primary affordance
│                     Dotknij i mów                             │  [15px muted]
│                                                                │
│                    [  Dalej  →  ]                             │  [btn ≥48px, full-w-ish]
│                                                                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

- **One goal:** capture the idea. Mic and text field are co-equal; mic is the hero
  affordance (large circle) but text always works.
- `Dalej` is disabled until there is text OR a completed voice transcript.
- Top bar: hamburger (left), wordmark (center/right), account dot (right). Nothing
  else competes.
- **Mic states** (see `03`): idle / listening (pulsing ring + live transcript
  inline in the field) / unavailable (mic dimmed, caption "Dyktowanie niedostępne
  w tej przeglądarce — wpisz tekst").
- **430:** identical, larger gutters feel. **768:** column centered at 560px, mic
  80px. **1440:** centered 720px column, generous vertical centering; the dark
  marketing shell may remain for `/` marketing, but the conversation column is the
  light card (decision flagged in `05`).

---

## S1 · INTENT CHIPS

```
┌───────────────────────────── 390 ─────────────────────────────┐
│  ← Wróć                                       PINGÜINO         │
│                                                                │
│   Rozumiem to tak:                                            │  [H1 28px]
│                                                                │
│   Smaki                                                       │  [eyebrow 13px]
│   ┌──────────────┐ ┌──────────────┐                          │
│   │ Wanilia    ✕ │ │ Bazylia    ✕ │  + Dodaj smak            │  [chip ≥44px]
│   └──────────────┘ └──────────────┘                          │
│                                                                │
│   Ilość                                                       │
│   ┌──────────────┐                                            │
│   │ 5 kg       ✎ │   rozpoznano z Twojego opisu              │  [banked fact]
│   └──────────────┘                                            │
│                                                                │
│   Coś jeszcze do poprawienia? Dotknij, aby edytować.         │  [15px muted]
│                                                                │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐ │
│   │                    Tak, dalej  →                        │ │  [primary ≥48px]
│   └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

- Chips are large, removable (`✕`) and editable (`✎`). "Ilość 5 kg" is shown as a
  **recognized/banked** fact with provenance ("rozpoznano z Twojego opisu") so the
  user trusts why it won't be asked again.
- `+ Dodaj smak` opens a small inline field / bottom sheet, not a new screen.
- Low-confidence parse → the raw phrase appears as one editable chip labeled
  "Sprawdź:" for the user to split/confirm.
- Nothing about engines. Correcting a chip only re-opens that fact later, not the
  whole flow.

---

## S2 · PRODUCT TYPE (customer-facing only)

```
┌───────────────────────────── 390 ─────────────────────────────┐
│  ← Wróć                                       PINGÜINO         │
│                                                                │
│   Jaki to rodzaj lodów?                                       │  [H1 28px]
│                                                                │
│   ┌────────────────────────────────────────────────────────┐ │
│   │  Gelato                                                 │ │  [card ≥64px]
│   │  Na bazie mleka — klasyczne i kremowe                   │ │  [title 17px/body 15px]
│   └────────────────────────────────────────────────────────┘ │
│   ┌────────────────────────────────────────────────────────┐ │
│   │  Sorbet                                                 │ │
│   │  Bez nabiału — owoc gra pierwsze skrzypce               │ │
│   └────────────────────────────────────────────────────────┘ │
│   ┌────────────────────────────────────────────────────────┐ │
│   │  Vegan                                                  │ │
│   │  Bez składników odzwierzęcych                           │ │
│   └────────────────────────────────────────────────────────┘ │
│   ┌────────────────────────────────────────────────────────┐ │
│   │  Protein                                                │ │
│   │  Więcej białka                                          │ │
│   └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

- Full-width stacked cards (not a wrapping chip row) → big targets, one column, no
  horizontal cramming. Selected = ivory fill + checkmark + 2px ink ring (not just
  color).
- **Never** a "Chocolate" card. If the flavor implied chocolate, the type stays
  **Gelato** and routing is internal.
- Selecting Gelato/Sorbet/Vegan → S3. Selecting **Protein → S2b**.

### S2b · PROTEIN — honest unsupported state

```
┌───────────────────────────── 390 ─────────────────────────────┐
│  ← Wróć                                       PINGÜINO         │
│                                                                │
│   Protein — jeszcze nad tym pracujemy                         │  [H1 28px]
│                                                                │
│   Nie mamy jeszcze dedykowanego profilu dla lodów             │  [body 17px]
│   proteinowych, więc nie policzymy dla nich dokładnej         │
│   receptury. Nie chcemy zgadywać.                             │
│                                                                │
│   Zapisaliśmy Twój pomysł: Wanilia · Protein · 5 kg          │  [captured, ivory card]
│                                                                │
│   ┌────────────────────────────────────────────────────────┐ │
│   │  Zrób to jako Gelato (na bazie mleka)                   │ │  [alt, honest]
│   └────────────────────────────────────────────────────────┘ │
│   ┌────────────────────────────────────────────────────────┐ │
│   │  Powiadom mnie, gdy Protein będzie gotowy               │ │
│   └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

- Deterministic, calm, **no fabricated recipe**. Intent is captured/echoed. Two
  honest exits: nearest supported type, or notify-me. (Notify-me is a stated
  intent, not a promise of email plumbing that doesn't exist — copy stays honest;
  see GAPS.)

---

## S3 · EQUIPMENT / SERVING MODE (large cards)

```
┌───────────────────────────── 390 ─────────────────────────────┐
│  ← Wróć                                       PINGÜINO         │
│                                                                │
│   Na czym podajesz albo mrozisz?                              │  [H1 28px]
│                                                                │
│   ┌─────────────────────────┐ ┌─────────────────────────┐    │
│   │  Ninja                  │ │  Ninja Swirl            │    │  [card ≥96px, 2-up]
│   │  Miękkie · świeże       │ │  Miękkie · świeże       │    │
│   │  ⓘ pojemność do potw.   │ │  ⓘ pojemność do potw.   │    │  [unverified note]
│   └─────────────────────────┘ └─────────────────────────┘    │
│   ┌─────────────────────────┐ ┌─────────────────────────┐    │
│   │  Witryna                │ │  −11°C                  │    │
│   │  Świeże gelato          │ │  Miękkie · około −11°C  │    │  [temp secondary]
│   └─────────────────────────┘ └─────────────────────────┘    │
│   ┌─────────────────────────┐ ┌─────────────────────────┐    │
│   │  −12°C                  │ │  −13°C                  │    │
│   │  Twardsze · ok. −12°C   │ │  Twarde · ok. −13°C     │    │
│   │  ⓘ podgląd              │ │  ⓘ podgląd              │    │  [preview honesty]
│   └─────────────────────────┘ └─────────────────────────┘    │
│   ┌─────────────────────────┐ ┌─────────────────────────┐    │
│   │  −18°C                  │ │  Własne ustawienie      │    │
│   │  Do przechowywania      │ │  Ustaw ręcznie          │    │
│   └─────────────────────────┘ └─────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

- Device/mode label is **primary**; temperature is **secondary** ("około −11°C").
- **Capacity behavior on select:**
  - **Verified capacity** (device configured & confirmed) → toast "Ustawiłem
    partię na X kg dla tego urządzenia" → **skip S4**, go to S5.
  - **Unverified capacity** → open a one-time confirm sheet:
    ```
    ┌─── bottom sheet ───────────────────────────────┐
    │  Jaka jest pojemność tego urządzenia?          │
    │  ┌──────────────┐  jednostka: [ ml | g ]       │
    │  │   ____       │                              │
    │  └──────────────┘                              │
    │  Podaj w gramach, jeśli znasz. Jeśli w ml,     │
    │  policzymy masę wg gęstości mieszanki.         │  ← never ml==g blindly
    │              [ Zapisz pojemność ]              │
    └────────────────────────────────────────────────┘
    ```
    Ask **once**. Never hardcode 480 ml. Never equate ml↔g without density.
- `−12/−13/−18/Fresh` carry the existing "podgląd — liczone na −11°C" honesty note.
- **Devices don't exist in code yet** (only temperature `servingProfiles`) — GAPS.

**768/1440:** 3-up then 4-up grid; cards grow, labels unchanged.

---

## S4 · BATCH (only if not already known)

```
┌───────────────────────────── 390 ─────────────────────────────┐
│  ← Wróć                                       PINGÜINO         │
│                                                                │
│   Ile chcesz zrobić?                                          │  [H1 28px]
│                                                                │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│   │   1 kg     │ │   5 kg     │ │   10 kg    │               │  [chip-card ≥64px]
│   └────────────┘ └────────────┘ └────────────┘               │
│   ┌────────────────────────────────────────────────────────┐ │
│   │  Własna ilość                                           │ │
│   └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

- **This screen never appears** when batch is known (utterance "5 kg" or a verified
  device capacity). If it appears and the user picks "Własna ilość", a numeric
  sheet opens (kg default, with a g toggle).

---

## S5 · FORK — two equal paths (inline, not a modal)

```
┌───────────────────────────── 390 ─────────────────────────────┐
│  ← Wróć                                       PINGÜINO         │
│                                                                │
│   Wanilia · Bazylia · Gelato · Ninja · 5 kg                  │  [summary chips 15px]
│                                                                │
│   Jak chcesz działać?                                        │  [H1 28px]
│                                                                │
│   ┌────────────────────────────────────────────────────────┐ │
│   │                                                        │ │
│   │        Stwórz nową recepturę                           │ │  [card A ≥120px]
│   │        PINGÜINO zbalansuje ją od zera                  │ │
│   │                                                        │ │
│   └────────────────────────────────────────────────────────┘ │
│   ┌────────────────────────────────────────────────────────┐ │
│   │                                                        │ │
│   │        Pokaż pasujące gotowe receptury                 │ │  [card B ≥120px]
│   │        Zacznij od sprawdzonej bazy                     │ │
│   │                                                        │ │
│   └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

- Two equally sized, equally weighted cards. **No interrupting modal.** The summary
  chip strip at top confirms the banked facts one last time (still editable by
  tapping back).

---

## S5b · READY RECIPES (5–6 cards)

```
┌───────────────────────────── 390 ─────────────────────────────┐
│  ← Wróć                                       PINGÜINO         │
│                                                                │
│   Pasujące receptury                                         │  [H1 28px]
│                                                                │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ ┌────────────────────────────────────────────────────┐ │ │
│   │ │            [ real photo 16:9 ]                     │ │ │  [img, lazy]
│   │ └────────────────────────────────────────────────────┘ │ │
│   │  Wanilia Klasyczna                     Gelato          │ │  [title 17px / type]
│   │  Kremowa baza mleczna, czysty smak wanilii            │ │  [desc 15px]
│   │  #wanilia  #kremowe                                   │ │  [tags 13px]
│   │  ✓ Najbliższa Twojemu pomysłowi                       │ │  [HONEST match note]
│   │  [ Zobacz recepturę ]   [ Użyj jako punkt wyjścia ]   │ │  [2 btns ≥48px]
│   └────────────────────────────────────────────────────────┘ │
│   ┌────────────────────────────────────────────────────────┐ │
│   │  … card 2 …                                            │ │
│   └────────────────────────────────────────────────────────┘ │
│                         ⋮ (5–6 total)                        │
└────────────────────────────────────────────────────────────────┘
```

- One card per row on mobile (never a table). Real photo required; while missing,
  a labeled neutral placeholder + "zdjęcie wkrótce" (honest), not a fake image.
- Match note is **honest and categorical** ("Najbliższa Twojemu pomysłowi",
  "Dobre dopasowanie", "Inna baza") — **never a fabricated percentage.**
- `Zobacz recepturę` → S6 read view. `Użyj jako punkt wyjścia` → loads into S6 as a
  starting point.
- **768:** 2 cards/row. **1440:** 3 cards/row, max-width 1120px.

---

## S6 · RESULT RECIPE CARD (the deliverable)

```
┌───────────────────────────── 390 ─────────────────────────────┐
│  ← Wróć                                       PINGÜINO         │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐ │
│   │             [ real photo 16:9 ]                        │ │
│   └────────────────────────────────────────────────────────┘ │
│   Wanilia Klasyczna                                          │  [H1 28px]
│   Gelato · Ninja · 5 kg                                      │  [meta 15px]
│                                                                │
│   Status: ✓ Zbilansowane — gotowe do produkcji              │  [friendly status]
│                                                                │
│   Składniki                                                  │  [eyebrow 13px]
│   ┌────────────────────────────────────────────────────────┐ │
│   │  Mleko 3,5%                                     🔒     │ │  ← Demo: name shown,
│   │  Śmietana 30%                                   🔒     │ │     gram = 🔒
│   │  Mleko w proszku odtłuszczone                  🔒     │ │
│   │  Cukier (sacharoza)                            🔒     │ │
│   │  Dekstroza                                     🔒     │ │
│   │  Guma tara                                     🔒     │ │
│   └────────────────────────────────────────────────────────┘ │
│   ( Home/Pro: 🔒 → "3350 g", "650 g", … exact grams )        │
│                                                                │
│   Jak to zrobić                                              │  [prep, always shown]
│   1. …  2. …  3. …                                           │
│                                                                │
│   ▸ Dane techniczne                                          │  [collapsed disclosure]
│                                                                │
│  ┌── Demo-only, sticky bottom, non-covering ───────────────┐ │
│  │  Odblokuj dokładne ilości                               │ │
│  │  [ Wybierz Home ]        [ Zobacz Pro ]                 │ │  [one card only]
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

- **Always visible:** photo, title, product type, device/mode, batch, full
  ingredient **names** in QUID-style order, substitution actions, prep guidance,
  a customer-friendly balance status.
- **Grams:** Demo/Free → `🔒` per line (grams absent at data layer — see `07`).
  Home/Pro (`canViewExactGrams`) → exact grams.
- **"Dane techniczne"** starts collapsed and holds the professional-but-secondary
  numbers (see `07_HIDE_VS_SHOW.md`). Raw engine internals (NPAC/POD/IF9/IF10/
  dispatcher/routes/violation codes) are **never** here — they stay dev-only.
- **Balance status** is a plain-language mapping of the engine verdict, not the raw
  indicator set.
- **Upgrade card:** exactly one, Demo/Free only, pinned to the bottom of the recipe,
  **never overlaying** the ingredient list (it sits below the fold, sticky within
  the card container). Actions: **Wybierz Home / Zobacz Pro**.

**768/1440 (result):** two columns — photo + meta + ingredients left, prep + Dane
techniczne right; the upgrade card spans full width at the bottom. Still one recipe,
one goal; never a lab dashboard.

---

## Persistent chrome

### Top bar (all screens)
```
[ ☰ ]                    PINGÜINO                    [ ○ account ]
```
- 56px tall, white, hairline bottom border. Back arrow replaces ☰ inside the flow.

### Mobile menu (bottom sheet, replaces the flat dark drawer)
```
┌─── bottom sheet ────────────────────────────────┐
│  ▁▁ (grab handle)                                │
│  Nowa receptura                                  │  [live]
│  Moje receptury                                  │  [live]
│  Receptury PINGÜINO                              │  [live]
│  ─────────────────────────────                   │
│  Subskrypcja                                     │
│  Konto: pinguino@…            Wyloguj            │
│  ─────────────────────────────                   │
│  Wkrótce: Etykiety · API · Składniki             │  [grouped, muted, honest]
└──────────────────────────────────────────────────┘
```
- Groups **live** vs **coming-soon** instead of interleaving dead rows. Targets
  ≥48px. Not an 8-item flat list.

---

## What each wireframe deliberately avoids

- No dark technical dashboard, no sticky lab rail, no nested scroll.
- No table/column strip for recipes.
- No engine jargon on any customer screen.
- No wrapping chip grid for the primary choice (stacked full-width cards instead).
- No fake match %, no fabricated recipe for unsupported Protein, no hardcoded
  480 ml, no ml==g assumption.
