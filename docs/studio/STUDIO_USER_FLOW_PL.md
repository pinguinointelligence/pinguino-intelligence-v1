# Studio User Flow — PL-first guidance layer (v1)

_Created 2026-07-10. Implements the first production slice of the User-Flow layer on top of the
locked [User_Flow.md](../pinguino-spine/User_Flow.md) (v1.0 FINAL). Pure UX/content/state-flow:
**no DB writes, no recipe saves, no inventory writes, no Mapper touch, no engine change** — the
engine stays at ENGINE 0.4.0 / CONFIG 0.6.0._

## 1. What shipped

| Piece | File | Nature |
|---|---|---|
| Locked PL copy registry | `src/features/studioFlow/studioFlowCopy.ts` | pure data, language-keyed (`pl` now, `en` slot later) |
| State → copy mapper | `src/features/studioFlow/studioFlowGuidance.ts` | pure function, no IO/side effects |
| Studio guidance panel | `src/features/studioFlow/StudioFlowGuidePanel.tsx` | read-only render in the Studio right rail (above the optimization preview) |

The panel derives everything from state Studio already has: the optimization preview view,
tier capabilities (`useAccess`) and signed-in status. It adds **no buttons that save or apply**,
no persistence, no auto-actions; its only interactive element is a native disclosure for the
production-flow explanations.

## 2. Covered user situations (all with locked PL copy + tests)

1. `new_recipe` — nothing computed yet; points to the optimization preview.
2. `recipe_in_range` — `no_action_needed`; honestly "nie ma nic do poprawiania".
3. `recipe_optimized` — verified correction; explicitly still a preview.
4. `recipe_tradeoff` — "kompromis, nie pełna naprawa" (never a rescue).
5. `recipe_impossible` — no safe correction; "nie zgadujemy i nie wymuszamy liczb".
6. `recipe_blocked` — missing data / unsupported profile; honest stop.
7. `batch_rescue_guidance` (IF9) — measured-batch language; "poprawa częściowa to wciąż partia
   nie w pełni uratowana".
8. `stock_shortage_guidance` (IF10) — "stany magazynowe nie są ani odczytywane, ani nigdzie
   zapisywane"; no silent substitution.
9. `verified_substitute_guidance` — calibrated catalog entry required; compositions never typed
   by hand.
10. `missing_data` — asks for a measurement; the system never guesses.

Overlays (not situations): tier notes (Demo/Free: "Pełna gramatura i Auto Fix są dostępne w Pro" —
mirrors the locked User_Flow §8 demo line; Pro: "dokładne gramatury korekt" + before/after), save
notes (sign-in → available → the explicit **save-vs-apply** distinction: "Zapis korekty to NIE
zmiana receptury… receptura pozostaje nietknięta"), and the standing disclaimers (preview-only,
no recipe mutation, no inventory write).

## 3. Locked copy rules (test-pinned)

- never "zapisano" / "zastosowano" / "nałożono" — nothing in this layer saves or applies;
- "uratowane" may appear ONLY with the "nie w pełni" qualifier (partial improvement is honest);
- Demo/Free wording is upgrade-safe and never promises visible exact grams;
- Pro wording may name exact grams (that is the paid value, per the locked flow §9);
- the save note appears ONLY when a solve is genuinely rerun-verified saveable, and only for
  tiers that can actually act (unsigned → sign-in note; signed-in Free → no dead promise);
- missing data always asks for a measurement;
- tone per the locked flow §14: short, clear, human, non-technical, confident.

## 4. State → copy contract

`studioFlowGuidance({ authStatus, exactCorrectionGrams, saveRecipes, optimization })` →
`{ situation, title, body, nextAction, contextLine, tierNote, saveNote, saveVsApplyNote,
disclaimers }`. The optimization input carries `finalDecision` (the five-value
`OptimizationDecision`), a conservative `saveableSolve` flag (mirrors the save control's core
conditions), and `productProfile` × `servingTemperatureC` for the context line. Decision → situation
is a total map (`no_action_needed → recipe_in_range`, `optimized`, `tradeoff`, `impossible`,
`blocked`). The authoritative save gate remains `SaveCorrectionControl`; the guidance only phrases
what is already true.

## 5. What this slice deliberately did NOT do

- **No conversational assistant.** The locked flow's question script ("Jakie lody dziś robimy?" →
  batch → temperature → texture → sweetness → style → boosters → defaults) is NOT implemented —
  this slice ships the guidance/copy layer only. The conversational shell is a future slice and
  will consume this same registry.
  **Update (2026-07-10):** the deterministic Conversational Assistant Shell now ships the question
  script — see [STUDIO_ASSISTANT_FLOW_PL.md](STUDIO_ASSISTANT_FLOW_PL.md). It is still NOT an LLM
  and still saves/mutates nothing; it collects intent into a read-only draft.
- **No apply/save workflows.** IF9/IF10 apply and apply-correction-to-recipe stay future work; the
  copy explicitly names them as separate, future functions.
- **No persistence of any kind** — no preferences, no defaults, no DB, no localStorage.
- No English copy yet (the registry structure carries the `en` slot).

## 6. Remaining before the conversational assistant

1. The question-script state machine (locked §3–§7 order) consuming this registry.
2. Preference defaults persistence (locked §11 list — a DB slice, owner-approved).
3. Product-recognition routing (locked §4/§12 — `normalizeRecipeIntent` already exists in the
   spine and covers the parsing; the shell must wire it).
4. Returning-user defaults flow (locked §7).

## 7. Remaining before apply/save workflows

1. Owner-approved design for "apply correction to recipe" (recipe mutation policy).
2. IF9/IF10 apply/save persistence design (production batch log / actual batch record — locked
   User_Flow §11 assigns these outside preference defaults).
3. Inventory integration (explicitly out of scope until designed).
