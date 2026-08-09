# Production Workspace — workflow contract

Checked against repository state: 2026-08-09
Implementation branch: `codex/production-master-label-final`

## Purpose

Production is a physical-workflow projection of a frozen recipe plan. It does not edit the saved recipe. The normal loop is:

`LOOK → WEIGH → ADJUST → CONFIRM → NEXT`

Every active line renders the binding control directly:

`[ − ]  ACTUAL  [ + ]  [ ✓ ]`

No modal or secondary click is needed. The keyboard remains an optional exact-entry path.

## State model

The implementation deliberately does not reuse `recipeStore.actual_grams` as the production session.

- `plannedGrams`: immutable source recipe quantity.
- `targetGrams`: expected final quantity after a verified rescue.
- `draftActualGrams`: value shown in the stepper; starts equal to plan.
- `physicalAddedGrams`: amount confirmed by ✓ as physically in the vessel.
- `confirmed`: whether the current target has been physically confirmed.
- `confirmationOrder` / `confirmedAt`: deterministic production trace.

The session is persisted under its own `pinguino-production-session` store and is cleared on a real account boundary. It survives Production → Monitor → Production and component remounts. It never marks the recipe draft dirty and never saves a half-finished run as a recipe version.

## Exact workflow and click count

For a recipe with `N` ingredients and no deviations:

1. Enter Production.
2. Actual already equals Planned.
3. Press ✓ once per line.
4. Press `Zakończ produkcję` once.

Weighing clicks: exactly `N` confirmations. Completion: one additional click. No numeric typing is required.

## Deviations

- Before ✓, `−` and `+` only change the candidate actual value.
- Delta updates immediately and is amber for a deviation; it is not red unless a real technical problem is present.
- Before ✓, the Engine forecast still uses the pending target, not an unconfirmed value.
- At ✓, the entered value becomes a physical floor.
- The final forecast then uses confirmed actual + every pending target.
- The cockpit always labels the score `Przewidywany wynik końcowy`; it never scores the incomplete vessel as a finished product.

## Physical reality

Once a line is confirmed, rescue may only keep or increase its physical mass. A candidate that omits or reduces a physical line is rejected before display. A verified top-up reopens the line with the already-added amount shown as the floor.

`Popraw zapis` is a separate audit intent. The UI shows:

> Zmienia zapis faktycznej ilości — użyj tylko jeśli poprzednia wartość została wpisana błędnie.

It is not presented as removing material.

## Completion

`Zakończ produkcję` is enabled only after every line is confirmed. Completion freezes:

- source recipe/version identifiers where available;
- immutable planned input;
- final actual `RecipeInput`;
- final Engine `RecipeResult` and version trace;
- planned target and actual final mass;
- canonical ingredient IDs;
- confirmation order/time;
- machine capacity and serving temperature;
- substitutions when present;
- operator identity when present;
- customer label note and internal production note as separate fields.

The completed snapshot becomes the only source for Master Label.

## Honest readiness gaps

The following remain pink and do not pretend to work:

- automatic Heat/Cold process stages;
- mid-run verified substitution;
- topping/post-freeze classification;
- durable server ProductionRepository commands for per-line confirmation;
- immutable database completion snapshot and idempotent RPC;
- canonical allergen rehydration for label use.

The current session is durable in the browser and owner-cleared, but commercial multi-device production requires the server persistence work above.
