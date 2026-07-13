# 03 — Interaction-State Matrix

Every customer component, every state. States: **default · loading · empty · error ·
selected · disabled · locked**. "Locked" = a Demo/Free capability boundary
(gated on **`canViewExactGrams`**, never `isPro`). "—" = not applicable.

Design invariants across all states:
- Selected state uses **fill + checkmark + ring** (never color alone; WCAG 1.4.1).
- Disabled ≠ locked. Disabled = temporarily unavailable (opacity + no pointer).
  Locked = intentionally gated with an explanation + upgrade path.
- Loading uses skeletons/spinners with a text label, min 44px hit area preserved.
- Errors are **honest, specific, recoverable**, and never blame the user.
- `prefers-reduced-motion` disables pulse/scale animations.

---

## 1. Text prompt field (S0)

| State | Behavior / appearance |
|-------|----------------------|
| default | Placeholder "Powiedz lub napisz, jakie lody chcesz przygotować…", 17px, muted ≥4.5:1. `Dalej` disabled. |
| loading | n/a for the field itself; if a live voice transcript is streaming, text appears in real time (see Mic). |
| empty | = default; `Dalej` stays disabled while trimmed length is 0. |
| error | Parse can't extract anything meaningful → keep text, show inline hint "Nie rozpoznałem smaku — spróbuj np. »wanilia«". Never destroy the user's text. |
| selected | Focus ring (3:1 non-text contrast) on the field; caret visible. |
| disabled | Only if the whole step is transitioning; field greys, no input. |
| locked | — (capture is never gated). |

## 2. Microphone button (S0)  ⚠ NET-NEW — no working mic exists today

| State | Behavior / appearance |
|-------|----------------------|
| default (available) | Large 72px circle, mic glyph, label "Dotknij i mów". Real `<button>` with `aria-label`. |
| listening | Pulsing ring (reduced-motion: static "słucham…"), live partial transcript into the field, tap again to stop. |
| processing | Brief spinner "przetwarzam…" while finalizing transcript. |
| empty (no speech) | After timeout: "Nie usłyszałem nic — spróbuj jeszcze raz lub wpisz tekst." |
| error (permission denied) | Mic dims, caption "Brak dostępu do mikrofonu — możesz wpisać tekst." Text field stays fully usable. |
| unavailable (no Web Speech API / insecure ctx) | Mic rendered **disabled** with honest caption "Dyktowanie niedostępne w tej przeglądarce — wpisz tekst." Never pretend it works. |
| disabled | Same visual as unavailable when step is mid-transition. |
| locked | — (voice is not a paid gate). |

> Constraint: voice uses the **existing safe browser capability only** (Web Speech
> API where present + permitted). No new network STT. Text is always the fallback.

## 3. Intent chip (flavor / banked fact) (S1)

| State | Behavior / appearance |
|-------|----------------------|
| default | Ivory-tinted chip, label 15px, `✕` remove + (for facts) `✎` edit, ≥44px. |
| loading | While re-parsing after an edit: chip shows a subtle shimmer, not removed. |
| empty | If all chips removed: show "Dodaj przynajmniej jeden smak" and disable `Dalej`. |
| error | Unrecognized phrase → chip variant "Sprawdź: …" with a warning tint (≥4.5:1) prompting split/confirm. |
| selected | Editing a chip opens inline field; chip gets focus ring. |
| disabled | — |
| locked | — |

## 4. Product-type card (S2)

| State | Behavior / appearance |
|-------|----------------------|
| default | Full-width card, title 17px + one-line desc 15px, ≥64px, hairline border. |
| loading | Cards render instantly (static data); no skeleton needed. |
| empty | — (always four options). |
| error | — (selection is local). |
| selected | Ivory fill + 2px ink ring + ✓; others dim slightly. |
| disabled | — |
| locked | — (Protein is NOT locked; it routes to the honest unsupported state S2b). |

## 5. Protein unsupported state (S2b)

