# Machine process data audit

Date: 2026-08-08
Scope: canonical Home machine definitions and their suitability for a reusable education layer.

## Canonical model

The existing machine architecture is already the correct source of truth:

- `src/features/machine-catalog/types.ts`
- `src/features/machine-catalog/machineCatalogData.ts`
- `src/features/machine-catalog/technologyMode.ts`
- `src/features/machine-catalog/machineDerivation.ts`
- `src/features/machine-catalog/machineOnboarding.ts`
- selected recipe context in `src/stores/recipeStore.ts`

No new machine routing or recipe modifier is required. Education must derive from the existing `technology`, `preFreezeTarget`, `requiresPreFreeze`, `preFreezeMinimumHours`, serving style and provenance/status fields.

## Supported educational categories

| Customer category                | Canonical technology                 | Verified first-level workflow                                                                               |
| -------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Processor z mrożonym pojemnikiem | `respin`, `respin_soft`              | Prepare mix → freeze the full container → machine processes the frozen base.                                |
| Maszyna z mrożoną misą           | `frozen_bowl`                        | Freeze bowl → pour mix → run machine.                                                                       |
| Maszyna z kompresorem            | `compressor`                         | Prepare mix → pour → machine actively cools/freezes it.                                                     |
| Fresh Gelato                     | education-only professional category | Prepare appropriate mix → process if required → freeze/mix/hold → serve. It is not a new Home routing cell. |

`continuous_soft_serve` remains outside the supported Home mode, exactly as the canonical routing states. `respin_soft` remains Ninja Swirl and must never be collapsed into professional continuous soft serve.

## Timing audit

The catalog represents timing honestly:

- `preFreezeMinimumHours` exists, but most records are `null`;
- two frozen-bowl records currently carry a documented minimum: Cuisinart ICE-30BCE (`12`) and KitchenAid 5KSMICM (`16`);
- all current seed records remain `provisional` or `needs_review`; none is `verified` with `specificationVerifiedAt`;
- the catalog does not contain verified mix-preparation time, machine processing time, first-batch time, cycle count or same-day readiness.

Consequences:

- a duration is not displayed as verified customer guidance unless the exact record has a value **and** `specificationStatus === 'verified'`;
- current provisional durations may be listed internally as audit evidence but remain unavailable in customer guidance;
- missing timing is shown with PINK `DO PODŁĄCZENIA`, never filled with an estimate;
- the “Kiedy chcesz jeść lody?” selector is a non-production educational prototype only.

## Capacity and comparison

Capacity fields are structured and versioned, but the educational layer does not recompute them and does not create buying recommendations. It may compare the following existing facts:

- pre-freezing target;
- active refrigeration (`compressor`) vs advance freezing;
- serving style;
- canonical capacity fields and status when a future approved comparison consumes them.

It must not infer convenience, frequency suitability, prices or universal preparation times from those facts.

## Fresh Gelato boundary

Fresh Gelato is presented as an all-in-one post-mix workflow: freezing/churning, holding/display and direct service. It does **not** decide whether a recipe needs heat treatment. The recipe-process classifier remains authoritative and independent.

No manufacturer brand, trademark, brochure layout or universal first-batch time is used in customer copy.

## Current gaps

- No canonical Fresh Gelato machine profile or approved universal timing.
- No verified model record in the current Home seed.
- No structured processing duration / cycle count / first-batch time.
- No recipe-level process plan linking ingredient preparation to machine steps.
- No approved buyer recommendation logic.

These gaps are intentionally exposed as PINK readiness states and do not block the factual workflow education that current technology fields support.
