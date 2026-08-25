# Production Top-Up Task P0

## Domain boundary

An authorized positive addition for an already-confirmed ingredient is represented by
`ProductionTopUpTask`. It references the existing canonical recipe line through
`sourceRecipeLineId` and `sourceIngredientId`; it is not appended to `plannedInput.items`,
`rescueAddedItems`, or the normal recipe ingredient collection.

**THE NO-DUPLICATE RECIPE RULE REMAINS ACTIVE.**

## Call graph

```text
Engine/Rescue authorized proposal
  -> ProductionRepository.consumeRescue (server revision/CAS authority)
  -> hydrateProductionSessionFromRun
  -> applyVerifiedRescueInput (canonical target only; no solver changes)
  -> materializeAuthorizedProductionTopUps
       taskId = Production Rescue revision + source recipe line id
       authorizedDeltaG = cumulative target - durable physical baseline
  -> ProductionTopUpSection (delta control; cumulative target is secondary)
  -> user confirms one task
  -> confirmProductionTopUpTask (increment the one canonical line's physical grams)
  -> ProductionRepository.recordActual(action = top_up)
  -> durable actual vector + append-only physical event
  -> hydrateProductionSessionFromRun
  -> remaining revision-bound tasks rematerialize from Rescue + actual facts
       stale checks use append-only server event order, never browser/server clock comparison
```

The Recipe duplicate guard is bypassed because the materializer writes only to
`ProductionSession.topUpTasks`. The original `ProductionLineState` remains the single execution
projection of the single canonical `RecipeItem`/PI-ING. A genuinely new Rescue ingredient may
still use the existing `rescueAddedItems` path; a positive addition for an existing PI-ING may not.

## Revision and persistence rules

- A task id is deterministic for one Rescue revision and source recipe line.
- A newer accepted Rescue invalidates pending tasks from the older revision before materializing
  its own tasks.
- A newly confirmed off-target physical value invalidates pending tasks because their correction
  basis is stale.
- Confirming one task exactly completes only that task; sibling tasks remain pending.
- The server-owned Rescue snapshot, actual vector, append-only execution-event order, actual
  revision, and Rescue revision reconstruct pending tasks after reload. Browser confirmation
  timestamps may come from a clock ahead of or behind the server and are therefore not used to
  decide whether an authorized task is stale. Local persistence stores delta drafts but cannot
  promote them to physical facts.
- Explicit confirmation is the only operation that increments vessel mass.

## UI materialization

The historical/current Production rows remain in the top ingredient list. Pending additions render
in the separate compact `KOREKTA — DODAJ JESZCZE` section. Its active number is `draftDeltaG`
(initialized from `authorizedDeltaG`); `physicalBaselineG` and `cumulativeTargetG` are secondary
read-only context. The section is not mounted when no pending task exists.

## Safety boundary

No Engine, solver, `x_user`, Crown, Multi-Main, Mapper, profile-science, `minimum_safe`, or
`restore_original_profile` formula was modified. The generated Rescue Edge bundle changes only
because it embeds the Production session materializer.