| State | Behavior / appearance |
|-------|----------------------|
| default | Calm explanation + echoed captured intent card + two honest actions. **No recipe rendered.** |
| loading | — |
| empty | — |
| error | If "Powiadom mnie" backend absent, action shows honest "Zapiszemy to lokalnie" or is hidden — never a fake success (see GAPS). |
| selected | "Zrób to jako Gelato" switches type to Gelato and continues to S3. |
| disabled | — |
| locked | The whole product is capability-independent; this is an availability state, not a paywall. |

## 6. Equipment / serving-mode card (S3)

| State | Behavior / appearance |
|-------|----------------------|
| default | Device/mode label primary (17px), temp secondary (15px muted), ≥96px, 2-up grid. |
| loading | Static; no skeleton. |
| empty | — (fixed set + Własne). |
| error | Own-capacity sheet: invalid input → "Podaj liczbę większą niż 0". |
| selected | Ivory fill + ✓ + ring. If verified capacity → toast + auto-batch + skip S4. |
| disabled | Preview temps are NOT disabled — they carry a "podgląd" note, still selectable. |
| locked | — |
| **special: unverified capacity** | Info pill "pojemność do potwierdzenia"; on select opens the one-time capacity sheet (ml/g toggle, density note). Never guesses, never hardcodes 480 ml. |

## 7. Capacity confirm sheet (S3 sub)

