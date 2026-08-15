# Pro Recipe Routing Audit

Date: 2026-08-15

Base: `origin/staging` at `e939d335`

Scope: Recipe Library entry points only. Home implementation is frozen.

## Root cause

`inspirationStartHref()` previously returned `/start` for every persona. Both curated PINGÜINO cards and Inspiration cards used that shared helper, so an authenticated Pro selection entered the customer/Home recipe flow. The repair uses the existing `useProCorePersona()` entitlement projection at the card boundary. Pro links target `/pro/recipe`; non-Pro links retain the accepted `/start` URL and receive no Pro-only handoff parameters.

The Pro workbench consumes `libraryTemplate` exactly once. After a successful atomic materialization it replaces the handoff URL with canonical `/pro/recipe`, preventing reload from reopening the pristine template over an edited draft. While materialization is pending, the previous workbench is hidden.

## Entry-point ledger

| Entry point | Current destination | Correct destination for Pro | Data handoff | Status |
|---|---|---|---|---|
| Receptury → Moje → Otwórz | Persona-aware `/pro/recipe` or `/home` | `/pro/recipe` | Saved `RecipeInput`, composition metadata, version identity via `loadRecipeInput` | PASS |
| Receptury → PINGÜINO curated candidate | Previously `/start`; now Pro-aware `/pro/recipe` | `/pro/recipe` | Current curated candidates carry intent only, not an exact versioned recipe | ROUTE PASS / EXECUTABLE DATA BLOCKED |
| Receptury → Inspiracje | Previously `/start`; now Pro-aware `/pro/recipe` | `/pro/recipe` | Inspiration intent; governed template mapping only where one exists | ROUTE PASS / MOST ENTRIES DATA BLOCKED |
| Lost & Legendary customer card | `/start` for non-Pro; `/pro/recipe` for Pro | `/pro/recipe` | Curated intent only | ROUTE PASS / DATA BLOCKED |
| Lost & Legendary Owner Review Batch 1 | Disabled while exact process/product evidence is missing | `/pro/recipe` after gate closes | Versioned template ID → canonical materializer | BLOCKED_EXACT_PRODUCT_DATA |
| Fantasy Owner Review cards | Disabled while exact product/process/Topping evidence is missing | `/pro/recipe` after gate closes | Versioned template ID → canonical materializer | BLOCKED_EXACT_PRODUCT_DATA |
| Direct executable template deep link | `/pro/recipe?source=executable_template&libraryTemplate=…` | `/pro/recipe` | Exact template ID; current auth/plan gate remains authoritative | ROUTE PASS / TEMPLATES BLOCKED |
| Saved recipe version | Remains in the canonical Pro Versions section | `/pro/versions` / current Pro workbench | Immutable saved version → new working version via repository | PASS |
| Production source recipe | Remains inside canonical Pro Production context | `/pro/production` | Frozen exact recipe/version/composition snapshot | PASS |
| Recipe search result | No executable recipe-search opening action exists in this codebase | N/A | N/A | NOT IMPLEMENTED / NO BYPASS FOUND |
| “+ Nowa receptura” | Pro `/pro/recipe`; Home `/home`; Demo `/start` | `/pro/recipe` | Canonical new-recipe store flow with unsaved-change confirmation | PASS |

## Home freeze proof

- No file under `src/features/customer-shell/**` changed.
- `/home` and `/start` route components were not changed.
- `inspirationStartHref(intent)` remains byte-for-byte `/start?...` for non-Pro callers.
- Even if a non-Pro caller supplies Pro-only `libraryTemplate` or `returnTo` parameters, the helper drops them.

## Remaining routing evidence gap

The route defect is repaired in code, but PR-01/02/03 cannot satisfy “exact recipe loaded” because the current existing Inspiration/PINGÜINO/Lost records do not contain executable gram vectors, and all six Batch 1 vectors correctly remain blocked by exact product/process evidence. Served authenticated PR-01–PR-07 must therefore wait; staging deployment is not authorized from this candidate.
