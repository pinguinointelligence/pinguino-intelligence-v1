# Studio Conversational Assistant Shell — PL-first, deterministic (v1)

_Created 2026-07-10. Second slice of the User-Flow layer, on top of the locked
[User_Flow.md](../pinguino-spine/User_Flow.md) question script and the
[STUDIO_USER_FLOW_PL.md](STUDIO_USER_FLOW_PL.md) guidance layer. **Deterministic — NO LLM, NO
persistence, NO recipe mutation.** Engine untouched (ENGINE 0.4.0 / CONFIG 0.6.0)._

## 1. What shipped

| Piece | File | Nature |
|---|---|---|
| Flow model | `src/features/studioFlow/conversationalAssistantFlow.ts` | pure state machine + intent-draft builder |
| PL copy | `src/features/studioFlow/studioFlowCopy.ts` (`assistant` block) | locked honest copy |
| UI shell | `src/features/studioFlow/StudioAssistantShell.tsx` | local-state, read-only, mounted in the Studio right rail |

It is a **fixed question state machine**, not a chatbot: 10 locked PL questions, deterministic
validation and navigation, and a draft built by feeding the collected answers into the locked
spine parser `normalizeRecipeIntent` — the assistant never re-implements flavor/profile logic and
never generates grams.

## 2. The 10-step PL script (User_Flow.md §3–§7 order)

1. `opening` — *Jakie lody dziś robimy?* (text, optional — the free opener; fallback flavor text)
2. `product_type` — Gelato / Sorbet / Vegan Gelato / Chocolate Gelato (required)
3. `serving_temperature` — −11 / −12 / −13 °C (required)
4. `batch_size` — 1 / 5 / 10 / 25 / 50 kg / własna (required; "własna" → captured as null, set in the builder)
5. `main_flavor` — text (optional; wins over the opener as flavor text)
6. `texture` — Twarde / Średnie / Kremowe (required → firm / medium / soft)
7. `sweetness` — Mniej / Standard / Bardziej słodkie (required → low / balanced / high)
8. `restrictions` — bez laktozy / vegan / bez alkoholu / bez orzechów / inne (multi, optional)
9. `boosters` — Nie / Tak (optional)
10. `goal` — projekt / optymalizacja / ratowanie partii / brak surowca (required → branch context)

Required steps (block completion until answered): product_type, serving_temperature, batch_size,
texture, sweetness, goal.

## 3. Flow-model API (pure, deterministic)

`startAssistantFlow` / `initialAssistantState` / `resetAssistantFlow`, `currentQuestion`,
`validateAnswer`, `answerCurrentQuestion` (validates + advances, returns NEW state),
`goBack`, `missingRequiredSteps`, `isIntentComplete`, `buildIntentDraft`, `answerLabel`. Every
operation returns new state; inputs are never mutated (test-pinned). No IO, no clock, no
randomness.

## 4. The intent draft (`AssistantIntentDraft`)

- `intent: NormalizedRecipeIntent` — from `normalizeRecipeIntent` (product profile, serving
  temperature, texture/sweetness/cost, flavor group + tags, dietary, constraints, warnings);
- `branchContext` — `recipe_design` | `actual_batch_rescue` | `stock_shortage` (the spine
  `IntegrationFlowContext`); "optimization" resolves to `recipe_design` + `wantsOptimization: true`;
- `batchSizeG` — grams, or null for "własna gramatura" (set in the builder, never invented);
- `restrictions` — echoed choice values (never silently applied beyond the dietary mapping);
- `complete` / `missingRequired` / `notes` (structured messageKeys only).

Restriction mapping: `lactose_free → dietary.lactoseFree`, `vegan → dietary.vegan`,
`no_nuts`/`other → dietary.allergenAware`, `no_alcohol` → captured as a note (no alcohol is the
default; never a silent flag flip).

## 5. Locked copy honesty rules (test-pinned)

- never "zapisano" / "zastosowano" / "nałożono";
- never a fake recipe-created claim — the draft is a **szkic**: "To tylko szkic — nie tworzy i nie
  zmienia receptury, nic nie zapisuje";
- Demo/Free: "Dokładne gramatury i Auto Fix są dostępne w Pro" (never promises visible grams);
- incomplete → "Uzupełnij wymagane odpowiedzi" (asks, never guesses);
- "Asystent działa deterministycznie — bez modelu językowego."

## 6. UI shell behavior

Mounted in the Studio right rail above the guidance panel. Buttons: **Zacznij**, **Wstecz**,
**Dalej**, **Reset**, **Przygotuj szkic intencji**. There is deliberately **no** save / apply /
"use as recipe" button — the draft is a read-only summary. Local component state only; no DB, no
persistence, no recipe mutation.

## 7. What remains before a true conversational assistant

1. **Intent → recipe generation** — turning the draft into a starting recipe (deterministic
   Designer output first; owner-approved).
2. **User defaults** — saving preferences (User_Flow.md §11) — a future DB slice.
3. **LLM or richer rules assistant** — free-text understanding beyond the fixed script (the flavor
   parser in `normalizeRecipeIntent` already handles keyword routing).
4. **Apply-to-local-draft / persistence** — using the draft to seed the Studio builder, then the
   existing save path. Explicitly out of scope here (no recipe mutation in this slice).

## 8. What this slice deliberately did NOT do

- No LLM/AI call of any kind (deterministic state machine).
- No persistence (no DB, no localStorage, no preferences saved).
- No recipe mutation, no grams generation, no "apply".
- No engine / CONFIG_VERSION change.