| State | Behavior / appearance |
|-------|----------------------|
| default | Number field + unit toggle [ml | g] + density note. |
| loading | On save: brief "zapisuję…". |
| empty | Save disabled until a positive number is entered. |
| error | Non-positive / non-numeric → inline error; ml chosen but density unknown for the base → "Policzymy masę, gdy wybierzesz bazę" (defer, don't fake). |
| selected | — |
| disabled | Save disabled while empty/invalid. |
| locked | — |

## 8. Batch chip (S4)

| State | Behavior / appearance |
|-------|----------------------|
| default | 1 kg / 5 kg / 10 kg / Własna ilość, ≥64px. |
| loading | — |
| empty | — |
| error | Własna: 0 or negative → "Podaj ilość większą niż 0". |
| selected | Ivory fill + ✓. |
| disabled | — |
| locked | — |
| **skipped** | Entire screen omitted when batch already known (never rendered, not shown-then-disabled). |

## 9. Fork cards (S5)

| State | Behavior / appearance |
|-------|----------------------|
| default | Two equal large cards, ≥120px. |
| loading | On tap "Stwórz nową recepturę": show S6 skeleton while the engine computes. |
| empty | — |
| error | Engine failure → S6 error state (below). |
| selected | Pressed card gets ring; the other stays available (no premature commit). |
| disabled | — |
| locked | — |

## 10. Ready-recipe card (S5b)

| State | Behavior / appearance |
|-------|----------------------|
| default | Photo + name + type + desc + tags + honest match note + 2 actions. |
| loading | Skeleton card (image block + 2 text lines) while catalogue loads. |
| empty | No matches → "Nie mamy jeszcze gotowej receptury dla tego pomysłu — stwórz nową." + button back to S5 create path. |
| error | Catalogue fetch fails → "Nie udało się wczytać receptur. Spróbuj ponownie." + retry; create path still offered. |
| selected | Chosen card ring; `Użyj jako punkt wyjścia` loads into S6. |
| disabled | An action is disabled only if its target is unavailable (e.g. photo-less recipe still shows, action stays enabled). |
| locked | Card is fully visible to Demo (names/desc/photo). Only grams inside S6 are locked. |
| **photo missing** | Neutral labeled placeholder + "zdjęcie wkrótce" — never a fake stock image, never a broken img. |
| **match note** | Categorical honest label only ("Najbliższa Twojemu pomysłowi" / "Dobre dopasowanie" / "Inna baza"). Never a % . |

## 11. Result recipe card (S6)

| State | Behavior / appearance |
|-------|----------------------|
| default | Photo, title, type, device/mode, batch, ingredient names, prep, friendly status, collapsed "Dane techniczne". |
| loading | Skeleton: image block, title line, 6 ingredient rows shimmer, status "liczę recepturę…". |
| empty | If somehow no ingredients resolve → "Nie udało się zbudować receptury — wróć i zmień wybór." (never a blank card). |
| error | Engine/validation failure → honest cause: e.g. capacity conflict "Ta ilość nie zmieści się w wybranym urządzeniu — zmień ilość lub urządzenie." |
| selected | — (it is a result, not a selector). |
| disabled | Export/clipboard/print actions disabled for Demo (redaction), each with a lock explanation. |
| locked (Demo/Free) | Each gram shows `🔒`; grams are ABSENT from the data (not CSS-hidden). Names, structure, prep, substitutions fully shown. Upgrade card present. |
| unlocked (Home/Pro) | Exact grams shown; export/clipboard/print enabled (still no raw engine internals). |

## 12. "Dane techniczne" disclosure (S6)

| State | Behavior / appearance |
|-------|----------------------|
| default | Collapsed row "▸ Dane techniczne", 15px, low emphasis. |
| expanded | Shows professional-but-secondary values (see `07`): per-100g nutrition, cost/kg (Home/Pro), plain-language stability summary. NEVER NPAC/POD/IF9/IF10/dispatcher/routes/violation codes. |
| loading | Values shimmer if computed lazily. |
| empty | If a value is unavailable → "Niedostępne" per row (honest), not 0. |
| error | Cost incomplete → "Cena niepełna — brakuje cen niektórych składników." |
| locked | Exact cost/grams inside are gated on `canViewExactGrams`; the section header still opens (structure is not secret, numbers are). |

## 13. Upgrade card (S6-Demo)

| State | Behavior / appearance |
|-------|----------------------|
| default | One card, sticky at bottom of the recipe container, non-covering: "Odblokuj dokładne ilości" + [Wybierz Home] [Zobacz Pro]. |
| loading | On action tap: button spinner while navigating to plan surface. |
| empty | — |
| error | Plan surface unavailable → "Płatności będą wkrótce" honest note (pre-billing) rather than a broken checkout. |
| selected | — |
| disabled | Hidden entirely for Home/Pro (`canViewExactGrams === true`). |
| locked | This IS the unlock surface. |

## 14. Top bar / back

| State | Behavior / appearance |
|-------|----------------------|
| default | ☰ + wordmark + account dot; back arrow inside the flow. |
| loading | — |
| empty | — |
| error | — |
| selected | Active route gets a calm emphasis (not a boxed pill). |
| disabled | — |
| locked | Account dot shows "Zaloguj" when signed out; identity when signed in. |

## 15. Mobile menu bottom sheet

| State | Behavior / appearance |
|-------|----------------------|
| default | Grab handle + grouped items (live / account / coming-soon). |
| loading | Auth row shows "…" while resolving session. |
| empty | — |
| error | Auth unavailable → honest row "Logowanie niedostępne w tej wersji." |
| selected | Current destination highlighted. |
| disabled | Coming-soon items rendered as muted, non-tappable, grouped under "Wkrótce". |
| locked | — |

---

## Cross-cutting error taxonomy (customer-safe)

| Cause | Customer message (PL) | Never say |
|-------|----------------------|-----------|
| Unsupported profile (Protein) | "Jeszcze nad tym pracujemy — nie policzymy dokładnej receptury." | raw "no engine profile" |
| Unverified capacity | "Potwierdź pojemność urządzenia." | a guessed number |
| Batch > capacity | "Ta ilość nie zmieści się w wybranym urządzeniu." | raw "machine_capacity_exceeded" |
| Cost incomplete | "Cena niepełna — brakuje cen składników." | raw "cost_incomplete" |
| Engine/validation | "Coś nie zgadza się w recepturze — sprawdź wybór." | raw violation codes |
| Voice unavailable | "Dyktowanie niedostępne — wpisz tekst." | fake "coming soon" on a dead control |

All raw codes (from `en.ts studio.warnings`, solver violations, spine dispatcher)
are **translated to plain language** at the customer boundary and kept verbatim
only in dev surfaces.
