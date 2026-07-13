# 04 — Mobile Acceptance Checklist

Concrete, testable pass/fail criteria for the customer conversational flow.
Test viewports: **390×844, 430×932, 768×1024, 1440×900** (+ verify 320px doesn't
break catastrophically). Each item is **[ ] fail / [x] pass**; ship gate = all
**MUST** items pass.

Legend: **MUST** = launch blocker · **SHOULD** = strong expectation · **NICE** = polish.

---

## A. Layout & no horizontal scroll  (MUST)

- [ ] **A1 (MUST)** No screen scrolls horizontally at 320/390/430/768. `document.scrollWidth <= clientWidth`.
- [ ] **A2 (MUST)** No customer screen renders a table or a fixed multi-column strip (kills the `MyRecipes` column strip pattern — see audit A-21).
- [ ] **A3 (MUST)** Primary content column ≤ 720px on desktop; 20px side gutters on phones, 32px on tablet.
- [ ] **A4 (SHOULD)** Any wide element (ingredient list, tags) wraps or lives in its own `overflow-x:auto` container — page body never scrolls sideways.
- [ ] **A5 (SHOULD)** Long PL strings ("Storage / Retail −18°C", "Mleko w proszku odtłuszczone") wrap gracefully; no clipping.

## B. Typography & readability  (MUST)

- [ ] **B1 (MUST)** Body/reading text ≥ **17px**; secondary ≥ **15px**; smallest label ≥ **13px**. No 10px / 8.8px chips anywhere (kills `text-[0.625rem]`, `text-[0.55rem]`).
- [ ] **B2 (MUST)** One H1 (the question) per conversational screen; heading levels consistent (no h1/h2 flip between steps).
- [ ] **B3 (SHOULD)** Reading measure 45–75 characters.
- [ ] **B4 (SHOULD)** Line-height ≥ 1.4 for body, ≥ 1.15 for the display question.
- [ ] **B5 (NICE)** `font-light` (300) used only at ≥28px; reading weights are 400+.

## C. Contrast & color  (MUST)

- [ ] **C1 (MUST)** All text ≥ **WCAG AA 4.5:1** (3:1 for ≥24px). Kills muted `text-*/35–45` body/hint/placeholder.
- [ ] **C2 (MUST)** Meaning is never carried by color alone; selected = fill **+ check + ring**.
- [ ] **C3 (MUST)** Focus indicator ≥ **3:1** against its background and visible on every interactive element.
- [ ] **C4 (SHOULD)** Status ("Zbilansowane") pairs an icon with the word.

## D. Touch targets & spacing  (MUST)

- [ ] **D1 (MUST)** Every interactive target ≥ **44×44px** (aim 48). Kills `py-1.5` (~28px) link rows and `py-0.5` chips.
- [ ] **D2 (MUST)** ≥ **8px** (aim 12) between adjacent targets; no accidental double-tap zones.
- [ ] **D3 (MUST)** Mic button ≥ **64px** (spec 72). Primary CTA full-width-ish, ≥48px tall.
- [ ] **D4 (SHOULD)** Remove/edit affordances on chips (`✕`/`✎`) each ≥44px effective hit area.
- [ ] **D5 (SHOULD)** Primary action reachable in the bottom third (thumb zone) on 390/430.

## E. One goal per screen / progressive disclosure  (MUST)

- [ ] **E1 (MUST)** Each conversational screen asks exactly one question / offers one decision.
- [ ] **E2 (MUST)** No engine dashboard (PI panel / NPAC / POD / IF9 / IF10 / optimization preview / branch previews) appears on any customer screen.
- [ ] **E3 (MUST)** Technical detail is collapsed under "Dane techniczne" by default on S6.
- [ ] **E4 (SHOULD)** Summary chip strip lets the user review banked facts before the fork (S5).

## F. Conversation correctness ("never ask twice")  (MUST)

- [ ] **F1 (MUST)** "Zrób 5 kg wanilii" → batch = 5 kg is banked; **S4 is not shown**.
- [ ] **F2 (MUST)** A verified device capacity auto-sets batch and **skips S4**.
- [ ] **F3 (MUST)** Editing a chip re-opens only the affected step; other banked facts persist.
- [ ] **F4 (SHOULD)** Explicit, unambiguous product type in the utterance skips S2.
- [ ] **F5 (SHOULD)** Provenance shown for banked facts ("rozpoznano z Twojego opisu").

## G. Product-type & routing honesty  (MUST)

- [ ] **G1 (MUST)** Only Gelato / Sorbet / Vegan / Protein are shown. **"Chocolate" never appears** as a user type.
- [ ] **G2 (MUST)** "Lody czekoladowe z pomarańczą" stays labeled **Gelato**; chocolate routing is internal and invisible.
- [ ] **G3 (MUST)** **Protein returns a deterministic unsupported state** — no fabricated recipe, no fake grams. Intent is captured/echoed.
- [ ] **G4 (SHOULD)** Unsupported state offers a nearest-supported alternative and/or notify-me, honestly.

## H. Equipment / capacity honesty  (MUST)

- [ ] **H1 (MUST)** Device/mode label is primary; temperature is secondary ("Miękkie · około −11°C").
- [ ] **H2 (MUST)** **No hardcoded capacity** (no 480 ml). Verified capacity auto-fills; unverified asks once as "oczekuje potwierdzenia".
- [ ] **H3 (MUST)** ml is **never** treated as grams without density; ml→g uses the base density (deferred if base unknown).
- [ ] **H4 (SHOULD)** Preview temperatures (−12/−13/−18/Fresh) carry the honest "podgląd — liczone na −11°C" note.

