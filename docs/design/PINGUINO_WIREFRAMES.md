# PINGÜINO — WIREFRAMES (Masterpiece UX/UI, Phase 2)

Date: 2026-07-24 · Agent G. All labels below are REAL copy from `src/copy/en.ts`,
`customerShellCopy.ts` and `landingCopy.ts` — no invented decorative modules. Wireframes describe
the TARGET presentation; where a surface is owned by another agent tonight, the frame is marked
`[post-merge]` and only documents intent.

Conventions: `▓` dark professional surface (`--color-shell`) · `░` light surface (`--color-paper`) ·
`[BTN]` primary action · `(btn)` secondary · `⋯` contextual menu · `≡` hamburger · `◆` logo mark.

---

## 1. Demo — mobile (375 px) — `/start`  `[post-merge: CustomerShellV1 seam]`

```
░─────────────────────────────░
░ ◆ PINGÜINO              ≡  ░   ← logo LEFT, hamburger RIGHT (frozen baseline)
░─────────────────────────────░
░  Co dziś robimy?            ░   ← one question, one field (ChatGPT-simple)
░  ┌─────────────────────┐    ░
░  │ Opisz pomysł…       │    ░
░  └─────────────────────┘    ░
░  [ Dalej ]                  ░   ← ONE primary action visible
░                             ░
░  (Zacznij od nowa)          ░
░─────────────────────────────░
░ sticky CTA (StickyCta) when ░
░ a result exists             ░
░─────────────────────────────░
```
Result screen keeps: compact context line (`Gelato mleczne · 1330 g`), ingredient rows
(`IngredientRow`), Monitor PI section collapsed by default, resolution via bottom sheet
(`ResolutionSheet`). No horizontal scroll; keyboard never covers the input (safe-area padding).

## 2. Demo — desktop (1440 px)

Same single centered column (max-w-2xl) for the conversation; the result screen widens to a
two-column layout: ingredients left, `Monitor PI` summary right — matching the Pro layout grammar
so the upgrade feels like “more of the same”, not a different app.

---

## 3. Home — mobile & desktop (post-P0; Home persona lands in `/start` flow + saved recipes)

Menu target (task brief): `Nowa receptura`, `Moje receptury`, `Gotowe receptury`, `Moja maszyna`,
`Etykiety i produkty` (capability), `Mój plan / Konto`, `Wyloguj się`. Today's canonical drawer
already carries: Strona główna / Stwórz recepturę / PINGÜINO Pro / Gotowe receptury / Moje receptury /
Moja maszyna / Etykiety i produkty / Subskrypcja / Plan + Konto footer. Delta = labels only
(`Stwórz recepturę` ≈ `Nowa receptura`) — RENAME CANDIDATE recorded, no item is missing.

---

## 4. PINGÜINO Pro — recipe workspace, mobile (390 px) — `/pro/recipe`

```
▓─────────────────────────────▓
▓ ◆ PINGÜINO              ≡  ▓   ← ONE header (AppShell), dark professional scope
▓─────────────────────────────▓
▓ STICKY WORKBAR              ▓
▓ ┌─────────────────────────┐ ▓
▓ │ Pistacja Premium    ✎  ⋯│ ▓   ← name + rename + contextual ⋯
▓ │ [ Zapisz nową wersję ]  │ ▓
▓ │ Carpigiani … · −12°C ·  │ ▓
▓ │ 1330 g                  │ ▓   ← compact context (machine · serving · batch)
▓ │ 17.07.2026 · v6 ·       │ ▓
▓ │ Wszystkie zmiany zapisane│ ▓   ← ONE saved-state truth line
▓ │ (Monitor PI) [Przelicz  │ ▓
▓ │              z PI]      │ ▓   ← never scroll to find these
▓ └─────────────────────────┘ ▓
▓ Preview panel (on Przelicz) ▓   ← ProRecalcPanel: Podgląd → Zastosuj/Anuluj → Cofnij
▓─────────────────────────────▓
▓ Cel receptury (collapsed on ▓
▓ mobile after first setup)   ▓
▓ Składniki                   ▓
▓  Mleko 3,5%        620 g 🔒 ▓
▓  Śmietanka 30%     220 g    ▓
▓  Pasta pistacjowa  140 g ●  ▓   ← ● Główny
▓  + Dodaj składnik           ▓
▓  Suma partii   1330 g / Cel ▓
▓ Dopasowanie receptury  8,4  ▓
▓ Monitor PI → (opens sheet)  ▓
▓ Narzędzia zaawansowane ▸    ▓   ← collapsed by default
▓─────────────────────────────▓
```
Monitor = bottom sheet (85 vh, rounded top). Priorities preserved: ingredients → grams →
lock/availability → add/replace/remove → total → status. No nested scroll regions on mobile.

