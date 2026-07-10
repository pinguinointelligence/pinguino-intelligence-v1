# Intent → deterministic starter recipe draft (local preview only)

_Created 2026-07-10. Third slice of the User-Flow layer, on top of the deterministic
[Conversational Assistant Shell](STUDIO_ASSISTANT_FLOW_PL.md). **Deterministic — NO LLM, NO DB,
NO persistence, NO recipe mutation.** Engine untouched (ENGINE 0.4.0 / CONFIG 0.6.0)._

## 1. What shipped

| Piece | File | Nature |
|---|---|---|
| Starter draft builder | `src/features/studioFlow/intentRecipeDraft.ts` | pure `AssistantIntentDraft → IntentRecipeDraft` |
| PL copy | `src/features/studioFlow/studioFlowCopy.ts` (`assistant.starter`) | locked honest copy |
| UI | `src/features/studioFlow/StudioAssistantShell.tsx` (extended) | read-only "Pokaż szkic receptury" preview |

`buildStarterRecipeDraft(assistantIntentDraft)` maps the collected intent to a **local starter
recipe snapshot** built from LOCKED base templates, runs the real `calculateRecipe` for a metrics
preview, and returns it read-only. It never saves, never applies, never mutates the Studio recipe,
and NEVER fakes a recipe — unsupported profiles return `not_supported`.

## 2. Deterministic recipe-start source (audit)

The ONLY ingredient source is the production demo/reference catalog `@/data/demoIngredients`
(`is_verified: false`, `pod_value/pac_value: null`, `source_type: 'manual'`) — the same reference
compositions that power the built-in Studio presets. **Forbidden and absent:** Mapper product
rows, PI-Calculated products, LLM-generated ingredients, arbitrary free-text composition
(test-pinned).

## 3. Supported cases (v0.1) and templates

| Profile | Status | Template (base 1000 g) |
|---|---|---|
| `standard_gelato` | **ready** | `milk_base_v1` — the built-in milk base (milk 670 / cream 130 / SMP 35 / sucrose 130 / dextrose 30 / tara 5) |
| `chocolate_gelato` | **ready** | `chocolate_base_v1` — the engine golden chocolate proportions (milk 600 / cream 90 / SMP 30 / sucrose 150 / dextrose 40 / cocoa 60 / dark choc 25 / tara 5) |
| `sorbet` | **not_supported** | no safe water/puree template in the production catalog → start manually |
| `vegan_gelato` | **not_supported** | no plant-milk lines in the production catalog → start manually |

Templates total exactly 1000 g and scale by an exact ratio to the requested batch (1/5/10/25/50 kg),
so the generated recipe totals the requested batch size precisely.

## 4. Statuses (`IntentRecipeDraftStatus`)

- `ready` — a safe template exists, batch is concrete → scaled snapshot + engine preview;
- `needs_more_information` — batch is "własna"/missing → the base cannot be scaled;
- `not_supported` — no safe template for the profile → start manually (never faked);
- `blocked` — the assistant intent itself is incomplete.

## 5. Flavor handling

- If the flavor is intrinsic to the template (chocolate on the chocolate base) → no warning.
- If a specific flavor (fruit/nut/coffee/vanilla) sits on the neutral gelato base → the base stays
  neutral and a `flavor_manual_mapping_required` warning says *"Dodaj składnik smakowy ręcznie —
  nie zgadujemy jego składu."* The flavor text is kept in the draft; **its composition is never
  invented.**
- Unknown flavor → kept as text, no fabricated ingredient.

## 6. Engine preview (read-only)

The scaled snapshot runs through the real `calculateRecipe`; the preview exposes
`configVersion` (0.6.0), `npacPoints`/`podPoints`/`iceFractionPercent`, and — from
`detectViolations` — `inBand` vs `optimizationRecommended` (mutually exclusive booleans). There is
**no "optimized" claim** — the honest signal is only "in range" or "optimization recommended".
Example: the milk base at −12 °C is honestly out of the seeded −12 band (npac ≈ 37 vs [42,50]),
so the preview recommends running the optimizer.

## 7. Tier redaction

Exact grams and numeric engine metrics render only under the Pro capability
(`exactCorrectionGrams`). Demo/Free sees the ingredient **structure** (names) plus the directional
"in range / optimization recommended" guidance and *"Dokładne gramatury i Auto Fix są dostępne w
Pro."* — never exact grams.

## 8. No apply / no mutation (deliberate)

The preview is **read-only**. There is intentionally NO "Use as local draft" / apply / save button
in this slice — turning the snapshot into the Studio working recipe (even local-only) is deferred
so this slice guarantees zero recipe mutation. Copy never says saved/applied; the draft is a
"szkic bazy".

## 9. What remains

- **Local apply-to-Studio-draft** — seed the Studio builder form from the snapshot (local-only,
  clearly "nic nie zostanie zapisane"), then the existing save path.
- **User defaults** persistence (a DB slice).
- **Richer Designer rules** — flavor→ingredient mapping, sorbet/vegan templates when safe
  reference ingredients exist; per-texture/sweetness starting grams.
- **LLM/rules assistant** later (only if owner-approved).