## I. Gram redaction & gating  (MUST)

- [ ] **I1 (MUST)** Demo/Free: exact grams are **absent from the DOM, clipboard, print, CSV, download, Apply and any client-visible service response** — not merely CSS-hidden.
- [ ] **I2 (MUST)** Demo/Free: ingredient **names, structure, type, photo, device/mode, description, substitutions, prep** are all visible; only grams show `🔒`.
- [ ] **I3 (MUST)** Gram visibility is decided by **`canViewExactGrams`**, never a raw `isPro` / price-id check.
- [ ] **I4 (MUST)** Home/Pro see exact grams and enabled export/clipboard/print.
- [ ] **I5 (SHOULD)** Attempting copy/print on Demo yields a clear locked explanation, not a silent no-op.

## J. Recipe discovery / cards  (SHOULD)

- [ ] **J1 (MUST)** 5–6 ready-recipe cards render one-per-row on mobile with real photo, name, type, desc, tags.
- [ ] **J2 (MUST)** Match labels are **categorical & honest** — **no fabricated percentages**.
- [ ] **J3 (SHOULD)** Missing photo → labeled placeholder + "zdjęcie wkrótce"; never a broken `img` or fake stock.
- [ ] **J4 (SHOULD)** Both actions present: "Zobacz recepturę" and "Użyj jako punkt wyjścia".

## K. Voice / mic  (SHOULD)

- [ ] **K1 (MUST)** Mic is a real, focusable `<button>` with an `aria-label` (not a decorative `aria-hidden` glyph).
- [ ] **K2 (MUST)** When Web Speech API is absent/insecure/denied, mic is disabled with an honest caption and text works fully.
- [ ] **K3 (SHOULD)** Listening state shows live partial transcript + a clear stop.
- [ ] **K4 (SHOULD)** Voice uses only the existing safe browser capability — no new network STT.

## L. States (loading / empty / error)  (SHOULD)

- [ ] **L1 (MUST)** Every async surface (S5b catalogue, S6 result) has a loading skeleton and an honest error+retry.
- [ ] **L2 (MUST)** No blank screens: empty states carry a message and a next action.
- [ ] **L3 (SHOULD)** Errors translate raw codes to plain PL (see `03` taxonomy); raw codes never shown to customers.
- [ ] **L4 (SHOULD)** Destructive confirms (delete) are designed sheets, not `window.confirm`.

## M. Accessibility  (MUST)

- [ ] **M1 (MUST)** All flows operable by keyboard and screen reader; logical focus order; back returns focus sensibly.
- [ ] **M2 (MUST)** Selected chips/cards expose `aria-pressed`/`aria-selected`; disclosure exposes `aria-expanded`.
- [ ] **M3 (MUST)** Respects `prefers-reduced-motion` (no pulse/scale for those users).
- [ ] **M4 (SHOULD)** Touch dictation and text entry both announce state changes via live regions.
- [ ] **M5 (SHOULD)** Dynamic type / browser zoom to 200% keeps layout usable (no clipping, no h-scroll).

## N. Trust  (SHOULD)

- [ ] **N1 (MUST)** No dead-end feeling: coming-soon items are grouped and labeled honestly, not interleaved as tappable-looking rows.
- [ ] **N2 (MUST)** No fabricated data anywhere (no fake %, no invented doses, no guessed capacity).
- [ ] **N3 (SHOULD)** Every honesty note ("podgląd", "do potwierdzenia", "zdjęcie wkrótce") is calm and specific.

## O. Performance / feel  (NICE)

- [ ] **O1 (SHOULD)** Step transitions ≤ 220ms; no layout shift on advance (CLS ~0).
- [ ] **O2 (SHOULD)** Photos lazy-load with intrinsic aspect ratio (no reflow).
- [ ] **O3 (NICE)** First interaction possible before all catalogue images load.

---

## Per-viewport spot checks

| Check | 390 | 430 | 768 | 1440 |
|-------|-----|-----|-----|------|
| Question fits ≤2 lines | ☐ | ☐ | ☐ | ☐ |
| Product cards 1-up / 1-up / 2-up / 2-up | ☐ | ☐ | ☐ | ☐ |
| Equipment grid 2-up / 2-up / 3-up / 4-up | ☐ | ☐ | ☐ | ☐ |
| Ready recipes 1 / 1 / 2 / 3 per row | ☐ | ☐ | ☐ | ☐ |
| Result: stacked / stacked / 2-col / 2-col | ☐ | ☐ | ☐ | ☐ |
| Upgrade card visible, non-covering | ☐ | ☐ | ☐ | ☐ |
| No horizontal scroll | ☐ | ☐ | ☐ | ☐ |

## Regression guards (do not reintroduce)

- [ ] No `[color-scheme:dark]` / `bg-shell` on the customer conversational flow (unless the light-vs-dark decision in `05` says otherwise).
- [ ] No `text-[0.625rem]` / `text-[0.55rem]` customer text.
- [ ] No `window.confirm` for customer confirmations.
- [ ] No `flex gap-5` non-wrapping stat strip for recipes.
- [ ] No mega-menu hover-only pattern as the sole mobile nav.
