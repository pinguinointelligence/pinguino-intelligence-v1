# Ingredient Resolution — REUSE MAP (Agent A)

The `src/features/ingredient-resolution/` module is a PURE domain layer that lets a
customer resolve a GENERIC recipe requirement line ("Czekolada", "Whisky", "Bazylia"…)
to a CONCRETE product/variant, gated on Engine-readiness, BEFORE any exact PI
recalculation runs. It reuses — never re-implements — the following existing modules.

## Delegated modules (imported, not duplicated)

| Concern | Existing module | What we call | How we use it |
| --- | --- | --- | --- |
| Product shape | `src/data/products/productRow.ts` | `ProductStatus`, `ProductRow` types | Structural typing only; we read a subset, never mutate a row. |
| Engine-value resolution | `src/data/products/productEngineResolver.ts` | `resolveProductEngineValues(product, reference)`, `ProductEngineInput`, `ReferenceEngineValues`, `EngineValueProvenance` | Core of the readiness gate: pac/pod are resolved (own-measured wins, else reference-linked). Unknown stays `null` — never invented. |
| Status policy | `src/data/products/productStatusDecision.ts` | `decideProductStatus(input)`, `StatusDecision` | Turns Mapper/red-flag/engine signals into a recommended status + blockers. PI Verified is never auto-granted (policy owns that). |
| Red-flag detection | `src/data/products/productRedFlags.ts` | (via `decideProductStatus`, and `RedFlagInput` type) | A red-flagged product is kept UNRESOLVED (not exact-ready). We read `decision.red_flags`. |
| Catalogue search | `src/data/products/productMatcher.ts` | `normalizeName(raw)` | Deterministic, accent-preserving name normalization for honest catalogue search. No fabricated match %. |
| Substitution intent | `src/features/customer-flow/substitutionIntent.ts` | `buildSubstitutionIntent({ lineId, ingredientName, reason, requestedSubstituteName })` | Backs the sheet actions `Nie mam tego składnika` (`i_dont_have_this`), `Zastąp składnik` (`replace_with`), `Po co jest ten składnik?` (`why_is_this_here`). |
| Recipe requirement lines | `src/features/customer-flow/recipeStructure.ts` | `LineResolution` (`'resolved' \| 'needs_ingredient' \| 'needs_dose'`) | Our requirement lines derive from the unresolved (`needs_ingredient` / `needs_dose`) structure lines. |
| OCR / manual intake | `src/features/ocr-intake/session/{intakeSession,saveFlow,duplicateCheck}.ts`, `intakeContracts.ts` | (delegated by descriptor, not imported into the pure core) | `Skanuj etykietę` / `Dodaj produkt ręcznie` emit an `IntakeHandoff` descriptor. The caller launches the EXISTING intake session; on a successful save we re-enter the SAME readiness gate with the new Product ID. OCR never grants PI Verified, never invents PAC/POD, runs its own duplicate check, and never writes Mapper Basement. |
| Grams gate | `src/features/pro-core/proCoreCapabilities.ts` + `customer-flow/recipeView.ts` | `canViewExactGrams` / `gramVisibilityForPersona` | The resolution UI carries NO gram numbers itself; grams remain the recipe view's gated concern (Demo shows none). |

## What we DELIBERATELY do not do

- No engine imports. We never `@/engine/...`, never call engine stage functions or
  coefficient tables (studio-boundary guard). Engine/product capability is reached only
  through the sanctioned `@/data/products/*` wrappers.
- No PAC/POD/dose/composition invention. `resolveProductEngineValues` returns `null` when a
  value is unknown; we surface that as "not exact-ready", never a guessed number.
- No form doses. Fresh/herb ingredients pick a FORM (świeża / suszona / pasta / ekstrakt /
  napar) as a state-machine step; no dose is attached to any form.
- No Product status writes. `decideProductStatus` only RECOMMENDS; we never persist a status.
- No Mapper Basement writes, no mutation of a source recipe/catalogue — a ready catalogue
  recipe is resolved on an editable WORKING COPY.
- We produce the resolution result + an `engineRerunToken` signal; we do NOT run the Engine
  ourselves, and we do NOT import the sibling PI Monitor.

## Public interface for the PI Monitor (sibling agent)

```ts
ingredientResolutionSummary(state: IngredientResolutionState): {
  allResolved: boolean;
  unresolvedCount: number;
  unresolvedNames: string[];
}
```

The PI Monitor gates exact recalculation on `allResolved` WITHOUT importing our internals.
