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
| Lost & Legendary Poland Owner Review | Disabled while the exact Starter Pack egg-yolk powder/dose is missing | `/pro/recipe` only after that product gate closes | Versioned blocked template; no fresh-yolk fallback | BLOCKED_EXACT_PRODUCT_DATA |
| Fantasy Owner Review cards | Admin-authorized Pro → `/pro/recipe` | `/pro/recipe` | Five exact zero-violation Base vectors; unresolved Toppings omitted; Production/Label remain blocked | OWNER_REVIEW_EDITABLE / PRODUCTION_BLOCKED / LABEL_BLOCKED |
| Direct executable template deep link | `/pro/recipe?source=executable_template&libraryTemplate=…` | `/pro/recipe` | Exact template ID; Pro plus active `admin_users` self-row required; unsaved drafts fail closed | ROUTE PASS / OWNER AUTH REQUIRED |
| Saved recipe version | Remains in the canonical Pro Versions section | `/pro/versions` / current Pro workbench | Immutable saved version → new working version via repository | PASS |
| Production source recipe | Remains inside canonical Pro Production context | `/pro/production` | Frozen exact recipe/version/composition snapshot | PASS |
| Recipe search result | No executable recipe-search opening action exists in this codebase | N/A | N/A | NOT IMPLEMENTED / NO BYPASS FOUND |
| “+ Nowa receptura” | Pro `/pro/recipe`; Home `/home`; Demo `/start` | `/pro/recipe` | Canonical new-recipe store flow with unsaved-change confirmation | PASS |

## Home freeze proof

- No file under `src/features/customer-shell/**` changed.
- `/home` and `/start` route components were not changed.
- `inspirationStartHref(intent)` remains byte-for-byte `/start?...` for non-Pro callers.
- Even if a non-Pro caller supplies Pro-only `libraryTemplate` or `returnTo` parameters, the helper drops them.

## Served evidence boundary

The route and guarded handoff are implemented locally. Generic Inspiration and
curated records still carry intent only, so they route correctly but do not
invent an executable vector. Five Fantasy Base templates are editable only on
the admin-authorized Pro Owner Review surface; Poland remains blocked by one
exact external product requirement. Final PR-01–PR-07 status must be recorded
against the deployed staging SHA; no local test is presented as served proof.