## 5. PINGÜINO Pro — desktop (1440 px)

```
▓───────────────────────────────────────────────────────────────▓
▓ ◆ PINGÜINO                                  [persona chip] ≡  ▓
▓ Receptura · Monitor · Wersje · Produkcja · Historia · Koszty  ▓  ← section switcher,
▓   · Eksporty · Ustawienia · Maszyna                           ▓    subordinate to header
▓───────────────────────────────────────────────────────────────▓
▓ STICKY WORKBAR (one row: name+save | context · v6 · status |  ▓
▓                 (Monitor PI) [Przelicz z PI])                 ▓
▓───────────────────────────────────────────────────────────────▓
▓ ┌ editor central ────────────────┐ ┌ lab rail (sticky) ─────┐ ▓
▓ │ Cel receptury                  │ │ Dopasowanie receptury  │ ▓
▓ │ Składniki (rows + locks + add) │ │ Monitor Pro (pinnable) │ ▓
▓ │ Blokady / Preview → Zastosuj   │ │ Nutrition · Cost       │ ▓
▓ │                                │ │ Corrections            │ ▓
▓ │                                │ │ Narzędzia zaawansowane▸│ ▓
▓ └────────────────────────────────┘ └────────────────────────┘ ▓
```
Editor central, Monitor pinned right (already the `lg:grid-cols-[1fr_minmax(380px,420px)]`
grammar) — Phase 5 unifies the SURROUNDING chrome to the same dark professional scope so the page
stops being a light/dark sandwich.

---

## 6. Menus (canonical drawer — real `appNav.ts` items)

```
Demo persona                  Pro persona
┌──────────── Menu ✕┐         ┌──────────── Menu ✕┐
│ NAWIGACJA         │         │ NAWIGACJA         │
│ Strona główna     │         │ … (8 items)       │
│ Stwórz recepturę  │         │ PINGÜINO PRO      │
│ PINGÜINO Pro      │← gate   │ Receptura         │
│ Gotowe receptury  │         │ Monitor PI        │
│ Moje receptury    │         │ Wersje            │
│ Moja maszyna      │         │ Produkcja         │
│ Etykiety i produkty│        │ Historia produkcji│
│ Subskrypcja / Plan│         │ Koszty            │
│ KONTO             │         │ Eksporty          │
│ Zaloguj się       │         │ Ustawienia        │
└───────────────────┘         │ KONTO             │
                              │ email · Plan Pro  │
                              │ Wyloguj się       │
                              └───────────────────┘
```
Right-side drawer, focus trap, Escape, focus return (already shipped). Review-mode adds red
`DO PRZEGLĄDU` badges beside duplicated/legacy entries (staging + owner only).

## 7. Monitor PI — drawer (desktop) & bottom sheet (mobile)

```
┌──────────── MONITOR PI ✕┐    First layer (SIMPLE):
│ Dopasowanie      8,4/10 │      one statement each —
│ Słodycz          w normie│     „w normie” / „wymaga uwagi” /
│ Miękkość         w normie│     „prowizoryczne” / „nieocenione”
│ Kremowość        uwaga ▲│
│ Pełnia           w normie│    Advanced (progressive disclosure):
│ Stabilność       w normie│    ▸ Zachowanie w temperaturze
│ Gotowość         gotowe  │    ▸ Cukry ▸ Woda i zamrażanie
│ ────────────────────────│    ▸ Tłuszcze ▸ Białka ▸ Ciała stałe
│ ▸ Parametry zaawansowane│    ▸ Stabilizacja ▸ Alkohol
└─────────────────────────┘
```
Presentation wrapper over the EXISTING `UserMonitorPro` module data — no data logic changes.
Mobile: same content as bottom sheet (85 vh). Focus trap + Escape + focus return required (parity
with AppNavDrawer — recorded as a11y note).

## 8. Preview (Przelicz z PI result) `[post-merge: ConstraintPreviewCard is Agent A's]`

```
┌ PRZELICZENIE Z PI ──────── Zamknij ┐
│ ZMIENIONO                          │  amount changes (old → new, mono nums)
│ DODANO PRZEZ PI                    │  new approved technological ingredients
│ USUNIĘTO / WYKLUCZONO              │
│ ZACHOWANO                          │  locks + unchanged important lines
│ EFEKT                              │  score, batch, Monitor changes, warnings
│ [ Zastosuj zmiany ]  (Anuluj)      │
│ po zastosowaniu: (Cofnij)          │
│   [ Zapisz nową wersję ]           │
└────────────────────────────────────┘
```
Flow feeling: Zmień → Przelicz z PI → Podgląd → Zastosuj/Anuluj → Cofnij → Zapisz wersję.
The five-group presentation is a Phase-5+ wrapper over the existing preview data; the failure
states already render honest diagnoses (lock table, `unchanged` note) and stay as designed.

## 9. Contextual recipe menu (workbar ⋯ — target)

```
⋯ ┌───────────────────────────────┐
  │ Zapisz jako nową recepturę    │  (exists)
  │ Zmień nazwę                   │  (exists)
  │ Dodaj notatkę                 │  (exists)
  │ ── post-merge relocations ──  │
  │ Zmień maszynę i serwowanie    │  → /pro/machine (today a tab)
  │ Wersje receptury              │  → /pro/versions
  │ Koszt receptury               │  → /pro/costs
  │ Eksportuj                     │  → /pro/exports
  │ Rozpocznij produkcję          │  → /pro/production
  │ Napraw gotową partię          │  (Batch Rescue, customer-facing name)
  │ Mam tylko tyle składnika      │  (Stock Shortage, customer-facing name)
  │ ───────────────────────────── │
  │ Archiwizuj recepturę          │  (exists; destructive tone)
  └───────────────────────────────┘
```
Global routes are NOT deleted — the menu adds proximity; duplicated global entries carry the red
badge on staging until the owner decides.

## 10. Moje receptury — mobile

```
░ ◆ PINGÜINO              ≡  ░
░ MOJE RECEPTURY             ░
░ ┌─────────────────────────┐░
░ │ Pistacja Premium        │░
░ │ Gelato · −12°C · 1330 g │░   ← cells stack under the name at <640 px
░ │ zakt. 17.07.2026        │░
░ │ [ Otwórz ]      (Usuń)  │░
░ └─────────────────────────┘░
```
Empty state: „Nie masz jeszcze zapisanych receptur — stwórz je w PINGÜINO Pro i zapisz.”

## 11. Ingredient picker (Składniki → Dodaj składnik) `[Agent C owns internals]`

```
┌ Szukaj składników ─────────────┐
│ 🔍 Szukaj składnika, kategorii…│
│ Wyniki — 12 składników znaleziono
│ Crema de pistacho   [Wybierz]  │
│ … needs-data state: „Składnik  │
│ został wybrany, ale wymaga     │
│ uzupełnienia danych…”          │
│ (Wyczyść wyszukiwanie)         │  ← honest no-results exit
└────────────────────────────────┘
```

## 12. Machine / serving selection (`/pro/machine` + `/profile/machine`)

```
MASZYNA I TRYB SERWOWANIA          (per-recipe, Pro)
Wybór dotyczy bieżącej receptury.
┌ Maszyna profesjonalna ──────────┐
│ Pełna kontrola temperatury…     │
│ Świeże · −11°C · −12°C · −13°C  │
└─────────────────────────────────┘
Maszyny domowe ▸ (cards, `Zalecany wsad: N g`)
Inne urządzenia ▸ („W trakcie weryfikacji pojemności…”)
Wielkość partii [____] g
— link: Otwórz ustawienia maszyny (= /profile/machine, the DEFAULT machine settings)
```
One sentence of copy on each page distinguishing per-recipe vs default machine resolves RV-13.

---

## 13. States vocabulary (every major area)

| State | Presentation |
|-------|-------------|
| empty | short PL sentence + one action (e.g. builder `Dodaj składniki, aby zacząć…`) |
| loading | quiet text or skeleton (`Ładowanie…`, `Szukam w katalogu PI…`) |
| success/partial | value + coverage note (`Oceniono 8 z 10 obszarów.`) |
| warning | desaturated status tone + one sentence + next action |
| error | `Błąd zapisu — spróbuj ponownie` pattern: what happened, data unchanged, retry |
| unavailable | honest backend chip: `Zaplecze danych · Nieskonfigurowane w tej wersji` |
| provisional | `Ocena częściowa / prowizoryczna dla tego profilu.` |
```
